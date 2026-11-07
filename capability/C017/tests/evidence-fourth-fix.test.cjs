'use strict';

// Evidence of the FOURTH fix cycle (F28 to F35 of the fifth independent review). F28: the END-state test of the third fix `return`ed silently while
// evidence\pins.json was missing, so the suite printed a plain ok (1 ms, `# skipped 0`) for a test that asserted nothing and that would have FAILED had it
// run (the generator run of the third fix left G083 undecided). The fourth fix (1) makes every END-state test an EXPLICIT skip with its reason, proved by
// end-state-skip.test.cjs, and (2) makes the END state REACHABLE: the generator now continues past a cut test file, so G083 is killed by name, and
// evidence\pins.json is written LAST, which makes the END-state test below run for real in the published suite.
// C017_END_STATE=run forces the END-state assertions before pins.json exists: the capture of green-05 must run before pins.json pins it, so it runs the
// whole suite with that switch and the END-state test executes for real in the archived GREEN too. pins.json itself is only asserted once it exists.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const E = require('./evidence-check.cjs');
const T = require('./tree-manifest.cjs');

const evidence = path.join(s.root, 'evidence');
const redRoot = path.join(evidence, 'red');
const repo = path.resolve(s.root, '..', '..');
const forced = process.env.C017_END_STATE === 'run';
const ended = () => forced || fs.existsSync(path.join(evidence, 'pins.json'));
const readme = () => fs.readFileSync(path.join(s.root, 'README.md'), 'utf8');
const readJson = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));
const tree2 = readJson(evidence, 'tree-8832dac5.json');
const tree3 = readJson(evidence, 'tree-35b21507.json');
// verifyAll hashes every capture of the namespace and unzips every transcript: once per test file is enough (nothing is edited while it runs).
let memo = null;
const everything = () => { memo = memo || E.verifyAll(); return memo; };
const snapshot = (name, file) => fs.readFileSync(path.join(redRoot, name, file));

test('the tree of the third fix is anchored to its commit, and every archive and capture made at that commit recomputes against it (live pins would name the files this fix changed)', () => {
  assert.equal(tree3.commit, T.TREES['35b21507'].commit);
  assert.equal(tree3.tag, 'kanban/C017/35b21507c103');
  assert.ok(Object.keys(tree3.files).length >= 300);
  const all = everything();
  for (const key of ['green-04', 'verify-green-04', 'coverage-04']) {
    assert.ok(all[key], `${key} is present`);
    assert.deepEqual(Object.values(all[key]).flatMap((entry) => entry.problems), [], key);
  }
  const redJson = (name) => `capability/C017/evidence/red/${name}/red.json`;
  const committed = Object.keys(all.red).filter((name) => Object.hasOwn(tree3.files, redJson(name)) && !Object.hasOwn(tree2.files, redJson(name)));
  assert.deepEqual(committed.map((name) => name.replace(/-[0-9a-f]{8}$/, '')).sort(), ['fix-lifecycle', 'fix-limits', 'fix-pending'], 'the REDs of the third fix');
  for (const name of committed) assert.deepEqual(all.red[name].problems, [], name);
  const retained = Object.keys(all.results).filter((name) => /-04[./]/.test(name));
  assert.ok(retained.length >= 16, `${retained.length} results of the third fix generation are recomputed against the tree of that commit`);
  // The files this fix edited differ from the bytes the -04 captures pin, so a live recomputation WOULD name them.
  for (const file of ['server.cjs', 'tests/mutate-gen.cjs', 'tests/evidence-check.cjs', 'tests/evidence-third-fix.test.cjs']) {
    assert.notEqual(E.sha(fs.readFileSync(path.join(s.root, file))), tree3.files[`capability/C017/${file}`].sha256, `${file} was not changed by the fourth fix`);
  }
});

