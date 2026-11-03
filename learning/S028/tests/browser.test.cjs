'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const proof = require('./proof.cjs');

const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const helper = path.join(proof.repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(proof.hashFile(helper), helperHash, 'Only the published 53c0c0d helper is qualified.');
const { openIsolatedLesson } = require(helper);

function tooling() {
  const command = [
    "$ErrorActionPreference='Stop'",
    "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'",
    '$s=Get-AuthenticodeSignature -LiteralPath $p',
    "$v=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion",
    "[ordered]@{path=$p;status=$s.Status.ToString();signer=$s.SignerCertificate.Subject;productVersion=$v;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}|ConvertTo-Json -Compress",
  ].join(';');
  const signatureCommand = ['pwsh.exe', '-NoProfile', '-NonInteractive', '-Command', command];
  const result = spawnSync(signatureCommand[0], signatureCommand.slice(1), {
    encoding: 'utf8', timeout: 15000, windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const edge = JSON.parse(result.stdout.replace(/^\uFEFF/, ''));
  const playwright = JSON.parse(fs.readFileSync(path.join(
    proof.repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json',
  ), 'utf8')).version;
  assert.match(process.version, /^v22\./);
  assert.equal(playwright, '1.56.1');
  assert.equal(edge.status, 'Valid');
  assert.match(edge.signer, /CN=Microsoft Corporation,/);
  assert.match(edge.productVersion, /^156\./);
  return {
    node: process.version, playwright, edge,
    signatureCheck: { command: signatureCommand, actualExit: result.status, stdout: result.stdout, stderr: result.stderr },
    helper: 'testing\\browser\\isolated.cjs',
    helperSha256: helperHash, helperPublishedCommit: '53c0c0d',
    lifecycle: 'Published helper only; known unattended lifecycle limit remains. Abandoned prototype unused and unqualified.',
  };
}

test('S028 actual isolated DOM, keyboard, error, failure, history, reset and CSP checks', { timeout: 90000 }, async (t) => {
  const observation = {
    schemaVersion: 1, cardId: 'A-S028', workerId: 'worker-A-S028', packet: 'SC-S028', kano: 'S',
    mode: 'actual-isolated-browser-of-synthetic-file-lesson', startedAtUtc: new Date().toISOString(),
    tooling: tooling(), checks: [], snapshots: {}, pageErrors: [], consoleErrors: [],
    cleanup: { closeAwaitedInFinally: false, pageClosed: false },
  };
  let session;
  async function check(name, run) {
    await t.test(name, async () => {
      await run();
      observation.checks.push(name);
    });
  }
  try {
    session = await openIsolatedLesson('learning\\S028\\index.html');
    const page = session.page;
    observation.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    page.on('pageerror', (error) => observation.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') observation.consoleErrors.push(message.text());
    });
    const text = (id) => page.locator(`#${id}`).innerText();
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const reset = () => press('archive-run');
    const start = () => press('begin');
    const tick = () => press('advance');
    const snapshot = () => page.evaluate(() => {
      const get = (id) => document.getElementById(id);
      return {
        phase: get('phase').textContent, verdict: get('verdict').textContent,
        userOutcome: get('user-outcome').textContent, routing: get('routing-result').textContent,
        metrics: get('metrics').textContent, migration: get('migration').textContent,
        preparationError: get('preparation-error').textContent,
        validationError: get('validation-error').textContent,
        focus: document.activeElement.id, historySummary: get('history-summary').textContent,
        trace: [...get('trace').rows].map((row) => [...row.cells].map((cell) => cell.textContent)),
        archives: [...get('history').querySelectorAll('pre')].map((pre) => JSON.parse(pre.textContent)),
      };
    });

    await check('standalone banner, honest initial result, labeled controls and native reset', async () => {
      assert.equal(await page.title(), 'S028 — Warm-up timeout');
      assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('label').count(), 4);
      assert.equal(await page.locator('script:not([src])').count(), 0);
      assert.equal(await page.evaluate(() => typeof document.getElementById('preparation-form').reset), 'function');
      assert.match(await text('verdict'), /unknown/);
      assert.match(await text('phase'), /Run 1: idle/);
      assert.match(await text('migration'), /attempted 0; completed 0/);
      assert.equal(await page.locator('#advance').isDisabled(), true);
      assert.equal(await page.locator('#abort').isDisabled(), true);
      observation.snapshots.initial = await snapshot();
    });

    await check('invalid numeric and forged enum inputs focus errors without mutation; empty reset repairs UX', async () => {
      await page.locator('#timeout').fill('1.5');
      await start();
      assert.match(await text('validation-error'), /whole number/);
      assert.equal(await page.locator('#validation-error').isVisible(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'validation-error');
      assert.match(await text('phase'), /Run 1: idle/);
      observation.snapshots.numericError = await snapshot();
      await reset();
      assert.equal(await page.locator('#timeout').inputValue(), '3');
      assert.equal(await page.locator('#validation-error').isHidden(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'timeout');
      await page.evaluate(() => {
        const option = new Option('<script>untrusted text</script>', 'forged');
        document.getElementById('receipt').add(option);
        document.getElementById('receipt').value = 'forged';
      });
      await start();
      assert.match(await text('validation-error'), /Receipt witness/);
      assert.match(await text('phase'), /Run 1: idle/);
      assert.equal(await page.locator('script').count(), 2);
      observation.snapshots.enumError = await snapshot();
      await reset();
      await page.evaluate(() => document.querySelector('#receipt option[value="forged"]').remove());
      assert.match(await text('history-summary'), /Retained 0.*evicted 0/);
    });

    await check('keyboard deadline produces explicit safe abort, measured receipts and zero migrations', async () => {
      await start();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'advance');
      assert.equal(await page.locator('#timeout').isDisabled(), true);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      assert.match(await text('phase'), /aborted; elapsed 3s; WARM_UP_TIMEOUT.*ineligible/);
      assert.match(await text('verdict'), /success/);
      assert.match(await text('user-outcome'), /safe abort before exposure/);
      assert.match(await text('preparation-error'), /WARM_UP_TIMEOUT/);
      assert.equal(await page.locator('#preparation-error').isVisible(), true);
      assert.match(await text('routing-result'), /100% \/ 0%.*100% \/ 0%/);
      assert.match(await text('metrics'), /attempted 4; successful 4; interruptions 0; unknown 0/);
      assert.match(await text('migration'), /attempted 0; completed 0/);
      assert.equal(await page.locator('#trace tr').count(), 4);
      assert.equal(await page.locator('#advance').isDisabled(), true);
      assert.equal(await page.locator('#abort').isDisabled(), true);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'results');
      observation.snapshots.timeout = await snapshot();
      const phase = await text('phase');
      await page.evaluate(() => document.getElementById('preparation-form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      ));
      assert.match(await text('validation-error'), /Archive and reset/);
      assert.equal(await text('phase'), phase);
      assert.equal(await page.locator('#trace tr').count(), 4);
    });

    await check('keyboard operator abort preserves the previous timeout trace on reset', async () => {
      await reset();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'timeout');
      assert.match(await text('history-summary'), /Retained 1.*evicted 0/);
      await start();
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'abort');
      await page.keyboard.press('Space');
      assert.match(await text('phase'), /aborted; elapsed 0s; OPERATOR_ABORT/);
      assert.match(await text('verdict'), /success/);
      assert.match(await text('metrics'), /attempted 2; successful 2/);
      observation.snapshots.operatorAbort = await snapshot();
      assert.equal(observation.snapshots.operatorAbort.archives[0].reason, 'WARM_UP_TIMEOUT');
      assert.equal(observation.snapshots.operatorAbort.archives[0].events.length, 4);
    });

    await check('readiness before deadline remains preparation only, never migration', async () => {
      await reset();
      await page.locator('#timeout').fill('4');
      await page.locator('#ready-after').fill('2');
      await start();
      await tick();
      await tick();
      assert.match(await text('phase'), /ready; elapsed 2s; READY_BEFORE_DEADLINE/);
      assert.match(await text('phase'), /eligible for a separate, unexecuted migration/);
      assert.match(await text('user-outcome'), /unverified - preparation only, no migration/);
      assert.match(await text('migration'), /completed 0/);
      assert.equal(await page.locator('#preparation-error').isHidden(), true);
      observation.snapshots.ready = await snapshot();
    });

    await check('drifted routing fails verification despite successful production receipts', async () => {
      await reset();
      await page.locator('#timeout').fill('1');
      await page.locator('#routing').selectOption('drift');
      await start();
      await tick();
      assert.match(await text('verdict'), /failure/);
      assert.match(await text('user-outcome'), /routing continuity failed/);
      assert.match(await text('routing-result'), /100% \/ 0%.*90% \/ 10%/);
      assert.match(await text('metrics'), /attempted 2; successful 2; interruptions 0; unknown 0/);
      assert.match(await text('migration'), /completed 0/);
      observation.snapshots.routingFailure = await snapshot();
    });

    await check('failed production receipts remain measured interruptions after archival', async () => {
      await reset();
      await page.locator('#timeout').fill('1');
      await page.locator('#receipt').selectOption('failure');
      await start();
      await tick();
      assert.match(await text('verdict'), /failure/);
      assert.match(await text('user-outcome'), /interrupted production journey observed/);
      assert.match(await text('metrics'), /attempted 2; successful 0; interruptions 2; unknown 0/);
      observation.snapshots.receiptFailure = await snapshot();
      assert.equal(observation.snapshots.receiptFailure.archives.at(-1).verdict, 'failure');
      assert.equal(observation.snapshots.receiptFailure.archives.at(-1).config.routing, 'drift');
    });

    await check('missing evidence is unknown and full bounded history counts eviction', async () => {
      await reset();
      await page.locator('#timeout').fill('1');
      await page.locator('#routing').selectOption('missing');
      await page.locator('#receipt').selectOption('unknown');
      await start();
      await tick();
      assert.match(await text('verdict'), /unknown/);
      assert.match(await text('user-outcome'), /continuity evidence missing/);
      assert.match(await text('metrics'), /attempted 2; successful 0; interruptions 0; unknown 2/);
      assert.match(await text('routing-result'), /Last observed: unknown/);
      observation.snapshots.unknown = await snapshot();
      await reset();
      const archived = await snapshot();
      assert.match(archived.historySummary, /Retained 3.*evicted 3/);
      assert.deepEqual(archived.archives.map((run) => run.runId), [4, 5, 6]);
      assert.deepEqual(archived.archives.map((run) => run.verdict), ['failure', 'failure', 'unknown']);
      assert.equal(archived.archives[1].counts.interruptions, 2);
      assert.equal(archived.archives[2].counts.unknown, 2);
      assert.ok(archived.archives.every((run) => run.events.length === 2 && run.config && run.actions.length === 1));
      observation.snapshots.retainedHistory = archived;
    });

    await check('active reset explicitly aborts, restores controls and focus; empty reset is idempotent', async () => {
      await start();
      await reset();
      const archived = await snapshot();
      assert.match(archived.phase, /Run 8: idle/);
      assert.equal(archived.archives.at(-1).reason, 'RESET_ABORT');
      assert.equal(archived.archives.at(-1).events.at(-1).action, 'archive-abort');
      assert.match(archived.historySummary, /Retained 3.*evicted 4/);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'timeout');
      assert.equal(await page.locator('#begin').isDisabled(), false);
      assert.equal(await page.locator('#timeout').isDisabled(), false);
      assert.equal(await page.locator('#routing').inputValue(), 'intact');
      assert.equal(await page.locator('#receipt').inputValue(), 'success');
      assert.equal(await page.locator('#timeout').inputValue(), '3');
      assert.equal(await page.locator('#trace tr').count(), 0);
      await reset();
      assert.deepEqual(await snapshot(), archived);
      observation.snapshots.activeReset = archived;
    });

    await check('CSP blocks real inline code, inline handlers and connections without an outgoing request', async () => {
      let networkAttempted = false;
      await page.route('http://127.0.0.1:9/**', async (route) => {
        networkAttempted = true;
        await route.abort();
      });
      await page.evaluate(async () => {
        globalThis.__s028Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s028Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s028InlineRan = true';
        document.body.append(script);
        const button = document.createElement('button');
        button.setAttribute('onclick', 'globalThis.__s028HandlerRan = true');
        document.body.append(button);
        button.click();
        try {
          await fetch('http://127.0.0.1:9/s028-csp-probe');
          globalThis.__s028Fetch = 'unexpected success';
        } catch (error) {
          globalThis.__s028Fetch = error.name;
        }
        script.remove();
        button.remove();
      });
      await page.waitForFunction(() => globalThis.__s028Csp.length >= 3);
      const csp = await page.evaluate(() => ({
        violations: globalThis.__s028Csp, inlineRan: globalThis.__s028InlineRan === true,
        handlerRan: globalThis.__s028HandlerRan === true, fetchResult: globalThis.__s028Fetch,
      }));
      assert.equal(csp.inlineRan, false);
      assert.equal(csp.handlerRan, false);
      assert.equal(csp.fetchResult, 'TypeError');
      assert.equal(networkAttempted, false);
      assert.ok(csp.violations.some((event) => event.directive === 'script-src-elem'));
      assert.ok(csp.violations.some((event) => event.directive === 'script-src-attr'));
      assert.ok(csp.violations.some((event) => event.directive === 'connect-src'));
      assert.deepEqual(observation.pageErrors, []);
      observation.csp = { ...csp, networkAttempted };
    });
    assert.equal(observation.checks.length, 10);
  } finally {
    try {
      if (session) {
        await session.close();
        observation.cleanup.closeAwaitedInFinally = true;
        observation.cleanup.pageClosed = session.page.isClosed();
      }
    } finally {
      observation.completedAtUtc = new Date().toISOString();
      observation.passedLeafChecks = observation.checks.length;
      const file = proof.writeRecord('browser-observation', observation);
      console.log(`S028_BROWSER_OBSERVATIONS ${JSON.stringify(observation)}`);
      if (file) console.log(`Captured ${file}`);
    }
  }
  assert.equal(observation.cleanup.closeAwaitedInFinally, true);
  assert.equal(observation.cleanup.pageClosed, true);
});
