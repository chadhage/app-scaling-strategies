'use strict';

// Evidence of the THIRD fix cycle (F24 to F27 of the third independent review, G102 and G103). Every hash of every capture is recomputed and each
// kind of check is proved by tampering with scratch copies (L-0133). The captures made at the second fix pin the live files of that day; this fix
// changed some of them, so they are recomputed against the manifest of that commit's tree (anchored to git by tests\tree-manifest.cjs check). The
// figures the README states about the captures of the END state are asserted only once evidence\pins.json exists (while the captures are being
// recorded they do not exist yet).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const E = require('./evidence-check.cjs');
const F = require('./fix-red.cjs');
const T = require('./tree-manifest.cjs');

const evidence = path.join(s.root, 'evidence');
const redRoot = path.join(evidence, 'red');
const repo = path.resolve(s.root, '..', '..');
// C017_END_STATE=run forces the END-state assertions before pins.json exists: the capture of green-05 must run before pins.json pins it (see
// evidence-fourth-fix.test.cjs), and it runs the whole suite with this switch so that no test is skipped in the archived GREEN.
const forced = process.env.C017_END_STATE === 'run';
const ended = () => forced || fs.existsSync(path.join(evidence, 'pins.json'));
const readme = () => fs.readFileSync(path.join(s.root, 'README.md'), 'utf8');
const tree2 = JSON.parse(fs.readFileSync(path.join(evidence, 'tree-8832dac5.json'), 'utf8'));
const tree3 = JSON.parse(fs.readFileSync(path.join(evidence, 'tree-35b21507.json'), 'utf8'));
// verifyAll hashes every capture of the namespace and unzips every transcript: once per test file is enough (nothing is edited while it runs).
let memo = null;
const everything = () => { memo = memo || E.verifyAll(); return memo; };

test('the tree of the second fix is anchored to its commit and every archive made at that commit recomputes against it (live pins would name the files this fix changed)', () => {
  assert.equal(tree2.commit, T.TREES['8832dac5'].commit);
  assert.equal(tree2.tag, 'kanban/C017/8832dac542f6');
  assert.ok(Object.keys(tree2.files).length >= 200);
  const all = everything();
  for (const key of ['green-03', 'coverage-03']) {
    assert.ok(all[key], `${key} is present`);
    assert.deepEqual(Object.values(all[key]).flatMap((entry) => entry.problems), [], key);
  }
  const committed = Object.keys(all.red).filter((name) => Object.hasOwn(tree2.files, `capability/C017/evidence/red/${name}/red.json`));
  assert.ok(committed.length >= 13, `${committed.length} RED archives were committed at the second fix`);
  for (const name of committed) assert.deepEqual(all.red[name].problems, [], name);
  // The files this fix edited differ from the committed bytes the old archives pin, so a live recomputation WOULD name them.
  for (const file of ['server.cjs', 'tests/child.cjs', 'tests/pipelining.cjs']) {
    const pinned = tree2.files[`capability/C017/${file}`].sha256;
    assert.notEqual(E.sha(fs.readFileSync(path.join(s.root, file))), pinned, `${file} was not changed by the third fix`);
  }
});

test('the published server.cjs of the second fix is retained byte for byte, equals the tree of that commit and really differs from the final code', () => {
  const prefix = E.verifyPrefix(path.join(redRoot, 'prefix-8832dac5'));
  assert.deepEqual(prefix.problems, []);
  assert.equal(prefix.manifest.commit, tree2.commit);
  assert.equal(prefix.manifest.files.length, 1);
  assert.equal(prefix.manifest.files[0].sha256, tree2.files['capability/C017/server.cjs'].sha256);
  assert.notEqual(E.sha(fs.readFileSync(path.join(s.root, 'server.cjs'))), prefix.manifest.files[0].sha256);
});

test('the two naive subjects are derived from the published bytes by the exact replacements their manifests name, and every prefix archive recomputes', () => {
  const all = everything();
  for (const name of ['prefix-8832dac5', 'prefix-naive-deadline', 'prefix-naive-limits']) assert.deepEqual(all.prefixes[name].problems, [], name);
  const deadline = JSON.parse(fs.readFileSync(path.join(redRoot, 'prefix-naive-deadline', 'manifest.json'), 'utf8'));
  assert.equal(deadline.derivedFrom.sha256, tree2.files['capability/C017/tests/child.cjs'].sha256);
  const limits = JSON.parse(fs.readFileSync(path.join(redRoot, 'prefix-naive-limits', 'manifest.json'), 'utf8'));
  assert.equal(limits.derivedFrom.sha256, tree2.files['capability/C017/server.cjs'].sha256);
  const snapshot = fs.readFileSync(path.join(redRoot, 'prefix-naive-limits', 'server.snapshot.cjs'), 'utf8');
  assert.doesNotMatch(snapshot, /maxHeadersCount|server\.maxConnections/, 'the subject really lacks the two limits');
});

