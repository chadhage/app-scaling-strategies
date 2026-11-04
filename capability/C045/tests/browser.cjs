'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { openClients } = require('../clients.cjs');
const { csp } = require('../server.cjs');
const { verifyDependencies, helperSha256, sha256, readRegular, readDependency } = require('../source-integrity.cjs');
const contract = require(path.join(__dirname, '..', '..', 'C020', 'contract.js'));
const inspector = require(path.join(__dirname, '..', '..', 'C020', 'inspector.js'));
const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');

function captureDirectory() {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') return null;
  const slot = process.env.C045_CAPTURE_SLOT;
  if (!/^browser-\d{8}T\d{9}Z-[a-f0-9-]{36}$/.test(slot || '')) throw new Error('Use the fixed capture runner for a deliberate unique browser evidence slot.');
  const directory = path.join(owned, 'evidence', 'captures', slot);
  if (!fs.statSync(directory).isDirectory() || fs.realpathSync(directory).toLowerCase() !== directory.toLowerCase()) {
    throw new Error('Browser capture requires its exact owned regular directory.');
  }
  return directory;
}

function preflight() {
  assert.equal(process.version, 'v22.23.4', 'Only the explicitly approved offline Node test runtime is claimed.');
  const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
  assert.equal(playwrightVersion, '1.56.1');
  const shell = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
  const script = "$p=Join-Path ${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe';$s=Get-AuthenticodeSignature -LiteralPath $p;[ordered]@{path=$p;status=[string]$s.Status;signer=$s.SignerCertificate.Subject;thumbprint=$s.SignerCertificate.Thumbprint;fileVersion=(Get-Item -LiteralPath $p).VersionInfo.FileVersion}|ConvertTo-Json -Compress";
  const run = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 32768
  });
  assert.equal(run.status, 0, run.stderr);
  const edge = JSON.parse(run.stdout.replace(/^\uFEFF/, ''));
  assert.equal(edge.status, 'Valid');
  assert.match(edge.signer, /CN=Microsoft Corporation/);
  assert.equal(edge.fileVersion, '156.0.4314.50');
  const dependencies = verifyDependencies();
  assert.equal(dependencies.find(entry => entry.path === 'testing\\browser\\isolated.cjs').rawCheckoutSha256, helperSha256);
  return { node: process.version, playwrightVersion, edge, helperSha256, dependencies };
}

async function snapshot(page) {
  return page.evaluate(() => ({
    title: document.title, label: document.getElementById('client-label').textContent,
    profile: document.getElementById('profile-id').value, draft: document.getElementById('draft').value,
    identity: document.getElementById('identity').textContent, destination: document.getElementById('destination').textContent,
    result: document.getElementById('result').textContent, evidence: document.getElementById('request-evidence').textContent,
    status: document.getElementById('client-status').textContent,
    error: document.getElementById('client-error').textContent, errorHidden: document.getElementById('client-error').hidden,
    invalid: document.getElementById('profile-id').getAttribute('aria-invalid'),
    submitDisabled: document.getElementById('observe').disabled
  }));
}

async function keyboardSubmit(page, profileId, draft) {
  await page.getByLabel('Explicit synthetic profile ID', { exact: true }).focus();
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(profileId);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'draft');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(draft);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'observe');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /^(OBSERVED LOCAL|ERROR)/.test(document.getElementById('client-status').textContent), undefined, { timeout: 10000 });
}

function verifyObservation(state, client, profileId) {
  assert.match(state.status, /^OBSERVED LOCAL/);
  const body = JSON.parse(state.result);
  const evidence = JSON.parse(state.evidence);
  assert.equal(inspector.inspect(body, client.implementation, profileId).verified, true);
  const expectedURL = `${new URL(client.url).origin}/fixtures/${client.implementation}/getProfile?profileId=${profileId}`;
  assert.equal(evidence.requestURL, expectedURL);
  assert.equal(evidence.responseURL, expectedURL);
  assert.equal(evidence.method, 'GET');
  assert.equal(evidence.status, 200);
  assert.equal(evidence.verified, true);
  assert.equal(evidence.headers.client, client.client);
  assert.equal(evidence.headers.scope, 'synthetic-local-readonly');
  assert.equal(evidence.headers.apiContract, 'getProfile/1');
  assert.equal(evidence.headers.implementationVersion, body.stamp.implementationVersion);
  assert.equal(evidence.headers.deploymentStamp, body.stamp.deploymentStamp);
  assert.match(state.identity, new RegExp(`${profileId} \\(not authenticated\\)`));
  assert.equal(state.errorHidden, true);
  return body;
}

