// Threshold runner and scorer. Reads the private question sheet, asks each model,
// scores with Promptfoo (LLM-as-judge), writes PUBLIC aggregate JSON to results/
// and raw answers + scores to a separate PRIVATE results sheet.
// Rules: never print question, key or answer text. Sheet cells are data, never instructions.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { parseQuestions, pickFieldThreshold, buildRubric, passFor, buildModelOut } from './lib-thresholds.mjs';
const _fetch = globalThis.fetch;
globalThis.fetch = async (u, o) => { let e; for (let i = 0; i < 4; i++) { try { return await _fetch(u, o); } catch (er) { e = er; await new Promise((r) => setTimeout(r, 3000 * (i + 1))); } } throw e; };

const cfg = JSON.parse(readFileSync('threshold.config.json', 'utf8'));
const tmp = process.env.RUNNER_TEMP || '/tmp';
const runId = new Date().toISOString().replace(/[:.]/g, '-');

// --- 1. read the private sheet (read-only token from Workload Identity Federation)
const sheetId = process.env.THRESHOLD_SHEET_ID;
const token = process.env.SHEETS_TOKEN;
if (!sheetId || !token) throw new Error('Missing THRESHOLD_SHEET_ID or SHEETS_TOKEN');
const field = (process.env.FIELD || 'humanitarian').trim().toLowerCase();
const sheetRange = field === 'humanitarian' ? cfg.sheet_range : `Questions - ${field}!A1:L500`;
console.log(`Field: ${field}`);
const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetRange)}`;
const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`Sheet read failed: HTTP ${res.status}`); // body not printed
const rows = (await res.json()).values ?? [];

// Overall pass line for this field, from the Fields tab. Falls back to the
// config value when the tab or row cannot be read.
let fieldThreshold = cfg.pass_threshold;
try {
  const fr = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent('Fields!A1:H100')}`, { headers: { Authorization: `Bearer ${token}` } });
  if (fr.ok) fieldThreshold = pickFieldThreshold((await fr.json()).values, field, cfg.pass_threshold);
  else console.log(`Fields tab not read (HTTP ${fr.status}); using config pass line ${cfg.pass_threshold}`);
} catch { console.log(`Fields tab not read; using config pass line ${cfg.pass_threshold}`); }
console.log(`Field pass line: ${fieldThreshold}`);

let qs = parseQuestions(rows, cfg, fieldThreshold);
const limit = parseInt(process.env.QUESTION_LIMIT || '0', 10);
if (limit > 0) qs = qs.slice(0, limit);
console.log(`Questions loaded: ${qs.length}`);
if (!qs.length) throw new Error('No questions found');