test('verify-green and replay compare test NAMES at every depth, never counts: a RED cut at 26 tests passes against a final run of 28 (F27)', () => {
  const archived = ['TAP version 13', '# Subtest: file', '    # Subtest: row a', '    not ok 1 - row a', '    ok 2 - row b', 'not ok 1 - the whole file'].join('\r\n');
  assert.deepEqual([...F.tapNames(archived, false)].sort(), ['row a', 'the whole file']);
  assert.deepEqual([...F.tapNames(archived, true)], ['row b']);
  const final = ['    ok 1 - row a', '    ok 2 - row b', '    ok 3 - row c', '    ok 4 - row d # SKIP not now', 'ok 1 - the whole file'].join('\n');
  const passing = F.tapNames(final, true);
  assert.ok([...F.tapNames(archived, false)].every((name) => passing.has(name)), 'every name that failed in the archive passes now, although the archive had fewer tests');
  assert.ok(passing.has('row d'), 'a skip directive is not part of the name');
  assert.equal(F.tapNames('not ok 1 - a\nok 2 - b\n', false).has('b'), false);
  // A RED cut by its own timeout names the test FILE as the failing test: that is a cut, never compared (the archived chunked-structural run).
  const cut = ['not ok 1 - row a', 'not ok 2 - capability\\C017\\tests\\chunked-process.test.cjs', 'ok 3 - the control'].join('\n');
  assert.deepEqual(F.failedNames(cut), ['row a']);
  const archivedCut = JSON.parse(fs.readFileSync(path.join(redRoot, fs.readdirSync(redRoot).find((name) => name.startsWith('fix-chunked-structural-')), 'red.json'), 'utf8'));
  assert.equal(archivedCut.summary.tests, 26, 'the archived RED of the rewritten cross-process test has the cut count that names alone can compare');
});

const KINDS = ['loops-04/child.json', 'mutants-04.json', 'mutants-gen-04.json', 'browser-observation-04.json', 'browser-journal-04.json'];

function scratchResults(t) {
  const made = s.scratch('ev5');
  t.after(() => made.remove());
  for (const name of KINDS) {
    fs.mkdirSync(path.dirname(path.join(made.dir, name)), { recursive: true });
    fs.writeFileSync(path.join(made.dir, name), `${JSON.stringify({ schema: 'x', inputs: E.inputPins() })}\n`);
  }
  // Results of an earlier fix carry no pins and must not be demanded to.
  fs.writeFileSync(path.join(made.dir, 'mutants-03.json'), '{}\n');
  fs.mkdirSync(path.join(made.dir, 'loops-03'));
  fs.writeFileSync(path.join(made.dir, 'loops-03', 'child.json'), '{}\n');
  return made.dir;
}

test('a loop, mutation or browser result of the third fix without its input pins, with an edited pin, a missing file or an unpinned file of the namespace is named (F27)', (t) => {
  const dir = scratchResults(t);
  assert.deepEqual(E.resultFiles(dir), [...KINDS].sort(), 'the results of the third fix are found, those of the second fix are not demanded to carry pins');
  for (const name of KINDS) assert.deepEqual(E.verifyResultInputs(path.join(dir, name)).problems, [], `${name}: the untouched result verifies`);
  const cases = [
    ['an edited input hash', (value) => { value.inputs[0].rawSha256 = `${value.inputs[0].rawSha256.slice(1)}0`; }, /differs from its pin/],
    ['an input that no longer exists', (value) => { value.inputs[0].path = 'capability\\C017\\tests\\does-not-exist.cjs'; }, /the pinned input is missing/],
    ['a file of the namespace that the result does not pin', (value) => { value.inputs.pop(); }, /a file of the namespace that the result does not pin/],
    ['the pins removed', (value) => { delete value.inputs; }, /carries no input pins/],
  ];
  for (const name of KINDS) {
    for (const [label, tamper, expected] of cases) {
      const file = path.join(dir, name);
      const before = fs.readFileSync(file, 'utf8');
      const value = JSON.parse(before);
      tamper(value);
      fs.writeFileSync(file, JSON.stringify(value));
      const result = E.verifyResultInputs(file);
      assert.equal(result.ok, false, `${name}: ${label} was accepted`);
      assert.ok(result.problems.some((problem) => expected.test(problem)), `${name}: ${label}: ${JSON.stringify(result.problems)}`);
      fs.writeFileSync(file, before);
    }
  }
});

test('every result of the third fix that exists pins the bytes it was produced from (the retained -04 results against the tree of the commit they were made at)', () => {
  const all = everything();
  assert.deepEqual(Object.values(all.results).flatMap((entry) => entry.problems), []);
  assert.ok(Object.keys(all.results).some((name) => /-04(\.json)?$/.test(name)), 'the retained results of the third fix are verified');
});

