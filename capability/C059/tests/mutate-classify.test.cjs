'use strict';

// The classification of a mutant run (fourth fix, review D2 and D3): killed only by a NAMED test that fails by an assertion or by an error thrown inside it, in a run whose TAP counters were read;
// a timeout, a file-level failure, a cancelled test, a failed hook, a crash and a run without a named failing test are UNDECIDED; a run that passed is a survivor. Every class is covered twice:
// by a TAP stream written down here, and by a REAL run of the node test runner on a tiny test file in a private tree (so that a change in the format of the runner fails here, not in the
// campaign). The private tree of a worker is proved pristine again after a run that left things behind (the defect of review D2).
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { classify, counters, demonstrationFile, failures, kindOf, proofKind } = require('./mutate-classify.cjs');
const treeTools = require('./mutate-tree.cjs');

const OPTIONS = { timeout: 120000 };
const FILE = 'capability\\C059\\tests\\server.test.cjs';

// A TAP stream as the node runner writes it: one `not ok` block per entry (the keys two spaces deeper), then the counters.
function tap({ entries = [], pass = 0, cancelled = 0, extra = {} }) {
  const lines = ['TAP version 13'];
  let number = 0;
  for (let index = 0; index < pass; index += 1) lines.push(`ok ${(number += 1)} - a test that passes`, '  ---', '  duration_ms: 1.5', "  type: 'test'", '  ...');
  const writeEntry = (entry, indent) => {
    const pad = ' '.repeat(indent);
    lines.push(`${pad}not ok ${(number += 1)} - ${entry.name}`, `${pad}  ---`, `${pad}  duration_ms: 3.5`, `${pad}  type: 'test'`, `${pad}  location: 'x:1:1'`);
    if (entry.failureType) lines.push(`${pad}  failureType: '${entry.failureType}'`);
    lines.push(`${pad}  error: |-`, `${pad}    something`);
    if (entry.code) lines.push(`${pad}  code: '${entry.code}'`);
    lines.push(`${pad}  name: 'Error'`);
    for (const child of entry.children ?? []) writeEntry(child, indent + 4);
    lines.push(`${pad}  ...`);
  };
  for (const entry of entries) writeEntry(entry, 0);
  const fail = extra.fail ?? entries.length;
  const total = extra.tests ?? pass + fail + cancelled;
  lines.push(`1..${total}`, `# tests ${total}`, '# suites 0', `# pass ${pass}`, `# fail ${fail}`, `# cancelled ${cancelled}`, '# skipped 0', '# todo 0', '# duration_ms 12');
  return lines.join('\n');
}
const assertion = (name) => ({ name, failureType: 'testCodeFailure', code: 'ERR_ASSERTION' });
const thrown = (name) => ({ name, failureType: 'testCodeFailure' });

test('an unhandled rejection or an uncaught exception that the runner attributes to a NAMED test is an error thrown inside it (a kill); attributed to a whole file it is not', OPTIONS, () => {
  for (const failureType of ['unhandledRejection', 'uncaughtException']) {
    const named = classify({ code: 1, text: tap({ entries: [{ name: 'a page test', failureType, code: 'ERR_TEST_FAILURE' }], pass: 3 }) });
    assert.deepEqual([named.status, named.named, named.kinds.thrown, named.kinds.other], ['killed', ['a page test'], 1, 0], failureType);
    const file = classify({ code: 1, text: tap({ entries: [{ name: FILE, failureType, code: 'ERR_TEST_FAILURE' }], pass: 3 }) });
    assert.deepEqual([file.status, file.named, file.kinds.file], ['undecided', [], 1], failureType);
  }
  assert.equal(kindOf({ name: 'x', failureType: 'testAborted', code: 'ERR_TEST_FAILURE' }), 'other');
});

