'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const observations = require('../evidence/u055/review-observations.json');
const { limits } = require('../server.cjs');
const root = path.resolve(__dirname, '..');
const readRun = (folder, name) => {
  const dir = path.join(root, 'evidence', 'u040-2', folder);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, `${name}.json`)));
  const stdout = zlib.gunzipSync(fs.readFileSync(path.join(dir, manifest.transcripts.stdout.path))).toString('utf8');
  return { manifest, stdout };
};

test('U055 facts: minimum-request arithmetic, the actual connection cap and the historical extrapolation reconcile', () => {
  assert.equal(observations.kind, 'historical-review-observations-not-a-new-performance-run');
  assert.equal(Buffer.byteLength('GET / HTTP/1.1\r\n\r\n'), observations.minimumRequestBytes);
  assert.equal(Math.floor(observations.readBytes / observations.minimumRequestBytes), observations.allMinimalCompleteRequestsPerRead);
  assert.equal(Math.floor((observations.readBytes - observations.minimumRequestBytes) / observations.minimumRequestBytes), observations.furtherRequestsAfterOneMinimalMark);
  assert.equal(limits.maxConnections, observations.connectionCap);
  assert.equal(observations.approximateMegabytesPerSocket * observations.connectionCap, observations.extrapolatedMegabytesAtCap);
  assert.equal(Math.round(observations.extrapolatedMegabytesAtCap / 1000 * 10) / 10, observations.approximateGigabytesAtCap);
  assert.equal(observations.reviewObservedRequestsPerRead * observations.stallObservedSockets, observations.parsedRequestsAt32Sockets);
  assert.deepEqual(observations.stallObservedSeconds, [12, 15], 'a pinned historical observation, not a timer assertion');
});

test('U055 facts: three first-RED variants and four final/control variants are derived from immutable raw stdout', () => {
  const first = readRun('red', 'f2-red-01-new-tests-committed-bytes');
  const final = readRun('red', 'f2-red-02-final-tests-committed-bytes');
  const control = readRun('green', 'f2-control-01-flood-pre-u040-bytes');
  const variants = (text) => [...text.matchAll(/^(?:not )?ok \d+ - flood (\w+): /gm)].map((match) => match[1]);
  assert.deepEqual(variants(first.stdout), observations.firstRedVariants);
  assert.deepEqual(variants(final.stdout), observations.finalFloodVariants);
  assert.deepEqual(variants(control.stdout), observations.finalFloodVariants);
  assert.match(final.stdout, /^ok \d+ - flood expect: /m);
  assert.match(final.stdout, /^not ok \d+ - budget expect: /m);
  assert.deepEqual([control.manifest.summary.tests, control.manifest.summary.pass, control.manifest.summary.fail], [4, 4, 0]);
});

test('U055 facts: the unavailable intermediate README remains a failed-attempt input, not recreated evidence', () => {
  const attempt = readRun('green', observations.missingInput.attempt);
  const input = attempt.manifest.inputs.find((entry) => entry.path === observations.missingInput.path);
  assert.equal(input.rawSha256, observations.missingInput.rawSha256);
  assert.equal(attempt.manifest.exitCode, 1);
  assert.equal(attempt.manifest.expectedExitCode, 0);
  assert.equal(observations.missingInput.status, 'unavailable-and-unverified');
  assert.equal(observations.missingInput.reconstructed, false);
  const note = fs.readFileSync(path.join(root, 'evidence', 'u040-2', 'COMMANDS.md'), 'utf8');
  assert.ok(note.includes(observations.missingInput.rawSha256));
  assert.ok(note.includes('unavailable and unverified'));
});