test('the figures the README states about the three new REDs equal the stored evidence and the unproven stall claim is gone (claims are tests, F26)', () => {
  const text = readme();
  const expected = { pending: [6, 4], lifecycle: [6, 5], limits: [3, 3] };
  for (const [group, [tests, fail]] of Object.entries(expected)) {
    const dir = fs.readdirSync(redRoot).find((name) => name.startsWith(`fix-${group}-`));
    const manifest = JSON.parse(fs.readFileSync(path.join(redRoot, dir, 'red.json'), 'utf8'));
    assert.deepEqual([manifest.summary.tests, manifest.summary.fail], [tests, fail], group);
    assert.ok(text.includes(`fix-${group}: ${fail} of ${tests}`), `the README states "fix-${group}: ${fail} of ${tests}"`);
  }
  assert.doesNotMatch(text, /the per-process budget and the smaller bound lower it/, 'the unproven sentence of the second fix is gone');
  assert.match(text, /this README does NOT claim that the per-process budget or the smaller bound lower the stall/);
  assert.match(text, /MORE THAN 8 of them behind its first request is DESTROYED/);
  const server = fs.readFileSync(path.join(s.root, 'server.cjs'), 'utf8');
  assert.match(server, /const MAX_DROPPED = 8;/, 'the README states the constant of the code');
});

// F28 of the fourth review: this test used to `return` while evidence\pins.json was missing, which the runner printed as a plain ok (1 ms, `# skipped 0`)
// and which counted a test that asserted nothing (L-0220). It is now an EXPLICIT skip with its reason (TAP `# SKIP <reason>`, `# skipped 1`), and
// end-state-skip.test.cjs proves that it can never pass silently. It asserts the RETAINED captures of the third fix as they really are: the generator
// run of that fix has exactly one UNDECIDED mutant (G083), which that fix killed by hand (evidence\by-hand-04); the fourth fix re-ran the generator.
const SKIP_UNENDED = 'evidence\\pins.json is not written: the END state (loops, mutation runs, coverage figures) is NOT asserted by this test in this state';
test('the retained loops, mutation runs and coverage of the third fix are archived, the README states their real figures and the one undecided mutant is the disclosed one (END state of the third fix)', { skip: ended() ? false : SKIP_UNENDED }, () => {
  const text = readme();
  const dir = path.join(evidence, 'loops-04');
  const plan = { chunked: [64, 4], 'chunked-process': [64, 4], resources: [64, 4], drain: [64, 4], 'pending-flood-process': [64, 4], pipelining: [16, 4], 'two-servers': [16, 4], 'refusal-shapes': [16, 4], child: [16, 4], 'pending-flood': [16, 4], limits: [16, 4], 'child-lifecycle': [16, 4] };
  for (const [name, [runs, parallel]] of Object.entries(plan)) {
    const loop = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
    assert.deepEqual([loop.file, loop.runs, loop.parallel, loop.failures, loop.failing], [`${name}.test.cjs`, runs, parallel, 0, []], name);
    assert.ok(text.includes(`${name}.test.cjs ${runs} x ${parallel} (third fix)`), `the README states the loop of ${name}`);
  }
  const named = JSON.parse(fs.readFileSync(path.join(evidence, 'mutants-04.json'), 'utf8'));
  assert.deepEqual([named.mutants, named.killed, named.undecided, named.survived], [37, 37, [], []], 'the retained named run has the 37 named mutants of the third fix, all killed');
  assert.ok(named.results.every((result) => result.failingTests.length >= 1));
  assert.ok(text.includes('37 named mutants'));
  const run = JSON.parse(fs.readFileSync(path.join(evidence, 'mutants-gen-04.json'), 'utf8'));
  assert.equal(run.baseSha256, tree3.files['capability/C017/server.cjs'].sha256, 'the third-fix run mutated the server.cjs that fix published (tree of commit 35b21507)');
  assert.equal(run.generated, 115);
  assert.deepEqual(run.undecided, ['G083-cond-false-L194'], 'the retained run has exactly the one undecided mutant it disclosed');
  const byHand = JSON.parse(fs.readFileSync(path.join(evidence, 'by-hand-04', 'results.json'), 'utf8'));
  assert.ok(byHand.g083.results.length >= 2);
  for (const result of byHand.g083.results) assert.ok(result.failing.length >= 1 && result.summary.fail >= 1, `${result.file} killed G083 by name when it was run by hand`);
  assert.ok(text.includes(`the third-fix base run killed ${run.killed} of ${run.ran} generated mutants`));
  for (const entry of run.survived) assert.ok(text.includes(entry.id), `${entry.id} survived the third-fix run and must be classified in the README`);
  const coverage = everything()['coverage-04'];
  assert.equal(Object.keys(coverage).length, 7, 'one L-0004 command per production file');
  assert.deepEqual(Object.values(coverage).flatMap((entry) => entry.problems), []);
});
