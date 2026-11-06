'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { qualifyEdge } = require('../qualify.cjs');
const { MS_SUBJECT, fixtureAdapters, never } = require('./support.cjs');

async function codes(overrides, options = {}) {
  const report = await qualifyEdge({ adapters: fixtureAdapters(overrides), ...options });
  assert.equal(report.ok, false);
  assert.ok(report.reasons.length > 0 && report.reasons.length === report.reasonCodes.length);
  return report.reasonCodes;
}

test('anything but a Valid signature fails closed with SIGNATURE_NOT_VALID', async () => {
  const cases = [
    { status: 'NotSigned', subject: null },
    { status: 'HashMismatch', subject: MS_SUBJECT },
    { status: 'NotTrusted', subject: MS_SUBJECT },
    { status: 'UnknownError', subject: MS_SUBJECT },
    { status: 'valid', subject: MS_SUBJECT },
    { status: 'Valid ', subject: MS_SUBJECT },
  ];
  for (const signature of cases) {
    assert.deepEqual(await codes({ signature: () => signature }), ['SIGNATURE_NOT_VALID'], signature.status);
  }
});

test('a validly signed binary of another publisher or a look-alike name fails closed', async () => {
  const subjects = [
    'CN=Contoso Ltd, O=Contoso Ltd, C=US',
    'CN=Not Microsoft Corp, O=Not Microsoft Corp, C=US',
    'CN=Microsoft Corporation, O=Evil Inc, C=US',
    'CN=Microsoft Corporation, O=Microsoft Corporation Ltd, C=US',
    'CN=Microsoft Corporation, O=Microsoft  Corporation, C=US',
    'CN=Microsoft Corporation, O=microsoft corporation, C=US',
    'O="Evil, O=Microsoft Corporation", C=US',
    'CN=Evil\\, O=Microsoft Corporation, O=Evil, C=US',
    'O=Microsoft Corporation, O=Evil Inc',
    'CN=Microsoft Corporation, C=US',
    'not a distinguished name',
    '',
  ];
  for (const subject of subjects) {
    assert.deepEqual(await codes({ signature: () => ({ status: 'Valid', subject }) }), ['PUBLISHER_NOT_MICROSOFT'], subject);
  }
});

test('a Valid signature with no certificate subject at all fails as PUBLISHER_NOT_MICROSOFT', async () => {
  assert.deepEqual(await codes({ signature: () => ({ status: 'Valid' }) }), ['PUBLISHER_NOT_MICROSOFT']);
});

test('an invalid signature of a foreign publisher reports both problems', async () => {
  const subject = 'CN=Evil Inc, O=Evil Inc, C=US';
  assert.deepEqual(
    await codes({ signature: () => ({ status: 'NotTrusted', subject }) }),
    ['SIGNATURE_NOT_VALID', 'PUBLISHER_NOT_MICROSOFT'],
  );
});

test('majors 155 and 157, a wildcard-like 1560 and a zero major fail closed with MAJOR_NOT_QUALIFIED', async () => {
  for (const version of ['155.0.4300.1', '157.0.4400.2', '1560.0.0.0', '0.0.0.1']) {
    assert.deepEqual(await codes({ fileVersion: () => version }), ['MAJOR_NOT_QUALIFIED'], version);
  }
  const report = await qualifyEdge({ adapters: fixtureAdapters({ fileVersion: () => '157.0.4400.2' }) });
  assert.equal(report.major, 157);
  assert.equal(report.version, '157.0.4400.2');
});

test('an unusable qualified list fails closed with QUALIFIED_MAJORS_INVALID', async () => {
  const bad = [
    () => { throw new Error('ENOENT'); },
    () => ({ qualifiedMajors: [] }),
    () => ({ qualifiedMajors: ['*'] }),
    () => ({ qualifiedMajors: ['156'] }),
    () => ({ qualifiedMajors: [156.5] }),
    () => ({ qualifiedMajors: [156, 156] }),
    () => ({ qualifiedMajors: [-156] }),
    () => ({ qualifiedMajors: 156 }),
    () => ({ majors: [156] }),
    () => null,
    () => '[156]',
  ];
  for (const readQualified of bad) {
    const report = await qualifyEdge({ adapters: fixtureAdapters({ readQualified }) });
    assert.equal(report.ok, false);
    assert.deepEqual(report.reasonCodes, ['QUALIFIED_MAJORS_INVALID']);
    assert.deepEqual(report.qualifiedMajors, []);
  }
});

