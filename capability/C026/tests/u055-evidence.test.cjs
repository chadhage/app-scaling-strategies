'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const chain = require('./u040-chain.cjs');
const authority = require('./u055-authority.cjs');
const finalSeal = require('./u055-seal.cjs');
const repository = path.resolve(__dirname, '..', '..', '..');
const prefix = 'capability\\C026\\';
const evidence = `${prefix}evidence\\u055\\`;
const read = (relative) => {
  try { return fs.readFileSync(path.join(repository, relative)); } catch { return null; }
};
const overlay = (changes) => (relative) => changes.has(relative) ? changes.get(relative) : read(relative);
const all = (directory) => fs.readdirSync(path.join(repository, directory), { withFileTypes: true }).flatMap((entry) =>
  entry.isDirectory() ? all(`${directory}${entry.name}\\`) : [`${directory}${entry.name}`]);
const capturePaths = () => all(evidence).filter((relative) => /\\(?:red|green|final)\\[^\\]+\.json$/.test(relative));

function checkCapture(relative, readBytes) {
  const errors = [];
  const content = readBytes(relative);
  if (content === null) return [`MISSING_CAPTURE ${relative}`];
  let manifest;
  try { manifest = JSON.parse(content); } catch { return [`BAD_CAPTURE ${relative}`]; }
  const texts = {};
  for (const stream of ['stdout', 'stderr']) {
    const record = manifest.transcripts[stream];
    const rawPath = `${relative.slice(0, relative.lastIndexOf('\\'))}\\${record.path}`;
    const compressed = readBytes(rawPath);
    if (compressed === null || chain.sha(compressed) !== record.gzipSha256) { errors.push(`GZIP_MISMATCH ${rawPath}`); continue; }
    const raw = zlib.gunzipSync(compressed);
    if (chain.sha(raw) !== record.sha256 || raw.length !== record.bytes || compressed.length !== record.gzipBytes) errors.push(`RAW_MISMATCH ${rawPath}`);
    texts[stream] = raw.toString('utf8');
  }
  if (manifest.timedOut || manifest.exitCode !== manifest.expectedExitCode) errors.push(`CAPTURE_EXIT ${relative}`);
  const stdout = texts.stdout ?? '';
  for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const count = new RegExp(`^# ${key} (\\d+)$`, 'm').exec(stdout);
    if (count !== null && Number(count[1]) !== manifest.summary[key]) errors.push(`SUMMARY_CHANGED ${relative} ${key}`);
  }
  const addendum = JSON.parse(readBytes(chain.addendumPath(3)));
  const original = JSON.parse(readBytes(authority.BASELINE));
  const previous = new Map(original.files.map((entry) => [entry.path, entry]));
  const fourth = JSON.parse(readBytes(chain.addendumPath(4)));
  const replacements = [...addendum.amendments, ...addendum.currentAuthorityAmendments, ...fourth.amendments];
  const artifacts = fourth.artifactAmendments;
  for (const input of manifest.inputs) {
    if (!input.path.startsWith(prefix)) continue;
    const current = readBytes(input.path);
    if (current !== null && chain.sha(current) === input.rawSha256) continue;
    const amendedArtifact = artifacts.find((entry) => entry.path === input.path && entry.previousRawSha256 === input.rawSha256);
    if (amendedArtifact && current !== null && chain.sha(current) === amendedArtifact.rawSha256) {
      const copy = amendedArtifact.supersededCopy ? readBytes(amendedArtifact.supersededCopy) : null;
      if ((copy !== null && chain.sha(copy) === input.rawSha256)
        || amendedArtifact.previousBytes === 'retained-privately-not-reconstructed-publicly') continue;
    }
    const retained = (addendum.retainedAttempts ?? []).find((attempt) => attempt.capture === relative)?.inputs.find((entry) =>
      entry.path === input.path && entry.rawSha256 === input.rawSha256);
    if (retained) {
      const copy = readBytes(retained.retainedCopy);
      if (copy !== null && chain.sha(copy) === input.rawSha256) continue;
    }
    const replaced = replacements.find((item) => item.path === input.path && item.previousRawSha256 === input.rawSha256);
    const old = replaced?.supersededCopy ? readBytes(replaced.supersededCopy) : null;
    if (old === null || chain.sha(old) !== input.rawSha256) errors.push(`CAPTURE_INPUT_CHANGED ${input.path}`);
  }
  return errors;
}

test('U055 evidence: every available capture manifest and both immutable raw streams recompute', () => {
  assert.deepEqual(authority.verifyAuthority(read).errors, []);
  const captures = capturePaths();
  assert.ok(captures.length >= 5, 'RED, replay, focused, full namespace and consumer captures exist');
  for (const relative of captures) assert.deepEqual(checkCapture(relative, read), [], relative);
  if (read(finalSeal.SEAL) !== null) assert.deepEqual(finalSeal.verify(read).errors, [], 'the final independent byte seal covers every manifest and every namespace byte');
});

