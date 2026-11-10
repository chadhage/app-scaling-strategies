'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { CURRENT, ORIGINAL, drive, assertAdmitted } = require('./u058-driver-fixture.cjs');
const root = path.resolve(__dirname, '..', '..', '..');

test('U058 admission: genuine API-qualified signed156 and signed157 proceed once and close fixtures', async (t) => {
  for (const version of ['156.0.4314.58', '157.0.4341.42']) {
    await t.test(version, async () => {
      const result = await drive(CURRENT, { version });
      assert.equal(result.report.ok, true);
      assert.equal(result.report.qualifiedVia, version.startsWith('156.') ? 'sealed' : 'addendum');
      assertAdmitted(result);
      assert.equal(result.counts.qualification, 1);
      assert.deepEqual(result.record.edgeQualification, result.report);
      assert.equal(result.record.signedEdge.fileVersion, version);
      assert.equal(result.record.browserVersion, version);
    });
  }
});

test('U058 admission: unqualified157 and unknown158 refuse before any service or browser starts', async (t) => {
  for (const [version, qualifiedMajors] of [['157.0.4341.42', [156]], ['158.0.4400.1', [156, 157]]]) {
    await t.test(version, async () => {
      const result = await drive(CURRENT, { version, qualifiedMajors });
      assert.equal(result.report.ok, false);
      assert.ok(result.report.reasonCodes.includes('MAJOR_NOT_QUALIFIED'));
      assert.deepEqual([result.counts.services, result.counts.sessions], [0, 0]);
      assert.match(result.errors[0].message, /MAJOR_NOT_QUALIFIED/);
      assert.equal(result.exitCode, 1);
    });
  }
});

test('U058 admission: qualified membership cannot override invalid signatures or publisher lookalikes', async (t) => {
  const cases = [
    [{ status: 'NotSigned' }, 'SIGNATURE_NOT_VALID'],
    [{ status: 'HashMismatch' }, 'SIGNATURE_NOT_VALID'],
    [{ organization: 'Fictional Software' }, 'PUBLISHER_NOT_MICROSOFT'],
    [{ organization: 'Microsoft Corporation Impostor' }, 'PUBLISHER_NOT_MICROSOFT'],
  ];
  for (const [options, reason] of cases) {
    await t.test(JSON.stringify(options), async () => {
      const result = await drive(CURRENT, options);
      assert.equal(result.report.ok, false);
      assert.ok(result.report.reasonCodes.includes(reason));
      assert.deepEqual([result.counts.services, result.counts.sessions], [0, 0]);
      assert.match(result.errors[0].message, new RegExp(reason));
    });
  }
});

test('U058 admission: false, absent and unavailable reports fail closed and retain diagnostics', async (t) => {
  const report = (await drive()).report;
  const cases = [
    ['false verdict despite membership', { verdictOverride: { ...report, ok: false, reasonCodes: ['SHA256_UNAVAILABLE'], reasons: ['SHA256_UNAVAILABLE: fixture'] } }],
    ['missing report', { verdictOverride: false }],
    ['qualification throws', { qualificationThrows: true }],
    ['unavailable authority', { adapters: { readQualified() { throw new Error('fixture authority unavailable'); } } }],
    ['invalid digest', { adapters: { sha256: () => 'bad' } }],
    ['missing binary', { adapters: { statFile: () => ({ exists: false }) } }],
    ['malformed version', { version: 'malformed' }],
    ['unavailable signature', { adapters: { signature() { throw new Error('fixture signature unavailable'); } } }],
  ];
  for (const [name, options] of cases) {
    await t.test(name, async () => {
      const result = await drive(CURRENT, options);
      assert.deepEqual([result.counts.services, result.counts.sessions], [0, 0]);
      assert.equal(result.errors.length, 1);
      assert.equal(result.exitCode, 1);
      assert.equal(result.record.outcome, 'failed');
    });
  }
});

test('U058 admission: full current binary/browser mismatches fail before page observation and clean up', async (t) => {
  for (const browserVersion of ['157.0.4341.43', '156.0.4314.58', '158.0.4400.1', 'malformed']) {
    await t.test(browserVersion, async () => {
      const result = await drive(CURRENT, { browserVersion });
      assert.equal(result.report.ok, true);
      assert.deepEqual([result.counts.services, result.counts.sessions, result.counts.pageEntered], [1, 1, 0]);
      assert.deepEqual([result.counts.serviceClosed, result.counts.sessionClosed], [1, 1]);
      assert.equal(result.errors[0].code, 'ERR_ASSERTION');
      assert.match(result.errors[0].message, /currently qualified binary version/);
    });
  }
});

test('U058 RED replay: the unchanged oracle fails on retained original157/156 and passes on current bytes', async () => {
  const red = await drive(ORIGINAL);
  assert.equal(red.report.ok, true, 'the fixture is genuinely qualified before the old driver runs');
  assert.equal(red.errors[0].code, 'ERR_ASSERTION');
  assert.match(red.errors[0].message, /'157' !== '156'/);
  assert.deepEqual([red.counts.services, red.counts.sessions], [0, 0]);
  assert.throws(() => assertAdmitted(red), { code: 'ERR_ASSERTION' });
  assertAdmitted(await drive());
});

test('U058 admission: independent concurrent fixtures cannot close or change their neighbour', async () => {
  const [matching, mismatch] = await Promise.all([drive(), drive(CURRENT, { browserVersion: '158.0.4400.1' })]);
  assertAdmitted(matching);
  assert.deepEqual([mismatch.counts.serviceClosed, mismatch.counts.sessionClosed, mismatch.counts.pageEntered], [1, 1, 0]);
  assert.notEqual(matching.counts, mismatch.counts);
});

test('U058 scope: owning API is called before startup; all non-admission observation bytes remain exact', () => {
  const current = fs.readFileSync(path.join(root, CURRENT), 'utf8');
  const original = fs.readFileSync(path.join(root, ORIGINAL), 'utf8');
  assert.doesNotMatch(current, /QUALIFIED_MAJOR|qualified\.json/);
  assert.ok(current.indexOf('await qualifyEdge()') < current.indexOf('service = await startService'));
  const observation = (source) => source.slice(source.indexOf('    const { page } = session;'));
  assert.equal(observation(current), observation(original));
  const setup = (source) => source.slice(source.indexOf('    service = await startService'), source.indexOf('    record.browserVersion ='));
  assert.equal(setup(current), setup(original));
});

test('U058 nested replay: child environment is sanitized and behavioral RED exits one', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const result = spawnSync(process.execPath, ['capability\\C043\\tests\\u058-admission.cjs', '--original'],
    { cwd: root, env, encoding: 'utf8', timeout: 120000, windowsHide: true });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /QUALIFIED_FIXTURE Microsoft-signed 157/);
  assert.match(result.stderr, /ERR_ASSERTION/);
  assert.doesNotMatch(result.stdout + result.stderr, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
});
