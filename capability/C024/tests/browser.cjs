'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256(fs.readFileSync(helper)), helperSha256, 'Only the exact published helper is qualified.');
assert.equal(process.versions.node.split('.')[0], '22', 'Only existing Node 22 tooling is qualified.');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(require.resolve('playwright/package.json', { paths: [path.dirname(helper)] })).version;
assert.equal(playwrightVersion, '1.56.1');
const signature = spawnSync('pwsh.exe', ['-NoProfile', '-NonInteractive', '-Command',
  "$p='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'; " +
  "[ordered]@{status=(Get-AuthenticodeSignature -LiteralPath $p).Status.ToString();" +
  "version=(Get-Item -LiteralPath $p).VersionInfo.ProductVersion}|ConvertTo-Json -Compress"],
{ encoding: 'utf8', timeout: 20000 });
assert.equal(signature.status, 0, signature.stderr);
const signedEdge = JSON.parse(signature.stdout);
assert.equal(signedEdge.status, 'Valid');
assert.match(signedEdge.version, /^156\./);

const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const label = process.env.C024_BROWSER_EVIDENCE_LABEL || '';
assert.match(label, /^(?:[a-z0-9][a-z0-9-]{0,40})?$/);
const suffix = label ? `-${label}` : '';
const evidence = path.join(root, 'evidence');
const recordPath = path.join(evidence, `browser-acceptance${suffix}.json`);
const imagePath = path.join(evidence, `browser-complete${suffix}.png`);
if (capture && (fs.existsSync(recordPath) || fs.existsSync(imagePath))) {
  throw new Error('Do not overwrite published proof; set a distinct C024_BROWSER_EVIDENCE_LABEL for an explicit refresh.');
}
function proofHashes() {
  const files = [];
  function walk(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push(file);
    }
  }
  walk(evidence);
  if (fs.existsSync(path.join(root, 'evidence.json'))) files.push(path.join(root, 'evidence.json'));
  return files.sort().map((file) => ({ path: path.relative(root, file), sha256: sha256(fs.readFileSync(file)) }));
}
const originalProof = proofHashes();
const expectedBytes = Uint8Array.from({ length: 256 }, (_, index) => (index * 37 + 11) % 256);
const expectedHash = sha256(expectedBytes);
const ids = ['part-001', 'part-002', 'part-003', 'part-004'];
const record = {
  cardId: 'C024', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  mode: 'isolated-headless-file', testRuntime: process.version, productionRuntimeValidated: false,
  nativeQualified: false, durableStorageImplemented: false, arbitraryUserUpload: false,
  integratedForegroundLeaseUsed: false, helperSha256, helperPublishedCommit: '53c0c0d',
  playwrightVersion, signedEdge, explicitCapture: capture, checks: [],
  cleanup: { browserClosed: false, serverCreated: false }
};
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
const parse = (page, id) => page.locator(`#${id}`).textContent().then((text) => JSON.parse(text));
async function accepted(page, expected) {
  assert.deepEqual(await page.locator('#accepted-ids li').allTextContents(),
    expected.length ? expected.map((id) => `${id} · 64 actual synthetic bytes`) : ['None']);
  assert.equal(await page.locator('#accepted-bytes').textContent(), `${expected.length * 64} / 256`);
}
async function rejected(page, code) {
  await page.waitForFunction((wanted) => document.getElementById('status').textContent.startsWith(`REJECTED — ${wanted};`), code);
  assert.match(await page.getByRole('alert').textContent(), new RegExp(`^${code} —`));
  assert.equal(await page.locator('#final-hash').textContent(), 'Not computed');
  assert.equal(await page.locator('#receipt').textContent(), 'No completed receipt.');
  assert.equal(await page.locator('#completed-bytes').textContent(), '0');
}
async function accept(page, id) {
  await page.getByLabel('Explicit synthetic part ID', { exact: true }).selectOption(id);
  await page.getByRole('button', { name: 'Accept selected synthetic part', exact: true }).click();
}

