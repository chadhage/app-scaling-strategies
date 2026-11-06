'use strict';

// Every hash of the NEW evidence of the fix cycle is recomputed, and the check itself is proved by TAMPERING (L-0133): a scratch copy of a
// retained RED is edited in every way a reviewer could object to and each edit must be named by the check. The RED replays of the fastest
// groups run here as well; fix-red.cjs replay-all and verify-green-all cover every group (README).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const s = require('./support.cjs');
const E = require('./evidence-check.cjs');
const F = require('./fix-red.cjs');

const repo = path.resolve(s.root, '..', '..');
const redRoot = path.join(s.root, 'evidence', 'red');
const fixes = fs.readdirSync(redRoot).filter((name) => name.startsWith('fix-')).sort();
const EXPECTED = ['chunked-process', 'chunked-structural', 'expect', 'identity', 'interrupted-compensation', 'journal', 'lanes', 'lifecycle', 'limits', 'minors', 'page-forged', 'pending', 'pins', 'pipeline', 'sample', 'wording'];
const original = path.join(redRoot, fixes.find((name) => name.startsWith('fix-identity-')));

function copyOfIdentity(t) {
  const made = s.scratch('ev');
  t.after(() => made.remove());
  const copy = path.join(made.dir, 'fix-identity');
  fs.cpSync(original, copy, { recursive: true });
  const edit = (file, change) => fs.writeFileSync(path.join(copy, file), change(fs.readFileSync(path.join(copy, file))));
  const editJson = (file, change) => edit(file, (bytes) => { const value = JSON.parse(bytes.toString('utf8')); change(value); return Buffer.from(JSON.stringify(value, null, 2)); });
  return { made, copy, edit, editJson };
}

test('every retained RED of the fix cycle is present, failed for its behavior, recomputes all its hashes and names only pinned files', () => {
  assert.deepEqual(fixes.map((name) => name.replace(/^fix-/, '').replace(/-[0-9a-f]{8}$/, '')), EXPECTED);
  for (const name of fixes) {
    const result = E.verifyRedAuto(path.join(redRoot, name));
    assert.deepEqual(result.problems, [], name);
    assert.equal(result.manifest.exitCode, 1, name);
    assert.ok(result.manifest.summary.fail >= 1, name);
    assert.equal(result.manifest.name, 'red');
    assert.deepEqual(result.manifest.summary.thresholdErrors, []);
  }
});

test('the retained first-publication bytes are pinned and really differ from the final code that replaced them', () => {
  const prefix = E.verifyPrefix();
  assert.deepEqual(prefix.problems, []);
  assert.equal(prefix.manifest.commit, 'ed21ef796791f2ae2e576bde390bf2c5124d854d');
  assert.equal(prefix.manifest.files.length, 6);
  for (const item of prefix.manifest.files) assert.notEqual(E.sha(fs.readFileSync(path.join(repo, item.live))), item.sha256, `${item.live} was not changed by the fix cycle`);
});

test('the evidence check names every tampering of a retained RED archive', (t) => {
  const clean = copyOfIdentity(t);
  assert.deepEqual(E.verifyRed(clean.copy).problems, [], 'the untouched copy verifies');
  const cases = [
    ['a flipped byte in the stdout transcript', (c) => c.edit('raw/red.stdout.raw.gz', (b) => { const x = Buffer.from(b); x[x.length - 12] ^= 1; return x; }), /gzip file changed|not a gzip file/],
    ['a stdout transcript replaced by another valid gzip', (c) => c.edit('raw/red.stdout.raw.gz', () => require('node:zlib').gzipSync('# tests 4\n# pass 4\n# fail 0\n')), /gzip file changed/],
    ['an exit code edited to look green', (c) => c.editJson('red.json', (m) => { m.exitCode = 0; }), /expected exit code/],
    ['a failing-test count edited down', (c) => c.editJson('red.json', (m) => { m.summary.fail = 0; }), /summary does not match the transcript/],
    ['a pinned input hash edited', (c) => c.editJson('red.json', (m) => { m.inputs[0].rawSha256 = `${m.inputs[0].rawSha256.slice(1)}0`; }), /differs from its pin/],
    ['the replay description deleted', (c) => fs.rmSync(path.join(c.copy, 'replay.json')), /replay\.json is missing/],
    ['a replayed test that is not pinned', (c) => c.editJson('replay.json', (r) => { r.tests.push('capability/C017/tests/unpinned.test.cjs'); }), /not a pinned input/],
    ['a RED manifest that expected a green run', (c) => c.editJson('red.json', (m) => { m.expectedExitCode = 0; m.exitCode = 0; }), /wrong kind/],
  ];
  for (const [name, tamper, expected] of cases) {
    const c = copyOfIdentity(t);
    tamper(c);
    const result = E.verifyRed(c.copy);
    assert.equal(result.ok, false, `${name} was accepted`);
    assert.ok(result.problems.some((problem) => expected.test(problem)), `${name}: ${JSON.stringify(result.problems)}`);
  }
});

test('a pinned test or snapshot that was edited or removed after the RED is named', (t) => {
  const made = s.scratch('ev');
  t.after(() => made.remove());
  const pinned = E.verifyRed(original).manifest.inputs.map((input) => input.path);
  const victim = pinned.find((input) => /identity\.test\.cjs$/.test(input));
  const resolveWith = (change) => (rel) => (rel === victim ? change(path.join(repo, rel.replaceAll('\\', '/'))) : path.join(repo, rel.replaceAll('\\', '/')));
  const edited = resolveWith((file) => { const copy = path.join(made.dir, 'edited.cjs'); fs.writeFileSync(copy, `${fs.readFileSync(file, 'utf8')}\n// weakened after the RED\n`); return copy; });
  const removed = resolveWith(() => path.join(made.dir, 'does-not-exist.cjs'));
  assert.ok(E.verifyRed(original, { resolve: edited }).problems.some((p) => /identity\.test\.cjs: differs from its pin/.test(p)));
  assert.ok(E.verifyRed(original, { resolve: removed }).problems.some((p) => /identity\.test\.cjs: the pinned input is missing/.test(p)));
});

test('the retained REDs of the two fastest groups replay on the pre-fix bytes and pass unchanged on the final code', () => {
  for (const group of ['identity', 'wording']) {
    const replayed = F.replay(group);
    assert.equal(replayed.reproduced, true, JSON.stringify(replayed));
    assert.ok(replayed.fail >= 1);
    const green = F.verifyGreen(group);
    assert.equal(green.unchangedRedPassesAgainstFinalCode, true, JSON.stringify(green));
  }
});

test('the nested replay never writes V8 coverage data into the directory of an outer coverage run (L-0140, proved with a real process)', (t) => {
  const made = s.scratch('cv');
  t.after(() => made.remove());
  const outer = path.join(made.dir, 'v8');
  fs.mkdirSync(outer);
  const env = { ...process.env, NODE_V8_COVERAGE: outer };
  delete env.NODE_TEST_CONTEXT;
  const run = spawnSync(process.execPath, [path.join(__dirname, 'fix-red.cjs'), 'replay', 'wording'], { cwd: repo, env, encoding: 'utf8', timeout: 120000, maxBuffer: 1 << 24 });
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.readdirSync(outer).length <= 1, `the nested test runs wrote ${fs.readdirSync(outer).length} coverage files into the outer directory`);
});
