'use strict';

// F20 and the evidence of the second fix cycle: every hash of EVERY capture is recomputed. The captures of the first fix pin the live files of
// the day they were made; the second fix changed some of them, so they are recomputed against the manifest of that commit's tree (anchored to
// git by tests\tree-manifest.cjs check). A one-byte edit of a coverage number, of a descriptive field of a manifest or of a browser observation
// is named, and the check is proved by tampering with scratch copies.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const E = require('./evidence-check.cjs');
const F = require('./fix-red.cjs');

const evidence = path.join(s.root, 'evidence');
const repo = path.resolve(s.root, '..', '..');
const tree = JSON.parse(fs.readFileSync(path.join(evidence, 'tree-8e7046e9.json'), 'utf8'));

test('the tree manifest is the tree of the first fix and the captures made at that commit recompute against it', () => {
  assert.equal(tree.commit, '8e7046e981311267b967ae71120d17ace350a307');
  assert.equal(tree.tag, 'kanban/C017/8e7046e98131');
  assert.ok(Object.keys(tree.files).length >= 150);
  const all = E.verifyAll();
  for (const key of ['green-02', 'verify-green-02', 'coverage-02']) {
    assert.ok(all[key], `${key} is present`);
    assert.deepEqual(Object.values(all[key]).flatMap((entry) => entry.problems), [], key);
  }
  // The live file of a pin is not what verified it: the second fix changed server.cjs, so a live recomputation WOULD name it.
  const green = all['green-02'].green.manifest.inputs.find((input) => input.path.endsWith('server.cjs'));
  assert.equal(green.rawSha256, tree.files['capability/C017/server.cjs'].sha256);
  assert.notEqual(E.sha(fs.readFileSync(path.join(s.root, 'server.cjs'))), green.rawSha256);
});

test('the retained published bytes of the first fix are pinned, equal the tree of that commit and really differ from the final code', () => {
  const prefix = E.verifyPrefix(path.join(evidence, 'red', 'prefix-8e7046e9'));
  assert.deepEqual(prefix.problems, []);
  assert.equal(prefix.manifest.commit, tree.commit);
  assert.deepEqual(prefix.manifest.files.map((item) => item.live.replace('capability/C017/', '')).sort(), ['contract.js', 'page.js', 'reconcile.cjs', 'server.cjs']);
  for (const item of prefix.manifest.files) {
    assert.equal(item.sha256, tree.files[item.live].sha256, `${item.live}: the snapshot is the published file of that commit`);
    assert.notEqual(E.sha(fs.readFileSync(path.join(repo, item.live))), item.sha256, `${item.live} was not changed by the second fix`);
  }
});

test('every capture and every manifest of the namespace recomputes (live pins for the second fix, tree pins for the first)', () => {
  // The END state (evidence\pins.json written) must be complete; while the captures are being recorded an unfinished capture is skipped.
  const all = E.verifyAll({ complete: fs.existsSync(path.join(evidence, 'pins.json')) });
  const flat = [all.prefix, all.prefix2, all.prefix3, all.prefix4, ...Object.values(all.red), ...['green-02', 'verify-green-02', 'green-03', 'verify-green-03', 'coverage-02', 'coverage-03', 'pins', 'complete'].flatMap((key) => Object.values(all[key] || {}))];
  assert.deepEqual(flat.flatMap((entry) => entry.problems), []);
});

function scratchCopy(t, names) {
  const made = s.scratch('ev3');
  t.after(() => made.remove());
  for (const name of names) {
    fs.mkdirSync(path.dirname(path.join(made.dir, name)), { recursive: true });
    fs.cpSync(path.join(evidence, name), path.join(made.dir, name), { recursive: true });
  }
  return made.dir;
}

test('a coverage number edited in a manifest is named: the claimed row must be the row of the transcript (F20)', (t) => {
  const dir = scratchCopy(t, ['coverage-02']);
  const pin = E.treePin();
  const clean = E.verifyCoverage(path.join(dir, 'coverage-02'), 'coverage-server.cjs.json', { pin });
  assert.deepEqual(clean.problems, []);
  const file = path.join(dir, 'coverage-02', 'coverage-server.cjs.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.summary.coverageRows[0].branches = 99.99;
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2));
  const edited = E.verifyCoverage(path.join(dir, 'coverage-02'), 'coverage-server.cjs.json', { pin });
  assert.ok(edited.problems.some((problem) => /not the row of the transcript/.test(problem)), JSON.stringify(edited.problems));
});