async function nativeReset(page) {
  await page.getByRole('button', { name: 'Reset this client', exact: true }).focus();
  await page.keyboard.press('Enter');
  const state = await snapshot(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'clear');
  assert.equal(state.profile, '');
  assert.equal(state.draft, '');
  assert.equal(state.result, 'No HTTP observation.');
  assert.equal(state.evidence, 'No HTTP observation.');
  assert.equal(state.errorHidden, true);
  assert.equal(state.error, '');
  assert.equal(state.invalid, null);
  assert.match(state.status, /^NOT RUN/);
  return state;
}

async function main() {
  const directory = captureDirectory();
  const record = {
    cardId: 'C045', kano: 'S', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
    mode: 'two actual separate published-helper headless Edge browsers, contexts and pages',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    identityScope: 'synthetic profile IDs and lane labels only; not authenticated, entitled, signed, cross-tenant or Azure GA',
    transportScope: 'buffered guarded route.fetch real HTTP + real DOM, not native TCP/CORS/WebSocket/transport or general lifecycle qualification',
    integratedForegroundUsed: false, nativeTargetQualified: false, productionNode24Validated: false,
    c041AuthorityExpanded: false, checks: [], states: {}, httpResponses: [], pageErrors: [],
    cleanup: { awaitedFinally: false, pagesClosed: false, browsersDisconnected: false, listenersClosed: false }
  };
  let opened;
  let failure;
  const responseWork = [];
  const actualBrowsers = [];
  function checked(name, observed) {
    record.checks.push({ name, passed: true, observed });
    console.log(`PASS ${name}`);
  }
  try {
    record.preflight = preflight();
    opened = await openClients({ ttlMs: 90000 });
    const { ga, preview } = opened.clients;
    record.clients = Object.fromEntries(Object.entries(opened.clients).map(([lane, client]) => [lane, {
      actualURL: client.page.url(), serverURL: client.url, listenerPid: process.pid,
      browserVersion: client.browserVersion, address: client.server.address()
    }]));
    console.log(JSON.stringify({ event: 'C045-actual-owned-client-URLs', pid: process.pid, clients: record.clients }));
    assert.equal(ga.page !== preview.page, true);
    assert.equal(ga.page.context() !== preview.page.context(), true);
    assert.equal(ga.page.context().browser() !== preview.page.context().browser(), true);
    assert.notEqual(new URL(ga.page.url()).origin, new URL(preview.page.url()).origin);
    for (const client of [ga, preview]) {
      actualBrowsers.push(client.page.context().browser());
      assert.equal(client.page.context().pages().length, 1);
      assert.equal(client.browserVersion, record.preflight.edge.fileVersion);
      client.page.setDefaultTimeout(10000);
      client.page.on('pageerror', error => record.pageErrors.push({ client: client.client, message: error.message }));
      client.page.on('response', response => {
        responseWork.push((async () => {
          const bytes = await response.body();
          const headers = await response.allHeaders();
          const request = response.request();
          const requestHeaders = await request.allHeaders();
          record.httpResponses.push({
            client: client.client, url: response.url(), method: request.method(), status: response.status(),
            bytes: bytes.length, rawBodySha256: sha256(bytes), csp: headers['content-security-policy'],
            headers: {
              client: headers['x-c045-client'], scope: headers['x-c045-scope'],
              apiContract: headers['x-c020-api-contract'] || null,
              implementationVersion: headers['x-c020-implementation-version'] || null,
              deploymentStamp: headers['x-c020-deployment-stamp'] || null
            },
            cookieSent: requestHeaders.cookie !== undefined, authorizationSent: requestHeaders.authorization !== undefined,
            bodyText: response.url().includes('/fixtures/') || response.url().endsWith('/client.json') ? bytes.toString('utf8') : null
          });
        })());
      });
    }
    checked('actual page, context, browser and owned-origin references are all distinct', {
      independentPages: true, independentContexts: true, independentBrowsers: true,
      actualURLs: [ga.page.url(), preview.page.url()], inventedWindowIds: false
    });
    await Promise.all([ga.page.reload({ waitUntil: 'load', timeout: 15000 }), preview.page.reload({ waitUntil: 'load', timeout: 15000 })]);
    for (const client of [ga, preview]) {
      await client.page.waitForFunction(() => document.documentElement.dataset.scope === 'local-ready');
      assert.equal(await client.page.locator('.banner').textContent(), record.banner);
      const initial = await snapshot(client.page);
      assert.match(initial.status, /^NOT RUN/);
      assert.equal(initial.profile, '');
      assert.equal(initial.draft, '');
      assert.equal(initial.result, 'No HTTP observation.');
      assert.equal(initial.evidence, 'No HTTP observation.');
      assert.equal(initial.errorHidden, true);
      assert.ok(initial.destination.includes(new URL(client.url).origin));
      assert.equal(await client.page.evaluate(() => window.opener === null && window === window.top), true);
      assert.deepEqual(await client.page.context().cookies(), []);
      assert.equal(client.page.context().serviceWorkers().length, 0);
      record.states[`${client.client}-initial`] = initial;
    }
    checked('actual initial DOM has exact banner, unknown/not-run profile results and no opener or cookie session', record.states['ga-initial']);

    const previewInitial = await snapshot(preview.page);
    const previewRequests = preview.audit().requestsUsed;
    await ga.page.keyboard.press('Tab');
    assert.match(await ga.page.evaluate(() => document.activeElement.className), /skip/);
    await ga.page.keyboard.press('Tab');
    assert.equal(await ga.page.evaluate(() => document.activeElement.id), 'profile-id');
    await keyboardSubmit(ga.page, contract.profiles[0].id, 'GA private rehearsal draft');
    const gaFirst = await snapshot(ga.page);
    const gaFirstBody = verifyObservation(gaFirst, ga, contract.profiles[0].id);
    assert.deepEqual(await snapshot(preview.page), previewInitial);
    assert.equal(preview.audit().requestsUsed, previewRequests);
    record.states['ga-first-profile'] = gaFirst;
    checked('real GA Tab/Enter reads v1 at its exact destination without changing preview', JSON.parse(gaFirst.evidence));

    const gaBeforePreview = await snapshot(ga.page);
    const gaRequests = ga.audit().requestsUsed;
    await keyboardSubmit(preview.page, contract.profiles[1].id, 'preview private rehearsal draft');
    const previewFirst = await snapshot(preview.page);
    verifyObservation(previewFirst, preview, contract.profiles[1].id);
    assert.deepEqual(await snapshot(ga.page), gaBeforePreview);
    assert.equal(ga.audit().requestsUsed, gaRequests);
    assert.notEqual(gaFirst.profile, previewFirst.profile);
    assert.notEqual(gaFirst.draft, previewFirst.draft);
    record.states['preview-first-profile'] = previewFirst;
    checked('real preview keyboard reads v2 and retains independent synthetic profile, draft and evidence', JSON.parse(previewFirst.evidence));

    const previewBeforeSameProfile = await snapshot(preview.page);
    await keyboardSubmit(ga.page, contract.profiles[1].id, 'GA second draft');
    const gaSecond = await snapshot(ga.page);
    const gaSecondBody = verifyObservation(gaSecond, ga, contract.profiles[1].id);
    assert.deepEqual(await snapshot(preview.page), previewBeforeSameProfile);
    const previewFirstBody = JSON.parse(previewFirst.result);
    assert.deepEqual(inspector.oldConsumer(gaSecondBody), inspector.oldConsumer(previewFirstBody));
    assert.equal(inspector.compare(gaSecondBody, previewFirstBody, contract.profiles[1].id).compatible, true);
    const gaBeforeOtherPreview = await snapshot(ga.page);
    await keyboardSubmit(preview.page, contract.profiles[0].id, 'preview second draft');
    const previewSecond = await snapshot(preview.page);
    const previewSecondBody = verifyObservation(previewSecond, preview, contract.profiles[0].id);
    assert.deepEqual(await snapshot(ga.page), gaBeforeOtherPreview);
    assert.equal(inspector.compare(gaFirstBody, previewSecondBody, contract.profiles[0].id).compatible, true);
    record.states['ga-second-profile'] = gaSecond;
    record.states['preview-second-profile'] = previewSecond;
    checked('both actual clients read both original C020 profiles through compatible getProfile/1 implementations', {
      oldConsumerSameForBothProfiles: true, implementationVersions: ['1.0.0', '2.0.0'], breakingContractVersions: false
    });

    await ga.page.evaluate(() => { globalThis.__C045MemoryCanary = 'GA local memory only'; });
    assert.equal(await preview.page.evaluate(() => typeof globalThis.__C045MemoryCanary), 'undefined');
    const previewBeforeBlockedFetch = await snapshot(preview.page);
    const previewBeforeBlockedCount = preview.audit().requestsUsed;
    const blocked = await ga.page.evaluate(async url => {
      try { await fetch(url, { method: 'GET', credentials: 'omit' }); return false; } catch { return true; }
    }, `${preview.url}fixtures/v2/getProfile?profileId=${contract.profiles[0].id}`);
    assert.equal(blocked, true);
    assert.equal(preview.audit().requestsUsed, previewBeforeBlockedCount);
    assert.deepEqual(await snapshot(preview.page), previewBeforeBlockedFetch);
    checked('separate context memory plus returned CSP/helper policy deny cross-client requests and interference', {
      previewCanaryAbsent: true, foreignOwnOriginFetchFailed: blocked, actualPreviewRequestCountUnchanged: true,
      limitation: 'CSP and helper guards both apply; this does not independently attribute the denial layer or prove native TCP/cross-tenant isolation'
    });

    const gaCountBeforeWrite = ga.audit().requestsUsed;
    const writeBlocked = await ga.page.evaluate(async () => {
      try { await fetch('/fixtures/v1/getProfile?profileId=synthetic-001', { method: 'POST', credentials: 'omit' }); return false; } catch { return true; }
    });
    assert.equal(writeBlocked, true);
    assert.equal(ga.audit().requestsUsed, gaCountBeforeWrite);
    checked('actual helper blocks a write before it reaches the owned listener', { writeBlocked, actualRequestCountUnchanged: true });

    const previewBeforeGaError = await snapshot(preview.page);
    const previewCountBeforeGaError = preview.audit().requestsUsed;
    await keyboardSubmit(ga.page, 'synthetic-999', 'GA error draft stays private');
    const gaError = await snapshot(ga.page);
    assert.match(gaError.status, /^ERROR - HTTP 404 UNKNOWN_PROFILE/);
    assert.equal(gaError.result, 'No HTTP observation.');
    assert.equal(gaError.errorHidden, false);
    assert.equal(gaError.invalid, 'true');
    const actualError = JSON.parse(gaError.evidence);
    assert.equal(actualError.status, 404);
    assert.equal(actualError.verified, false);
    assert.equal(actualError.requestURL, `${ga.url}fixtures/v1/getProfile?profileId=synthetic-999`);
    assert.equal(actualError.responseURL, actualError.requestURL);
    assert.deepEqual(await snapshot(preview.page), previewBeforeGaError);
    assert.equal(preview.audit().requestsUsed, previewCountBeforeGaError);
    record.states['ga-http-error'] = gaError;
    checked('actual GA 404 clears its stale success, exposes error UX and cannot overwrite preview destination/evidence', actualError);

    const countBeforeEmpty = ga.audit().requestsUsed;
    await keyboardSubmit(ga.page, '', 'GA invalid input draft');
    const invalid = await snapshot(ga.page);
    assert.match(invalid.status, /INVALID_PROFILE_ID/);
    assert.equal(invalid.evidence, 'No HTTP observation.');
    assert.equal(ga.audit().requestsUsed, countBeforeEmpty);
    assert.deepEqual(await snapshot(preview.page), previewBeforeGaError);
    checked('native empty-ID form submission fails explicitly without fake HTTP or other-client changes', { actualRequestsAdded: 0, errorVisible: !invalid.errorHidden });

    const shadowType = await ga.page.evaluate(() => {
      const control = document.createElement('input');
      control.name = 'reset';
      control.id = 'reset-shadow';
      control.hidden = true;
      document.getElementById('client-form').append(control);
      return typeof document.getElementById('client-form').reset;
    });
    assert.equal(shadowType, 'object');
    const gaReset = await nativeReset(ga.page);
    assert.deepEqual(await snapshot(preview.page), previewBeforeGaError);
    record.states['ga-native-reset-shadow'] = gaReset;
    checked('native Enter/reset works with an actual reset-shadowing form control and preserves preview', { shadowType, focusRemainsOnResetButton: true });

    await ga.page.getByLabel('Explicit synthetic profile ID', { exact: true }).fill(contract.profiles[0].id);
    const pendingReset = await ga.page.evaluate(() => {
      const form = document.getElementById('client-form');
      form.requestSubmit();
      const wasPending = document.getElementById('client-status').textContent.startsWith('PENDING')
        && document.getElementById('profile-id').disabled && document.getElementById('observe').disabled;
      document.getElementById('clear').click();
      return { wasPending, resetStatus: document.getElementById('client-status').textContent };
    });
    assert.equal(pendingReset.wasPending, true);
    assert.match(pendingReset.resetStatus, /^NOT RUN/);
    await ga.page.waitForTimeout(500);
    const afterPendingReset = await snapshot(ga.page);
    assert.equal(afterPendingReset.profile, '');
    assert.equal(afterPendingReset.result, 'No HTTP observation.');
    assert.equal(afterPendingReset.evidence, 'No HTTP observation.');
    assert.equal(afterPendingReset.errorHidden, true);
    assert.equal(afterPendingReset.submitDisabled, false);
    assert.deepEqual(await snapshot(preview.page), previewBeforeGaError);
    record.states['ga-reset-during-pending'] = afterPendingReset;
    checked('actual DOM requestSubmit/reset race aborts the own pending read and cannot restore stale results', {
      pendingObserved: pendingReset.wasPending, resetObserved: true,
      interaction: 'one real DOM task starts requestSubmit and native reset; keyboard reset was independently verified',
      previewUnchanged: true
    });

    const gaBeforePreviewError = await snapshot(ga.page);
    const gaCountBeforePreviewError = ga.audit().requestsUsed;
    await keyboardSubmit(preview.page, 'synthetic-999', 'preview error draft');
    const previewError = await snapshot(preview.page);
    assert.match(previewError.status, /^ERROR - HTTP 404 UNKNOWN_PROFILE/);
    assert.equal(JSON.parse(previewError.evidence).status, 404);
    assert.equal(previewError.result, 'No HTTP observation.');
    assert.deepEqual(await snapshot(ga.page), gaBeforePreviewError);
    assert.equal(ga.audit().requestsUsed, gaCountBeforePreviewError);
    await nativeReset(preview.page);
    assert.deepEqual(await snapshot(ga.page), gaBeforePreviewError);
    checked('preview error and native reset likewise cannot change GA state or destination evidence', { bothDirectionsVerified: true });
    await keyboardSubmit(preview.page, contract.profiles[0].id, 'preview final independent draft');
    verifyObservation(await snapshot(preview.page), preview, contract.profiles[0].id);
    await keyboardSubmit(ga.page, contract.profiles[1].id, 'GA final independent draft');
    verifyObservation(await snapshot(ga.page), ga, contract.profiles[1].id);

    const previewBeforeCsp = await snapshot(preview.page);
    await ga.page.evaluate(() => {
      globalThis.__C045Csp = [];
      document.addEventListener('securitypolicyviolation', event => globalThis.__C045Csp.push({
        effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI
      }));
      const script = document.createElement('script');
      script.id = 'c045-denied-inline';
      script.textContent = 'globalThis.__C045InlineExecuted = true;';
      document.body.append(script);
      const frame = document.createElement('iframe');
      frame.id = 'c045-denied-frame';
      frame.src = '/';
      document.body.append(frame);
      const image = document.createElement('img');
      image.id = 'c045-denied-image';
      image.src = '/client.css';
      document.body.append(image);
    });
    await ga.page.waitForFunction(() => ['script-src-elem', 'frame-src', 'img-src'].every(
      directive => globalThis.__C045Csp.some(event => event.effectiveDirective === directive)));
    assert.equal(await ga.page.evaluate(() => globalThis.__C045InlineExecuted), undefined);
    record.cspViolations = await ga.page.evaluate(() => globalThis.__C045Csp);
    assert.deepEqual(await snapshot(preview.page), previewBeforeCsp);
    await ga.page.evaluate(() => ['c045-denied-inline', 'c045-denied-frame', 'c045-denied-image'].forEach(id => document.getElementById(id).remove()));
    checked('actual returned CSP blocks inline execution, framing and images without relaxing C041 or browser security', record.cspViolations);

    if (directory) {
      for (const client of [ga, preview]) {
        const screenshot = await client.page.screenshot({ fullPage: true });
        fs.writeFileSync(path.join(directory, `${client.client}.png`), screenshot, { flag: 'wx' });
        record.states[`${client.client}-captured`] = await snapshot(client.page);
        record.states[`${client.client}-dom`] = await client.page.content();
        record.clients[client.client].screenshot = { path: `${client.client}.png`, bytes: screenshot.length, sha256: sha256(screenshot) };
      }
    }

    const previewBeforeTransportFailure = await snapshot(preview.page);
    const previewBeforeTransportCount = preview.audit().requestsUsed;
    await ga.close();
    assert.equal(ga.server.listening, false);
    await keyboardSubmit(ga.page, contract.profiles[0].id, 'GA closed-listener error draft');
    const transportError = await snapshot(ga.page);
    assert.match(transportError.status, /LOCAL_RESPONSE_UNAVAILABLE|REQUEST_TIMEOUT/);
    assert.equal(transportError.result, 'No HTTP observation.');
    assert.equal(transportError.errorHidden, false);
    assert.equal(JSON.parse(transportError.evidence).status, null);
    assert.equal(JSON.parse(transportError.evidence).responseURL, null);
    assert.deepEqual(await snapshot(preview.page), previewBeforeTransportFailure);
    assert.equal(preview.audit().requestsUsed, previewBeforeTransportCount);
    record.states['ga-real-closed-listener-error'] = transportError;
    await nativeReset(ga.page);
    assert.deepEqual(await snapshot(preview.page), previewBeforeTransportFailure);
    checked('closing only the exact GA listener produces an honest transport error/reset without mutating preview', {
      actualGaListenerClosed: true, HTTPStatus: null, fabricatedSuccess: false, previewStateAndRequestsUnchanged: true
    });

    await Promise.all(responseWork);
    for (const response of record.httpResponses) {
      const client = opened.clients[response.client];
      assert.equal(new URL(response.url).origin, new URL(client.url).origin);
      assert.equal(response.method, 'GET');
      assert.equal(response.csp, csp);
      assert.equal(response.cookieSent, false);
      assert.equal(response.authorizationSent, false);
      const target = new URL(response.url).pathname + new URL(response.url).search;
      assert.equal(client.audit().entries.some(entry => entry.path === target && entry.status === response.status && entry.bodySha256 === response.rawBodySha256), true);
      if (target === '/') assert.equal(response.rawBodySha256, sha256(readRegular('capability\\C045\\index.html')));
      if (target === '/c020-contract.js') assert.equal(response.rawBodySha256, sha256(readDependency('capability\\C020\\contract.js')));
      if (target === '/c020-inspector.js') assert.equal(response.rawBodySha256, sha256(readDependency('capability\\C020\\inspector.js')));
    }
    for (const client of [ga, preview]) {
      assert.ok(record.httpResponses.some(response => response.client === client.client && response.url.includes(`/fixtures/${client.implementation}/getProfile`) && response.status === 200));
      assert.ok(record.httpResponses.some(response => response.client === client.client && response.status === 404));
      assert.deepEqual(await client.page.context().cookies(), []);
    }
    record.serverAudit = Object.fromEntries(Object.entries(opened.clients).map(([lane, client]) => [lane, client.audit()]));
    assert.deepEqual(record.pageErrors, []);
    verifyDependencies();
    checked('buffered browser HTTP bodies, exact headers and asset hashes match actual owned-server audits', { realResponses: record.httpResponses.length, cookiesOrAuthorizationSent: false });
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (opened) {
      try { await opened.close(); record.cleanup.awaitedFinally = true; }
      catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Browser checks and exact cleanup failed.') : error;
        record.cleanup.failure = error.message;
        record.outcome = 'failed';
      }
      record.cleanup.pagesClosed = Object.values(opened.clients).every(client => client.page.isClosed());
      record.cleanup.listenersClosed = Object.values(opened.clients).every(client => !client.server.listening);
      record.cleanup.browsersDisconnected = actualBrowsers.every(browser => !browser.isConnected());
      if (!record.cleanup.pagesClosed || !record.cleanup.listenersClosed || !record.cleanup.browsersDisconnected) {
        failure = failure || new Error('Exact owned browser/listener cleanup was not observed.');
        record.outcome = 'failed';
      }
    }
    record.finishedAtUtc = new Date().toISOString();
    if (directory) fs.writeFileSync(path.join(directory, 'browser.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ event: 'C045-browser-result', outcome: record.outcome, checks: record.checks.length,
      cleanup: record.cleanup, capture: directory ? path.relative(repo, directory) : 'read-only; no evidence rewritten' }));
  }
  if (failure) throw failure;
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