async function main() {
  let session;
  let failure;
  try {
    session = await openIsolatedLesson(path.join('capability', 'C024', 'index.html'));
    record.browserVersion = session.browserVersion;
    assert.match(record.browserVersion, /^156\./);
    const { page } = session;
    const pageErrors = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => requests.push({ url: request.url(), method: request.method() }));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('start').disabled);
    assert.match(await page.getByRole('status').textContent(), /^Not run/);
    assert.equal(await page.locator('#final-hash').textContent(), 'Not computed');
    assert.equal(await page.locator('#pinned-hash').textContent(), expectedHash);
    assert.match(await page.locator('#source-version').textContent(), /synthetic-001 · getProfile\/1 · 2\.0\.0 · C020-loopback-v2-r1/);
    assert.match(await page.locator('header').textContent(), /No server, network multipart, Azure Blob, database or durable storage/);
    assert.equal(await page.locator('#conduct').evaluate((element) => element.disabled), true);
    checked('initial actual DOM is unverified with explicit synthetic plan, reused C020 metadata and honest scope', expectedHash);

    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixture-id');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'start');
    const focus = await page.locator('#start').evaluate((element) => {
      const style = getComputedStyle(element);
      return { visible: element.matches(':focus-visible'), outline: style.outlineWidth, style: style.outlineStyle };
    });
    assert.equal(focus.visible, true);
    assert.equal(focus.outline, '4px');
    assert.equal(focus.style, 'solid');
    await page.keyboard.press('Enter');
    await accepted(page, []);
    assert.equal(await page.locator('#memory-state').textContent(), 'active');
    checked('actual Tab/Enter with visible focus explicitly starts an empty synthetic fixture', focus);

    await page.getByLabel('Explicit synthetic part ID', { exact: true }).selectOption('part-003');
    await page.locator('#part-id').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'accept');
    await page.keyboard.press('Enter');
    await accepted(page, ['part-003']);
    await accept(page, 'part-001');
    await accept(page, 'part-001');
    const duplicate = await parse(page, 'observation');
    assert.equal(duplicate.duplicate, true);
    assert.deepEqual(duplicate.acceptedPartIds, ['part-001', 'part-003']);
    assert.deepEqual(duplicate.arrivalOrder, ['part-003', 'part-001']);
    await accepted(page, ['part-001', 'part-003']);
    checked('out-of-order actual acceptance reports exact IDs and duplicate suppression without extra bytes', duplicate);

    await page.getByRole('button', { name: 'Probe conflicting bytes', exact: true }).click();
    await rejected(page, 'CONFLICTING_PART');
    await page.getByLabel('Explicit synthetic part ID', { exact: true }).selectOption('part-002');
    await page.getByRole('button', { name: 'Probe conflicting bytes', exact: true }).click();
    await rejected(page, 'NON_SYNTHETIC_BYTES');
    await accept(page, 'part-999');
    await rejected(page, 'UNKNOWN_PART_ID');
    await accepted(page, ['part-001', 'part-003']);
    checked('actual error DOM rejects conflicting, non-fixture and unknown-ID probes without changing accepted bytes', ['CONFLICTING_PART', 'NON_SYNTHETIC_BYTES', 'UNKNOWN_PART_ID']);

    await page.getByRole('button', { name: 'Complete and verify SHA-256', exact: true }).click();
    await rejected(page, 'MISSING_PARTS');
    checked('missing accepted parts cannot produce a hash or completed receipt', await page.getByRole('status').textContent());

    await page.locator('#pause').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#memory-state').textContent(), 'paused');
    assert.equal(await page.locator('#accept').isDisabled(), true);
    assert.equal(await page.locator('#completion-controls').evaluate((element) => element.disabled), true);
    await page.locator('#resume').focus();
    await page.keyboard.press('Enter');
    const resumed = await parse(page, 'resume-observation');
    assert.deepEqual(resumed, {
      acceptedPartIds: ['part-001', 'part-003'], missingPartIds: ['part-002', 'part-004'],
      acceptedBytes: 128, resumeCount: 1, scope: 'same-memory-object-only'
    });
    checked('keyboard pause/resume exposes exact same-memory accepted and missing IDs, not durable recovery', resumed);

    await accept(page, 'part-004');
    await accept(page, 'part-002');
    await accepted(page, ids);
    assert.equal(await page.locator('#arrival-order').textContent(), 'part-003, part-001, part-004, part-002');
    for (const [order, code] of [
      [[...ids].reverse().join(', '), 'PART_ORDER_MISMATCH'],
      [['part-001', 'part-001', 'part-003', 'part-004'].join(', '), 'DUPLICATE_PART_ID'],
      [ids.slice(0, 3).join(', '), 'MISSING_COMPLETION_IDS'],
      ['part-001,part-002,,part-004', 'UNKNOWN_PART_ID'],
      ['part-001,part-002,part-003,part-999', 'UNKNOWN_PART_ID']
    ]) {
      await page.getByLabel('Explicit completion part IDs, comma separated', { exact: true }).fill(order);
      assert.match(await page.getByRole('status').textContent(), /^Verification input changed/);
      await page.locator('#complete').click();
      await rejected(page, code);
      await accepted(page, ids);
    }
    checked('actual completion inputs reject ordering, duplicate, missing, empty and unknown IDs without masking failure', 'five DOM rejection branches');

    await page.locator('#completion-order').fill(ids.join(', '));
    for (const [expected, code] of [['bad', 'INVALID_HASH'], ['0'.repeat(64), 'HASH_MISMATCH']]) {
      await page.getByLabel('Expected SHA-256 (64 lowercase hexadecimal characters)', { exact: true }).fill(expected);
      await page.locator('#complete').click();
      await rejected(page, code);
      await accepted(page, ids);
    }
    checked('malformed and mismatched expected hashes fail explicitly, leaving actual accepted parts inspectable', ['INVALID_HASH', 'HASH_MISMATCH']);

    await page.locator('#expected-hash').fill(expectedHash);
    await page.evaluate(() => {
      Object.defineProperty(crypto.subtle, 'digest', {
        configurable: true, value: async () => { throw new Error('Controlled browser completion failure.'); }
      });
    });
    await page.locator('#complete').click();
    await rejected(page, 'DIGEST_FAILED');
    await accepted(page, ids);
    assert.equal(await page.locator('#memory-state').textContent(), 'active');
    await page.evaluate(() => { delete crypto.subtle.digest; });
    checked('actual asynchronous digest rejection cannot fabricate completion and retains all accepted bytes', 'DIGEST_FAILED; receipt absent');

    await page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      globalThis.__c024DigestInput = null;
      Object.defineProperty(crypto.subtle, 'digest', {
        configurable: true,
        value: async (algorithm, bytes) => {
          globalThis.__c024DigestInput = { algorithm, bytes: Array.from(bytes) };
          return original(algorithm, bytes);
        }
      });
    });
    await page.locator('#complete').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('VERIFIED LOCAL SYNTHETIC CONTENT'));
    const receipt = await parse(page, 'receipt');
    const actualDigest = await page.evaluate(() => globalThis.__c024DigestInput);
    assert.equal(actualDigest.algorithm, 'SHA-256');
    assert.deepEqual(actualDigest.bytes, [...expectedBytes]);
    assert.equal(sha256(Uint8Array.from(actualDigest.bytes)), receipt.actualSha256);
    assert.equal(receipt.actualSha256, expectedHash);
    assert.equal(receipt.expectedSha256, expectedHash);
    assert.deepEqual(receipt.orderedPartIds, ids);
    assert.equal(receipt.resumeCount, 1);
    assert.equal(receipt.byteCount, 256);
    assert.equal(receipt.source.stamp.deploymentStamp, 'C020-loopback-v2-r1');
    assert.equal(await page.locator('#final-hash').textContent(), expectedHash);
    assert.equal(await page.locator('#completed-bytes').textContent(), '256');
    assert.equal(await page.locator('#byte-preview').textContent(),
      `${Buffer.from(expectedBytes.slice(0, 16)).toString('hex')} … ${Buffer.from(expectedBytes.slice(-16)).toString('hex')}`);
    assert.equal(await page.locator('#conduct').evaluate((element) => element.disabled), true);
    assert.equal(await page.locator('#completion-controls').evaluate((element) => element.disabled), true);
    await page.evaluate(() => { delete crypto.subtle.digest; });
    checked('real browser Web Crypto hashes all actual 256 assembled bytes; independent Node SHA-256 and receipt agree', {
      actualSha256: receipt.actualSha256, byteCount: actualDigest.bytes.length,
      orderedPartIds: receipt.orderedPartIds, instrumentation: 'captured actual digest input, delegated unchanged to original real Web Crypto'
    });
    if (capture) {
      await page.screenshot({ path: imagePath, fullPage: true });
      record.screenshot = path.relative(root, imagePath);
    }

    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    checked('actual mobile viewport wraps hash, receipt and controls without horizontal overflow', '375×812');
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: 'Reset fixture', exact: true }).click();
    await accepted(page, []);
    assert.equal(await page.locator('#memory-state').textContent(), 'Not started');
    assert.equal(await page.locator('#final-hash').textContent(), 'Not computed');
    assert.equal(await page.locator('#receipt').textContent(), 'No completed receipt.');
    assert.equal(await page.locator('#resume-observation').textContent(), 'No same-memory resume observed.');
    assert.equal(await page.locator('#history li').count(), 0);
    assert.equal(await page.locator('#start').isEnabled(), true);
    assert.equal(await page.locator('#conduct').evaluate((element) => element.disabled), true);
    checked('actual reset clears successful receipt, accepted parts, errors, history and resume observation', 'new start required');

    await page.locator('#start').click();
    for (const id of ids) await accept(page, id);
    await page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      const barrier = new Promise((resolve) => { globalThis.__c024ReleaseDigest = resolve; });
      Object.defineProperty(crypto.subtle, 'digest', {
        configurable: true,
        value: (...arguments_) => {
          globalThis.__c024OldDigest = barrier.then(() => original(...arguments_));
          return globalThis.__c024OldDigest;
        }
      });
    });
    await page.locator('#complete').click();
    await page.waitForFunction(() => document.getElementById('memory-state').textContent === 'hashing');
    assert.equal(await page.locator('#reset').isEnabled(), true);
    assert.equal(await page.locator('#accept').isDisabled(), true);
    await page.locator('#reset').click();
    await page.locator('#start').click();
    await page.evaluate(async () => {
      globalThis.__c024ReleaseDigest();
      await globalThis.__c024OldDigest;
      await new Promise((resolve) => setTimeout(resolve, 0));
      delete crypto.subtle.digest;
    });
    await accepted(page, []);
    assert.equal(await page.locator('#memory-state').textContent(), 'active');
    assert.equal(await page.locator('#final-hash').textContent(), 'Not computed');
    assert.equal(await page.locator('#receipt').textContent(), 'No completed receipt.');
    assert.match(await page.getByRole('status').textContent(), /^Started named synthetic fixture/);
    checked('actual reset during outstanding real hashing prevents old-session success from contaminating a new fixture', 'old real digest settled; new fixture remains active and empty');

    await accept(page, 'part-001');
    await page.locator('#pause').click();
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('start').disabled);
    await accepted(page, []);
    assert.equal(await page.locator('#memory-state').textContent(), 'Not started');
    assert.equal(await page.locator('#resume-observation').textContent(), 'No same-memory resume observed.');
    checked('actual reload loses partial paused memory instead of claiming durable resume', 'empty, not started');

    await page.evaluate(() => {
      globalThis.__c024Csp = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        globalThis.__c024Csp.push({
          effectiveDirective: event.effectiveDirective, blockedURI: event.blockedURI, disposition: event.disposition
        });
      });
      const inline = document.createElement('script');
      inline.textContent = 'globalThis.__c024InlineExecuted = true;';
      document.head.append(inline);
      globalThis.__c024ConnectRejected = false;
      fetch('https://example.invalid/C024-csp-probe').catch(() => { globalThis.__c024ConnectRejected = true; });
    });
    await page.waitForFunction(() => globalThis.__c024ConnectRejected
      && globalThis.__c024Csp.some((item) => item.effectiveDirective.startsWith('script-src'))
      && globalThis.__c024Csp.some((item) => item.effectiveDirective === 'connect-src'));
    const csp = await page.evaluate(() => ({ ran: globalThis.__c024InlineExecuted === true, violations: globalThis.__c024Csp }));
    assert.equal(csp.ran, false);
    assert.equal(csp.violations.every((item) => item.disposition === 'enforce'), true);
    assert.deepEqual(requests.filter((request) => !request.url.startsWith('file:')), []);
    assert.deepEqual(pageErrors, []);
    checked('actual enforced CSP blocks inline execution and outbound connection before network dispatch', csp.violations);
    checked('no page errors, non-file requests, server or foreground browser lease', { pageErrors, nonFileRequests: 0 });
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        await session.close();
        record.cleanup.browserClosed = true;
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Check and cleanup failed') : error;
        record.outcome = 'failed';
        record.cleanup.error = error.message;
      }
    }
    record.completedAtUtc = new Date().toISOString();
    if (!capture) {
      try {
        assert.deepEqual(proofHashes(), originalProof);
        checked('ordinary browser verification leaves all committed proof bytes unchanged', { files: originalProof.length });
      } catch (error) {
        failure = failure || error;
        record.outcome = 'failed';
      }
    } else {
      fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    }
  }
  console.log(JSON.stringify(record, null, 2));
  if (failure) throw failure;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