test('a one-byte edit of a descriptive manifest field, of a browser observation or of a pin is named by evidence/pins.json (F20)', (t) => {
  const dir = scratchCopy(t, ['coverage-02', 'browser-observation-02.json', 'tree-8e7046e9.json']);
  E.writePins(dir);
  assert.deepEqual(E.verifyPins(dir).problems, []);
  for (const [name, edit] of [
    ['coverage-02/coverage-server.cjs.json', (text) => text.replace('"purpose": "', '"purpose": "x')],
    ['browser-observation-02.json', (text) => `${text} `],
    ['tree-8e7046e9.json', (text) => text.replace('8e7046e9', '8e7046e8')],
  ]) {
    const file = path.join(dir, name);
    const before = fs.readFileSync(file, 'utf8');
    assert.notEqual(edit(before), before, `${name}: the edit changes nothing`);
    fs.writeFileSync(file, edit(before));
    assert.ok(E.verifyPins(dir).problems.some((problem) => problem.startsWith(`${name}: differs`)), `${name}: an edit went undetected`);
    fs.writeFileSync(file, before);
  }
  fs.rmSync(path.join(dir, 'browser-observation-02.json'));
  assert.ok(E.verifyPins(dir).problems.some((problem) => /browser-observation-02\.json: pinned but missing/.test(problem)));
});

test('the figures the README states about the second fix equal the stored evidence (claims are tests)', () => {
  const readme = fs.readFileSync(path.join(s.root, 'README.md'), 'utf8');
  const red = path.join(evidence, 'red');
  const expected = { expect: [23, 6], pipeline: [6, 3], journal: [11, 10], minors: [4, 3], 'chunked-structural': [26, 24] };
  for (const [group, [tests, fail]] of Object.entries(expected)) {
    const dir = fs.readdirSync(red).find((name) => name.startsWith(`fix-${group}-`));
    const manifest = JSON.parse(fs.readFileSync(path.join(red, dir, 'red.json'), 'utf8'));
    assert.deepEqual([manifest.summary.tests, manifest.summary.fail], [tests, fail], group);
    if (group !== 'pipeline') assert.ok(readme.includes(`${fail} of ${tests}`), `the README states ${fail} of ${tests} for ${group}`);
  }
  assert.ok(readme.includes('all three raw-socket matrices fail'));
  const lanesDir = fs.readdirSync(red).find((name) => name.startsWith('fix-lanes-'));
  const lanes = JSON.parse(fs.readFileSync(path.join(red, lanesDir, 'red.json'), 'utf8')).summary;
  assert.ok(lanes.fail >= 1 && lanes.fail + lanes.pass === lanes.tests, 'the lane tests fail on the naive subject');
  assert.ok(readme.includes(`${lanes.fail} of ${lanes.tests} lane tests fail`), 'the README states the lane RED');
  const { mutants } = require('./mutant-list.cjs');
  assert.equal(mutants.length, 37, 'the catalogue of the third fix: the 31 named mutants of the second fix and six more');
  assert.ok(readme.includes('31 named mutants'));
  const archived = path.join(evidence, 'mutants-03.json');
  if (fs.existsSync(archived)) {
    const summary = JSON.parse(fs.readFileSync(archived, 'utf8'));
    assert.deepEqual([summary.mutants, summary.killed, summary.survived], [31, 31, []], 'every named mutant of the second fix is killed by a named failing test');
    const current = new Set(mutants.map((mutant) => mutant.id));
    assert.ok(summary.results.every((result) => current.has(result.id)), 'the 31 archived mutants are still in the catalogue');
    assert.ok(summary.results.every((result) => result.failingTests.length >= 1));
  }
});