test('the published bytes of the four files the new REDs are about are retained and equal the tree of commit 35b21507, and each naive subject is that file with the exact replacements its manifest names (F28, F30, F34)', () => {
  const all = everything();
  const prefix = all.prefixes['prefix-35b21507'];
  assert.deepEqual(prefix.problems, []);
  assert.equal(prefix.manifest.commit, tree3.commit);
  const published = {};
  for (const item of prefix.manifest.files) {
    assert.equal(item.sha256, tree3.files[item.live].sha256, `${item.live} is the published file`);
    published[item.live] = fs.readFileSync(path.join(repo, item.snapshot));
  }
  assert.deepEqual(Object.keys(published).sort(), ['capability/C017/imports.json', 'capability/C017/server.cjs', 'capability/C017/tests/evidence-third-fix.test.cjs', 'capability/C017/tests/mutate-gen.cjs']);
  for (const name of ['prefix-naive-churn', 'prefix-naive-generator']) {
    assert.deepEqual(all.prefixes[name].problems, [], name);
    const manifest = readJson(redRoot, name, 'manifest.json');
    const source = published[manifest.derivedFrom.file];
    assert.equal(E.sha(source), manifest.derivedFrom.sha256, `${name} is derived from the published file`);
    let text = source.toString('utf8');
    for (const { find, replace } of manifest.derivedFrom.replacements) {
      assert.equal(text.split(find).length - 1, 1, `${name}: "${find.slice(0, 50)}" occurs exactly once in the published file`);
      text = text.replace(find, () => replace);
    }
    assert.equal(E.sha(Buffer.from(text, 'utf8')), manifest.files[0].sha256, `${name} equals the published bytes with its replacements applied`);
  }
  const churn = snapshot('prefix-naive-churn', 'server.snapshot.cjs').toString('utf8');
  assert.match(churn, /function openSockets/);
  assert.doesNotMatch(churn, /sockets\.delete\(socket\)/, 'the churn subject keeps closed sockets in the tracked set');
  const generator = snapshot('prefix-naive-generator', 'mutate-gen.snapshot.cjs').toString('utf8');
  assert.match(generator, /async function decide/);
  assert.match(generator, /killed: null, undecided: true, killedBy: `\$\{path\.basename\(file\)\} \(cut, no named failing test\)`/, 'the generator subject stops at the first cut file');
  assert.match(published['capability/C017/tests/evidence-third-fix.test.cjs'].toString('utf8'), /if \(!ended\(\)\) return;/, 'the published END-state test returned silently');
  assert.doesNotMatch(fs.readFileSync(path.join(s.root, 'tests', 'evidence-third-fix.test.cjs'), 'utf8'), /if \(!ended\(\)\) return;/, 'the final one does not');
  assert.doesNotMatch(published['capability/C017/imports.json'].toString('utf8'), /qualify/, 'the published imports.json does not pin qualify.cjs');
});

test('the figures the README states about the four new REDs equal the stored evidence, and the misleading and unproven sentences are gone (claims are tests, F29)', () => {
  const text = readme();
  const groups = ['endskip', 'gencontinue', 'tracked', 'imports'];
  for (const group of groups) {
    const dir = fs.readdirSync(redRoot).find((name) => name.startsWith(`fix-${group}-`));
    assert.ok(dir, `fix-${group} is archived`);
    const { summary } = readJson(redRoot, dir, 'red.json');
    assert.ok(summary.fail >= 1 && summary.fail <= summary.tests, group);
    assert.ok(text.includes(`fix-${group}: ${summary.fail} of ${summary.tests}`), `the README states "fix-${group}: ${summary.fail} of ${summary.tests}"`);
  }
  assert.doesNotMatch(text, /so few first requests can be pending at a time/, 'the sentence that did not bound the cost is gone');
  assert.match(text, /the cost does not depend on a pending request/i);
  assert.match(text, /KEYS=none/);
  assert.match(text, /about 2\.4 MB \(50-byte\) to 6\.5 MB \(18-byte\) per connection per 64 KB read/);
  assert.match(text, /up to about 416 MB/);
  assert.match(text, /cap 16 still aborts 64 sockets of the 18-byte request/);
  assert.match(text, /wall-clock guards that remain/);
  assert.match(text, /fixtures\\sanitized-tap\.cjs/);
});

