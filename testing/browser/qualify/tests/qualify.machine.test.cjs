'use strict';

// MACHINE TEST (not part of the hermetic coverage run): asks the real Windows PowerShell about the real installed
// Edge and about two real files that must fail closed. It launches no browser. It never pins a version or a hash.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const { scratchDir, removeDir } = require('./harness.cjs');

const LONG = { timeout: 240000 };

test('the real installed Edge is Microsoft-signed and inside the qualified majors; its identity is recorded', LONG, async (t) => {
  const report = await qualifyEdge();
  t.diagnostic(`Edge ${report.version} at ${report.path}; signature ${report.signature.status} by ${report.signature.publisher}; sha256 ${report.sha256}`);
  assert.equal(report.ok, true, report.reasons.join(' | '));
  assert.equal(report.signature.status, 'Valid');
  assert.equal(report.signature.publisher, 'Microsoft Corporation');
  assert.ok(report.qualifiedMajors.includes(report.major));
  assert.match(report.version, /^\d+\.\d+\.\d+\.\d+$/);
  assert.match(report.sha256, /^[0-9a-f]{64}$/);
  assert.ok(path.win32.isAbsolute(report.path) && report.path.toLowerCase().endsWith('msedge.exe'));
});

test('a real file that is not a signed Microsoft binary named msedge.exe fails closed on the real PowerShell', LONG, async (t) => {
  const dir = scratchDir();
  try {
    const fake = path.join(dir, 'msedge.exe');
    fs.writeFileSync(fake, 'MZ this is not an executable');
    const report = await qualifyEdge({ path: fake });
    t.diagnostic(`unsigned look-alike: ${report.reasonCodes.join(', ')}; status ${report.signature.status}`);
    assert.equal(report.ok, false);
    assert.ok(report.reasonCodes.includes('SIGNATURE_NOT_VALID'));
    assert.equal(report.path, fake);
  } finally {
    removeDir(dir);
  }
});

test('the real node.exe of this machine is not Microsoft Edge: another publisher or no signature fails closed', LONG, async (t) => {
  const report = await qualifyEdge({ path: process.execPath });
  t.diagnostic(`node.exe: status ${report.signature.status}, publisher ${report.signature.publisher}, version ${report.version}, reasons ${report.reasonCodes.join(', ')}`);
  assert.equal(report.ok, false);
  assert.ok(report.reasonCodes.includes(report.signature.status === 'Valid' ? 'PUBLISHER_NOT_MICROSOFT' : 'SIGNATURE_NOT_VALID'));
  assert.notEqual(report.signature.publisher, 'Microsoft Corporation');
});

test('a path that does not exist is a missing binary on the real file system', async () => {
  const report = await qualifyEdge({ path: path.join(__dirname, 'no-such-dir', 'msedge.exe') });
  assert.deepEqual(report.reasonCodes, ['EDGE_NOT_FOUND']);
});

test('discovery picks the very binary that Playwright launches for the msedge channel (what isolated.cjs uses)', async () => {
  const registry = require(path.join(__dirname, '..', '..', 'node_modules', 'playwright-core', 'lib', 'server', 'registry', 'index.js'));
  const launched = registry.registry.findExecutable('msedge').executablePath();
  const { edgeCandidates, statFile } = require('../adapters.cjs');
  const first = edgeCandidates().find((candidate) => statFile(candidate).exists);
  assert.equal(typeof launched, 'string');
  assert.equal(first.toLowerCase(), launched.toLowerCase());
});
