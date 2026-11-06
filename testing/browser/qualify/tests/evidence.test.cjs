'use strict';

// Evidence integrity of the fix (review R2): recomputes every hash of the NEW archives and fails when anything is tampered
// with. The first-publication evidence is immutable and is not touched here. Tamper cases run on a scratch copy.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { scratchDir, removeDir } = require('./harness.cjs');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const NAMESPACE = path.join(REPO, 'testing', 'browser', 'qualify');
const EVIDENCE = path.join(NAMESPACE, 'evidence');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

// The archive of this very test (green-fix-04) cannot exist while it is being captured, so it is optional.
const OPTIONAL = ['green-fix-04-evidence-test'];
// A retained failed attempt is kept as it was recorded (never rewritten) and its successful retry carries the next number:
// coverage-adapters failed only in the shell hang test (a 15 s wall bound broke on an overloaded machine); the first real
// requalification failed closed, correctly, when isolated.test.cjs took 390 s under the same load and one test failed.
const RETAINED_FAILED = {
  'coverage-adapters': 'a shell that hangs past the timeout is ended and fails with SHELL_TIMEOUT',
  'fix-cli-02-requalify-current-edge': null,
};
const EXPECTED = {
  red: ['red-fix-f1-subject-lookalike', 'red-fix-f2-requalify-verdict', 'red-fix-f3-f6-cli-contract', 'red-fix-f4-second-digest'],
  fix: ['green-fix-01-hermetic-suite', 'green-fix-02-replay-f1', 'green-fix-02-replay-f2', 'green-fix-02-replay-f3-f6', 'green-fix-02-replay-f4',
    'green-fix-03-machine-test', 'green-fix-05-survivor-tests', 'coverage-adapters', 'coverage-adapters-2', 'coverage-cli', 'coverage-qualify', 'coverage-requalify', 'coverage-subject',
    'coverage-version', 'fix-cli-01-qualify-current-edge', 'fix-cli-02-requalify-current-edge', 'fix-cli-03-requalify-current-edge', 'fix-mutation-run'],
};

function manifestsIn(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) manifestsIn(full, found);
    else if (entry.name.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (data && data.transcripts && Array.isArray(data.inputs)) found.push({ file: full, dir: directory, data });
    }
  }
  return found;
}

const fixManifests = () => [
  ...fs.readdirSync(path.join(EVIDENCE, 'red')).filter((name) => name.startsWith('fix-')).flatMap((name) => manifestsIn(path.join(EVIDENCE, 'red', name))
    .map((manifest) => ({ ...manifest, kind: 'red' }))),
  ...manifestsIn(path.join(EVIDENCE, 'fix-1')).map((manifest) => ({ ...manifest, kind: 'fix' })),
];

// Returns the list of problems of one manifest; root is the repository root the pinned inputs are resolved against.
function verify({ file, dir, data, kind }, root = REPO) {
  const problems = [];
  const name = path.basename(file);
  for (const stream of ['stdout', 'stderr']) {
    const t = data.transcripts[stream];
    const gz = fs.existsSync(path.join(dir, t.path)) ? fs.readFileSync(path.join(dir, t.path)) : null;
    if (gz === null) { problems.push(`${name}: ${stream} transcript missing`); continue; }
    if (sha(gz) !== t.gzipSha256) problems.push(`${name}: ${stream} gzip hash differs`);
    let raw = null;
    try { raw = zlib.gunzipSync(gz); } catch { problems.push(`${name}: ${stream} is not gzip`); }
    if (raw !== null && (sha(raw) !== t.sha256 || raw.length !== t.bytes)) problems.push(`${name}: ${stream} raw hash or size differs`);
  }
  const retained = Object.hasOwn(RETAINED_FAILED, data.name);
  const ended = retained ? data.exitCode === 1 : data.exitCode === data.expectedExitCode;
  if (!ended || data.timedOut !== false || data.spawnError !== null) problems.push(`${name}: the run did not end as expected`);
  for (const input of data.inputs) {
    // A RED run pins the production files as they were before the fix: only the tests it ran must stay unchanged.
    if (kind === 'red' && !/\\tests\\/.test(input.path)) continue;
    const current = fs.existsSync(path.join(root, input.path)) ? fs.readFileSync(path.join(root, input.path)) : null;
    if (current === null) problems.push(`${name}: ${input.path} is missing`);
    else if (sha(current) !== input.rawSha256 && sha(lf(current)) !== input.crlfToLfSha256) problems.push(`${name}: ${input.path} differs from its pin`);
  }
  return problems;
}

test('the new archives are exactly the expected set (a removed or renamed archive fails)', () => {
  const found = fixManifests();
  assert.deepEqual(found.filter((m) => m.kind === 'red').map((m) => m.data.name).sort(), [...EXPECTED.red].sort());
  const names = found.filter((m) => m.kind === 'fix').map((m) => m.data.name);
  assert.deepEqual(names.filter((name) => !OPTIONAL.includes(name)).sort(), [...EXPECTED.fix].sort());
  assert.ok(names.every((name) => EXPECTED.fix.includes(name) || OPTIONAL.includes(name)));
});

