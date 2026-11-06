'use strict';
// Answers to the survivors of the first mutation run of the fix for the third review: each test fails on its mutant (N07, N24).
// N07: a script without the [string]$AlarmDir parameter is refused by SCRIPT_ALARM_PATH itself, not only by the shape sequence.
// N24: the status paragraph must appear exactly once and unchanged; a removed, a repeated and a reworded paragraph are each MARKDOWN_STATUS.
// Plus the walker over the answers of validatePacket: no object of an answer is shared with a later answer.
const { load, reseal, run, assert, test } = require('./support.cjs');
const { faithfulMarkdown } = require('./md.cjs');
const { STATUS_LINE } = require('../markdown-structure.cjs');

const codesOf = (p, markdown) => new Set(run(reseal(p), markdown === undefined ? {} : { markdown }).findings.map((f) => f.code));
const withMd = (edit) => { const p = load(); return codesOf(p, edit(faithfulMarkdown(p).split('\n')).join('\n')); };

test('SCRIPT_ALARM_PATH: a script without any [string]$AlarmDir parameter is refused by this rule', () => {
  const p = load();
  const script = p.cleanupAndRollback.teardown.job.script;
  const at = script.findIndex((l) => l.includes('[string]$AlarmDir'));
  assert.ok(at >= 0, 'the fixture has the parameter');
  script.splice(at, 1);
  assert.ok(codesOf(p).has('SCRIPT_ALARM_PATH'));
});

test('MARKDOWN_STATUS: the status paragraph appears exactly once and unchanged', () => {
  const p = load();
  const md = faithfulMarkdown(p).split('\n');
  assert.equal(md.filter((l) => l === STATUS_LINE).length, 1, 'the faithful copy has the paragraph once');
  assert.equal(codesOf(p, md.join('\n')).has('MARKDOWN_STATUS'), false);
  assert.ok(withMd((l) => l.filter((x) => x !== STATUS_LINE)).has('MARKDOWN_STATUS'), 'removed');
  assert.ok(withMd((l) => { const i = l.indexOf(STATUS_LINE); l.splice(i + 1, 0, STATUS_LINE); return l; }).has('MARKDOWN_STATUS'), 'repeated unchanged');
  assert.ok(withMd((l) => l.map((x) => (x === STATUS_LINE ? '**Proposal only. Nothing here is an approval.**' : x))).has('MARKDOWN_STATUS'), 'reworded without a "Status:" prefix');
});

// No shared mutable returns: every object and array reachable from an answer is written to in strict mode (a frozen one throws and is skipped),
// then the same validations are asked again and must answer exactly as before.
function scribble(root) {
  const seen = new Set();
  const todo = [root];
  while (todo.length > 0) {
    const value = todo.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Object.keys(value)) todo.push(value[key]);
    for (const key of Object.keys(value)) { try { value[key] = '<<scribble>>'; } catch { /* a frozen object refuses: nothing shared to damage */ } }
    try { if (Array.isArray(value)) value.push('<<scribble>>'); else value.scribble = true; } catch { /* frozen */ }
  }
  return seen.size;
}

test('NO SHARED MUTABLE RETURNS: scribbling on every object of an answer changes no later answer', () => {
  const accepted = () => { const p = load(); return run(reseal(p), { markdown: faithfulMarkdown(p) }); };
  const rejected = () => { const p = load(); p.authority.go = true; p.cleanupAndRollback.guards[0].commands.push('Get-Date'); return run(reseal(p), {}); };
  const snapshot = (answer) => JSON.parse(JSON.stringify(answer));
  const before = { accepted: snapshot(accepted()), rejected: snapshot(rejected()) };
  assert.ok(before.rejected.findings.length >= 2, 'the rejected variant has findings to scribble on');
  assert.ok(scribble(accepted()) >= 1);
  assert.ok(scribble(rejected()) > before.rejected.findings.length);
  assert.deepEqual(snapshot(accepted()), before.accepted);
  assert.deepEqual(snapshot(rejected()), before.rejected);
});
