'use strict';

// Recomputes the hashes of the evidence archived by the fix run (R2-U009): the gzip transcripts of every recorder manifest, and the bytes of every input the
// final runs read (README.md and evidence\.gitattributes included: the C044 lesson). The tamper tests show that a changed byte is found.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const repository = path.resolve(__dirname, '..', '..', '..');
const namespace = path.resolve(__dirname, '..');
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const crlfToLf = (buffer) => Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const inRepository = (relative) => path.join(repository, ...relative.split('\\'));

function manifestsIn(directory) {
  const found = [];
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'raw') {
      found.push(...manifestsIn(full));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (data !== null && typeof data === 'object' && data.schemaVersion === 1 && data.transcripts && Array.isArray(data.inputs)) found.push({ file: full, directory, data });
    }
  }
  return found;
}

// The problems of one recorder manifest, or []. `read.input(relative)` and `read.transcript(relative)` return bytes (and throw when missing).
function verifyManifest(manifest, read, { inputFilter = () => true } = {}) {
  const problems = [];
  if (manifest.exitCode !== manifest.expectedExitCode) problems.push(`exit ${manifest.exitCode}, expected ${manifest.expectedExitCode}`);
  if (manifest.timedOut) problems.push('timed out');
  for (const input of manifest.inputs.filter((entry) => inputFilter(entry.path))) {
    let bytes;
    try {
      bytes = read.input(input.path);
    } catch {
      problems.push(`${input.path}: missing`);
      continue;
    }
    if (sha(crlfToLf(bytes)) !== input.crlfToLfSha256) problems.push(`${input.path}: the bytes differ from the pinned hash`);
  }
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    let gz;
    try {
      gz = read.transcript(entry.path);
    } catch {
      problems.push(`${stream}: transcript missing`);
      continue;
    }
    if (gz.length !== entry.gzipBytes || sha(gz) !== entry.gzipSha256) problems.push(`${stream}: gzip transcript differs`);
    let raw;
    try {
      raw = zlib.gunzipSync(gz);
    } catch {
      problems.push(`${stream}: not a gzip stream`);
      continue;
    }
    if (raw.length !== entry.bytes || sha(raw) !== entry.sha256) problems.push(`${stream}: raw transcript differs`);
    if ((raw.toString('latin1').match(/\r\n/g) || []).length !== entry.rawCRLFPairs) problems.push(`${stream}: CRLF pairs differ`);
  }
  return problems;
}

const readers = (directory) => ({
  input: (relative) => fs.readFileSync(inRepository(relative)),
  transcript: (relative) => fs.readFileSync(path.join(directory, ...relative.split('\\')))
});

const finals = manifestsIn(path.join(namespace, 'evidence', 'fix'));
const reds = manifestsIn(path.join(namespace, 'evidence', 'red')).filter((entry) => /fix-[a-z0-9-]+$/.test(path.basename(entry.directory)));
const kind = (entry) => entry.data.name.replace(/^([a-z0-9]+)-.*$/, '$1');
const sealed = finals.some((entry) => entry.data.name.startsWith('self-gate-'));

test('every archived run of the fix verifies: transcripts match their hashes and every input matches the bytes of this checkout', () => {
  const bad = finals.flatMap((entry) => verifyManifest(entry.data, readers(entry.directory)).map((problem) => `${entry.data.name}: ${problem}`));
  assert.deepEqual(bad, []);
});

test('the archived REDs verify their transcripts, failed by assertion, and their test files are unchanged', () => {
  const bad = reds.flatMap((entry) => verifyManifest(entry.data, readers(entry.directory), { inputFilter: (input) => /^testing\\coverage\\tests\\fix-[a-z0-9-]+\.test\.cjs$/.test(input) })
    .map((problem) => `${entry.data.name}: ${problem}`));
  assert.deepEqual(bad, []);
  for (const entry of reds) {
    assert.equal(entry.data.expectedExitCode, 1);
    assert.equal(entry.data.summary.fail >= 1, true, `${entry.data.name} has failing tests`);
    assert.equal(entry.data.inputs.some((input) => /\\gate\.cjs$/.test(input.path)), true, `${entry.data.name} pins the gate it ran against`);
  }
});

