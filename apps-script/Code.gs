// Threshold admin go-between.
// Container-bound to the spreadsheet "Threshold - Questions and answer keys (PRIVATE)".
// Deploy: Deploy > New deployment > type Web app > Execute as: Me > Who has access: Anyone.
// "Anyone" only means the URL can be reached. Every call must carry a Google
// sign-in token, and the email is checked against the Allowlist tab before
// anything is read or changed.
//
// Script properties (Project Settings > Script Properties):
//   GITHUB_TOKEN  fine-grained personal access token, Actions: write, on
//                 DigitalHumanitarianNetwork/threshold. Needed for runModel only.
//   RUN_CAP       optional. Max run dispatches per day. Default 20.

var CLIENT_ID = '410104533080-hf6usfgcbdcjaho8f70sbokssjcp0k90.apps.googleusercontent.com';
var REPO = 'DigitalHumanitarianNetwork/threshold';
var WORKFLOW = 'threshold-run.yml';
var ALERT_TO = 'andrejverity@gmail.com';
var OWNER = 'andrejverity@gmail.com';
var QUESTION_HEADERS = ['ID', 'Topic', 'Type', 'Question', 'Ideal answer', 'Key points', 'Must-not-say', 'Difficulty', 'Source to verify', 'Status', 'Reviewer', 'Pass threshold'];

function doGet() {
  return out({ ok: true, service: 'threshold-admin' });
}

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var info = verify(req.token);
    if (!info) return out({ error: 'invalid_token' });
    var email = info.email.toLowerCase();
    switch (req.action) {
      case 'whoami':      return out(whoami(info));
      case 'listFields':  requireRole(email, ['admin', 'editor']); return out({ fields: readFields() });
      case 'listPeople':  requireRole(email, ['admin']); return out({ people: readPeople() });
      case 'setRole':     requireRole(email, ['admin']); return out(setRole(req.email, req.role));
      case 'createField': requireRole(email, ['admin', 'editor']); return out(createField(email, req.field, req.questions));
      case 'runModel':    requireRole(email, ['admin', 'editor']); return out(runModel(email, req.field, req.model));
      case 'listRuns':    requireRole(email, ['admin', 'editor']); return out({ runs: readRuns() });
      default:            return out({ error: 'unknown_action' });
    }
  } catch (err) {
    if (err && err.forbidden) return out({ error: 'forbidden', role: err.role || 'none' });
    console.error(err);
    return out({ error: 'server_error' });
  }
}

// --- sign-in -----------------------------------------------------------------

function verify(token) {
  if (!token || typeof token !== 'string' || token.length > 8192) return null;
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + sha(token);
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  var d = JSON.parse(r.getContentText());
  if (d.aud !== CLIENT_ID) return null;
  if (String(d.email_verified) !== 'true' || !d.email) return null;
  var info = { email: d.email, name: d.name || '' };
  cache.put(key, JSON.stringify(info), 300);
  return info;
}

function sha(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s);
  return Utilities.base64EncodeWebSafe(b).slice(0, 40);
}

function whoami(info) {
  var email = info.email.toLowerCase();
  var role = getRole(email);
  if (!role) {
    ss().getSheetByName('Allowlist').appendRow([email, 'pending', new Date(), 'auto: first sign-in', info.name]);
    MailApp.sendEmail(ALERT_TO, 'Threshold admin: new sign-in is pending',
      email + (info.name ? ' (' + info.name + ')' : '') + ' signed in to the Threshold admin area and is not on the approved list yet.\n\n' +
      'To approve them, open the Allowlist tab and change pending to editor or admin:\n' + ss().getUrl() + '\n\nTo decline, delete the row.');
    role = 'pending';
  }
  return { email: email, name: info.name, role: role };
}

// --- allowlist ----------------------------------------------------------------

function getRole(email) {
  var rows = ss().getSheetByName('Allowlist').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) return String(rows[i][1]).trim().toLowerCase();
  }
  return null;
}

function requireRole(email, roles) {
  var role = getRole(email);
  if (roles.indexOf(role) < 0) throw { forbidden: true, role: role || 'none' };
}

function readPeople() {
  return ss().getSheetByName('Allowlist').getDataRange().getValues().slice(1)
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return { email: r[0], role: r[1], added: r[2], addedBy: r[3], note: r[4] }; });
}

function setRole(target, role) {
  target = String(target || '').trim().toLowerCase();
  if (!target) return { error: 'missing_email' };
  if (target === OWNER) return { error: 'owner_locked' };
  var sh = ss().getSheetByName('Allowlist');
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === target) {
      if (role === 'remove') sh.deleteRow(i + 1);
      else if (role === 'admin' || role === 'editor') sh.getRange(i + 1, 2).setValue(role);
      else return { error: 'bad_role' };
      return { ok: true };
    }
  }
  return { error: 'not_found' };
}

// --- fields and questions ------------------------------------------------------