test('an unparsable file version fails closed with VERSION_UNPARSABLE and is not recorded as the version', async () => {
  const unparsable = [
    '156.0.4314', '156.0.4314.58.1', '156.0.4314.58 (Official build)', 'v156.0.4314.58', '156.0.04314.58',
    '156.0.4314.70000', '156,0,4314,58', ' 156.0.4314.58', '156.0.4314.58\n', '156.0.-1.58', '156.0.4314.5e1', '',
  ];
  for (const version of unparsable) {
    const report = await qualifyEdge({ adapters: fixtureAdapters({ fileVersion: () => version }) });
    assert.equal(report.ok, false, JSON.stringify(version));
    assert.deepEqual(report.reasonCodes, [version === '' ? 'VERSION_UNAVAILABLE' : 'VERSION_UNPARSABLE'], JSON.stringify(version));
    assert.equal(report.version, null);
    assert.equal(report.major, null);
  }
});

test('a missing, null, non-string or throwing version read fails closed with VERSION_UNAVAILABLE', async () => {
  for (const fileVersion of [() => null, () => undefined, () => 156, () => { throw new Error('no resource'); }]) {
    assert.deepEqual(await codes({ fileVersion }), ['VERSION_UNAVAILABLE']);
  }
});

test('a signature, version or hash query that never answers fails closed with a timeout code and returns', { timeout: 30000 }, async () => {
  assert.deepEqual(await codes({ signature: never }, { timeoutMs: 40 }), ['SIGNATURE_TIMEOUT']);
  assert.deepEqual(await codes({ fileVersion: never }, { timeoutMs: 40 }), ['VERSION_TIMEOUT']);
  assert.deepEqual(await codes({ sha256: never }, { timeoutMs: 40 }), ['SHA256_TIMEOUT']);
});

test('a throwing or malformed adapter answer fails closed instead of crashing', async () => {
  assert.deepEqual(await codes({ signature: () => { throw new Error('boom'); } }), ['SIGNATURE_UNAVAILABLE']);
  assert.deepEqual(await codes({ signature: () => 42 }), ['SIGNATURE_UNAVAILABLE']);
  assert.deepEqual(await codes({ signature: () => ({ status: 7 }) }), ['SIGNATURE_UNAVAILABLE']);
  assert.deepEqual(await codes({ sha256: () => { throw new Error('locked'); } }), ['SHA256_UNAVAILABLE']);
  assert.deepEqual(await codes({ sha256: () => 'not a digest' }), ['SHA256_UNAVAILABLE']);
  assert.deepEqual(await codes({ statFile: () => { throw new Error('EACCES'); } }), ['EDGE_NOT_FOUND']);
  assert.deepEqual(await codes({ candidates: () => [] }), ['EDGE_NOT_FOUND']);
});

test('a binary that changes while it is checked fails closed with EDGE_CHANGED_DURING_CHECK', async () => {
  for (const [first, second] of [[{ size: 10, mtimeMs: 1 }, { size: 11, mtimeMs: 1 }], [{ size: 10, mtimeMs: 1 }, { size: 10, mtimeMs: 2 }]]) {
    let calls = 0;
    const statFile = () => ({ exists: true, isFile: true, ...(calls++ === 0 ? first : second) });
    assert.deepEqual(await codes({ statFile }), ['EDGE_CHANGED_DURING_CHECK']);
  }
  const vanished = [{ exists: true, isFile: true, size: 1, mtimeMs: 1 }, { exists: false }];
  let seen = 0;
  assert.deepEqual(await codes({ statFile: () => vanished[Math.min(seen++, 1)] }), ['EDGE_CHANGED_DURING_CHECK']);
});
