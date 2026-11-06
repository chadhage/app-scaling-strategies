'use strict';
// N7 and N8: the work of the validator is bounded by typed caps, proved structurally (a child with a capped heap, counters of normalize calls and
// characters, typed refusals at the boundaries), never by an absolute time.
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { load, reseal, run, NOW, assert, test } = require('./support.cjs');
const { faithfulMarkdown } = require('./md.cjs');

const CLI = path.join(__dirname, '..', 'validate-packet.cjs');
const cleanEnv = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; delete e.NODE_V8_COVERAGE; return e; };
const codes = (r) => new Set(r.findings.map((f) => f.code));

// n nested openers ("(a;" or "{a;") in the unattended script, in lines of at most about 19,000 characters (every string stays inside its cap).
function nested(p, n, opener = '(') {
  const unit = `${opener}a;`;
  const perLine = Math.floor(19000 / unit.length);
  const lines = [];
  for (let left = n; left > 0; left -= perLine) lines.push(unit.repeat(Math.min(perLine, left)));
  p.cleanupAndRollback.teardown.job.script = lines;
  return reseal(p);
}

test('N7: block nesting beyond 32 is a typed INPUT_TOO_DEEP; 32 is not', () => {
  assert.ok(codes(run(nested(load(), 33))).has('INPUT_TOO_DEEP'), '33 nested openers must be refused');
  assert.ok(codes(run(nested(load(), 4000, '{'))).has('INPUT_TOO_DEEP'), '4000 nested braces must be refused');
  assert.equal(codes(run(nested(load(), 32))).has('INPUT_TOO_DEEP'), false, '32 nested openers are inside the cap');
});

test('N7: more than 2000 statements in one container is a typed INPUT_TOO_LARGE; 2000 is not', () => {
  const many = (n) => { const p = load(); p.cleanupAndRollback.teardown.job.script = [`${'a;'.repeat(n - 1)}a`]; return reseal(p); };
  assert.ok(codes(run(many(2001))).has('INPUT_TOO_LARGE'));
  assert.equal(codes(run(many(2000))).has('INPUT_TOO_LARGE'), false);
});

for (const [n, opener] of [[20000, '('], [20000, '{'], [38000, '(']]) {
  test(`N7: ${n} nested "${opener}" in a child with a 300 MB heap end in a typed refusal, not in an out-of-memory crash`, () => {
    const child = spawnSync(process.execPath, ['--max-old-space-size=300', CLI, '-', '--now', NOW], { input: JSON.stringify(nested(load(), n, opener)), env: cleanEnv(), encoding: 'utf8', timeout: 240000, maxBuffer: 64 * 1024 * 1024 });
    assert.equal(child.signal, null);
    assert.ok(!/heap out of memory|FATAL ERROR/.test(`${child.stdout}${child.stderr}`), 'the process must not run out of memory');
    assert.equal(child.status, 1, `exit ${child.status}`);
    assert.match(child.stdout, /INPUT_TOO_DEEP/);
  });
}

// N8: combining marks of different classes make NFKC super-quadratic; a run beyond 32 is refused before anything is normalised.
const UNIT = '\u0345\u0301\u0316\u0f71\u0f72\u0f74\u0315';
const marks = (n) => UNIT.repeat(Math.ceil(n / UNIT.length)).slice(0, n);

test('N8: a run of more than 32 combining marks in a JSON string is a typed finding; 32 is not', () => {
  const at = (n) => { const p = load(); p.note = `a${marks(n)}b`; return reseal(p); };
  assert.ok(codes(run(at(33))).has('INPUT_COMBINING_RUN'));
  assert.equal(codes(run(at(32))).has('INPUT_COMBINING_RUN'), false);
});

test('N8: three strings of 19,999 marks are refused by name (the review measured 371 s for 90 of them)', () => {
  const p = load();
  for (let i = 0; i < 3; i += 1) p[`n${i}`] = marks(19999);
  assert.ok(codes(run(reseal(p))).has('INPUT_COMBINING_RUN'));
});

test('N8: a run of marks in a key or in the markdown is a typed finding', () => {
  const p = load();
  p[`k${marks(5000)}`] = 1;
  assert.ok(codes(run(reseal(p))).has('INPUT_COMBINING_RUN'), 'a key');
  const q = load();
  assert.ok(codes(run(q, { markdown: `${faithfulMarkdown(q)}\n${marks(5000)}` })).has('INPUT_COMBINING_RUN'), 'the markdown');
});

test('N8: a total character budget of 1,000,000 over every string, key and the markdown', () => {
  const total = (p) => { let n = 0; const walk = (v) => { if (typeof v === 'string') n += v.length; else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { n += k.length; walk(x); } }; walk(p); return n; };
  const filled = (target) => { const p = load(); let left = target - total(p); for (let i = 0; left > 0; i += 1) { const k = Math.min(left - 6, 19999); p[`f${i}`] = 'a'.repeat(Math.max(k, 1)); left -= k + 6; } return reseal(p); };
  const refused = codes(run(filled(1000000 + 50000)));
  assert.ok(refused.has('INPUT_TOO_LARGE'), 'above the budget');
  assert.equal(codes(run(filled(1000000 - 50000))).has('INPUT_TOO_LARGE'), false, 'below the budget');
});

// Structural proof of "fold each string once": count the normalize calls and the characters they see while the fixture and its markdown are validated.
const strings = (v, out) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); strings(x, out); } return out; };

test('N8: normalisation work is bounded by the distinct strings, not by the number of scanners', () => {
  const p = load();
  const md = faithfulMarkdown(p);
  const distinct = [...new Set([...strings(p, []), ...md.split('\n')])];
  const chars = distinct.reduce((n, s) => n + s.length, 0) + md.length;
  const original = String.prototype.normalize;
  let calls = 0;
  let seen = 0;
  String.prototype.normalize = function counted(form) { calls += 1; seen += this.length; return original.call(this, form); };
  try { run(p, { markdown: md }); } finally { String.prototype.normalize = original; }
  assert.ok(calls <= 2 * distinct.length + 50, `${calls} normalize calls for ${distinct.length} distinct strings`);
  assert.ok(seen <= 3 * chars, `${seen} characters normalised for ${chars} characters of input`);
});
