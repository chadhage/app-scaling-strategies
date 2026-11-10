'use strict';

// rev-C043 F2: the evidence is recomputed for EVERY manifest of EVERY capture (the RED of the first publication, its
// green, coverage, mutants and browser captures, and the captures of this fix), not only the RED. The captures of the
// first publication are sealed to its commit (their pinned inputs are read from git at that commit, because the files
// were fixed afterwards); the captures of the fix pin the final tree. Each capture kind then gets a tamper test in a
// scratch copy that must fail BY NAME: a README byte, a production file byte, a test byte, a stream byte, a pin.
// Limit (also in the README): a CONSISTENT rewrite of a manifest together with its inputs cannot be detected here;
// the only external anchor is the commit hash.
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const {
  gitReader, manifestsUnder, sha, verifyManifest, manifestReader,
} = require('./evidence.cjs');
const { assert, cleanup, scratch } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const FIRST = '88fd6b0860691489d2db36d552898ed33b374dbe';
// [manifest file, kind, sealed to the first publication, optional]. The capture of THIS test (evidence-02) cannot exist
// while the test runs to be captured, so it is recomputed (and tampered) when present and not required when absent.
const CAPTURES = [
  ['red-initial.json', 'red', true], ['green-01.json', 'green', true], ['coverage-01.json', 'coverage', true], ['mutants-01.json', 'mutants', true], ['browser-01.json', 'browser', true],
  ['red-f1-pipelining.json', 'red', false], ['red-f3-cross-check.json', 'red', false], ['red-f4-tamper.json', 'red', false], ['red-addendum-node-own.json', 'red', false],
  ['red-load-flake.json', 'red', false], ['red-connect-upgrade.json', 'red', false], ['red-gaps-f2-f6-f7.json', 'red', false], ['red-aliasing.json', 'red', false],
  ['green-02.json', 'green', false], ['coverage-02.json', 'coverage', false], ['mutants-02.json', 'mutants', false], ['browser-02.json', 'browser', false],
  ['evidence-02.json', 'evidence', false, true],
  ['u058-red.json', 'repair-red', false], ['u058-green.json', 'repair-green', false], ['u058-focused.json', 'repair-focused', false],
  ['u059-red.json', 'repair-red', false], ['u059-green.json', 'repair-green', false], ['u059-focused.json', 'repair-focused', false],
  ['u060-red-timeout-bookkeeping.json', 'repair-red', false], ['u060-green-timeout-bookkeeping.json', 'repair-green', false], ['u060-focused.json', 'repair-focused', false],
  ['u060-red-startup-gate.json', 'repair-red', false], ['u060-green-startup-gate.json', 'repair-green', false],
];
const KINDS = [
  ['a README byte', /README\.md$/],
  ['a production file byte', /^capability\\C043\\(?:[a-z-]+\.c?js|evidence\\red\\(?:stubs\\[^\\]+\.cjs|old-subject\\[^\\]+\.txt))$/],
  ['a test byte', /\\(?:tests\\[^\\]+\.cjs|[^\\]+\.snapshot\.cjs)$/],
];
const readerFor = (sealed, manifestFile) => (sealed ? gitReader(FIRST, repository) : manifestReader(manifestFile, repository));
const flip = (bytes) => { const copy = Buffer.from(bytes); copy[copy.length - 1] ^= 1; return copy; };

test('every capture manifest under evidence is found (the raw folder included), exactly the expected ones, and each is recomputed', { timeout: 120000 }, () => {
  const found = manifestsUnder(path.join(root, 'evidence'));
  const present = found.map((file) => path.basename(file));
  assert.deepEqual(present.sort(), CAPTURES.filter(([name, , , optional]) => !optional || present.includes(name)).map(([name]) => name).sort(), 'no capture is skipped and none is missing');
  for (const file of found) {
    const [, , sealed] = CAPTURES.find(([name]) => name === path.basename(file));
    assert.deepEqual(verifyManifest(file, repository, readerFor(sealed, file)), [], file);
  }
});