test('U055 evidence: the genuine RED is six named assertion failures and its unchanged final replay is six passes', () => {
  const reds = capturePaths().filter((relative) => relative.includes('\\red\\'));
  const redPath = reds.find((relative) => relative.endsWith('u055-red-03-correct-facts-retained-published-baseline.json'));
  assert.ok(redPath);
  const red = JSON.parse(read(redPath));
  const replayPath = capturePaths().find((relative) => relative.endsWith('u055-replay-01-unchanged-red.json'));
  assert.ok(replayPath);
  const replay = JSON.parse(read(replayPath));
  assert.deepEqual([red.exitCode, red.summary.tests, red.summary.pass, red.summary.fail], [1, 6, 0, 6]);
  assert.deepEqual([replay.exitCode, replay.summary.tests, replay.summary.pass, replay.summary.fail], [0, 6, 6, 0]);
  assert.deepEqual(red.command, replay.command);
  assert.ok(red.environmentAdded.includes('C026_U055_BASELINE'), 'the recorded old subject is the retained published baseline');
  for (const input of red.inputs.filter((entry) => entry.path.includes('\\tests\\u055-'))) {
    assert.deepEqual(replay.inputs.find((entry) => entry.path === input.path), input, input.path);
  }
  const raw = zlib.gunzipSync(read(`${redPath.slice(0, redPath.lastIndexOf('\\'))}\\${red.transcripts.stdout.path}`)).toString();
  assert.equal((raw.match(/name: 'AssertionError'/g) ?? []).length, 6);
  assert.equal(red.transcripts.stderr.bytes, 0);
  const previous = JSON.parse(read(`${evidence}red\\u055-red-02-published-readme-and-unpinned-head.json`));
  const retained = JSON.parse(read(chain.addendumPath(3))).retainedAttempts;
  assert.equal(previous.summary.fail, 6);
  assert.equal(retained[0].status, 'five-behavioral-failures-one-invalid-arithmetic-assertion');
  assert.equal(retained[0].inputs.length, 2, 'the earlier test and feature bytes are both retained, never overwritten');
});

test('U055 evidence: the comment-edited full server file has a positive per-file 85/85/85 measurement', () => {
  const relative = capturePaths().find((file) => file.endsWith('u055-coverage-01-server.json'));
  assert.ok(relative);
  const manifest = JSON.parse(read(relative));
  assert.equal(manifest.exitCode, 0);
  assert.ok(manifest.command.includes('--test-coverage-include=capability/C026/server.cjs'));
  assert.equal(manifest.summary.pass, manifest.summary.tests);
  for (const key of ['fail', 'cancelled', 'skipped', 'todo']) assert.equal(manifest.summary[key], 0);
  const row = manifest.summary.coverageRows.find((entry) => entry.file === 'server.cjs' || /[\\/]server\.cjs$/.test(entry.file));
  assert.ok(row && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, JSON.stringify(row));
  const input = manifest.inputs.find((entry) => entry.path === `${prefix}server.cjs`);
  assert.equal(input.rawSha256, chain.sha(read(input.path)));
});

test('U055 evidence: tampering with a manifest count, a raw stream, or a declared input fails by name', () => {
  const relative = capturePaths().find((file) => file.endsWith('u055-replay-01-unchanged-red.json'));
  assert.ok(relative);
  const manifest = JSON.parse(read(relative));
  const altered = structuredClone(manifest);
  altered.summary.pass += 1;
  assert.ok(checkCapture(relative, overlay(new Map([[relative, Buffer.from(JSON.stringify(altered))]]))).includes(`SUMMARY_CHANGED ${relative} pass`));
  const rawPath = `${relative.slice(0, relative.lastIndexOf('\\'))}\\${manifest.transcripts.stdout.path}`;
  assert.ok(checkCapture(relative, overlay(new Map([[rawPath, Buffer.from('wrong')]]))).includes(`GZIP_MISMATCH ${rawPath}`));
  const input = `${prefix}tests\\u055-behavior.test.cjs`;
  assert.ok(checkCapture(relative, overlay(new Map([[input, Buffer.from('wrong')]]))).includes(`CAPTURE_INPUT_CHANGED ${input}`));
  if (read(finalSeal.SEAL) !== null) {
    assert.ok(finalSeal.verify(overlay(new Map([[relative, Buffer.from('wrong')]]))).errors.includes(`FINAL_BYTES_CHANGED ${relative}`));
    assert.deepEqual(finalSeal.verify(overlay(new Map([[finalSeal.SEAL, Buffer.from('{}')]]))).errors, [`FINAL_SEAL_CHANGED ${finalSeal.SEAL}`]);
  }
});