test('the systematic mutation run of the second fix is archived for the server.cjs of that fix, and every survivor of its base run is killed by the re-run or named in the README (L-0172, checklist line 4)', () => {
  const G = require('./mutate-gen.cjs');
  const base = path.join(evidence, 'mutants-gen-03.json');
  const again = path.join(evidence, 'mutants-gen-03-rerun.json');
  if (!fs.existsSync(path.join(evidence, 'pins.json')) && !fs.existsSync(base)) return;
  const readme = fs.readFileSync(path.join(s.root, 'README.md'), 'utf8');
  const server = fs.readFileSync(path.join(evidence, 'red', 'prefix-8832dac5', 'server.snapshot.cjs'));
  const run = JSON.parse(fs.readFileSync(base, 'utf8'));
  assert.equal(run.generated, G.generate(server.toString('utf8').replace(/\r\n/g, '\n')).length, 'the archived run generated every mutant of the server.cjs of the second fix');
  assert.equal(run.baseSha256, E.sha(server), 'the archived run mutated the server.cjs of the second fix (the published bytes, retained in evidence/red/prefix-8832dac5)');
  assert.equal(run.ran + run.invalid.length, run.generated);
  assert.equal(run.killed + run.survived.length, run.ran);
  assert.ok(run.results.every((result) => result.invalid || result.killed === false || result.failingTests.length >= 1 || /hang/.test(result.killedBy)), 'every kill names a failing test');
  assert.ok(readme.includes(`the base run killed ${run.killed} of ${run.ran} generated mutants`), 'the README states the base run');
  // The re-run of the survivors is part of the END state (evidence\pins.json written); while the captures are being recorded it may still be running.
  if (!fs.existsSync(again) && !fs.existsSync(path.join(evidence, 'pins.json'))) return;
  const second = JSON.parse(fs.readFileSync(again, 'utf8'));
  assert.deepEqual(second.results.map((result) => result.id).sort(), run.survived.map((entry) => entry.id).sort(), 'the re-run covers exactly the survivors of the base run');
  assert.equal(second.ran, run.survived.length);
  assert.ok(readme.includes(`the re-run killed ${second.killed} of ${second.ran} survivors`), 'the README states the re-run');
  for (const entry of second.survived) assert.ok(readme.includes(entry.id), `${entry.id} survived and must be classified in the README`);
});

test('the legacy time-bound tests of the first fix are retained byte for byte, equal the tree of that commit, and the live files are the structural rewrite (F22)', () => {
  const legacy = E.verifyPrefix(path.join(evidence, 'red', 'prefix-legacy-8e7046e9'));
  assert.deepEqual(legacy.problems, []);
  assert.equal(legacy.manifest.commit, tree.commit);
  assert.deepEqual(legacy.manifest.files.map((item) => item.live.replace('capability/C017/', '')).sort(), ['tests/chunked-process.test.cjs', 'tests/chunked.test.cjs']);
  for (const item of legacy.manifest.files) {
    assert.equal(item.sha256, tree.files[item.live].sha256, `${item.live}: the snapshot is the published file of that commit`);
    const live = fs.readFileSync(path.join(repo, item.live), 'utf8');
    assert.notEqual(E.sha(Buffer.from(live)), item.sha256, `${item.live} was not rewritten by the second fix`);
    assert.match(fs.readFileSync(path.join(evidence, 'red', 'prefix-legacy-8e7046e9', path.basename(item.snapshot)), 'utf8'), /CLOSE_BOUND_MS|LAG_BOUND_MS/, 'the retained bytes are the time-bound version');
    // No clock decides pass or fail in the rewrite: nothing reads the time or names a time bound (a poll sleep and the startup limit of a child are not decisions).
    assert.doesNotMatch(live, /Date\.now|performance\.now|hrtime|CLOSE_BOUND_MS|LAG_BOUND_MS|capMs|closedAfterMs|lagSince|monitorEventLoopDelay/, `${item.live} still reads a clock or names a time bound`);
  }
});

