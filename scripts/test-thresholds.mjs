// Fixture test for per-question and overall pass lines. Run: node scripts/test-thresholds.mjs
// Uses only fake rows and fake scores: no network, no sheets, no model calls.
import assert from 'node:assert/strict';
import { parseThreshold, pickFieldThreshold, parseQuestions, buildRubric, passFor, buildModelOut } from './lib-thresholds.mjs';

const cfg = { pass_threshold: 0.7, exclude_status: ['retired', 'rejected'] };

// --- parseThreshold: only numbers in (0, 1] survive
assert.equal(parseThreshold('0.85', 0.7), 0.85);
assert.equal(parseThreshold(0.5, 0.7), 0.5);
assert.equal(parseThreshold('', 0.7), 0.7, 'empty cell falls back');
assert.equal(parseThreshold('banana', 0.7), 0.7, 'text falls back');
assert.equal(parseThreshold('0', 0.7), 0.7, 'zero falls back');
assert.equal(parseThreshold('1.4', 0.7), 0.7, 'above 1 falls back');

// --- pickFieldThreshold: the Fields tab wins over the config value (0.80 != 0.70)
const fieldsRows = [
  ['Field ID', 'Name', 'Description', 'Overall pass threshold', 'Questions tab', 'Status', 'Created by', 'Created'],
  ['education', 'Education', 'Pilot set', '0.80', 'Questions - education', 'active', 'a@b.c', '2026-11-28'],
  ['logistics', 'Logistics', 'Pilot set', 'not-a-number', 'Questions - logistics', 'active', 'a@b.c', '2026-11-28'],
];
assert.equal(pickFieldThreshold(fieldsRows, 'education', 0.7), 0.8, 'field line comes from the Fields tab');
assert.equal(pickFieldThreshold(fieldsRows, 'logistics', 0.7), 0.7, 'unreadable field line falls back to config');
assert.equal(pickFieldThreshold(fieldsRows, 'missing', 0.7), 0.7, 'unknown field falls back to config');
assert.equal(pickFieldThreshold([], 'education', 0.7), 0.7, 'missing tab falls back to config');

const fieldLine = pickFieldThreshold(fieldsRows, 'education', cfg.pass_threshold);
assert.equal(fieldLine, 0.8);

// --- parseQuestions: per-question lines from the "Pass threshold" column
const qHead = ['ID', 'Topic', 'Type', 'Question', 'Ideal answer', 'Key points', 'Must-not-say', 'Difficulty', 'Source to verify', 'Status', 'Reviewer', 'Pass threshold'];
const qRows = [
  qHead,
  ['EDU-Q001', 'schools', 'open', 'Q one', 'Ideal one', 'kp1', 'mn1', 'easy', 'src', 'approved', 'r', '0.50'],
  ['EDU-Q002', 'schools', 'open', 'Q two', 'Ideal two', 'kp1', 'mn1', 'hard', 'src', 'approved', 'r', '0.90'],
  ['EDU-Q003', 'camps', 'open', 'Q three', 'Ideal three', 'kp1', 'mn1', 'easy', 'src', 'approved', 'r', ''],
  ['EDU-Q004', 'camps', 'open', 'Q four', 'Ideal four', 'kp1', 'mn1', 'easy', 'src', 'approved', 'r', 'banana'],
  ['EDU-Q005', 'camps', 'open', 'Q five', 'Ideal five', 'kp1', 'mn1', 'easy', 'src', 'retired', 'r', '0.90'],
];
const qs = parseQuestions(qRows, cfg, fieldLine);
assert.equal(qs.length, 4, 'retired question is excluded');
assert.equal(qs[0].passThreshold, 0.5, 'own line 0.50');
assert.equal(qs[1].passThreshold, 0.9, 'own line 0.90');
assert.equal(qs[2].passThreshold, 0.8, 'blank cell inherits the field line');
assert.equal(qs[3].passThreshold, 0.8, 'unreadable cell inherits the field line');