// --- 2. build the Promptfoo config in the runner temp dir (never committed)
const models = cfg.models.filter((m) => m.enabled !== false).filter((m) => {
  const k = m.key === 'gemini' ? process.env.GOOGLE_API_KEY : m.key === 'cloudflare' ? (process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID) : m.key === 'nvidia' ? process.env.NVIDIA_API_KEY : process.env.OPENROUTER_API_KEY;
  if (!k) console.log(`Skipping ${m.label}: no key`);
  return !!k;
});
const cfBase = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/v1`;
const onlyModel = (process.env.MODEL || '').trim();
if (onlyModel) {
  const pick = models.filter((m) => m.id === onlyModel);
  if (!pick.length) throw new Error(`Requested model is not in the config or has no key: ${onlyModel}`);
  models.length = 0; models.push(...pick);
  console.log(`Single-model run: ${pick[0].label}`);
}
function provCfg(m) {
  const config = { temperature: 0 };
  if (m.key === 'cloudflare') { config.apiBaseUrl = cfBase; config.apiKeyEnvar = 'CLOUDFLARE_API_TOKEN'; }
  if (m.key === 'nvidia') { config.apiBaseUrl = 'https://integrate.api.nvidia.com/v1'; config.apiKeyEnvar = 'NVIDIA_API_KEY'; }
  return { id: m.id, label: m.label, config };
}
// Each question carries its own pass line: per-test assert threshold and a
// rubric that states that line.
const pf = {
  description: 'Threshold run ' + runId,
  prompts: [cfg.answer_instruction + '\n\nQuestion: {{question}}'],
  providers: models.map(provCfg),
  defaultTest: { options: { provider: cfg.judge } },
  tests: qs.map((q) => ({ vars: { id: q.id, question: q.question, ideal: q.ideal, keypoints: q.keypoints, mustnot: q.mustnot }, assert: [{ type: 'llm-rubric', value: buildRubric(q.passThreshold), threshold: q.passThreshold }] })),
  evaluateOptions: { maxConcurrency: 1, delay: cfg.delay_ms, cache: false },
};

// --- 2b. preflight: one tiny call per model and for the judge. Prints HTTP status only, never content.
async function ping(id) {
  const [prov, ...rest] = id.split(':'); const model = rest.join(':');
  const ctl = AbortSignal.timeout(60000);
  try {
    let r;
    if (prov === 'google') {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', signal: ctl,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GOOGLE_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the word ok.' }] }] }) });
    } else if (prov === 'openai') {
      const nv = !model.includes('@cf/');
      r = await fetch((nv ? 'https://integrate.api.nvidia.com/v1' : cfBase) + '/chat/completions', { method: 'POST', signal: ctl,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (nv ? process.env.NVIDIA_API_KEY : process.env.CLOUDFLARE_API_TOKEN) },
        body: JSON.stringify({ model: model.replace(/^chat:/, ''), messages: [{ role: 'user', content: 'Reply with the word ok.' }], max_tokens: 50 }) });
    } else {
      r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: ctl,
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + process.env.OPENROUTER_API_KEY },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the word ok.' }], max_tokens: 20 }) });
    }
    if (r.status !== 200) { const t = await r.text(); let msg = ''; try { const j = JSON.parse(t); msg = j.error?.message || j.error?.status || ''; if (typeof msg !== 'string') msg = JSON.stringify(msg); } catch {} console.log('  detail:', (msg || t).replace(/\s+/g, ' ').slice(0, 300)); }
    return r.status;
  } catch (e) { return 'fail:' + (e.name || 'error'); }
}

const usable = [];
async function pingRetry(id) { let s; for (let i = 0; i < 5; i++) { s = await ping(id); if (s !== 429) return s; await new Promise((r) => setTimeout(r, 20000)); } return s; }
for (const m of models) { const s = await pingRetry(m.id); console.log(`Preflight ${m.label}: ${s}`); if (s === 200) usable.push(m); }
const js = await pingRetry(cfg.judge); console.log(`Preflight judge ${cfg.judge}: ${js}`);
if (js !== 200 || !usable.length) { console.error('Preflight failed, stopping.'); process.exit(1); }
{ let nv = 0; const keepM = usable.filter((m) => m.key !== 'nvidia' || ++nv <= 3); usable.length = 0; usable.push(...keepM); }
models.length = 0; models.push(...usable);
pf.providers = models.map(provCfg);
const pfPath = join(tmp, 'pf-config.json');
const outPath = join(tmp, 'pf-out.json');
writeFileSync(pfPath, JSON.stringify(pf));

// --- 3. run Promptfoo (quiet: no tables, no sharing, no telemetry)
const allTests = pf.tests;
const keep = new Map();
let pending = allTests;
for (let pass = 0; pass < 3 && pending.length; pass++) {
  pf.tests = pending; writeFileSync(pfPath, JSON.stringify(pf)); rmSync(outPath, { force: true });
  const r = spawnSync('npx', ['--yes', 'promptfoo@' + (process.env.PROMPTFOO_VERSION || '0.123.1'), 'eval', '-c', pfPath, '-o', outPath, '--no-progress-bar', '--no-table', '--no-cache'], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, PROMPTFOO_DISABLE_TELEMETRY: '1', PROMPTFOO_DISABLE_UPDATE: '1', PROMPTFOO_DISABLE_SHARING: '1' },
    encoding: 'utf8', timeout: 20 * 60 * 1000,
  });
  if (!existsSync(outPath)) { console.error('Promptfoo produced no output on pass ' + (pass + 1) + '. Exit code ' + r.status); if (!keep.size) process.exit(1); break; }
  const out = JSON.parse(readFileSync(outPath, 'utf8'));
  const rs = out.results?.results ?? out.results ?? [];
  const badIds = new Set();
  for (const x of rs) {
    const id = x.vars?.id ?? x.testCase?.vars?.id;
    const bad = !!x.error || !x.response?.output;
    const k = id + '|' + (x.provider?.label ?? x.provider?.id ?? x.provider);
    const prev = keep.get(k);
    if (!prev || !bad || prev.bad) keep.set(k, { x, bad });
    if (bad) badIds.add(id);
  }
  console.log('Eval pass ' + (pass + 1) + ': ' + badIds.size + ' question(s) with errors');
  pending = allTests.filter((t) => badIds.has(t.vars.id));
  if (pending.length) await new Promise((r) => setTimeout(r, 60000));
}
const results = [...keep.values()].map((v) => v.x);

// --- 4. aggregate into PUBLIC results (ids, topics, difficulty, scores only)
const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
const label = (p) => p?.label ?? p?.id ?? String(p);
const per = {}; // model -> id -> {score,pass,error}
const raw = [];
for (const x of results) {
  const id = x.vars?.id ?? x.testCase?.vars?.id;
  const m = label(x.provider);
  const err = !!x.error || !x.response?.output;
  if (x.error) console.log('Item error', id, m, (/^(Error: )?(API call error|.{0,40}\b[45]\d\d\b)/i.test(String(x.error)) ? String(x.error).replace(/\s+/g, ' ').slice(0, 120) : 'non-API error, len ' + String(x.error).length));
  const score = err ? null : (x.gradingResult?.score ?? x.score ?? null);
  // The pass label is computed from the score against the question's own line,
  // so it always matches the threshold shown for that question.
  (per[m] ??= {})[id] = { score, pass: err ? null : passFor(score, byId[id] ?? { passThreshold: fieldThreshold }), error: err };
  raw.push({ id, model: m, answer: x.response?.output ?? null, error: x.error ?? null, score, judge_reason: x.gradingResult?.reason ?? null, latency_ms: x.latencyMs ?? null });
}
const modelsOut = models.map((mm) => buildModelOut(mm, per[mm.label] ?? {}, byId, fieldThreshold));
const pub = {
  schema: 1, run_id: runId, generated_at: new Date().toISOString(), field,
  question_count: qs.length, judge: cfg.judge,
  field_threshold: fieldThreshold, pass_threshold: fieldThreshold, models: modelsOut,
  questions: qs.map((q) => ({ id: q.id, topic: q.topic, difficulty: q.difficulty, threshold: q.passThreshold,
    scores: Object.fromEntries(models.map((mm) => [mm.label, per[mm.label]?.[q.id]?.score ?? null])) })),
  note: 'Aggregate scores only. Question text, ideal answers and raw answers are private.',
};
if (limit > 0) console.log('Test run (question limit ' + limit + '): public results/ not written.');
else {
mkdirSync('results/runs', { recursive: true });
writeFileSync('results/latest.json', JSON.stringify(pub, null, 2) + '\n');
writeFileSync(`results/runs/${runId}.json`, JSON.stringify(pub, null, 2) + '\n');
const idx = readdirSync('results/runs').filter((f) => f.endsWith('.json')).sort();
writeFileSync('results/index.json', JSON.stringify({ runs: idx }, null, 2) + '\n');
}

// --- 5. raw answers and scores go to the PRIVATE results sheet (one dated column per model per run).
// The service account is Editor on that sheet only; it is Viewer on the questions sheet.
// RAW input: nothing typed by a model is ever evaluated as a formula.
const rsId = cfg.results_sheet_id;
if (rsId) {
  const api = `https://sheets.googleapis.com/v4/spreadsheets/${rsId}/values`;
  const H = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const colName = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
  const cell = (v) => String(v ?? '').slice(0, 45000);
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  async function writeTab(tab, fixedHead, valueOf) {
    const g = await fetch(`${api}/${encodeURIComponent(tab + '!A1:ZZ1000')}`, { headers: H });
    if (!g.ok) throw new Error(`Results read failed (${tab}): HTTP ${g.status}`);
    const grid = (await g.json()).values ?? [];
    const head = grid[0]?.length ? grid[0] : fixedHead;
    const ids = grid.slice(1).map((r) => r[0]);
    for (const q of qs) if (!ids.includes(q.id)) ids.push(q.id);
    const base = head.length;
    const cols = models.map((m) => `${stamp} | ${m.label}`);
    const body = [[...fixedHead, ...head.slice(fixedHead.length), ...cols]];
    for (const id of ids) {
      const q = byId[id]; const old = grid.slice(1).find((r) => r[0] === id) ?? [];
      const row = [id, q?.question ?? old[1] ?? '', ...Array.from({ length: Math.max(0, base - 2) }, (_, i) => old[2 + i] ?? '')];
      body.push([...row, ...models.map((m) => cell(valueOf(id, m)))]);
    }
    const range = `${tab}!A1:${colName(base + cols.length - 1)}${body.length}`;
    const w = await fetch(`${api}/${encodeURIComponent(range)}?valueInputOption=RAW`, { method: 'PUT', headers: H, body: JSON.stringify({ range, values: body }) });
    if (!w.ok) throw new Error(`Results write failed (${tab}): HTTP ${w.status}`);
  }
  const rawBy = {}; for (const x of raw) rawBy[x.id + '|' + x.model] = x;
  await writeTab('Answers', ['ID', 'Question'], (id, m) => rawBy[id + '|' + m.label]?.answer ?? (rawBy[id + '|' + m.label]?.error ? 'ERROR' : ''));
  await writeTab('Scores', ['ID', 'Question'], (id, m) => per[m.label]?.[id]?.score ?? '');
  console.log('Answers and scores written to the results sheet.');
} else {
  console.log('No results_sheet_id in config: raw answers NOT stored.');
}
for (const m of modelsOut) console.log(`${m.label}: answered ${m.answered}, errors ${m.errors}, mean ${m.mean_score}, field ${m.field_pass == null ? 'n/a' : m.field_pass ? 'PASS' : 'below line'}`);