function readFields() {
  return ss().getSheetByName('Fields').getDataRange().getValues().slice(1)
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) { return { id: r[0], name: r[1], description: r[2], threshold: r[3], tab: r[4], status: r[5], createdBy: r[6], created: r[7] }; });
}

function createField(actor, field, questions) {
  field = field || {};
  var id = String(field.id || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) return { error: 'bad_field_id' };
  if (readFields().some(function (f) { return String(f.id).toLowerCase() === id; })) return { error: 'field_exists' };
  var name = String(field.name || '').trim();
  if (!name) return { error: 'missing_name' };
  var threshold = num(field.threshold, 0.7);
  var qs = (questions || []).filter(function (q) { return q && String(q.question || '').trim(); });
  if (!qs.length) return { error: 'no_questions' };
  if (qs.length > 60) return { error: 'too_many_questions' };
  var tabName = 'Questions - ' + id;
  if (ss().getSheetByName(tabName)) return { error: 'field_exists' };
  var prefix = id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  var sh = ss().insertSheet(tabName);
  sh.getRange(1, 1, 1, QUESTION_HEADERS.length).setValues([QUESTION_HEADERS]).setFontWeight('bold');
  sh.setFrozenRows(1);
  var rows = qs.map(function (q, i) {
    return [
      prefix + '-Q' + ('00' + (i + 1)).slice(-3),
      clean(q.topic, 200), clean(q.type, 50) || 'fact', clean(q.question, 8000), clean(q.ideal, 20000),
      clean(q.keypoints, 8000), clean(q.mustnot, 4000), clean(q.difficulty, 50), clean(q.source, 2000),
      'approved', 'Created in admin area by ' + actor, num(q.threshold, threshold),
    ];
  });
  sh.getRange(2, 1, rows.length, QUESTION_HEADERS.length).setValues(rows);
  ss().getSheetByName('Fields').appendRow([id, name, String(field.description || '').slice(0, 500), threshold, tabName, 'active', actor, new Date()]);
  return { ok: true, field: id, questions: rows.length };
}

// --- runs -----------------------------------------------------------------------

function runModel(actor, fieldId, modelId) {
  fieldId = String(fieldId || '').trim().toLowerCase();
  modelId = String(modelId || '').trim();
  var f = readFields().filter(function (x) { return String(x.id).toLowerCase() === fieldId && x.status === 'active'; })[0];
  if (!f) return { error: 'unknown_field' };
  if (!ss().getSheetByName(f.tab)) return { error: 'field_tab_missing' };
  var cfg = JSON.parse(UrlFetchApp.fetch('https://raw.githubusercontent.com/' + REPO + '/main/threshold.config.json', { muteHttpExceptions: true }).getContentText());
  var model = (cfg.models || []).filter(function (m) { return m.id === modelId; })[0];
  if (!model) return { error: 'unknown_model' };
  if (model.enabled === false) return { error: 'model_disabled' };
  var cap = parseInt(PropertiesService.getScriptProperties().getProperty('RUN_CAP') || '20', 10);
  var today = Utilities.formatDate(new Date(), 'Europe/Amsterdam', 'yyyy-MM-dd');
  var runs = readRuns();
  var todays = runs.filter(function (r) { return Utilities.formatDate(new Date(r.at), 'Europe/Amsterdam', 'yyyy-MM-dd') === today; }).length;
  if (todays >= cap) return { error: 'cap_reached', cap: cap };
  var gh = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!gh) return { error: 'github_not_connected' };
  var res = UrlFetchApp.fetch('https://api.github.com/repos/' + REPO + '/actions/workflows/' + WORKFLOW + '/dispatches', {
    method: 'post', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + gh, Accept: 'application/vnd.github+json' },
    contentType: 'application/json',
    payload: JSON.stringify({ ref: 'main', inputs: { question_limit: '0', field: fieldId, model: modelId } }),
  });
  if (res.getResponseCode() !== 204) return { error: 'github_refused' };
  runsTab().appendRow([new Date(), actor, fieldId, modelId, model.label, 'requested']);
  return { ok: true };
}

function runsTab() {
  var sh = ss().getSheetByName('Runs');
  if (!sh) {
    sh = ss().insertSheet('Runs');
    sh.getRange(1, 1, 1, 6).setValues([['Requested at', 'By', 'Field', 'Model', 'Model label', 'Status']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRuns() {
  var sh = ss().getSheetByName('Runs');
  if (!sh) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { at: r[0], by: r[1], field: r[2], model: r[3], label: r[4], status: r[5] }; })
    .reverse().slice(0, 25);
}

// --- helpers ---------------------------------------------------------------------

function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clean(v, max) { return String(v == null ? '' : v).slice(0, max).replace(/^[=\-+@]/, "'$&"); }
function num(v, dflt) { var n = parseFloat(v); return isNaN(n) ? dflt : Math.min(1, Math.max(0, n)); }
