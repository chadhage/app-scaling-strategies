'use strict';

// F4 of the independent review: the signature and the version come from one PowerShell start and the first SHA-256 from
// a separate read, so a swap that restores size and modification time went unnoticed. The digest is read AGAIN after the
// shell answered and both digests must be equal.
const assert = require('node:assert/strict');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const { fixtureAdapters, MS_SUBJECT, SHA, never } = require('./support.cjs');

const LIMIT = { timeout: 30000 };
const OTHER = 'cd'.repeat(32);
const answerLater = (events, name, value) => async () => {
  events.push(`${name}:start`);
  await new Promise((resolve) => setImmediate(resolve));
  events.push(`${name}:end`);
  return value;
};
const digests = (...list) => { const queue = [...list]; return () => { const next = queue.shift(); if (next instanceof Error) throw next; return next; }; };

test('the digest is read a second time after the signature and the version answered', LIMIT, async () => {
  const events = [];
  const adapters = fixtureAdapters({
    sha256: () => { events.push('sha256'); return SHA; },
    signature: answerLater(events, 'signature', { status: 'Valid', subject: MS_SUBJECT }),
    fileVersion: answerLater(events, 'fileVersion', '156.0.4314.58'),
    statFile: () => { events.push('stat'); return { exists: true, isFile: true, size: 4096, mtimeMs: 1000 }; },
  });
  const report = await qualifyEdge({ adapters });
  assert.equal(report.ok, true);
  assert.equal(report.sha256, SHA);
  assert.equal(events.filter((event) => event === 'sha256').length, 2);
  assert.ok(events.lastIndexOf('sha256') > events.indexOf('signature:end'), events.join(' '));
  assert.ok(events.lastIndexOf('sha256') > events.indexOf('fileVersion:end'), events.join(' '));
  assert.equal(events[events.length - 1], 'stat', events.join(' '));
});

test('a swap that restores size and modification time is caught: the two digests differ', LIMIT, async () => {
  for (const [first, second] of [[OTHER, SHA], [SHA, OTHER]]) {
    const report = await qualifyEdge({ adapters: fixtureAdapters({ sha256: digests(first, second) }) });
    assert.equal(report.ok, false);
    assert.deepEqual(report.reasonCodes, ['EDGE_CHANGED_DURING_CHECK']);
    assert.match(report.reasons[0], /SHA-256 differs between the first read and the read after the signature check/);
    assert.ok(report.reasons[0].includes(first) && report.reasons[0].includes(second), report.reasons[0]);
    assert.equal(report.sha256, null);
  }
});

test('equal digests pass whatever their letter case, and the recorded digest is lower case', LIMIT, async () => {
  const report = await qualifyEdge({ adapters: fixtureAdapters({ sha256: digests(SHA.toUpperCase(), SHA) }) });
  assert.equal(report.ok, true);
  assert.equal(report.sha256, SHA);
});

test('a second read that fails, answers garbage or never answers fails closed with its own code', LIMIT, async () => {
  const failing = await qualifyEdge({ adapters: fixtureAdapters({ sha256: digests(SHA, new Error('locked')) }) });
  assert.deepEqual(failing.reasonCodes, ['SHA256_UNAVAILABLE']);
  assert.match(failing.reasons[0], /second read.*locked/);
  assert.equal(failing.ok, false);
  const garbage = await qualifyEdge({ adapters: fixtureAdapters({ sha256: digests(SHA, 'not a digest') }) });
  assert.deepEqual(garbage.reasonCodes, ['SHA256_UNAVAILABLE']);
  assert.equal(garbage.ok, false);
  let reads = 0;
  const silent = await qualifyEdge({ timeoutMs: 200, adapters: fixtureAdapters({ sha256: () => { reads += 1; return reads === 1 ? SHA : never(); } }) });
  assert.deepEqual(silent.reasonCodes, ['SHA256_TIMEOUT']);
  assert.equal(silent.ok, false);
});

test('no second read is made when the first one failed or when there is nothing to read', LIMIT, async () => {
  let reads = 0;
  const first = await qualifyEdge({ adapters: fixtureAdapters({ sha256: () => { reads += 1; throw new Error('locked'); } }) });
  assert.deepEqual(first.reasonCodes, ['SHA256_UNAVAILABLE']);
  assert.equal(reads, 1);
  reads = 0;
  const missing = await qualifyEdge({ adapters: fixtureAdapters({ sha256: () => { reads += 1; return SHA; }, statFile: () => ({ exists: false }) }) });
  assert.deepEqual(missing.reasonCodes, ['EDGE_NOT_FOUND']);
  assert.equal(reads, 0);
});

test('a changed size or time and a changed digest are one finding, not two', LIMIT, async () => {
  let looks = 0;
  const statFile = () => ({ exists: true, isFile: true, size: 4096, mtimeMs: looks++ === 0 ? 1000 : 2000 });
  const report = await qualifyEdge({ adapters: fixtureAdapters({ statFile, sha256: digests(SHA, OTHER) }) });
  assert.deepEqual(report.reasonCodes, ['EDGE_CHANGED_DURING_CHECK']);
  assert.equal(report.ok, false);
});
