'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const { EDGE, MS_SUBJECT, SHA, fixtureAdapters } = require('./support.cjs');

test('a Microsoft-signed Edge inside the qualified majors passes and records its actual identity', async () => {
  const report = await qualifyEdge({ adapters: fixtureAdapters() });
  assert.equal(report.ok, true);
  assert.deepEqual(report.reasons, []);
  assert.deepEqual(report.reasonCodes, []);
  assert.equal(report.path, EDGE);
  assert.equal(report.version, '156.0.4314.58');
  assert.equal(report.major, 156);
  assert.equal(report.signature.status, 'Valid');
  assert.equal(report.signature.publisher, 'Microsoft Corporation');
  assert.equal(report.signature.subject, MS_SUBJECT);
  assert.equal(report.sha256, SHA);
  assert.deepEqual(report.qualifiedMajors, [156]);
  assert.equal(report.checkedAtUtc, '2026-11-05T12:00:00.000Z');
});

test('no historical build number is compared: .50 and .58 and a later build of major 156 all qualify', async () => {
  for (const version of ['156.0.4314.50', '156.0.4314.58', '156.1.9999.0']) {
    const report = await qualifyEdge({ adapters: fixtureAdapters({ fileVersion: () => version }) });
    assert.equal(report.ok, true, version);
    assert.equal(report.version, version);
    assert.equal(report.major, 156);
  }
});

test('the binary hash is recorded and never compared with a historical value', async () => {
  for (const digest of ['00'.repeat(32), 'ff'.repeat(32), SHA]) {
    const report = await qualifyEdge({ adapters: fixtureAdapters({ sha256: () => digest }) });
    assert.equal(report.ok, true);
    assert.equal(report.sha256, digest);
  }
});

test('a missing binary fails closed with EDGE_NOT_FOUND and lists every checked candidate', async () => {
  const candidates = ['C:\\a\\msedge.exe', 'C:\\b\\msedge.exe'];
  const report = await qualifyEdge({
    adapters: fixtureAdapters({ candidates: () => candidates, statFile: () => ({ exists: false }) }),
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['EDGE_NOT_FOUND']);
  assert.equal(report.path, null);
  assert.equal(report.version, null);
  assert.equal(report.sha256, null);
  assert.deepEqual(report.candidates, candidates.map((p) => ({ path: p, exists: false })));
});

test('a candidate that is a directory fails closed with EDGE_NOT_A_FILE', async () => {
  const report = await qualifyEdge({
    adapters: fixtureAdapters({ statFile: () => ({ exists: true, isFile: false, size: 0, mtimeMs: 1 }) }),
  });
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['EDGE_NOT_A_FILE']);
  assert.equal(report.path, EDGE);
});

test('the first existing candidate is the one that is qualified, later ones are only listed', async () => {
  const [first, second, third] = ['C:\\one\\msedge.exe', 'C:\\two\\msedge.exe', 'C:\\three\\msedge.exe'];
  const hashed = [];
  const adapters = fixtureAdapters({
    candidates: () => [first, second, third],
    statFile: (p) => ({ exists: p !== first, isFile: true, size: 5, mtimeMs: 7 }),
    sha256: (p) => { hashed.push(p); return SHA; },
    signature: (p) => ({ status: p === second ? 'Valid' : 'NotSigned', subject: p === second ? MS_SUBJECT : null }),
  });
  const report = await qualifyEdge({ adapters });
  assert.equal(report.ok, true);
  assert.equal(report.path, second);
  assert.deepEqual(hashed, [second, second]);
  assert.deepEqual(report.candidates.map((c) => c.exists), [false, true, true]);
});

test('an explicit path skips discovery and is recorded', async () => {
  const explicit = 'D:\\portable\\msedge.exe';
  const adapters = fixtureAdapters({
    candidates: () => { throw new Error('discovery must not run'); },
    statFile: (p) => ({ exists: p === explicit, isFile: true, size: 3, mtimeMs: 3 }),
  });
  const report = await qualifyEdge({ adapters, path: explicit });
  assert.equal(report.ok, true);
  assert.equal(report.path, explicit);
});

test('an equality pin on 156.0.4314.50 fails on the installed 156.0.4314.58 while qualifyEdge passes', async () => {
  const installed = '156.0.4314.58';
  assert.throws(() => assert.equal(installed, '156.0.4314.50'), assert.AssertionError);
  const report = await qualifyEdge({ adapters: fixtureAdapters({ fileVersion: () => installed }) });
  assert.equal(report.ok, true);
  assert.equal(report.version, installed);
});
