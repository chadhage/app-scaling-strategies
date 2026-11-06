'use strict';
// Pure helpers shared by the rule modules. No I/O, no clock, no randomness.
const crypto = require('node:crypto');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = (v) => Array.isArray(v);
const approx = (a, b, eps = 1e-6) => isNum(a) && isNum(b) && Math.abs(a - b) <= eps;
const round = (x, d = 6) => Math.round((x + Number.EPSILON) * 10 ** d) / 10 ** d;

// The packet convention: ceiling = ceil(worst case x 1.25 / 5) x 5 (rounded first against float noise).
const ceilingFor = (worst) => Math.ceil(round((worst * 1.25) / 5, 9)) * 5;

// Integrity: SHA-256 of JSON.stringify of the packet without the integrity and validation fields, keys in construction order.
function integrityHash(packet) {
  const { integrity, validation, ...body } = packet;
  return crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function makeSink() {
  const findings = [];
  const add = (code, path, message) => { findings.push({ code, path, message }); };
  return { findings, add };
}

// Visits every string in a JSON-like tree with its path, e.g. options[0].teardown.mechanism.
function walkStrings(value, visit, path = '') {
  if (typeof value === 'string') visit(value, path);
  else if (isArr(value)) value.forEach((v, i) => walkStrings(v, visit, `${path}[${i}]`));
  else if (isObj(value)) for (const [k, v] of Object.entries(value)) walkStrings(v, visit, path ? `${path}.${k}` : k);
}

// Collects the az and PowerShell statements of the plan (commands, scripts) with their paths. Revision 1 packets kept one string per
// step in `command` (deletion order) or `how` (verification); those are collected too, so the old shape is checked rather than skipped.
function planStatements(plan) {
  const out = [];
  const take = (value, path) => {
    const list = isArr(value) ? value : typeof value === 'string' ? [value] : [];
    list.forEach((c, i) => { if (typeof c === 'string') out.push({ path: isArr(value) ? `${path}[${i}]` : path, text: c }); });
  };
  (isArr(plan.guards) ? plan.guards : []).forEach((g, i) => take(g && g.commands, `cleanupAndRollback.guards[${i}].commands`));
  for (const section of ['armingSequence', 'deletionOrder', 'verification', 'rollback']) {
    (isArr(plan[section]) ? plan[section] : []).forEach((s, i) => {
      for (const field of ['commands', 'command', 'how']) take(s && s[field], `cleanupAndRollback.${section}[${i}].${field}`);
    });
  }
  take(plan.teardown && plan.teardown.job && plan.teardown.job.script, 'cleanupAndRollback.teardown.job.script');
  return out;
}

// An az invocation inside a statement: "az <word>" not preceded by a word character or a dash.
const AZ = /(?<![\w-])az\s+([a-z][\w-]*(?:\s+[a-z][\w-]*)?)/g;

function azInvocations(text) {
  const found = [];
  const bare = text.replace(/"(?:`.|[^"`])*"|'[^']*'/g, '""');
  for (const statement of bare.split(/;|\r?\n|\|\s*ConvertFrom-Json|\{|\}/)) {
    AZ.lastIndex = 0;
    const m = AZ.exec(statement);
    if (m) found.push({ command: m[1], statement: statement.trim() });
  }
  return found;
}

// Whole UTC days from a YYYY-MM-DD date to an ISO instant: the 7-day price rule is counted in calendar days.
const dayAge = (dateStr, iso) => Math.floor((Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`) - Date.parse(`${dateStr}T00:00:00Z`)) / 86400000);

module.exports = { isObj, isNum, isStr, isArr, approx, round, ceilingFor, integrityHash, makeSink, walkStrings, planStatements, azInvocations, dayAge };