test('a named test that fails by an assertion kills; so does an error thrown inside a named test', OPTIONS, () => {
  const a = classify({ code: 1, text: tap({ entries: [assertion('the Host check')], pass: 3 }) });
  assert.deepEqual([a.status, a.named, a.kinds.assertion, a.unfinished], ['killed', ['the Host check'], 1, false]);
  const b = classify({ code: 1, text: tap({ entries: [thrown('the origin check')], pass: 2 }) });
  assert.deepEqual([b.status, b.named, b.kinds.thrown], ['killed', ['the origin check'], 1]);
  const both = classify({ code: 1, text: tap({ entries: [assertion('one'), thrown('two'), assertion('one')], pass: 1 }) });
  assert.deepEqual([both.status, both.named], ['killed', ['one', 'two']]);
});

test('a timeout of the runner, the failure of a whole file, a cancelled test and a failed hook are UNDECIDED, never a kill', OPTIONS, () => {
  const classes = [
    ['timeout', { name: 'a slow test', failureType: 'testTimeoutFailure', code: 'ERR_TEST_FAILURE' }],
    ['file', { name: FILE, failureType: 'testCodeFailure', code: 'ERR_TEST_FAILURE' }],
    ['cancelled', { name: 'a test that was cancelled', failureType: 'cancelledByParent', code: 'ERR_TEST_FAILURE' }],
    ['hook', { name: 'a hook', failureType: 'hookFailed', code: 'ERR_TEST_FAILURE' }],
  ];
  for (const [kind, entry] of classes) {
    const verdict = classify({ code: 1, text: tap({ entries: [entry], pass: 4 }) });
    assert.deepEqual([verdict.status, verdict.unfinished, verdict.named, verdict.kinds[kind]], ['undecided', false, [], 1], kind);
    assert.match(verdict.reason, new RegExp(`1 ${kind}`), kind);
  }
});

test('a named assertion failure is a kill even when a timeout or a whole-file failure came with it; only the assertion is named', OPTIONS, () => {
  const verdict = classify({ code: 1, text: tap({ entries: [{ name: 'a slow test', failureType: 'testTimeoutFailure', code: 'ERR_TEST_FAILURE' }, assertion('the real killer'), { name: FILE, failureType: 'testCodeFailure', code: 'ERR_TEST_FAILURE' }], pass: 2 }) });
  assert.deepEqual([verdict.status, verdict.named], ['killed', ['the real killer']]);
});

test('a failing subtest is read on its own: the parent that only reports its subtests is not a kill, the nested assertion is', OPTIONS, () => {
  const verdict = classify({ code: 1, text: tap({ entries: [{ name: 'a group', failureType: 'subtestsFailed', code: 'ERR_TEST_FAILURE', children: [assertion('the nested one')] }], pass: 0, extra: { tests: 2, fail: 2 } }) });
  assert.equal(verdict.kinds.parent, 1);
  assert.equal(verdict.kinds.assertion, 1);
  assert.deepEqual([verdict.status, verdict.named], ['killed', ['the nested one']]);
  const onlyParent = classify({ code: 1, text: tap({ entries: [{ name: 'a group', failureType: 'subtestsFailed', code: 'ERR_TEST_FAILURE' }], pass: 0 }) });
  assert.equal(onlyParent.status, 'undecided');
});

test('a run that crashed (no counters), a run whose counters do not add up and a failing exit without a failing test are UNDECIDED; a failing test with exit 0 is never a survivor', OPTIONS, () => {
  const crashed = classify({ code: null, text: 'TAP version 13\nok 1 - a test\n' });
  assert.deepEqual([crashed.status, crashed.unfinished], ['undecided', true]);
  assert.equal(counters('# tests 3\n# pass 3\n'), null, 'a missing counter is no counters');
  const uneven = classify({ code: 1, text: tap({ entries: [assertion('x')], pass: 1, extra: { tests: 9 } }) });
  assert.deepEqual([uneven.status, uneven.unfinished], ['undecided', false]);
  const silent = classify({ code: 1, text: tap({ pass: 5 }) });
  assert.deepEqual([silent.status, silent.unfinished], ['undecided', false]);
  assert.match(silent.reason, /no failing test in the TAP/);
  const contradiction = classify({ code: 0, text: tap({ entries: [assertion('x')], pass: 1 }) });
  assert.equal(contradiction.status, 'undecided', 'exit 0 with a failing test in the TAP is not a survivor');
});