// Sheet without the column at all (the original humanitarian layout)
const legacyRows = [
  qHead.slice(0, 11),
  ['HUM-Q001', 'water', 'open', 'Q', 'Ideal', 'kp1', 'mn1', 'easy', 'src', 'approved', 'r'],
];
assert.equal(parseQuestions(legacyRows, cfg, 0.7)[0].passThreshold, 0.7, 'no column: every question uses the field line');

// --- buildRubric states the question's own line
assert.ok(buildRubric(0.9).includes('at least 0.9'), 'rubric states 0.9');
assert.ok(buildRubric(0.5).includes('at least 0.5'), 'rubric states 0.5');

// --- passFor: the per-question label
assert.equal(passFor(0.6, qs[0]), true, '0.60 passes a 0.50 line');
assert.equal(passFor(0.85, qs[1]), false, '0.85 fails a 0.90 line');
assert.equal(passFor(0.75, qs[2]), false, '0.75 fails an inherited 0.80 line');
assert.equal(passFor(null, qs[0]), false, 'no score never passes');

// --- buildModelOut: both labels end to end (per-question pass + field pass)
const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
const rsA = {
  'EDU-Q001': { score: 0.6, pass: passFor(0.6, qs[0]), error: false },
  'EDU-Q002': { score: 0.85, pass: passFor(0.85, qs[1]), error: false },
  'EDU-Q003': { score: 0.75, pass: passFor(0.75, qs[2]), error: false },
  'EDU-Q004': { score: 0.9, pass: passFor(0.9, qs[3]), error: false },
};
const a = buildModelOut({ id: 'm:a', label: 'Model A' }, rsA, byId, fieldLine);
assert.equal(a.pass_rate, 0.5, 'A passes 2 of 4 questions on their own lines');
assert.equal(a.mean_score, 0.78, 'A mean 0.78');
assert.equal(a.field_pass, false, 'A is below the 0.80 field line');
assert.deepEqual(a.by_topic.camps, { mean: 0.83, n: 2 });

const rsB = {
  'EDU-Q001': { score: 0.95, pass: passFor(0.95, qs[0]), error: false },
  'EDU-Q002': { score: 0.95, pass: passFor(0.95, qs[1]), error: false },
  'EDU-Q003': { score: 0.85, pass: passFor(0.85, qs[2]), error: false },
  'EDU-Q004': { score: 0.9, pass: passFor(0.9, qs[3]), error: false },
};
const b = buildModelOut({ id: 'm:b', label: 'Model B' }, rsB, byId, fieldLine);
assert.equal(b.pass_rate, 1, 'B passes every question');
assert.equal(b.mean_score, 0.91, 'B mean 0.91');
assert.equal(b.field_pass, true, 'B passes the field overall');

// Same scores under the old global 0.70 line would have labeled differently:
// A would pass 4 of 4 and the field. Proves the fixture lines really differ.
const aAt70 = buildModelOut({ id: 'm:a', label: 'Model A' },
  Object.fromEntries(Object.entries(rsA).map(([k, v]) => [k, { ...v, pass: v.score >= 0.7 }])), byId, 0.7);
assert.equal(aAt70.pass_rate, 0.75, 'control: at 0.70 three of four pass');
assert.equal(aAt70.field_pass, true, 'control: at 0.70 the field passes');

// Errors are not passes and do not count toward the mean
const rsC = { 'EDU-Q001': { score: null, pass: null, error: true } };
const c = buildModelOut({ id: 'm:c', label: 'Model C' }, rsC, byId, fieldLine);
assert.equal(c.answered, 0);
assert.equal(c.errors, 1);
assert.equal(c.mean_score, null);
assert.equal(c.pass_rate, null);
assert.equal(c.field_pass, null, 'no scores: no field label');

console.log('All threshold fixture checks passed (per-question lines, inherited lines, field line, both labels).');
