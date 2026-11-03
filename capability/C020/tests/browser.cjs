'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startLocal } = require(path.join(__dirname, '..', 'server.cjs'));
const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
const { openIsolatedLoopback } = require(path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs'));
const recordPath = path.join(__dirname, '..', 'evidence', 'browser-acceptance.json');
const record = {
  cardId: 'C020', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  mode: 'isolated-headless', engine: 'Microsoft Edge (Chromium)',
  testRuntime: process.version, businessData: 'synthetic', nativeTargetQualified: false,
  productionRuntimeValidated: false, integratedForegroundLeaseUsed: false,
  checks: [], cleanup: { serverClosed: false, browserClosed: false }
};

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

function parseText(page, id) {
  return page.locator(`#${id}`).textContent().then((text) => JSON.parse(text));
}

async function main() {
  let server;
  let session;
  let failure;
  try {
    assert.equal(typeof openIsolatedLoopback, 'function', 'Verified shared loopback API is required; do not bypass its guards.');
    server = await startLocal();
    record.server = { pid: process.pid, address: server.address(), ownership: 'this process, exact returned http.Server handle' };
    const origin = `http://127.0.0.1:${server.address().port}`;
    session = await openIsolatedLoopback(path.join('capability', 'C020', 'index.html'), server);
    record.browserVersion = session.browserVersion;
    record.playwrightVersion = require(path.join(repositoryRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    const { page } = session;
    const pageErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('inspect').disabled);
    assert.match(await page.locator('#status').textContent(), /^Not run/);
    assert.match(await page.locator('main').textContent(), /Synthetic business data · Loopback HTTP only/);
    assert.match(await page.locator('#runtime').textContent(), new RegExp(process.version.replaceAll('.', '\\.')));
    checked('initial state has no successful observations and labels synthetic/local tooling', await page.locator('#runtime').textContent());

    await page.getByLabel('Explicit synthetic profile ID').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('synthetic-001');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'inspect');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL'));
    const first = [await parseText(page, 'v1'), await parseText(page, 'v2')];
    assert.deepEqual(first[0].profile, first[1].profile);
    assert.deepEqual(first[0].profile, {
      id: 'synthetic-001', displayName: 'Avery Example', email: 'avery@example.invalid',
      preferences: { locale: 'en-GB', theme: 'dark', topics: ['scaling', 'versions'] }
    });
    assert.deepEqual(first.map((value) => value.apiContract), ['getProfile/1', 'getProfile/1']);
    assert.deepEqual(first.map((value) => value.stamp.implementationVersion), ['1.0.0', '2.0.0']);
    assert.deepEqual(first.map((value) => value.stamp.deploymentStamp), ['C020-loopback-v1-r1', 'C020-loopback-v2-r1']);
    const compatibility = await parseText(page, 'compatibility');
    assert.equal(compatibility.compatible, true);
    assert.deepEqual(compatibility.oldConsumer, first[0].profile);
    checked('real Tab/Enter submits BOTH implementations and exposes stable old-consumer semantics and differing stamps', {
      profile: first[0].profile, apiContract: compatibility.apiContract, stamps: first.map((value) => value.stamp)
    });
    await page.screenshot({ path: path.join(__dirname, '..', 'evidence', 'browser-profile.png'), fullPage: true });
    record.screenshot = path.join('capability', 'C020', 'evidence', 'browser-profile.png');

    await page.getByLabel('Explicit synthetic profile ID').fill('synthetic-002');
    await page.getByRole('button', { name: 'Inspect both implementations', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL'));
    const second = [await parseText(page, 'v1'), await parseText(page, 'v2')];
    assert.deepEqual(second[0].profile, second[1].profile);
    assert.deepEqual(second[0].profile, {
      id: 'synthetic-002', displayName: 'Jordan Sample', email: 'jordan@example.invalid',
      preferences: { locale: 'fr-FR', theme: 'light', topics: [] }
    });
    checked('second immutable synthetic profile is compatible through BOTH actual HTTP implementations', second[0].profile);

    await page.getByRole('button', { name: 'Validate candidate response', exact: true }).click();
    assert.match(await page.locator('#candidate-status').textContent(), /^VALID LOCAL CANDIDATE/);
    checked('an unchanged actual v2 candidate validates without being mislabelled a new HTTP observation', await page.locator('#candidate-status').textContent());
    for (const [name, mutate, code] of [
      ['forged implementation version', (value) => { value.stamp.implementationVersion = '999'; }, 'STAMP_MISMATCH'],
      ['forged deployment stamp', (value) => { value.stamp.deploymentStamp = 'production'; }, 'STAMP_MISMATCH'],
      ['missing stamp', (value) => { delete value.stamp; }, 'STAMP_MISMATCH'],
      ['breaking contract', (value) => { value.apiContract = 'getProfile/2'; }, 'CONTRACT_MISMATCH'],
      ['changed nested business data', (value) => { value.profile.preferences.theme = 'changed'; }, 'PROFILE_MISMATCH'],
      ['wrong profile', (value) => { value.profile.id = 'synthetic-001'; }, 'PROFILE_MISMATCH']
    ]) {
      const candidate = structuredClone(second[1]);
      mutate(candidate);
      await page.getByLabel('Candidate JSON for the profile ID above').fill(JSON.stringify(candidate));
      await page.getByRole('button', { name: 'Validate candidate response', exact: true }).click();
      const observed = await page.locator('#candidate-status').textContent();
      assert.match(observed, new RegExp(`^REJECTED — ${code}`));
      checked(`actual DOM rejects ${name}`, observed);
    }
    for (const text of ['{', '']) {
      await page.getByLabel('Candidate JSON for the profile ID above').fill(text);
      await page.getByRole('button', { name: 'Validate candidate response', exact: true }).click();
      assert.match(await page.locator('#candidate-status').textContent(), /^REJECTED — INVALID_JSON/);
    }
    checked('actual DOM rejects malformed and empty JSON instead of defaulting healthy', 'INVALID_JSON for both');

    const protocols = await page.evaluate(async () => {
      const observed = [];
      for (const implementation of ['v1', 'v2']) {
        const response = await fetch(`/fixtures/${implementation}/getProfile?profileId=synthetic-002`, {
          headers: { 'X-C020-Implementation-Version': 'forged', 'X-C020-Deployment-Stamp': 'production' }
        });
        const value = await response.json();
        const verification = globalThis.C020Inspector.inspect(value, implementation, 'synthetic-002');
        observed.push({
          status: response.status, verified: verification.verified, value,
          headerVersion: response.headers.get('x-c020-implementation-version'),
          headerDeployment: response.headers.get('x-c020-deployment-stamp')
        });
      }
      const old = observed.map((item) => globalThis.C020Inspector.oldConsumer(item.value));
      const changedVersion = JSON.parse(JSON.stringify(observed[1].value));
      changedVersion.stamp.implementationVersion = 'a-future-implementation';
      const unchanged = JSON.stringify(globalThis.C020Inspector.oldConsumer(changedVersion)) === JSON.stringify(old[1]);
      let changedStampRejected = false;
      try { globalThis.C020Inspector.inspect(changedVersion, 'v2', 'synthetic-002'); } catch (error) { changedStampRejected = error.code === 'STAMP_MISMATCH'; }
      const invalid = [];
      for (const route of [
        '/fixtures/v1/getProfile?profileId=synthetic-001&implementationVersion=999',
        '/fixtures/v2/getProfile?profileId=synthetic-001&deploymentStamp=production',
        '/fixtures/v3/getProfile?profileId=synthetic-001'
      ]) {
        const response = await fetch(route);
        invalid.push({ status: response.status, body: await response.json() });
      }
      let immutable = false;
      try {
        (function () { 'use strict'; globalThis.C020Contract.profiles[0].preferences.topics.push('leak'); }());
      } catch (error) { immutable = error.name === 'TypeError'; }
      return {
        observed, oldConsumerEqual: JSON.stringify(old[0]) === JSON.stringify(old[1]),
        implementationVersionDoesNotBreakOldConsumer: unchanged, changedStampRejected, invalid, immutable,
        nestedFrozen: Object.isFrozen(globalThis.C020Contract.profiles[0].preferences.topics)
      };
    });
    for (const [index, observed] of protocols.observed.entries()) {
      assert.equal(observed.status, 200);
      assert.equal(observed.verified, true);
      assert.equal(observed.headerVersion, `${index + 1}.0.0`);
      assert.equal(observed.headerDeployment, `C020-loopback-v${index + 1}-r1`);
    }
    assert.equal(protocols.oldConsumerEqual, true);
    assert.equal(protocols.implementationVersionDoesNotBreakOldConsumer, true);
    assert.equal(protocols.changedStampRejected, true);
    assert.equal(protocols.immutable, true);
    assert.equal(protocols.nestedFrozen, true);
    assert.deepEqual(protocols.invalid.map((item) => item.status), [400, 400, 404]);
    assert.deepEqual(protocols.invalid.map((item) => item.body.error.code), ['INVALID_QUERY', 'INVALID_QUERY', 'NOT_FOUND']);
    assert.equal(protocols.invalid.some((item) => Object.hasOwn(item.body, 'profile')), false);
    checked('actual browser HTTP ignores forged headers, rejects query overrides/unknown implementation, and keeps stamps coherent', protocols);

    for (const [id, code] of [['synthetic-999', 'UNKNOWN_PROFILE'], ['', 'INVALID_PROFILE_ID']]) {
      await page.getByLabel('Explicit synthetic profile ID').fill(id);
      await page.getByRole('button', { name: 'Inspect both implementations', exact: true }).click();
      await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('UNVERIFIED'));
      const observed = await page.locator('#status').textContent();
      assert.match(observed, new RegExp(`v1: ${code}.*v2: ${code}`));
      assert.equal(await page.locator('#stamps').textContent(), 'No observed stamps.');
      assert.equal(await page.locator('#compatibility').textContent(), 'No verified compatibility result.');
      assert.equal(await page.locator('#v1').textContent(), 'No observation.');
      assert.equal(await page.locator('#v2').textContent(), 'No observation.');
      assert.equal(await page.locator('#candidate').inputValue(), '');
      checked(`actual DOM clears prior success after ${id || 'empty ID'}`, observed);
    }
    assert.deepEqual(pageErrors, []);
    assert.equal(requests.every((request) => request.url.startsWith(`${origin}/`) && request.method === 'GET'), true);
    checked('monitored reload and interactions have no uncaught page errors or nonlocal requests', {
      pageErrors, requests, monitoring: 'listeners installed before the verified reload'
    });
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      try {
        if (session) { await session.close(); record.cleanup.browserClosed = true; }
      } finally {
        if (server) {
          server.closeAllConnections();
          await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
          record.cleanup.serverClosed = !server.listening;
          record.cleanup.method = 'exact owned http.Server handle closed in caller PID; no process-name termination';
        }
      }
    } catch (error) {
      failure ||= error;
      record.outcome = 'failed';
      record.cleanup.error = error.message;
    }
    record.completedAtUtc = new Date().toISOString();
    fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  }
  if (failure) throw failure;
  console.log(`C020 browser: ${record.checks.length} actual checks passed; Edge ${record.browserVersion}; cleanup complete.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