// The figures of the END state below are asserted only once evidence\pins.json exists (or C017_END_STATE=run forces them); until then the test is an
// EXPLICIT skip, never a plain ok (L-0220).
const SKIP_UNENDED = 'evidence\\pins.json is not written: the END state of the fourth fix (twelve loops, the named and generated mutation runs, coverage, the real-Edge captures and the README figures) is NOT asserted by this test in this state';
test('the loops, the mutation runs, the coverage and the real-Edge captures of the fourth fix are archived, the generator run is complete (G083 killed by name, nothing undecided) and the README states their real figures (END state)', { skip: ended() ? false : SKIP_UNENDED }, () => {
  const text = readme();
  const loopsDir = path.join(evidence, 'loops-05');
  const names = ['chunked', 'chunked-process', 'resources', 'drain', 'pending-flood-process', 'pipelining', 'two-servers', 'refusal-shapes', 'child', 'pending-flood', 'limits', 'child-lifecycle'];
  const slowest = [];
  for (const name of names) {
    const loop = readJson(loopsDir, `${name}.json`);
    assert.deepEqual([loop.file, loop.runs, loop.parallel, loop.failures, loop.failing, loop.burners.count], [`${name}.test.cjs`, 20, 4, 0, [], 4], name);
    assert.equal(loop.burners.pids.length, 4, `${name}: the PIDs of the four CPU burners are recorded`);
    assert.ok(text.includes(`${name}.test.cjs 20 x 4 (fourth fix)`), `the README states the loop of ${name}`);
    slowest.push(loop.slowestSeconds);
  }
  assert.equal(fs.readdirSync(loopsDir).filter((name) => name.endsWith('.json')).length, names.length, 'no loop is missing or extra');
  assert.ok(text.includes(`${Math.max(...slowest)} s`), `the README states the slowest single run of the loops (${Math.max(...slowest)} s)`);
  assert.ok(text.includes('4 CPU burners'));

  const { mutants } = require('./mutant-list.cjs');
  const named = readJson(evidence, 'mutants-05.json');
  assert.deepEqual([named.mutants, named.killed, named.undecided, named.survived], [mutants.length, mutants.length, [], []], 'every named mutant is killed');
  assert.ok(named.results.every((result) => result.failingTests.length >= 1), 'each by a named failing test');
  assert.ok(text.includes(`${mutants.length} named mutants`));

  const G = require('./mutate-gen.cjs');
  const run = readJson(evidence, 'mutants-gen-05.json');
  const server = fs.readFileSync(path.join(s.root, 'server.cjs'));
  assert.equal(run.generated, G.generate(server.toString('utf8').replace(/\r\n/g, '\n')).length, 'the run generated every mutant of the final server.cjs');
  assert.equal(run.baseSha256, E.sha(server));
  assert.deepEqual(run.undecided, [], 'no mutant is left undecided: the generator continues past a cut test file (F28)');
  assert.deepEqual(run.invalid, []);
  assert.equal(run.killed + run.survived.length, run.ran, 'every mutant is killed or listed as a survivor');
  const g083 = run.results.find((result) => result.id.startsWith('G083-'));
  assert.ok(g083 && g083.killed === true && /\.test\.cjs$/.test(g083.killedBy) && g083.failingTests.length >= 1, 'G083 (closeOwned never closes the listener) is killed by a named failing test');
  assert.ok(run.results.every((result) => result.invalid || result.killed === false || result.failingTests.length >= 1), 'every kill names a failing test');
  assert.ok(text.includes(`the fourth-fix base run killed ${run.killed} of ${run.ran} generated mutants`));
  for (const entry of run.survived) assert.ok(text.includes(entry.id), `${entry.id} survived the fourth-fix run and must be classified in the README`);

  const coverage = everything()['coverage-05'];
  assert.equal(Object.keys(coverage).length, 7, 'one L-0004 command per production file');
  assert.deepEqual(Object.values(coverage).flatMap((entry) => entry.problems), []);
  const tests = fs.readdirSync(path.join(s.root, 'tests')).filter((name) => name.endsWith('.test.cjs'));
  for (const [key, entry] of Object.entries(coverage)) {
    const file = key.replace(/^coverage-/, '').replace(/\.json$/, '');
    const row = entry.manifest.summary.coverageRows.find((candidate) => candidate.file === file);
    assert.ok(text.includes(`${file} ${row.lines}/${row.branches}/${row.functions}`), `the README states the coverage row of ${file}`);
    const included = entry.manifest.command.filter((arg) => /\.test\.cjs$/.test(arg)).map((arg) => path.basename(arg.replaceAll('\\', '/')));
    const left = tests.filter((name) => !included.includes(name)).map((name) => name.replace(/\.test\.cjs$/, '')).sort();
    assert.deepEqual(left, ['child', 'chunked-process', 'end-state-skip', 'evidence', 'evidence-fourth-fix', 'evidence-second-fix', 'evidence-third-fix', 'flood-structural', 'pending-flood-process', 'pipelining'], `${file}: the test files left out of the coverage command`);
  }
  for (const name of ['child', 'chunked-process', 'pending-flood-process', 'pipelining', 'flood-structural', 'evidence', 'evidence-second-fix', 'evidence-third-fix', 'evidence-fourth-fix', 'end-state-skip']) {
    assert.ok(text.includes(`${name}.test.cjs`), `the README names ${name}.test.cjs among the files left out of the coverage commands (F31)`);
  }

  for (const name of ['browser-observation-05.json', 'browser-journal-05.json']) {
    const observation = readJson(evidence, name);
    assert.equal(observation.edge.signature, 'Valid', name);
    assert.ok(observation.edge.major >= 156, name);
    assert.ok(Array.isArray(observation.inputs) && observation.inputs.length >= 90, `${name} pins the namespace files`);
  }
  assert.deepEqual(Object.values(everything().results).flatMap((entry) => entry.problems), [], 'every result of the fourth fix pins the bytes it was produced from');
  assert.deepEqual(Object.values(everything()['verify-green-05'] || {}).flatMap((entry) => entry.problems), [], 'verify-green-05');

  // `complete` names every missing capture; pins.json itself is asserted only once it exists (the forced capture run happens before it is written).
  const missing = E.verifyAll({ complete: true }).complete.complete.problems;
  const expected = forced && !fs.existsSync(path.join(evidence, 'pins.json')) ? missing.filter((problem) => !/^(pins\.json|green-05\/green\.json):/.test(problem)) : missing;
  assert.deepEqual(expected, [], 'the END state is complete');
  if (fs.existsSync(path.join(evidence, 'pins.json'))) assert.deepEqual(E.verifyPins().problems, [], 'every pin of evidence\\pins.json recomputes');
});