test('a run in which every test passed and the exit code is 0 is a survivor', OPTIONS, () => {
  const verdict = classify({ code: 0, text: tap({ pass: 7 }) });
  assert.deepEqual([verdict.status, verdict.named, verdict.unfinished], ['survived', [], false]);
  assert.equal(classify({ code: 0, text: tap({ pass: 0 }) }).status, 'undecided', 'a run of no test decides nothing');
});

test('the reader of the TAP: failures() reads the keys of each entry at its own depth, kindOf() names the class', OPTIONS, () => {
  const text = tap({ entries: [{ name: 'outer', failureType: 'subtestsFailed', code: 'ERR_TEST_FAILURE', children: [assertion('inner')] }, thrown('plain')], pass: 0, extra: { tests: 3 } });
  assert.deepEqual(failures(text).map((entry) => [entry.name, entry.failureType, entry.code, kindOf(entry)]), [
    ['outer', 'subtestsFailed', 'ERR_TEST_FAILURE', 'parent'], ['inner', 'testCodeFailure', 'ERR_ASSERTION', 'assertion'], ['plain', 'testCodeFailure', null, 'thrown'],
  ]);
});

test('the kind of proof of an equivalent mutant is read from its reason, and a demonstration names a test file', OPTIONS, () => {
  assert.equal(proofKind('IDENTITY: identical replacement'), 'identity');
  assert.equal(proofKind('DEMONSTRATED (tests\\node-close.test.cjs): a bare server shows it'), 'demonstrated');
  assert.equal(demonstrationFile('DEMONSTRATED (tests\\node-close.test.cjs): a bare server shows it'), 'node-close.test.cjs');
  assert.equal(proofKind('REASONING ONLY: code reading'), 'reasoning');
  for (const reason of ['proof: a long text that says nothing about its kind', 'DEMONSTRATED: no file', 'identity: lower case']) assert.equal(proofKind(reason), 'unlabelled', reason);
  assert.equal(proofKind(undefined), null);
  assert.equal(demonstrationFile('REASONING ONLY: x'), null);
});

// ---- the REAL runner on tiny test files, in a private tree (the file names have the shape the generator gives: capability\C059\tests\<name>.test.cjs, relative to the tree) ----
const SOURCES = {
  pass: "require('node:test')('passes', () => {});\n",
  assertion: "const test = require('node:test');\nconst assert = require('node:assert/strict');\ntest('fails by assertion', () => assert.equal(1, 2));\n",
  thrown: "require('node:test')('throws a TypeError', () => { const nothing = null; return nothing.property; });\n",
  rejection: "require('node:test')('rejects in the background', () => { Promise.reject(new TypeError('boom')); return new Promise((resolve) => setTimeout(resolve, 100)); });\n",
  uncaught: "require('node:test')('throws in a timer', () => { setTimeout(() => { throw new Error('late'); }, 10); return new Promise((resolve) => setTimeout(resolve, 150)); });\n",
  timeout: "require('node:test')('hangs past its limit', { timeout: 200 }, () => new Promise((resolve) => setTimeout(resolve, 2500)));\n",
  file: "const = ;\n",
  crash: "require('node:test')('kills the runner', () => process.kill(process.ppid, 'SIGKILL'));\n",
};
const EXPECTED = { pass: 'survived', assertion: 'killed', thrown: 'killed', rejection: 'killed', uncaught: 'killed', timeout: 'undecided', file: 'undecided', crash: 'undecided' };

function runNode(tree, name) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=900000', path.join('capability', 'C059', 'tests', `${name}.test.cjs`)], { cwd: tree, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 90000);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, text: Buffer.concat(chunks).toString('utf8') }); });
  });
}