test('every hash of every new archive is recomputed: transcripts, exit codes and the pinned inputs', () => {
  for (const manifest of fixManifests()) assert.deepEqual(verify(manifest), [], manifest.data.name);
});

test('a retained RED failed for assertions, a GREEN passed with no failure, and the coverage runs met 85/85/85', () => {
  for (const { data, kind } of fixManifests()) {
    if (Object.hasOwn(RETAINED_FAILED, data.name)) {
      if (RETAINED_FAILED[data.name] !== null) assert.deepEqual(data.summary.notOk, [RETAINED_FAILED[data.name]], data.name);
      continue;
    }
    if (kind === 'red') {
      assert.equal(data.exitCode, 1, data.name);
      assert.ok(data.summary.fail > 0 && data.summary.notOk.length === data.summary.fail, data.name);
    } else if (/^(green|coverage)-/.test(data.name)) {
      assert.equal(data.summary.fail, 0, data.name);
      assert.equal(data.summary.pass, data.summary.tests, data.name);
      assert.ok(data.summary.tests > 0 && data.summary.skipped === 0 && data.summary.todo === 0 && data.summary.cancelled === 0, data.name);
    }
    if (/^coverage-/.test(data.name)) {
      const production = data.name.replace(/^coverage-/, '').replace(/-\d+$/, '');
      const row = data.summary.coverageRows.find((candidate) => candidate.file.endsWith(`${production}.cjs`));
      assert.ok(row && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, data.name);
    }
  }
});

test('the archived requalification ran every test of every suite on the qualified Edge (the retained first attempt failed closed)', () => {
  const first = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'fix-1', 'requalify', 'requalification-report.json'), 'utf8'));
  assert.equal(first.ok, false);
  assert.deepEqual(first.reasonCodes, ['REQUALIFICATION_FAILED', 'BROWSER_VERSION_MISSING']);
  assert.deepEqual(first.requalification.suites.flatMap((suite) => suite.failedTests), ['concurrent real headless sessions stay visible, independent, and actionable']);
  const report = JSON.parse(fs.readFileSync(path.join(EVIDENCE, 'fix-1', 'requalify', 'requalification-report-2.json'), 'utf8'));
  assert.equal(report.ok, true);
  assert.equal(report.requalification.passed, true);
  assert.ok(report.requalification.suites.length >= 2);
  for (const suite of report.requalification.suites) {
    assert.equal(suite.passed, true, suite.file);
    assert.ok(suite.pass > 0 && suite.pass === suite.tests && suite.skipped === 0 && suite.todo === 0 && suite.cancelled === 0, suite.file);
    assert.deepEqual(suite.browserVersionsSeen, [report.version], suite.file);
  }
  assert.equal(report.requalification.edgeChangedDuringRun, false);
});

test('tampering is detected: a flipped transcript byte, an edited pin, a changed input and a missing file each fail', () => {
  const manifest = fixManifests().find((candidate) => candidate.data.name === 'coverage-version');
  const dir = scratchDir();
  try {
    const root = path.join(dir, 'root');
    for (const input of manifest.data.inputs) {
      fs.mkdirSync(path.dirname(path.join(root, input.path)), { recursive: true });
      fs.copyFileSync(path.join(REPO, input.path), path.join(root, input.path));
    }
    const copy = path.join(dir, 'evidence');
    fs.cpSync(manifest.dir, copy, { recursive: true });
    const at = { ...manifest, dir: copy };
    assert.deepEqual(verify(at, root), [], 'the scratch copy verifies before the tampering');
    const stdoutFile = path.join(copy, manifest.data.transcripts.stdout.path);
    const original = fs.readFileSync(stdoutFile);
    const flipped = Buffer.from(original);
    flipped[Math.floor(flipped.length / 2)] ^= 0xff;
    fs.writeFileSync(stdoutFile, flipped);
    assert.ok(verify(at, root).some((problem) => /stdout/.test(problem)), 'flipped transcript byte');
    fs.writeFileSync(stdoutFile, original);
    const pin = { ...manifest.data, inputs: manifest.data.inputs.map((input, i) => (i === 0 ? { ...input, rawSha256: '0'.repeat(64), crlfToLfSha256: '0'.repeat(64) } : input)) };
    assert.ok(verify({ ...at, data: pin }, root).some((problem) => /differs from its pin/.test(problem)), 'edited pin');
    const changed = path.join(root, manifest.data.inputs[0].path);
    fs.appendFileSync(changed, '\n// tampered');
    assert.ok(verify(at, root).some((problem) => /differs from its pin/.test(problem)), 'changed input');
    fs.rmSync(changed);
    assert.ok(verify(at, root).some((problem) => /is missing/.test(problem)), 'missing input');
    fs.rmSync(stdoutFile);
    assert.ok(verify(at, root).some((problem) => /transcript missing/.test(problem)), 'missing transcript');
  } finally {
    removeDir(dir);
  }
});

test('the evidence folder keeps its attributes so that raw transcripts are never rewritten by git', () => {
  assert.equal(fs.readFileSync(path.join(EVIDENCE, '.gitattributes'), 'utf8').trim(), '* -text -diff');
});
