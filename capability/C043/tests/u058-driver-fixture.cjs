'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { qualifyEdge } = require('../../../testing/browser/qualify/qualify.cjs');

const root = path.resolve(__dirname, '..', '..', '..');
const CURRENT = 'capability\\C043\\tests\\browser.cjs';
const ORIGINAL = 'capability\\C043\\evidence\\u058\\superseded\\tests\\browser.cjs.txt';
const OBSERVATION_BOUNDARY = 'U058_FIXTURE_OBSERVATION_BOUNDARY';

async function fixtureReport(options = {}) {
  const version = options.version ?? '157.0.4341.42';
  const organization = options.organization ?? 'Microsoft Corporation';
  const adapters = {
    now: () => '2026-11-08T12:00:00.000Z',
    candidates: () => ['C:\\Fixture\\Microsoft\\Edge\\msedge.exe'],
    statFile: () => ({ exists: true, isFile: true, size: 4096, mtimeMs: 1000 }),
    sha256: () => 'ab'.repeat(32),
    signature: () => ({
      status: options.status ?? 'Valid', subject: `CN=Fixture, O=${organization}, C=US`,
      issuer: 'CN=Fixture Microsoft Signing Authority', thumbprint: 'cd'.repeat(20),
    }),
    fileVersion: () => version,
    readQualified: () => ({
      schemaVersion: 1, qualifiedMajors: options.qualifiedMajors ?? [156, 157], sealedMajors: [156],
    }),
    ...options.adapters,
  };
  return qualifyEdge({ adapters, env: {}, timeoutMs: 1000 });
}

async function drive(driver = CURRENT, options = {}) {
  const report = await fixtureReport(options);
  const counts = { qualification: 0, services: 0, sessions: 0, serviceClosed: 0, sessionClosed: 0, pageEntered: 0 };
  const errors = [];
  const messages = [];
  const processFixture = { env: {}, version: process.version, pid: 0, exitCode: 0 };
  const page = {
    on() {},
    async reload() {
      counts.pageEntered += 1;
      throw Object.assign(new Error(OBSERVATION_BOUNDARY), { code: OBSERVATION_BOUNDARY });
    },
  };
  const support = {
    gate: () => ({ executor: async () => {}, release() {} }),
    doc: (value) => value,
    step: (n, extra) => ({ n, ...extra }),
    inFlight: async () => {},
    async startService() {
      counts.services += 1;
      return {
        port: 0, server: { address: () => ({ address: '127.0.0.1', port: 0 }) },
        async stop() { counts.serviceClosed += 1; },
      };
    },
    async call(port, method) {
      assert.equal(port, 0);
      return method === 'GET' ? { json: { presets: [{}] } } : { status: 201 };
    },
  };
  const resolve = (name) => {
    if (name === 'node:child_process') return {
      execFileSync() {
        return JSON.stringify({
          path: report.path, status: report.signature.status, signer: report.signature.subject,
          fileVersion: report.version, sha256: report.sha256,
        });
      },
    };
    if (name === './support.cjs') return support;
    if (name === '../transcript.cjs') return { produceTranscript() {} };
    if (name === '../contract.js') return {};
    if (name.endsWith(path.join('testing', 'browser', 'qualify', 'qualify.cjs'))) return {
      async qualifyEdge() {
        counts.qualification += 1;
        if (options.qualificationThrows) throw new Error('QUALIFICATION_UNAVAILABLE fixture');
        return options.verdictOverride ?? report;
      },
    };
    if (name.endsWith(path.join('testing', 'browser', 'isolated.cjs'))) return {
      async openIsolatedLoopback() {
        counts.sessions += 1;
        return {
          browserVersion: options.browserVersion ?? report.version, page,
          async close() { counts.sessionClosed += 1; },
        };
      },
    };
    if (name.endsWith(path.join('playwright', 'package.json'))) return { version: 'fixture' };
    if (['node:assert/strict', 'node:crypto', 'node:fs', 'node:path'].includes(name)) return require(name);
    throw new Error(`UNEXPECTED_FIXTURE_IMPORT ${name}`);
  };
  const original = options.source ?? fs.readFileSync(path.join(root, driver), 'utf8');
  const invocation = 'main().catch((error) => { console.error(error); process.exitCode = 1; });';
  assert.equal(original.includes(invocation), true, 'the retained driver has the expected completion hook');
  // Only expose the driver's existing completion; none of its admission or observation statements are rewritten.
  const source = original.replace(invocation, `const completion = ${invocation}`) + '\nreturn completion.then(() => record);\n';
  const run = vm.compileFunction(source, ['require', '__dirname', 'process', 'console'], { filename: CURRENT });
  const record = await run(resolve, path.join(root, 'capability', 'C043', 'tests'), processFixture, {
    log: (message) => messages.push(String(message)),
    error: (error) => errors.push(error),
  });
  return { report, counts, errors, messages, record, exitCode: processFixture.exitCode };
}

function assertAdmitted(result) {
  assert.equal(result.counts.services, 1,
    `fixture-qualified Microsoft-signed major157 must cross driver admission; driver: ${result.errors[0]?.message}`);
  assert.equal(result.counts.sessions, 1);
  assert.equal(result.counts.pageEntered, 1);
  assert.equal(result.errors[0]?.code, OBSERVATION_BOUNDARY);
  assert.deepEqual([result.counts.serviceClosed, result.counts.sessionClosed], [1, 1]);
}

module.exports = { CURRENT, ORIGINAL, OBSERVATION_BOUNDARY, fixtureReport, drive, assertAdmitted };
