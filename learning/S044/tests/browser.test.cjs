'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const expectedHelperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(fs.readFileSync(helperPath)), expectedHelperHash, 'Only the published browser helper is qualified.');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function proofHashes() {
  const directory = path.join(root, 'evidence');
  return Object.fromEntries(fs.readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = path.join(entry.parentPath, entry.name);
      return [path.relative(directory, file), hash(fs.readFileSync(file))];
    }).sort(([a], [b]) => a.localeCompare(b)));
}

test('actual isolated Edge DOM, keyboard, error, failure, history, reset and CSP', { timeout: 180000 }, async () => {
  const proofBefore = proofHashes();
  const browserExecutable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const signatureCommand = `$ErrorActionPreference='Stop';$s=Get-AuthenticodeSignature '${browserExecutable}';[pscustomobject]@{status=[string]$s.Status;subject=$s.SignerCertificate.Subject}|ConvertTo-Json -Compress`;
  const signature = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command', signatureCommand], { encoding: 'utf8', timeout: 20000 });
  assert.equal(signature.status, 0, signature.stderr);
  const signer = JSON.parse(signature.stdout);
  assert.equal(signer.status, 'Valid');
  assert.match(signer.subject, /Microsoft Corporation/);
  const packageVersion = JSON.parse(fs.readFileSync(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'), 'utf8')).version;
  assert.equal(packageVersion, '1.56.1');
  console.log('S044 explicit offline Playwright and signed installed Edge preflight passed.');
  const observations = [];
  const pageErrors = [];
  const consoleErrors = [];
  const externalRequests = [];
  let blockedRouteAttempts = 0;
  let browserVersion;
  let finalDom;
  let csp;
  let closed = false;
  const startedAtUtc = new Date().toISOString();
  const session = await openIsolatedLesson('learning\\S044\\index.html');
  try {
    const page = session.page;
    browserVersion = session.browserVersion;
    assert.match(browserVersion, /^156\./);
    console.log(`S044 isolated lesson loaded in Edge ${browserVersion}.`);
    page.on('pageerror', (error) => pageErrors.push(String(error)));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('request', (request) => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
    await page.context().route('https://s044-proof.invalid/**', (route) => {
      blockedRouteAttempts += 1;
      return route.abort('blockedbyclient');
    });
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('.banner').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(await page.locator('#resume-download').isDisabled(), true);
    assert.equal(await page.locator('#current-result').isHidden(), true);
    const activeId = () => page.evaluate(() => document.activeElement.id);
    const waitResult = async (verdict) => {
      await page.locator('#current-result').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#verdict').innerText(), verdict);
      return page.locator('#current-result').innerText();
    };
    const reset = async () => {
      await page.locator('#rehearsal-reset').click();
      assert.equal(await activeId(), 'prefix');
      assert.equal(await page.locator('#current-result').isHidden(), true);
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#resume-download').isDisabled(), true);
      for (const [id, value] of [['prefix', '12'], ['response', 'correct'], ['delay', '10'], ['budget', '100'], ['hash-evidence', 'present']]) {
        assert.equal(await page.locator(`#${id}`).inputValue(), value);
      }
    };
    const conduct = async ({ response = 'correct', hashEvidence = 'present', delay = '10', verdict = 'PASS' } = {}) => {
      await reset();
      await page.locator('#response').selectOption(response);
      await page.locator('#hash-evidence').selectOption(hashEvidence);
      await page.locator('#delay').fill(delay);
      await page.locator('#admit-prefix').click();
      assert.equal(await page.locator('#configuration-fields').evaluate((fieldset) => fieldset.disabled), true);
      assert.equal(await page.locator('#prefix').isDisabled(), true);
      assert.equal(await activeId(), 'resume-download');
      await page.keyboard.press('Enter');
      const dom = await waitResult(verdict);
      observations.push({ response, hashEvidence, delayMs: Number(delay), expectedVerdict: verdict, actualVerdict: await page.locator('#verdict').innerText(), dom });
      console.log(`S044 DOM ${response}/${hashEvidence}/${delay} ms => ${verdict}.`);
      return dom;
    };

    await page.keyboard.press('Tab');
    assert.equal(await activeId(), 'prefix');
    for (const expected of ['response', 'delay', 'budget', 'hash-evidence', 'admit-prefix']) {
      await page.keyboard.press('Tab');
      assert.equal(await activeId(), expected);
    }
    await page.keyboard.press('Enter');
    assert.equal(await activeId(), 'resume-download');
    assert.match(await page.locator('#paused-receipt').innerText(), /12 retained bytes.*offset 12.*100 ms/);
    await page.keyboard.press('Enter');
    const safeDom = await waitResult('PASS');
    assert.match(safeDom, /32 \/ 12 \/ 20 \/ 32/);
    assert.match(safeDom, /70 ms \/ 100 ms/);
    assert.match(safeDom, /630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd/);
    observations.push({ check: 'keyboard-only default admission and resume', actualVerdict: 'PASS', dom: safeDom });
    await page.keyboard.press('Shift+Tab');
    assert.equal(await activeId(), 'rehearsal-reset');
    await page.keyboard.press('Enter');
    assert.equal(await activeId(), 'prefix');
    assert.equal(await page.locator('#history > li').count(), 1);
    assert.match(await page.locator('#history').innerText(), /Run 1: PASS/);
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#response').inputValue(), 'gap');
    for (let i = 0; i < 4; i += 1) await page.keyboard.press('Tab');
    assert.equal(await activeId(), 'admit-prefix');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    const gapDom = await waitResult('FAIL');
    assert.match(gapDom, /206; Content-Range: bytes 13-31\/32/);
    assert.match(gapDom, /32 \/ 12 \/ 19 \/ 31/);
    assert.match(gapDom, /missing offsets \[12\]/);
    assert.match(await page.locator('#history').innerText(), /Run 1: PASS[\s\S]*Run 2: FAIL/);
    observations.push({ check: 'keyboard gap, real failing 206 receipt, failure retained', actualVerdict: 'FAIL', dom: gapDom });

    const duplicate = await conduct({ response: 'duplicate', verdict: 'FAIL' });
    assert.match(duplicate, /duplicate offsets \[11\]/);
    assert.match(duplicate, /32 \/ 12 \/ 21 \/ 33/);
    const corrupt = await conduct({ response: 'corrupt', verdict: 'FAIL' });
    assert.match(corrupt, /32 \/ 12 \/ 20 \/ 32/);
    assert.match(corrupt, /byteCount: PASS/);
    assert.match(corrupt, /contentHash: FAIL/);
    const ignored = await conduct({ response: 'ignored', verdict: 'FAIL' });
    assert.match(ignored, /200; Content-Range: absent/);
    assert.match(ignored, /unsupported resume/i);
    assert.match(ignored, /unsafe append refused/i);
    const unknown = await conduct({ hashEvidence: 'missing', verdict: 'UNKNOWN' });
    assert.match(unknown, /contentHash: UNKNOWN/);
    const partial = await conduct({ response: 'gap', hashEvidence: 'missing', verdict: 'FAIL' });
    assert.match(partial, /contentHash: UNKNOWN/);
    const late = await conduct({ delay: '41', verdict: 'FAIL' });
    assert.match(late, /101 ms \/ 100 ms/);
    assert.match(late, /originalBudget: FAIL/);
    const boundary = await conduct({ delay: '40', verdict: 'PASS' });
    assert.match(boundary, /100 ms \/ 100 ms/);
    assert.equal(await page.locator('#history > li').count(), 8);

    await reset();
    const historyBeforeInvalid = await page.locator('#history').innerText();
    await page.locator('#prefix').fill('');
    await page.locator('#admit-prefix').click();
    assert.equal(await page.locator('#input-error').isVisible(), true);
    assert.match(await page.locator('#input-error').innerText(), /empty and coerced values are invalid/);
    assert.equal(await page.locator('#current-result').isHidden(), true);
    assert.equal(await activeId(), 'input-error');
    assert.equal(await page.locator('#history').innerText(), historyBeforeInvalid);
    observations.push({ check: 'empty numeric rejection', error: await page.locator('#input-error').innerText(), priorOutcomesRetained: true });

    await reset();
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.id = 'forged-option';
      option.value = '<script>globalThis.__s044Injected=true</script>';
      option.textContent = 'Forged test response';
      document.getElementById('response').append(option);
      document.getElementById('response').value = option.value;
    });
    await page.locator('#admit-prefix').click();
    assert.match(await page.locator('#input-error').innerText(), /not a supported synthetic condition/);
    assert.equal(await page.evaluate(() => globalThis.__s044Injected), undefined);
    assert.equal(await page.locator('#resume-download').isDisabled(), true);
    assert.equal(await page.locator('#history').innerText(), historyBeforeInvalid);
    await page.evaluate(() => document.getElementById('forged-option').remove());
    observations.push({ check: 'forged response rejected without script execution or state advance', passed: true });

    await reset();
    await page.locator('#resume-download').dispatchEvent('click');
    await page.locator('#input-error').waitFor({ state: 'visible' });
    assert.match(await page.locator('#input-error').innerText(), /State guard/);
    assert.equal(await page.locator('#history').innerText(), historyBeforeInvalid);
    observations.push({ check: 'premature resume handler state guard', passed: true });

    await reset();
    await page.locator('#admit-prefix').click();
    await page.locator('#rehearsal-reset').click();
    assert.match(await page.locator('#history > li').last().innerText(), /UNKNOWN/);
    await page.locator('#history > li').last().locator('summary').click();
    assert.match(await page.locator('#history > li').last().innerText(), /Reset before resume/);
    observations.push({ check: 'unfinished reset retains UNKNOWN full receipt', passed: true });

    await page.evaluate(() => {
      globalThis.__s044Digest = crypto.subtle.digest;
      crypto.subtle.digest = async () => { throw new Error('Synthetic browser checksum error'); };
    });
    try {
      const unavailable = await conduct({ verdict: 'UNKNOWN' });
      assert.match(unavailable, /Checksum calculation unavailable/);
      observations.push({ check: 'actual browser checksum error is UNKNOWN', passed: true });
    } finally {
      await page.evaluate(() => {
        crypto.subtle.digest = globalThis.__s044Digest;
        delete globalThis.__s044Digest;
      });
    }

    await page.evaluate(async () => {
      globalThis.__s044Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__s044Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
      });
      const script = document.createElement('script');
      script.textContent = 'globalThis.__s044UnsafeInline = true';
      document.head.append(script);
      try {
        await fetch('https://s044-proof.invalid/should-not-connect');
        globalThis.__s044Connection = 'unexpected success';
      } catch {
        globalThis.__s044Connection = 'blocked';
      } finally {
        script.remove();
      }
    });
    await page.waitForFunction(() => globalThis.__s044Csp.some((event) => event.directive === 'connect-src')
      && globalThis.__s044Csp.some((event) => event.directive.startsWith('script-src')));
    csp = await page.evaluate(() => ({ violations: globalThis.__s044Csp, inlineExecuted: globalThis.__s044UnsafeInline === true, connection: globalThis.__s044Connection }));
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.connection, 'blocked');
    assert.equal(blockedRouteAttempts, 0, 'CSP must block before the defensive route is needed.');
    assert.deepEqual(externalRequests, []);
    assert.deepEqual(pageErrors, []);
    assert.ok(consoleErrors.every((message) => /Content Security Policy|connect to|Refused to|Connecting to|Executing inline/i.test(message)), consoleErrors.join('\n'));

    await reset();
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('#history > li').count(), 8);
    assert.equal(await activeId(), 'prefix');
    finalDom = await page.locator('main').innerText();
    observations.push({ check: 'final exact defaults, idle, focus, bounded history, mobile overflow', passed: true });
  } finally {
    console.log('S044 closing its owned isolated session in awaited finally.');
    await session.close();
    closed = true;
    console.log('S044 owned isolated session closed.');
  }
  assert.equal(closed, true);
  const record = {
    schemaVersion: 1, cardId: 'A-S044', workerId: 'worker-A-S044', mode: 'actual isolated browser observing a synthetic lesson',
    startedAtUtc, finishedAtUtc: new Date().toISOString(), passed: true,
    provenance: {
      runtime: process.version, playwright: packageVersion, browserVersion, browserExecutable,
      browserExecutableSha256: hash(fs.readFileSync(browserExecutable)),
      signatureShell: 'pwsh.exe (installed PowerShell 7)', signatureCommand,
      signatureStdout: signature.stdout, signatureStderr: signature.stderr, signer,
      helperSha256: expectedHelperHash, helperPublication: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
      browserSecurityBypassed: false, ownHeadlessSession: true, finallyAwaitedClose: closed,
    },
    observations, csp, externalRequests, defensiveRouteAttempts: blockedRouteAttempts,
    pageErrors, consoleErrors, finalDom, cleanup: 'Owned isolated session closed; no listener or foreground lease.',
    limits: 'Not native HTTP/Azure evidence, production Node.js 24 certification, or parent completion.',
  };
  if (capture) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), `${JSON.stringify(record, null, 2)}\n`);
  else assert.deepEqual(proofHashes(), proofBefore, 'Normal verification must not rewrite proof.');
  console.log(JSON.stringify({ browserVersion, playwright: packageVersion, observations: observations.length, csp: csp.violations, externalRequests: externalRequests.length, pageErrors: pageErrors.length, closed, captured: capture }));
});
