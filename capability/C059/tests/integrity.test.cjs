'use strict';

// Integrity: the read-only imports are pinned to the accepted commits (recomputed against git), the archived RED is immutable and
// behavioral (and every tamper of it, of a pin or of an evidence file is caught BY NAME), and the SAME retained RED replays both
// ways: it fails against the naive subject and passes unchanged against the final code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { sha, verifyManifest, verifyPins } = require('./evidence-verify.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const pins = JSON.parse(fs.readFileSync(path.join(root, 'imports.json'), 'utf8'));
const OPTIONS = { timeout: 120000 };
const readBlob = (commit, relative) => execFileSync('git', ['--no-pager', 'cat-file', 'blob', `${commit}:${relative}`], { cwd: repository, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
const readFile = (relative) => fs.readFileSync(path.join(repository, ...relative.split('/')));
const live = { readBlob, readFile };

function nestedEnvironment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.CAPTURE_BROWSER_EVIDENCE;
  return env;
}

const runRed = (extra) => spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000', path.join(red, 'initial-a.snapshot.cjs'), path.join(red, 'initial-b.snapshot.cjs')],
  { cwd: repository, env: nestedEnvironment(extra), encoding: 'utf8', windowsHide: true, timeout: 150000 });

test('every import is pinned to the accepted commit and tag: the blob, the working bytes and the LF form agree (recomputed against git)', OPTIONS, () => {
  assert.deepEqual(verifyPins(pins, live), []);
  assert.deepEqual(Object.keys(pins.accepted), ['C041', 'C042']);
  assert.equal(pins.imports.length, 9);
});

test('a tampered pin is caught by name: a changed blob hash, a wrong tag, an edited working copy, a pin that is not the accepted bytes', OPTIONS, () => {
  const copy = () => JSON.parse(JSON.stringify(pins));
  const flipped = copy(); flipped.imports[0].acceptedGitSha256 = `${'0'.repeat(63)}1`;
  assert.ok(verifyPins(flipped, live).some((problem) => problem.startsWith('BLOB_MISMATCH')));
  const tag = copy(); tag.accepted.C042.tag = 'kanban/C042/000000000000';
  assert.deepEqual(verifyPins(tag, live), ['TAG_MISMATCH C042']);
  const edited = verifyPins(pins, { readBlob, readFile: (relative) => Buffer.concat([readFile(relative), Buffer.from(' ')]) });
  assert.ok(edited.some((problem) => problem.startsWith('WORKING_COPY_DIFFERS')));
  const unaccepted = copy(); unaccepted.imports[1].rawSha256 = sha(Buffer.from('x')); unaccepted.imports[1].crlfToLfSha256 = sha(Buffer.from('x'));
  assert.ok(verifyPins(unaccepted, { readBlob, readFile: () => Buffer.from('x') }).some((problem) => problem.startsWith('PIN_NOT_ACCEPTED_BYTES')));
});

test('every C041 and C042 file that the sources and the page load is pinned, and no pin is unused', OPTIONS, () => {
  const referenced = new Set();
  for (const name of ['server.cjs', 'transcript.cjs', 'journey.js', 'index.html']) {
    const text = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of text.matchAll(/path\.join\((c04[12]), '([^']+)'\)/g)) referenced.add(`capability/${match[1].toUpperCase()}/${match[2]}`);
    for (const match of text.matchAll(/\.\.\/(C04[12])\/([A-Za-z0-9.-]+)/g)) referenced.add(`capability/${match[1]}/${match[2]}`);
    for (const match of text.matchAll(/src="\/(c04[12])\/([A-Za-z0-9.-]+)"/g)) referenced.add(`capability/${match[1].toUpperCase()}/${match[2]}`);
  }
  for (const match of fs.readFileSync(path.join(root, 'server.cjs'), 'utf8').matchAll(/'\/(c04[12])\/([A-Za-z0-9.-]+)'/g)) referenced.add(`capability/${match[1].toUpperCase()}/${match[2]}`);
  assert.deepEqual([...referenced].sort(), pins.imports.map((entry) => entry.path).sort());
});

test('the archived RED is a recorded behavioral failure: exit 1, 42 of 44 assertion failures, no module or syntax error, inputs unchanged', OPTIONS, () => {
  const { manifest, problems, stdout } = verifyManifest(path.join(red, 'run-1', 'red.json'), { root: repository });
  assert.deepEqual(problems, []);
  assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 1, false]);
  assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [44, 2, 42]);
  assert.equal([...stdout.matchAll(/^not ok \d+ - /gm)].length, 42);
  assert.equal([...stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, 42, 'every failure is an assertion about behavior');
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError|TypeError/);
  assert.equal(manifest.transcripts.stderr.bytes, 0);
  assert.ok(manifest.inputs.some((input) => input.path.endsWith('C059.feature')), 'the specification is among the recorded inputs');
  assert.ok(manifest.inputs.length >= 11);
});