test('the REAL node runner: a passing file survives, an assertion, a thrown error, an unhandled rejection and an uncaught exception kill, a timeout, an unreadable file and a killed runner are undecided', OPTIONS, async () => {
  const tree = path.join(__dirname, 'scratch', `t-${crypto.randomUUID()}`);
  try {
    fs.mkdirSync(path.join(tree, 'capability', 'C059', 'tests'), { recursive: true });
    for (const [name, source] of Object.entries(SOURCES)) fs.writeFileSync(path.join(tree, 'capability', 'C059', 'tests', `${name}.test.cjs`), source);
    // The timeout file runs with the per-test cap of ITS OWN test (200 ms): the runner itself reports the timeout, which the classification must not take for a kill.
    const runs = Object.fromEntries(await Promise.all(Object.keys(SOURCES).map(async (name) => [name, await runNode(tree, name)])));
    const verdicts = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, classify(run)]));
    assert.deepEqual(Object.fromEntries(Object.entries(verdicts).map(([name, verdict]) => [name, verdict.status])), EXPECTED);
    assert.deepEqual(verdicts.assertion.named, ['fails by assertion']);
    assert.deepEqual(verdicts.thrown.named, ['throws a TypeError']);
    assert.deepEqual([verdicts.rejection.named, verdicts.rejection.kinds.thrown], [['rejects in the background'], 1], 'the runner attributes an unhandled rejection to the named test');
    assert.deepEqual([verdicts.uncaught.named, verdicts.uncaught.kinds.thrown], [['throws in a timer'], 1], 'the runner attributes an uncaught exception to the named test');
    assert.equal(verdicts.timeout.kinds.timeout, 1, 'the timeout is a timeout of the runner');
    assert.equal(verdicts.file.kinds.file, 1, 'an unreadable file is a failure of the whole file');
    assert.equal(verdicts.crash.unfinished, true, 'a killed runner leaves no counters');
  } finally {
    fs.rmSync(tree, { recursive: true, force: true });
    try { fs.rmdirSync(path.join(__dirname, 'scratch')); } catch { /* another test still uses it, or it is gone */ }
  }
});

test('the private tree of a worker is pristine again after a run that left things behind: a changed file, a missing file, a stray file and a stray folder', OPTIONS, () => {
  const tree = path.join(__dirname, 'scratch', `t-${crypto.randomUUID()}`);
  try {
    fs.mkdirSync(path.join(tree, 'capability', 'C059', 'tests'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'capability', 'C059', 'server.cjs'), 'server');
    fs.writeFileSync(path.join(tree, 'capability', 'C059', 'tests', 'a.test.cjs'), 'a');
    const pristine = treeTools.snapshot(tree);
    const pristineDigest = treeTools.digest(pristine);
    assert.equal(treeTools.restore(tree, pristine), 0, 'a pristine tree needs no repair');
    fs.writeFileSync(path.join(tree, 'capability', 'C059', 'server.cjs'), 'mutated');
    fs.rmSync(path.join(tree, 'capability', 'C059', 'tests', 'a.test.cjs'));
    fs.mkdirSync(path.join(tree, 'capability', 'C059', 'data', 'left-over'), { recursive: true });
    fs.writeFileSync(path.join(tree, 'capability', 'C059', 'data', 'left-over', 'journal.json'), '{}');
    fs.writeFileSync(path.join(tree, 'capability', 'C059', 'tests', 'stray.txt'), 'x');
    assert.notEqual(treeTools.digest(treeTools.snapshot(tree)), pristineDigest, 'the digest sees every kind of leftover');
    assert.equal(treeTools.restore(tree, pristine), 5, 'five paths were repaired: the changed file, the missing file, the stray file, the stray file of the stray folder and the folder');
    assert.equal(treeTools.digest(treeTools.snapshot(tree)), pristineDigest, 'the tree is pristine again');
    assert.equal(fs.existsSync(path.join(tree, 'capability', 'C059', 'data')), false, 'the stray folder is gone');
    assert.equal(treeTools.restore(tree, pristine), 0, 'a second restore finds nothing to repair');
  } finally {
    fs.rmSync(tree, { recursive: true, force: true });
    try { fs.rmdirSync(path.join(__dirname, 'scratch')); } catch { /* another test still uses it, or it is gone */ }
  }
});
