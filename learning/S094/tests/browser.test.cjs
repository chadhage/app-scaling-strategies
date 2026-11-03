'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const owned = path.resolve(__dirname, '..');
const helper = path.resolve(owned, '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helper)), helperSha256, 'Only the published qualified helper is permitted');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(path.dirname(helper), 'node_modules', 'playwright', 'package.json')).version;

test('actual isolated DOM, keyboard, failure, error, history, reset and CSP checks', { timeout: 120000 }, async t => {
  assert.match(process.version, /^v22\./, 'Node 22 is test tooling only');
  assert.equal(playwrightVersion, '1.56.1');
  const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
  assert.ok(process.env.CAPTURE_BROWSER_EVIDENCE === undefined || capture,
    'Unset CAPTURE_BROWSER_EVIDENCE for read-only verification; 1 is deliberate capture only');
  const output = path.join(owned, 'evidence', 'raw', 'browser');
  if (capture) assert.equal(fs.existsSync(output), false, 'Never overwrite retained browser evidence');
  const checks = [];
  const journeys = [];
  const artifacts = [];
  const pageErrors = [];
  const consoleErrors = [];
  const blockedRequests = [];
  let session;
  let closed = false;
  let browserVersion;
  let csp;

  try {
    session = await openIsolatedLesson('learning\\S094\\index.html');
    const { page } = session;
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./, 'Only installed Edge 156 is qualified here');
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    await page.route(/^https?:\/\//, route => {
      blockedRequests.push(route.request().url());
      return route.abort('blockedbyclient');
    });
    const text = id => page.locator(`#${id}`).textContent();
    const active = () => page.evaluate(() => document.activeElement.id);
    const reset = async () => {
      await page.locator('#reset-all').click();
      assert.equal(await page.locator('#history tbody tr').count(), 0);
      assert.match(await text('phase'), /DRAFT/);
      assert.equal(await page.locator('#fixture').inputValue(), 'compatible-settings');
      assert.equal(await page.locator('#pilot').inputValue(), '2');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await text('attempted'), '—');
      assert.match(await text('outcome'), /^UNKNOWN — not observed$/);
      assert.equal(await active(), 'fixture');
      assert.equal(await page.locator('#guard-error').isHidden(), true);
    };
    const newAttempt = async () => {
      await page.locator('#new-attempt').click();
      assert.match(await text('phase'), /DRAFT/);
    };
    const run = async (fixture, pilot, prediction) => {
      await page.locator('#fixture').selectOption(fixture);
      await page.locator('#pilot').selectOption(String(pilot));
      await page.locator('#start').click();
      await page.locator('#observe').click();
      await page.locator('#expand').click();
      await page.locator('#prediction').selectOption(prediction);
      await page.locator('#check').click();
    };
    const retainDOM = async name => {
      const snapshot = await page.evaluate(() => ({
        phase: document.getElementById('phase').textContent,
        outcome: document.getElementById('outcome').textContent,
        admission: document.getElementById('admission').textContent,
        gate: document.getElementById('gate').textContent,
        denominator: document.getElementById('denominator').textContent,
        verification: document.getElementById('verification').textContent,
        history: document.getElementById('history').innerText,
        trace: document.getElementById('trace').innerText,
        error: document.getElementById('guard-error').textContent,
        counts: Object.fromEntries(['attempted', 'successes', 'interruptions', 'unknown',
          'reauthentication', 'rejected-sessions', 'rejected-sign-ins', 'old-only']
          .map(id => [id, document.getElementById(id).textContent])),
      }));
      journeys.push({ name, ...snapshot });
      if (capture) artifacts.push({
        name: `${name}.dom.snapshot`, bytes: Buffer.from(JSON.stringify(snapshot, null, 2) + '\n'),
      });
    };
    const screenshot = async name => {
      if (capture) artifacts.push({ name: `${name}.png`, bytes: await page.screenshot({ fullPage: true }) });
    };

    assert.equal(await text('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(await text('status'), /^Ready\./);
    assert.equal(await page.locator('#fixture option').count(), 6);
    assert.equal(await page.locator('#pilot option').count(), 2);
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#expand').isDisabled(), true);
    assert.equal(await page.evaluate(() => typeof document.getElementById('controls').reset), 'function');
    assert.deepEqual(await page.evaluate(() => performance.getEntriesByType('resource').map(entry =>
      new URL(entry.name).protocol).filter(protocol => protocol !== 'file:')), []);
    checks.push('exact banner, loadable local resources, bounded controls, no form.reset shadowing');

    await page.keyboard.press('Tab');
    assert.equal(await page.locator('.skip').evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'exercise');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'fixture');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#fixture').inputValue(), 'forced-reauthentication');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'pilot');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#pilot').inputValue(), '4');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'start');
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'observe');
    assert.equal(await page.locator('#fixture').isDisabled(), true);
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'expand');
    assert.match(await text('admission'), /STOPPED/);
    assert.equal(await text('attempted'), '4');
    assert.equal(await text('successes'), '3');
    assert.equal(await text('interruptions'), '1');
    assert.equal(await text('reauthentication'), '1');
    assert.equal(await text('old-only'), '4');
    assert.equal(await page.locator('#trace tbody tr').count(), 4);
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'prediction');
    assert.match(await text('gate'), /BLOCKED.*Current cohort 4.*proposed cohort 8 NOT EXECUTED/);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#prediction').inputValue(), 'FAILURE');
    await page.keyboard.press('Tab');
    assert.equal(await active(), 'check');
    await page.keyboard.press('Enter');
    assert.equal(await active(), 'new-attempt');
    assert.match(await text('verification'), /Learner check PASS.*remains FAILURE/);
    assert.equal(await page.locator('#history tbody tr').count(), 1);
    await retainDOM('keyboard-forced-reauthentication');
    await screenshot('keyboard-forced-reauthentication');
    checks.push('full keyboard negative journey, immediate stopped admission, affected rows and separate denominator');

    await page.keyboard.press('Enter');
    assert.equal(await active(), 'fixture');
    assert.match(await text('history-count'), /^1 of 6/);
    assert.match(await page.locator('#history tbody').textContent(), /FAILURE/);
    await run('compatible-settings', 2, 'SUCCESS');
    assert.match(await text('outcome'), /^SUCCESS/);
    assert.match(await text('gate'), /ELIGIBLE.*proposed cohort 4 NOT EXECUTED/);
    assert.equal(await text('attempted'), '2');
    assert.equal(await text('successes'), '2');
    assert.equal(await text('interruptions'), '0');
    assert.equal(await text('old-only'), '6');
    await retainDOM('compatible');
    await screenshot('compatible');
    checks.push('compatible fixture is synthetic SUCCESS only; next cohort unexecuted; history preserves prior failure');

    await newAttempt();
    await run('rejected-valid-session', 2, 'SUCCESS');
    assert.equal(await text('rejected-sessions'), '1');
    assert.match(await text('admission'), /STOPPED/);
    assert.match(await text('verification'), /Learner check FAIL.*remains FAILURE/);
    await retainDOM('rejected-valid-session-wrong-prediction');
    checks.push('rejected valid-session fixture counts interruption; incorrect prediction retained');

    await newAttempt();
    await run('rejected-sign-in', 4, 'FAILURE');
    assert.equal(await text('rejected-sign-ins'), '1');
    assert.match(await text('outcome'), /^FAILURE/);
    await retainDOM('rejected-sign-in');
    checks.push('fixed sign-in rejection fixture is detected without an identity operation');

    await newAttempt();
    await run('missing-observation', 2, 'UNKNOWN');
    assert.match(await text('outcome'), /^UNKNOWN/);
    assert.match(await text('admission'), /HELD/);
    assert.match(await text('gate'), /BLOCKED/);
    assert.equal(await text('successes'), '1');
    assert.equal(await text('unknown'), '1');
    assert.match(await text('verification'), /Learner check PASS.*remains UNKNOWN/);
    await retainDOM('unknown');
    await screenshot('unknown');
    checks.push('missing observation blocks expansion and stays UNKNOWN even after learner PASS');

    await newAttempt();
    await run('failure-and-unknown', 2, 'FAILURE');
    assert.match(await text('outcome'), /^FAILURE/);
    assert.equal(await text('successes'), '0');
    assert.equal(await text('interruptions'), '1');
    assert.equal(await text('unknown'), '1');
    assert.equal(await page.locator('#history tbody tr').count(), 6);
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.match(await text('history-count'), /Limit reached/);
    await retainDOM('failure-and-unknown');
    await page.locator('#new-attempt').evaluate(node => { node.disabled = false; });
    await page.locator('#new-attempt').click();
    assert.match(await text('guard-error'), /Six checked attempts/);
    assert.equal(await page.locator('#history tbody tr').count(), 6);
    assert.equal(await text('interruptions'), '1');
    await retainDOM('history-limit-guard');
    checks.push('mixed failure and unknown preserved; actual DOM history bound rejects tampered seventh-attempt control');

    await reset();
    checks.push('explicit keyboard-reachable reset clears six attempts, measurements and errors; default focus restored');
    await page.locator('#fixture').evaluate(node => {
      const option = document.createElement('option');
      option.value = 'unlisted-fixed-fixture';
      option.textContent = 'Synthetic invalid fixture probe';
      option.dataset.s094Probe = 'true';
      node.append(option);
    });
    await page.locator('#fixture').selectOption('unlisted-fixed-fixture');
    await page.locator('#start').click();
    assert.match(await text('guard-error'), /Choose a fixed synthetic fixture/);
    assert.match(await text('phase'), /DRAFT/);
    assert.equal(await active(), 'guard-error');
    assert.equal(await page.locator('#history tbody tr').count(), 0);
    await retainDOM('invalid-fixture-guard');
    await reset();
    await page.locator('#fixture option[data-s094-probe]').evaluate(node => node.remove());

    await page.locator('#pilot').evaluate(node => {
      const option = document.createElement('option');
      option.value = '2junk';
      option.textContent = 'Synthetic invalid pilot probe';
      option.dataset.s094Probe = 'true';
      node.append(option);
    });
    await page.locator('#pilot').selectOption('2junk');
    await page.locator('#start').click();
    assert.match(await text('guard-error'), /Pilot must be exactly 2 or 4/);
    assert.match(await text('phase'), /DRAFT/);
    await retainDOM('invalid-pilot-guard');
    await screenshot('invalid-pilot-guard');
    await reset();
    await page.locator('#pilot option[data-s094-probe]').evaluate(node => node.remove());

    await page.locator('#expand').evaluate(node => { node.disabled = false; });
    await page.locator('#expand').click();
    assert.match(await text('guard-error'), /requires OBSERVED; current phase is DRAFT/);
    assert.equal(await page.locator('#history tbody tr').count(), 0);
    await retainDOM('out-of-order-guard');
    await reset();
    checks.push('unsupported fixture, malformed numeric pilot and out-of-order DOM actions visibly fail closed');

    await page.locator('#start').click();
    await page.locator('#observe').click();
    await page.locator('#expand').click();
    await page.locator('#check').click();
    assert.match(await text('guard-error'), /Choose SUCCESS, FAILURE, or UNKNOWN/);
    assert.match(await text('phase'), /GATED/);
    assert.equal(await page.locator('#history tbody tr').count(), 0);
    await retainDOM('missing-prediction-guard');
    await page.locator('#prediction').selectOption('SUCCESS');
    await page.locator('#check').click();
    assert.equal(await page.locator('#guard-error').isHidden(), true);
    assert.equal(await page.locator('#history tbody tr').count(), 1);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#history tbody tr').count(), 0);
    assert.match(await text('status'), /^Ready\./);
    await page.locator('#fixture').selectOption('forced-reauthentication');
    await page.locator('#start').click();
    await reset();
    checks.push('missing-prediction guard is recoverable; reload and mid-exposure reset clear memory without storage');

    await page.evaluate(async () => {
      window.s094CspProbe = { inlineExecuted: false, fetchRejected: false, violations: [] };
      document.addEventListener('securitypolicyviolation', event => {
        window.s094CspProbe.violations.push({
          directive: event.effectiveDirective,
          blockedURI: event.blockedURI,
          disposition: event.disposition,
        });
      });
      const script = document.createElement('script');
      script.textContent = 'window.s094CspProbe.inlineExecuted = true;';
      document.body.append(script);
      script.remove();
      try {
        await fetch('https://s094.invalid/synthetic-csp-probe');
      } catch {
        window.s094CspProbe.fetchRejected = true;
      }
      const probeForm = document.createElement('form');
      probeForm.action = 'https://s094.invalid/synthetic-csp-probe';
      probeForm.method = 'post';
      document.body.append(probeForm);
      HTMLFormElement.prototype.submit.call(probeForm);
      probeForm.remove();
    });
    await page.waitForFunction(() => window.s094CspProbe.violations.length >= 3);
    csp = await page.evaluate(() => window.s094CspProbe);
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.fetchRejected, true);
    for (const directive of ['script-src-elem', 'connect-src', 'form-action']) {
      assert.ok(csp.violations.some(item => item.directive === directive && item.disposition === 'enforce'),
        `Actual enforced ${directive} violation required`);
    }
    assert.deepEqual(blockedRequests, [], 'CSP stopped every HTTP probe before any request reached the safety route');
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(consoleErrors.filter(message => !/content security policy/i.test(message)), []);
    assert.equal(new URL(page.url()).protocol, 'file:');
    await retainDOM('final-reset-and-csp');
    checks.push('actual enforced inline-script, connect and form-action CSP; zero HTTP requests and zero application errors');
  } finally {
    if (session) {
      await session.close();
      closed = true;
    }
  }

  assert.equal(closed, true, 'Qualified session close was awaited in finally');
  const report = {
    schemaVersion: 1,
    cardId: 'A-S094',
    workerId: 'worker-A-S094',
    parentId: 'D-S094',
    packet: 'SC-S094',
    kanoUnit: 'A-S094',
    kano: 'S',
    unitCount: 1,
    mode: 'synthetic',
    captureBrowserEvidence: capture,
    command: 'CAPTURE_BROWSER_EVIDENCE=1 node --test learning\\S094\\tests\\browser.test.cjs',
    capturedAtUtc: new Date().toISOString(),
    runtime: process.version,
    playwrightVersion,
    browserVersion,
    helperSha256,
    helperPublishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    verifierResult: 'passed',
    userImpactResults: ['SUCCESS', 'FAILURE', 'UNKNOWN'],
    actualAuthenticationCertified: false,
    nativeAzureCertified: false,
    productionNode24Certified: false,
    checks,
    journeys,
    csp,
    pageErrors,
    consoleErrors,
    httpRequests: blockedRequests,
    cleanup: { awaitedFinallyClose: true, closed, localHistoryCleared: true },
    artifacts: artifacts.map(item => ({ file: item.name, sha256: hash(item.bytes) })),
  };
  if (capture) {
    fs.mkdirSync(output, { recursive: true });
    for (const item of artifacts) fs.writeFileSync(path.join(output, item.name), item.bytes, { flag: 'wx' });
    fs.writeFileSync(path.join(output, 'run.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  t.diagnostic(`${checks.length} actual browser groups passed; Edge ${browserVersion}; awaited cleanup; ${capture ? 'deliberate capture' : 'read-only verification'}.`);
});
