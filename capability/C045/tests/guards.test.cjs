'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const { startClient, startPair, optionsLifetime, csp, limits } = require('../server.cjs');
const { openClients } = require('../clients.cjs');
const { recheckConsent } = require('../consent.cjs');
const { verifyDependencies, readDependency } = require('../source-integrity.cjs');
const { guardOperation } = require(path.join(__dirname, '..', '..', 'C001', 'contract-guard.js'));
const approval = require(path.join(__dirname, '..', '..', 'C001', 'approved-contract.js')).approval;
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('actual current local.probe consent and exact accepted gates are reread under mutex', async () => {
  const permission = await recheckConsent();
  assert.equal(permission.allowed, true);
  assert.equal(permission.action, 'local.probe');
  assert.deepEqual(permission.currentGates.map(gate => gate.id), ['C020', 'C041']);
  assert.equal((await guardOperation('local.probe', undefined)).allowed, false);
  assert.equal((await guardOperation('local.probe', { ...approval, identityRegistrationApproved: true })).allowed, false);
  for (const action of ['native.execute', 'iac.generate', 'scaffold.generate', 'deployment.execute', 'identity.register', 'spend.authorize']) {
    const decision = await guardOperation(action, approval);
    assert.equal(decision.allowed, false);
    assert.equal(decision.executed, false);
  }
  assert.match(source('consent.ps1'), /Local\\AppScalingStrategies_KanbanState_v1/);
  assert.match(source('consent.ps1'), /finally[\s\S]*ReleaseMutex\(\)[\s\S]*Dispose\(\)/);
  assert.match(source('server.cjs'), /await recheckConsent\(\);[\s\S]*server\.listen\(\{ port: 0, host: '127\.0\.0\.1', signal: startup\.signal \}/);
  assert.match(source('server.cjs'), /expired = true;[\s\S]*startup\.abort\(\)/);
  assert.doesNotMatch(source('consent.cjs'), /ExecutionPolicy|Bypass|readSource|callerApproval/);
});

test('strict own lifetime data is the only accepted caller option; no listeners start for invalid input', async () => {
  assert.equal(optionsLifetime(), 120000);
  assert.equal(optionsLifetime({ ttlMs: 1000 }), 1000);
  assert.equal(optionsLifetime(Object.assign(Object.create(null), { ttlMs: 1000 })), 1000);
  for (const options of [null, [], 1, '1000', { host: '0.0.0.0' }, { port: 0 }, { origin: 'http://127.0.0.1' },
    { profileId: 'synthetic-001' }, { implementation: 'v2' }, { deploymentStamp: 'forged' }, { approval },
    { ttlMs: 999 }, { ttlMs: 120001 }, { ttlMs: NaN }, { ttlMs: 1000.5 },
    Object.create({ ttlMs: 1000 }), Object.defineProperty({}, 'ttlMs', { get() { throw new Error('must not invoke accessor'); }, enumerable: true }),
    Object.defineProperty({}, 'ttlMs', { value: 1000, enumerable: false }), { [Symbol('override')]: 1 }]) {
    await assert.rejects(startClient('ga', options), /option|forbidden|Lifetime/);
    await assert.rejects(startPair(options), /option|forbidden|Lifetime/);
    await assert.rejects(openClients(options), /option|forbidden|Lifetime/);
  }
  for (const lane of ['', 'GA', ' ga', 'preview ', 'v1', 'v2', '__proto__', {}, null]) {
    await assert.rejects(startClient(lane), /exactly ga or preview/);
  }
  await assert.rejects(startClient('ga', {}, 'extra'), /exactly ga or preview/);
  await assert.rejects(startPair({}, 'extra'), /lifetime option/);
  await assert.rejects(openClients({}, 'extra'), /lifetime option/);
  assert.equal(limits.maximumRequests, 256);
  assert.equal(limits.maximumConnections, 16);
});

test('CLI overrides fail with no browser/listener success claim', () => {
  for (const file of ['server.cjs', 'clients.cjs']) {
    const run = spawnSync(process.execPath, [path.join(__dirname, '..', file), '--host', '127.0.0.1'], {
      cwd: path.resolve(__dirname, '..', '..', '..'), encoding: 'utf8', timeout: 15000, maxBuffer: 32768
    });
    assert.equal(run.status, 1);
    assert.doesNotMatch(run.stdout, /listening|client-pages-open/);
    assert.match(run.stderr, /accepts? no/);
  }
});

test('closed assets, immutable dependencies and C041 boundary are not expanded', () => {
  assert.equal(verifyDependencies().length, 11);
  assert.throws(() => readDependency('capability\\C033\\index.html'), /approved fixed dependency/);
  assert.doesNotMatch(source('server.cjs'), /require\([^)]*C041|startHost|createHost|allow-same-origin|allow-popups|unsafe-inline|unsafe-eval/);
  assert.doesNotMatch(source('client.js'), /window\.open|postMessage|message['"]|localStorage|sessionStorage|document\.cookie|indexedDB|WebSocket|serviceWorker/);
  assert.match(source('clients.cjs'), /openIsolatedLoopback\(path\.join\('capability', 'C045', 'index\.html'\), pair\.clients\[lane\]\.server\)/);
  assert.doesNotMatch(source('clients.cjs'), /chromium\.launch|newContext|newPage|connectOverCDP|executablePath/);
  for (const directive of ["script-src 'self'", "style-src 'self'", "connect-src 'self'", "frame-src 'none'",
    "worker-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'"]) assert.ok(csp.includes(directive));
  const page = source('index.html');
  assert.match(page, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(page, /UNKNOWN - no actual owned server destination observed/);
  assert.match(page, /id="observe" type="submit" disabled/);
  assert.match(page, /id="clear" type="reset"/);
  assert.doesNotMatch(source('client.js'), /form\.reset\s*\(/);
  assert.match(source('client.js'), /form\.addEventListener\('reset'/);
  assert.match(source('client.js'), /location\.hostname !== '127\.0\.0\.1'/);
  assert.match(source('client.js'), /credentials: 'omit'/);
});