test('once the final runs exist: every RED has an unchanged replay, and README.md and .gitattributes are pinned (m5)', { skip: sealed ? false : 'the final runs are not archived yet' }, () => {
  const counts = {};
  for (const entry of finals) counts[kind(entry)] = (counts[kind(entry)] || 0) + 1;
  assert.deepEqual({ replay: counts.replay, l0004: counts.l0004, self: counts.self, c031: counts.c031, mutation: counts.mutation },
    { replay: 6, l0004: 9, self: 1, c031: 2, mutation: 1 });
  assert.equal(reds.length, 6);
  for (const red of reds) {
    const suffix = red.data.name.replace(/^red-\d+-/, '');
    const replay = finals.find((entry) => entry.data.name.endsWith(suffix) && entry.data.name.startsWith('replay-'));
    assert.notEqual(replay, undefined, `a replay of ${red.data.name}`);
    assert.equal(replay.data.exitCode, 0, 'the same test passes on the final code');
    const test = red.data.inputs.find((input) => /\\tests\\fix-[a-z0-9-]+\.test\.cjs$/.test(input.path));
    assert.equal(replay.data.inputs.find((input) => input.path === test.path).crlfToLfSha256, test.crlfToLfSha256, `${test.path} is replayed unchanged`);
  }
  const pinning = finals.find((entry) => entry.data.name.startsWith('self-gate-'));
  for (const pinned of ['testing\\coverage\\README.md', 'testing\\coverage\\evidence\\.gitattributes']) {
    assert.equal(pinning.data.inputs.some((input) => input.path === pinned), true, `${pinned} is pinned by the final self-gate run`);
  }
});

test('README.md lists every archived RED folder and discloses the discarded pilot run of C031', () => {
  const readme = fs.readFileSync(path.join(namespace, 'README.md'), 'utf8');
  for (const entry of reds) assert.equal(readme.includes(path.basename(entry.directory)), true, `README names ${path.basename(entry.directory)}`);
  assert.match(readme, /pilot/i);
  assert.match(readme, /discarded/i);
});

function synthetic() {
  const own = fs.readFileSync(__filename);
  const stdout = Buffer.from('# tests 1\r\n# pass 1\r\n');
  const stderr = Buffer.alloc(0);
  const gz = { stdout: zlib.gzipSync(stdout), stderr: zlib.gzipSync(stderr) };
  const entry = (name, raw) => ({ path: `raw\\x.${name}.raw.gz`, bytes: raw.length, sha256: sha(raw), gzipBytes: gz[name].length, gzipSha256: sha(gz[name]), rawCRLFPairs: (raw.toString('latin1').match(/\r\n/g) || []).length });
  const manifest = {
    schemaVersion: 1, name: 'synthetic', expectedExitCode: 0, exitCode: 0, timedOut: false,
    inputs: [{ path: 'testing\\coverage\\tests\\evidence.test.cjs', bytes: own.length, rawSha256: sha(own), crlfToLfSha256: sha(crlfToLf(own)) }],
    transcripts: { stdout: entry('stdout', stdout), stderr: entry('stderr', stderr) }
  };
  const files = { 'raw\\x.stdout.raw.gz': gz.stdout, 'raw\\x.stderr.raw.gz': gz.stderr };
  const read = { input: () => own, transcript: (relative) => files[relative] };
  return { manifest, read, files, stdout };
}

test('tamper check: a changed input byte, transcript byte, count, exit code or a missing file is found', () => {
  const { manifest, read, files } = synthetic();
  assert.deepEqual(verifyManifest(manifest, read), [], 'the untouched archive verifies');
  const clone = (change) => {
    const copy = JSON.parse(JSON.stringify(manifest));
    change(copy);
    return copy;
  };
  const problems = (copy, override = {}) => verifyManifest(copy, { ...read, ...override });
  assert.match(problems(clone((copy) => { copy.inputs[0].crlfToLfSha256 = '0'.repeat(64); }))[0], /bytes differ from the pinned hash/);
  assert.match(problems(manifest, { input: () => Buffer.from('tampered readme') })[0], /bytes differ/);
  assert.match(problems(manifest, { input: () => { throw new Error('gone'); } })[0], /missing/);
  const flipped = Buffer.from(files['raw\\x.stdout.raw.gz']);
  flipped[flipped.length - 9] ^= 1;
  assert.match(problems(manifest, { transcript: (relative) => (relative.includes('stdout') ? flipped : files[relative]) }).join(), /stdout: gzip transcript differs/);
  assert.match(problems(manifest, { transcript: (relative) => (relative.includes('stdout') ? Buffer.alloc(0) : files[relative]) }).join(), /stdout: gzip transcript differs/);
  assert.match(problems(manifest, { transcript: () => { throw new Error('gone'); } }).join(), /transcript missing/);
  const notGzip = Buffer.from('plain text');
  const regzipped = clone((copy) => { copy.transcripts.stdout.gzipBytes = notGzip.length; copy.transcripts.stdout.gzipSha256 = sha(notGzip); });
  assert.match(problems(regzipped, { transcript: (relative) => (relative.includes('stdout') ? notGzip : files[relative]) }).join(), /not a gzip stream/);
  assert.match(problems(clone((copy) => { copy.transcripts.stdout.bytes += 1; })).join(), /raw transcript differs/);
  assert.match(problems(clone((copy) => { copy.transcripts.stdout.rawCRLFPairs += 1; })).join(), /CRLF pairs differ/);
  assert.match(problems(clone((copy) => { copy.exitCode = 1; })).join(), /exit 1, expected 0/);
  assert.match(problems(clone((copy) => { copy.timedOut = true; })).join(), /timed out/);
});