test('an archive that pinned the old bytes is satisfied by the retained copy only, and a tampered copy, manifest or path is named (F22)', (t) => {
  const red = path.join(evidence, 'red');
  const old = path.join(red, fs.readdirSync(red).find((name) => name.startsWith('fix-chunked-process-')));
  assert.deepEqual(E.verifyRed(old).problems, [], 'the live files are rewritten, the retained bytes satisfy the pins');
  const made = s.scratch('ev4');
  t.after(() => made.remove());
  const manifest = path.join(made.dir, 'manifest.json');
  const snapshot = path.join(made.dir, 'old.cjs');
  const bytes = Buffer.from("'use strict';\r\n// the old bytes\r\n");
  const input = { path: 'capability\\C017\\tests\\x.test.cjs', rawSha256: E.sha(bytes) };
  const write = (kept) => fs.writeFileSync(manifest, JSON.stringify({ files: [kept] }));
  fs.writeFileSync(snapshot, bytes);
  write({ live: 'capability/C017/tests/x.test.cjs', snapshot: 'old.cjs', sha256: E.sha(bytes) });
  const options = { manifest, base: made.dir };
  assert.equal(E.retainedMatches(input, options), true);
  assert.equal(E.retainedMatches({ ...input, path: 'capability\\C017\\tests\\y.test.cjs' }, options), false, 'a path that was not retained');
  assert.equal(E.retainedMatches({ ...input, rawSha256: E.sha(Buffer.from('other')) }, options), false, 'a pin that is not the retained bytes');
  fs.writeFileSync(snapshot, `${bytes}// weakened\r\n`);
  assert.equal(E.retainedMatches(input, options), false, 'a retained copy that was edited');
  fs.writeFileSync(snapshot, bytes);
  write({ live: 'capability/C017/tests/x.test.cjs', snapshot: 'old.cjs', sha256: E.sha(Buffer.from('other')) });
  assert.equal(E.retainedMatches(input, options), false, 'a manifest whose hash was edited');
  fs.rmSync(snapshot);
  write({ live: 'capability/C017/tests/x.test.cjs', snapshot: 'old.cjs', sha256: E.sha(bytes) });
  assert.equal(E.retainedMatches(input, options), false, 'a retained copy that was removed');
});

test('only the archive that pinned the old bytes is served them by the replay tool, every other archive runs the live tests (F22)', () => {
  const red = path.join(evidence, 'red');
  const mapped = Object.fromEntries(fs.readdirSync(red).filter((name) => name.startsWith('fix-')).map((name) => [name.replace(/^fix-/, '').replace(/-[0-9a-f]{8}$/, ''), Object.keys(F.retainedLegacy(path.join(red, name)))]));
  assert.deepEqual(mapped['chunked-process'].sort(), ['capability/C017/tests/chunked-process.test.cjs', 'capability/C017/tests/chunked.test.cjs']);
  for (const [group, files] of Object.entries(mapped)) if (group !== 'chunked-process') assert.deepEqual(files, [], `${group} must run the live tests`);
  const structural = JSON.parse(fs.readFileSync(path.join(red, fs.readdirSync(red).find((name) => name.startsWith('fix-chunked-structural-')), 'replay.json'), 'utf8'));
  assert.equal(structural.baseline, 'final', 'the structural RED runs on the final world with a naive subject');
  assert.deepEqual(Object.keys(structural.overlay), ['capability/C017/server.cjs']);
});

test('the flake loops are archived with zero failures and the README states their real sizes (F22, checklist line 12)', () => {
  const dir = path.join(evidence, 'loops-03');
  const plan = { chunked: [64, 4], 'chunked-process': [64, 4], resources: [64, 4], drain: [64, 4], pipelining: [16, 4], 'two-servers': [16, 4], 'refusal-shapes': [16, 4], child: [16, 4] };
  if (!fs.existsSync(path.join(evidence, 'pins.json')) && !fs.existsSync(dir)) return;
  const readme = fs.readFileSync(path.join(s.root, 'README.md'), 'utf8');
  for (const [name, [runs, parallel]] of Object.entries(plan)) {
    const loop = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`), 'utf8'));
    assert.deepEqual([loop.file, loop.runs, loop.parallel, loop.failures, loop.failing], [`${name}.test.cjs`, runs, parallel, 0, []], name);
    assert.ok(readme.includes(`${name}.test.cjs ${runs} x ${parallel}`), `the README states the loop of ${name} as "${name}.test.cjs ${runs} x ${parallel}"`);
  }
});