test('the retained code of the first publication is exactly that commit (the RED of every fix runs against it)', { timeout: 60000 }, () => {
  for (const name of fs.readdirSync(path.join(root, 'evidence', 'red', 'old-subject'))) {
    const blob = execFileSync('git', ['--no-pager', 'cat-file', 'blob', `${FIRST}:capability/C043/${name.replace(/\.txt$/, '')}`], { cwd: repository, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
    assert.equal(sha(fs.readFileSync(path.join(root, 'evidence', 'red', 'old-subject', name))), sha(blob), name);
  }
});

// A scratch "repository" holding the pinned inputs of ONE capture, its manifest and its transcripts.
function stage(manifestFile, sealed, out) {
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const read = readerFor(sealed, manifestFile);
  const repo = path.join(out, 'repo');
  const inputs = new Map(manifest.inputs.map((input) => [input.path, read(input.path)]));
  for (const [relative, bytes] of inputs) {
    fs.mkdirSync(path.dirname(path.join(repo, relative)), { recursive: true });
    fs.writeFileSync(path.join(repo, relative), bytes);
  }
  const evidence = path.join(out, 'evidence');
  fs.mkdirSync(evidence, { recursive: true });
  const target = path.join(evidence, path.basename(manifestFile));
  fs.copyFileSync(manifestFile, target);
  for (const info of Object.values(manifest.transcripts)) {
    fs.mkdirSync(path.dirname(path.join(evidence, info.path)), { recursive: true });
    fs.copyFileSync(path.join(path.dirname(manifestFile), info.path), path.join(evidence, info.path));
  }
  return { manifest, repo, target, evidence };
}

test('every kind of tampering with every capture is a named failure: a README byte, a production byte, a test byte, a stream byte, a pin', { timeout: 300000 }, () => {
  const out = scratch();
  try {
    for (const file of manifestsUnder(path.join(root, 'evidence'))) {
      const [, kind, sealed] = CAPTURES.find(([name]) => name === path.basename(file));
      const staged = stage(file, sealed, out);
      const check = (label, expected, problems) => assert.equal(problems.some((problem) => problem.includes(expected)), true, `${path.basename(file)}: ${label} was not reported: ${problems.join('; ')}`);
      assert.deepEqual(verifyManifest(staged.target, staged.repo), [], `${path.basename(file)}: the untouched scratch copy verifies`);
      for (const [label, pattern] of KINDS) {
        const input = staged.manifest.inputs.find((item) => pattern.test(item.path));
        // The four large captures pin the README, the production code and the tests; a RED pins what it ran.
        if (!input) { assert.equal(kind === 'red' || kind.startsWith('repair-'), true, `${path.basename(file)} (${kind}) must pin ${label}`); continue; }
        const original = fs.readFileSync(path.join(staged.repo, input.path));
        fs.writeFileSync(path.join(staged.repo, input.path), flip(original));
        check(label, `input ${input.path} differs from the recorded bytes`, verifyManifest(staged.target, staged.repo));
        fs.writeFileSync(path.join(staged.repo, input.path), original);
      }
      const gz = path.join(staged.evidence, staged.manifest.transcripts.stdout.path);
      const bytes = fs.readFileSync(gz);
      fs.writeFileSync(gz, flip(bytes));
      check('a stream byte', 'stdout transcript bytes changed', verifyManifest(staged.target, staged.repo));
      fs.writeFileSync(gz, bytes);
      const pinned = JSON.parse(fs.readFileSync(staged.target, 'utf8'));
      pinned.inputs[0].rawSha256 = '0'.repeat(64);
      fs.writeFileSync(staged.target, JSON.stringify(pinned));
      check('a changed pin', `input ${pinned.inputs[0].path} differs from the recorded bytes`, verifyManifest(staged.target, staged.repo));
      fs.rmSync(path.join(out, 'repo'), { recursive: true, force: true });
      fs.rmSync(path.join(out, 'evidence'), { recursive: true, force: true });
    }
  } finally {
    cleanup(out);
  }
});

test('the large captures of both generations pin the README, the production code, the tests and the tooling', { timeout: 60000 }, () => {
  for (const [name, kind, , optional] of CAPTURES.filter(([, kind]) => kind !== 'red' && !kind.startsWith('repair-'))) {
    const file = manifestsUnder(path.join(root, 'evidence')).find((item) => path.basename(item) === name);
    if (!file) { assert.equal(optional, true, `${name} must exist`); continue; }
    const { inputs } = JSON.parse(fs.readFileSync(file, 'utf8'));
    const paths = inputs.map((input) => input.path);
    for (const needle of ['\\README.md', '\\runner.cjs', '\\server.cjs', '\\tests\\surface.test.cjs', '\\tests\\evidence.cjs', '\\tests\\browser.cjs']) {
      assert.equal(paths.some((item) => item.endsWith(needle)), true, `${name} (${kind}) pins ${needle}`);
    }
  }
});

test('U058 repair captures pin their executed tooling and retain explicit positive or assertion-RED counts', () => {
  for (const name of ['u058-red', 'u058-green', 'u058-focused', 'u059-red', 'u059-green', 'u059-focused',
    'u060-red-timeout-bookkeeping', 'u060-green-timeout-bookkeeping', 'u060-focused', 'u060-red-startup-gate', 'u060-green-startup-gate']) {
    const card = name.slice(0, 4);
    const file = path.join(root, 'evidence', card, `${name}.json`);
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const relative of card === 'u058' ? ['tests\\browser.cjs', 'tests\\u058-driver-fixture.cjs', 'tests\\u058-admission.cjs']
      : card === 'u059' ? ['tests\\stall.preload.cjs', 'tests\\u059-stall-fixture.cjs']
        : name.includes('startup-gate') ? ['tests\\u060-startup-oracle.cjs', 'tests\\u060-startup.fixture.cjs'] : ['tests\\mutants.test.cjs', 'tests\\u060-runner-fixture.cjs']) {
      assert.equal(manifest.inputs.some((entry) => entry.path === `capability\\C043\\${relative}`), true, `${name}: ${relative}`);
    }
    assert.equal(manifest.timedOut, false);
    assert.equal(manifest.spawnError, null);
    assert.equal(manifest.summary.tests > 0, true);
    assert.deepEqual([manifest.summary.cancelled, manifest.summary.skipped, manifest.summary.todo], [0, 0, 0]);
    const red = name.includes('-red');
    assert.equal(manifest.exitCode, red ? 1 : 0);
    assert.equal(manifest.summary.fail, red ? 1 : 0);
    assert.equal(manifest.summary.pass, red ? 0 : manifest.summary.tests);
  }
});