test('tampering with the RED archive is caught by name on a scratch copy: a changed input, transcript, manifest count and a missing file', OPTIONS, () => {
  const scratch = path.join(__dirname, 'scratch', `t-${randomUUID()}`);
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-1', 'red.json'), 'utf8'));
    for (const input of manifest.inputs) {
      const target = path.join(scratch, ...input.path.split('\\'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repository, ...input.path.split('\\')), target);
    }
    const dir = path.join(scratch, 'capability', 'C059', 'evidence', 'red', 'run-1');
    fs.cpSync(path.join(red, 'run-1'), dir, { recursive: true });
    const manifestPath = path.join(dir, 'red.json');
    assert.deepEqual(verifyManifest(manifestPath, { root: scratch }).problems, [], 'the untouched copy verifies');
    const input = path.join(scratch, ...manifest.inputs[1].path.split('\\'));
    fs.appendFileSync(input, ' ');
    assert.deepEqual(verifyManifest(manifestPath, { root: scratch }).problems, [`INPUT_CHANGED ${manifest.inputs[1].path}`]);
    fs.copyFileSync(path.join(repository, ...manifest.inputs[1].path.split('\\')), input);
    const gz = path.join(dir, 'raw', 'red.stdout.raw.gz');
    const bytes = fs.readFileSync(gz);
    bytes[bytes.length - 12] ^= 0xff;
    fs.writeFileSync(gz, bytes);
    assert.ok(verifyManifest(manifestPath, { root: scratch }).problems.some((problem) => /^(GZIP_CHANGED|GZIP_CORRUPT|RAW_CHANGED) stdout$/.test(problem)));
    fs.copyFileSync(path.join(red, 'run-1', 'raw', 'red.stdout.raw.gz'), gz);
    const edited = { ...manifest, summary: { ...manifest.summary, fail: 0 } };
    fs.writeFileSync(manifestPath, JSON.stringify(edited));
    assert.deepEqual(verifyManifest(manifestPath, { root: scratch }).problems, ['SUMMARY_MISMATCH fail']);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    fs.rmSync(gz);
    assert.ok(verifyManifest(manifestPath, { root: scratch }).problems.includes('TRANSCRIPT_MISSING stdout'));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('the retained RED replays against the naive subject: exit 1, 42 assertion failures, no module or syntax error', OPTIONS, () => {
  const run = runRed({ C059_RED_SUBJECT: path.join(red, 'stubs') });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^# fail 42$/m);
  assert.match(run.stdout, /^# pass 2$/m);
  assert.equal([...run.stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, 42);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
});

test('the SAME retained RED file passes unchanged against the final code (44 of 44, no edited copy)', OPTIONS, () => {
  const run = runRed({});
  assert.equal(run.status, 0, run.stdout.slice(-2000));
  assert.match(run.stdout, /^# pass 44$/m);
  assert.match(run.stdout, /^# fail 0$/m);
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-1', 'red.json'), 'utf8'));
  for (const name of ['initial-a.snapshot.cjs', 'initial-b.snapshot.cjs']) {
    const recorded = manifest.inputs.find((input) => input.path.endsWith(name));
    assert.equal(sha(fs.readFileSync(path.join(red, name))), recorded.rawSha256, `${name} is byte-identical to the RED run`);
  }
});

test('the helpers of the retained RED are copies of the test helpers of the same name at RED time and are never rewritten', OPTIONS, () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-1', 'red.json'), 'utf8'));
  for (const input of manifest.inputs.filter((item) => item.path.includes('\\helpers\\') || item.path.includes('\\stubs\\'))) {
    assert.equal(sha(fs.readFileSync(path.join(repository, ...input.path.split('\\')))), input.rawSha256, input.path);
  }
  assert.equal(fs.readFileSync(path.join(root, 'evidence', '.gitattributes'), 'utf8').trim(), '* -text -diff');
  assert.match(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8'), /^\* -text/m);
});

// The LATEST archived run of every stage must have passed, verify (hashes, counts) and describe the bytes that are published:
// the captures are made last, so every recorded input equals the current file. Earlier failed runs stay as history.
const latest = (stage) => {
  const names = fs.readdirSync(path.join(root, 'evidence', 'raw')).filter((name) => new RegExp(`^${stage}-\\d+\\.json$`).test(name));
  assert.ok(names.length > 0, `no archived ${stage} run`);
  return path.join(root, 'evidence', 'raw', names.sort((a, b) => Number(/-(\d+)\.json$/.exec(a)[1]) - Number(/-(\d+)\.json$/.exec(b)[1])).at(-1));
};

test('the latest archived coverage, syntax, browser and mutation runs passed, verify, and match the published bytes', OPTIONS, () => {
  const gate = require('./coverage-gate.cjs');
  // The GREEN run cannot verify itself (it runs this test): its manifest is checked by the reviewer and by the result file.
  for (const stage of ['coverage', 'syntax', 'browser', 'mutation']) {
    const { manifest, problems, stdout } = verifyManifest(latest(stage), { root: repository });
    assert.deepEqual(problems, [], `${stage}: ${latest(stage)}`);
    assert.equal(manifest.exitCode, 0, stage);
    if (stage === 'coverage') {
      const rows = [...stdout.matchAll(/"file": "([^"]+)",\s+"lines": ([\d.]+),\s+"branches": ([\d.]+),\s+"functions": ([\d.]+)/g)].map((match) => [match[1], Number(match[2]), Number(match[3]), Number(match[4])]);
      assert.deepEqual(rows.map((row) => row[0]).sort(), gate.enumerate(gate.listNamespaceFiles(root)), 'every enumerated production file has a row');
      for (const [file, lines, branches, functions] of rows) assert.ok(lines >= 85 && branches >= 85 && functions >= 85, `${file} ${lines}/${branches}/${functions}`);
      assert.match(stdout, /C059 coverage GREEN: 5\/5 enumerated production files/);
    }
    if (stage === 'browser') {
      assert.ok([...stdout.matchAll(/^PASS /gm)].length >= 18, 'the browser checks are recorded');
      assert.match(stdout, /"result":"ok"/);
      assert.match(stdout, /^PASS the installed Edge is Microsoft-signed and within the qualified major/m);
    }
    if (stage === 'mutation') {
      const report = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'raw', `mutation-report-${/-(\d+)\.json$/.exec(latest(stage))[1]}.json`), 'utf8'));
      assert.deepEqual([report.killed, report.survivors], [report.total, []]);
      assert.ok(report.results.every((item) => item.killed && item.failingTests.length > 0 && !item.error), 'every mutant is killed by a NAMED failing test');
    }
  }
});
