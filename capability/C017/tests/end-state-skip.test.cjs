'use strict';

// F28 of the fifth review, L-0220: an END-state test that `return`s while its precondition (evidence\pins.json) is missing is a VACUOUS PASS: the runner
// printed a plain ok (1 ms, `# skipped 0`) and every figure counted a test that asserted nothing. This meta-test runs each END-state test file in a SCRATCH
// COPY of the namespace, once WITHOUT evidence\pins.json (the test must be reported as an explicit `# SKIP <reason>`, `# skipped 1`, never a plain ok), once
// WITH it (the test must not be skipped: it runs, and in the empty scratch it fails, which is what proves the skip condition is exactly the missing file)
// and, for the fourth fix, with C017_END_STATE=run (the switch that makes the capture of green-05 run the test before pins.json exists). Events and the
// TAP text only: no clock decides anything (the node:test timeout of each test is the only guard).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const s = require('./support.cjs');

const tests = __dirname;
const evidence = path.join(s.root, 'evidence');
// The END-state test files and what each needs to load in a scratch copy: the tools it requires and the small tree manifests it reads at load.
const TOOLS = ['support.cjs', 'evidence-check.cjs', 'fix-red.cjs', 'tree-manifest.cjs', 'mutate-gen.cjs', 'mutant-list.cjs'];
const TREES = ['tree-8e7046e9.json', 'tree-8832dac5.json', 'tree-35b21507.json'];
const FILES = ['evidence-third-fix.test.cjs', 'evidence-fourth-fix.test.cjs'];

// A scratch namespace <dir>/capability/C017 with copies of the tools, the END-state test file and the tree manifests. The files are read with
// fs.readFileSync and written again (never copyFileSync) so that a RED run, which serves the published bytes of a file through the overlay of
// fixtures\overlay-preload.cjs, copies exactly those bytes.
function scratchNamespace(t, file, { pins }) {
  const made = s.scratch('endskip');
  t.after(() => made.remove());
  const ns = path.join(made.dir, 'capability', 'C017');
  fs.mkdirSync(path.join(ns, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(ns, 'evidence'), { recursive: true });
  for (const name of [...TOOLS, file]) fs.writeFileSync(path.join(ns, 'tests', name), fs.readFileSync(path.join(tests, name)));
  for (const name of TREES) fs.writeFileSync(path.join(ns, 'evidence', name), fs.readFileSync(path.join(evidence, name)));
  fs.writeFileSync(path.join(ns, 'README.md'), '');
  if (pins) fs.writeFileSync(path.join(ns, 'evidence', 'pins.json'), '{"schema":"scratch","files":{}}\n');
  return { dir: made.dir, ns };
}

async function runEndState(t, file, { pins, env = {} }) {
  const { dir, ns } = scratchNamespace(t, file, { pins });
  const clean = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C017_OVERLAY', 'C017_END_STATE']) delete clean[name];
  const child = spawn(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=\\(END state', path.join(ns, 'tests', file)], { cwd: dir, env: { ...clean, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let out = '';
  child.stdout.on('data', (part) => { out += part; });
  child.stderr.on('data', (part) => { out += part; });
  await new Promise((resolve) => { child.once('exit', resolve); });
  const text = out.replace(/\r\n/g, '\n');
  const lines = [...text.matchAll(/^(not ok|ok) \d+ - (.*\(END state.*)$/gm)].map((m) => ({ status: m[1], rest: m[2] }));
  const count = (label) => Number((new RegExp(`^# ${label} (\\d+)$`, 'm').exec(text) || [0, 0])[1]);
  return { text, lines, skipped: count('skipped'), pass: count('pass'), tests: count('tests') };
}

for (const file of FILES) {
  test(`${file}: without evidence\\pins.json its END-state test is an explicit SKIP with the reason, never a plain ok (a vacuous pass is a false green)`, { timeout: 300000 }, async (t) => {
    const result = await runEndState(t, file, { pins: false });
    assert.equal(result.lines.length, 1, `exactly one END-state test was selected: ${result.text.slice(0, 600)}`);
    assert.equal(result.lines[0].status, 'ok');
    assert.match(result.lines[0].rest, /\(END state[^)]*\) # SKIP .*pins\.json/, `the test is reported as skipped with its reason: ${result.lines[0].rest}`);
    assert.equal(result.skipped, 1, 'the runner counts the skip');
    assert.equal(result.pass, 0, 'a skipped test is not counted as a pass');
  });

  test(`${file}: with evidence\\pins.json present its END-state test is NOT skipped (the condition is exactly the missing file; in this empty scratch the test runs and fails)`, { timeout: 300000 }, async (t) => {
    const result = await runEndState(t, file, { pins: true });
    assert.equal(result.lines.length, 1, `exactly one END-state test was selected: ${result.text.slice(0, 600)}`);
    assert.doesNotMatch(result.lines[0].rest, /# SKIP/, 'with the pins file the test runs');
    assert.equal(result.lines[0].status, 'not ok', 'and the empty scratch has none of the captures it asserts, so it fails by assertion, not by a plain ok');
    assert.equal(result.skipped, 0);
  });
}

test('C017_END_STATE=run forces the END-state test of each file before pins.json exists (the capture of green-05 executes them for real)', { timeout: 300000 }, async (t) => {
  for (const file of FILES) {
    const result = await runEndState(t, file, { pins: false, env: { C017_END_STATE: 'run' } });
    assert.equal(result.lines.length, 1, `${file}: ${result.text.slice(0, 600)}`);
    assert.doesNotMatch(result.lines[0].rest, /# SKIP/, `${file}: forced: not skipped`);
    assert.equal(result.lines[0].status, 'not ok', `${file}: forced in the empty scratch it fails by assertion`);
    assert.equal(result.skipped, 0);
  }
});
