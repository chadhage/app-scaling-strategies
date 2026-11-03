'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const contract = require('../../C020/contract.js');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperFile = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const publishedHelperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
function proofFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? proofFiles(file) : [[path.relative(root, file), hash(fs.readFileSync(file))]];
  });
}
function proofFingerprint() {
  const files = proofFiles(evidence);
  const manifest = path.join(root, 'evidence.json');
  if (fs.existsSync(manifest)) files.push(['evidence.json', hash(fs.readFileSync(manifest))]);
  const stub = path.join(root, 'compatibility.stub.snapshot.js');
  files.push(['compatibility.stub.snapshot.js', hash(fs.readFileSync(stub))]);
  return files.sort(([left], [right]) => left.localeCompare(right));
}
const initialProof = capture ? null : proofFingerprint();
const record = {
  cardId: 'C021', startedAtUtc: new Date().toISOString(), outcome: 'not-run',
  mode: 'isolated-headless-local-file', businessData: 'synthetic',
  baselineSource: 'unchanged C020 bundled catalog replay; not live implementations or HTTP observations',
  testRuntime: process.version, playwrightVersion: null, browserVersion: null,
  productionRuntimeValidated: false, nativeTargetQualified: false, identityVerified: false,
  durableStoreImplemented: false, newListenersStarted: 0, liveAzureRuns: 0, authorizedCloudSpend: 0,
  integratedForegroundLeaseUsed: false, deliberateCapture: capture,
  checks: [], cleanup: { browserClosed: false }
};

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}
async function jsonPanel(page, id) {
  return JSON.parse(await page.locator(`#${id}`).textContent());
}
async function assertEmpty(page) {
  assert.equal(await page.locator('#outcomes tr').count(), 0);
  assert.equal(await page.locator('#baseline').textContent(), 'No baseline replay.');
  assert.equal(await page.locator('#raw').textContent(), 'No raw response.');
  assert.equal(await page.locator('#adapted').textContent(), 'No adapted response.');
  assert.equal(await page.locator('#candidate-result').textContent(), 'No candidate adaptation.');
  assert.equal(await page.locator('#candidate').inputValue(), '');
  assert.equal(await page.locator('#check-candidate').isDisabled(), true);
}
async function run(page, id, implementation) {
  await page.getByLabel('Explicit synthetic profile ID', { exact: true }).fill(id);
  await page.locator('#implementation').selectOption(implementation);
  await page.locator('#run-rehearsal').focus();
  await page.keyboard.press('Enter');
  assert.match(await page.locator('#status').textContent(), /^REHEARSED — RAW BREAKING; ADAPTED SAFE/);
  const [baseline, raw, adapted, semantics] = await Promise.all(
    ['baseline', 'raw', 'adapted', 'semantics'].map((panel) => jsonPanel(page, panel))
  );
  const expected = contract.profiles.find((profile) => profile.id === id);
  assert.equal(baseline.apiContract, 'getProfile/1');
  assert.deepEqual(baseline.profile, expected);
  assert.deepEqual(baseline.stamp, contract.stamps[implementation]);
  assert.equal(raw.apiContract, 'getProfile/2');
  assert.deepEqual(raw.provenance.sourceStamp, contract.stamps[implementation]);
  assert.deepEqual(adapted.profile, expected);
  assert.equal(adapted.provenance.adapterId, 'C021/getProfile-2-to-1/r1');
  assert.equal(Object.hasOwn(adapted, 'stamp'), false);
  assert.deepEqual(semantics, { oldConsumer: expected, newConsumer: expected, adaptedOldConsumer: expected });
  const rows = await page.locator('#outcomes tr').allTextContents();
  assert.equal(rows.length, 6);
  assert.match(rows[1], /raw -> oldBREAKINGCONTRACT_MISMATCH/);
  assert.match(rows[3], /adapted -> oldSAFESEMANTICS_PRESERVED/);
  assert.match(rows[4], /baseline -> newBREAKINGCONTRACT_MISMATCH/);
  assert.match(rows[5], /adapted -> newBREAKINGCONTRACT_MISMATCH/);
  return { baseline, raw, adapted, semantics, rows };
}

async function main() {
  let session;
  let failure;
  try {
    assert.equal(process.versions.node.split('.')[0], '22', 'This proof is restricted to Node22 tooling.');
    const beforeImport = hash(fs.readFileSync(helperFile));
    assert.equal(beforeImport, publishedHelperSha256, 'Only the byte-exact published isolated helper is qualified.');
    const { openIsolatedLesson } = require(helperFile);
    assert.equal(hash(fs.readFileSync(helperFile)), publishedHelperSha256, 'Helper bytes must remain unchanged during import.');
    record.helperQualification = {
      publishedCommit: '53c0c0d82cc1', sha256: beforeImport,
      prototypeUsed: false, finalSha256: null
    };
    const playwright = JSON.parse(fs.readFileSync(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')));
    assert.equal(playwright.version, '1.56.1');
    record.playwrightVersion = playwright.version;
    const browserSourceFile = path.join(repo, 'testing', 'browser', 'evidence', 'browser-source.json');
    const browserSource = JSON.parse(fs.readFileSync(browserSourceFile));
    assert.equal(browserSource.signatureStatus, 'Valid');
    assert.match(browserSource.signer, /CN=Microsoft Corporation/);
    const binaryHash = hash(fs.readFileSync(browserSource.path));
    assert.equal(binaryHash, browserSource.sha256.toLowerCase(), 'Installed browser must match the recorded signed binary.');
    record.installedBrowserProvenance = {
      source: path.relative(repo, browserSourceFile), recordedSignatureStatus: browserSource.signatureStatus,
      signer: browserSource.signer, sha256Rechecked: binaryHash, sourceRecordSha256: hash(fs.readFileSync(browserSourceFile))
    };
    record.sharedToolingSources = ['isolated.cjs', 'package.json', 'package-lock.json'].map((name) => {
      const file = path.join(repo, 'testing', 'browser', name);
      return { path: path.relative(repo, file), sha256: hash(fs.readFileSync(file)) };
    });

    session = await openIsolatedLesson(path.join('capability', 'C021', 'index.html'));
    record.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    assert.equal(session.browserVersion, browserSource.version);
    const { page } = session;
    const pageErrors = [];
    const responses = [];
    const requests = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => responses.push(response.url()));
    page.on('request', (request) => requests.push(request.url()));
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.title(), 'C021 · Explicit profile contract adapter');
    assert.equal(await page.locator('#run-rehearsal').isDisabled(), false);
    assert.match(await page.locator('#status').textContent(), /^Not run/);
    assert.match(await page.locator('.boundary').textContent(), /not a live implementation or HTTP observation/);
    await assertEmpty(page);
    checked('initial real DOM is synthetic/local, dependency-ready, and has no successful observations', {
      title: await page.title(), status: await page.locator('#status').textContent()
    });

    await page.getByLabel('Explicit synthetic profile ID', { exact: true }).click();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'implementation');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'run-rehearsal');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#status').textContent(), /^REHEARSED/);
    assert.equal(await page.locator('#outcomes tr').count(), 6);
    checked('actual Tab/Tab/Enter conducts the default raw-breaking and adapted-safe comparison', await page.locator('#outcomes tr').allTextContents());

    for (const id of ['synthetic-001', 'synthetic-002']) {
      for (const implementation of ['v1', 'v2']) {
        const observed = await run(page, id, implementation);
        checked(`actual DOM preserves all fields for ${implementation}/${id} with API and implementation versions distinct`, observed);
      }
    }

    const browserConsumers = await page.evaluate(() => {
      const baseline = JSON.parse(document.getElementById('baseline').textContent);
      const raw = JSON.parse(document.getElementById('raw').textContent);
      const adapted = JSON.parse(document.getElementById('adapted').textContent);
      const code = (operation) => { try { operation(); return 'UNEXPECTED_ACCEPTANCE'; } catch (error) { return error.code; } };
      return {
        sameOldFunction: C021Compatibility.oldConsumer === C020Inspector.oldConsumer,
        contractFrozen: Object.isFrozen(C020Contract.profiles[0].preferences.topics),
        oldRaw: code(() => C020Inspector.oldConsumer(raw)),
        newBaseline: code(() => C021Compatibility.newConsumer(baseline, 'v2', 'synthetic-002')),
        newAdapted: code(() => C021Compatibility.newConsumer(adapted, 'v2', 'synthetic-002')),
        originalInspection: code(() => C020Inspector.inspect(adapted, 'v2', 'synthetic-002')),
        oldAdapted: C020Inspector.oldConsumer(adapted),
        newRaw: C021Compatibility.newConsumer(raw, 'v2', 'synthetic-002')
      };
    });
    assert.equal(browserConsumers.sameOldFunction, true);
    assert.equal(browserConsumers.contractFrozen, true);
    for (const field of ['oldRaw', 'newBaseline', 'newAdapted']) assert.equal(browserConsumers[field], 'CONTRACT_MISMATCH');
    assert.equal(browserConsumers.originalInspection, 'STAMP_MISMATCH');
    assert.deepEqual(browserConsumers.oldAdapted, browserConsumers.newRaw);
    checked('real unchanged C020 consumer and new consumer execute strict directional contracts in-browser', browserConsumers);

    const requestCount = requests.length;
    await page.locator('#check-candidate').click();
    assert.match(await page.locator('#candidate-status').textContent(), /^CANDIDATE SAFE VIA EXPLICIT ADAPTER/);
    const candidateSuccess = await jsonPanel(page, 'candidate-result');
    assert.deepEqual(candidateSuccess.oldConsumer, contract.profiles[1]);
    assert.deepEqual(candidateSuccess.newConsumer, contract.profiles[1]);
    assert.equal(requests.length, requestCount, 'Candidate validation must not create a service observation.');
    checked('valid candidate adapts explicitly without any new file or network request', candidateSuccess.adapted.provenance);

    const good = await jsonPanel(page, 'raw');
    for (const [name, mutate, code] of [
      ['unknown API version', (value) => { value.apiContract = 'getProfile/3'; }, 'CONTRACT_MISMATCH'],
      ['old API version', (value) => { value.apiContract = 'getProfile/1'; }, 'CONTRACT_MISMATCH'],
      ['changed business email', (value) => { value.person.contact.emailAddress = 'changed@example.invalid'; }, 'PROFILE_MISMATCH'],
      ['forged source version', (value) => { value.provenance.sourceStamp.implementationVersion = '999'; }, 'PROVENANCE_MISMATCH'],
      ['forged cloud stamp', (value) => { value.provenance.sourceStamp.deploymentStamp = 'production'; }, 'PROVENANCE_MISMATCH'],
      ['missing provenance', (value) => { delete value.provenance; }, 'INVALID_ENVELOPE'],
      ['unknown candidate profile', (value) => { value.person.key = 'synthetic-999'; }, 'PROFILE_MISMATCH'],
      ['missing nested field', (value) => { delete value.person.settings.language; }, 'INVALID_PROFILE'],
      ['extra field', (value) => { value.authorized = true; }, 'INVALID_ENVELOPE']
    ]) {
      const candidate = structuredClone(good);
      mutate(candidate);
      await page.locator('#candidate').fill(JSON.stringify(candidate));
      assert.equal(await page.locator('#candidate-result').textContent(), 'No candidate adaptation.');
      assert.equal(await page.locator('#candidate-status').textContent(), 'No candidate checked.');
      await page.locator('#check-candidate').click();
      assert.match(await page.locator('#candidate-status').textContent(), new RegExp(`^REJECTED — ${code}`));
      assert.equal(await page.locator('#candidate-result').textContent(), 'No candidate adaptation.');
      checked(`actual candidate DOM rejects ${name} and clears stale adaptation`, code);
    }
    for (const text of ['{', '', ' ']) {
      await page.locator('#candidate').fill(text);
      await page.locator('#check-candidate').click();
      assert.match(await page.locator('#candidate-status').textContent(), /^REJECTED — INVALID_JSON/);
      assert.equal(await page.locator('#candidate-result').textContent(), 'No candidate adaptation.');
    }
    await page.locator('#candidate').fill('<img src=x onerror="globalThis.C021_INJECTED=true">');
    await page.locator('#check-candidate').click();
    assert.match(await page.locator('#candidate-status').textContent(), /^REJECTED — INVALID_JSON/);
    assert.equal(await page.evaluate(() => globalThis.C021_INJECTED), undefined);
    checked('malformed, empty, whitespace, and markup candidates fail as data without script execution', 'INVALID_JSON');

    await page.locator('#implementation').selectOption('v1');
    await assertEmpty(page);
    assert.match(await page.locator('#status').textContent(), /context changed/);
    checked('source implementation change invalidates every prior result and candidate immediately', await page.locator('#status').textContent());

    for (const [id, code] of [
      ['synthetic-999', 'UNKNOWN_PROFILE'], ['', 'INVALID_PROFILE_ID'], [' synthetic-001', 'INVALID_PROFILE_ID']
    ]) {
      await page.locator('#profile-id').fill(id);
      await page.locator('#run-rehearsal').click();
      assert.match(await page.locator('#status').textContent(), new RegExp(`^REJECTED — ${code}`));
      await assertEmpty(page);
    }
    checked('unknown, empty, and malformed explicit identifiers have no healthy default or stale successful panels', 'UNKNOWN_PROFILE / INVALID_PROFILE_ID');

    await page.locator('#profile-id').fill('synthetic-001');
    await page.evaluate(() => {
      const select = document.getElementById('implementation');
      select.add(new Option('Unknown fixture', 'v9'));
      select.value = 'v9';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.locator('#run-rehearsal').click();
    assert.match(await page.locator('#status').textContent(), /^REJECTED — UNKNOWN_IMPLEMENTATION/);
    await assertEmpty(page);
    checked('tampered unknown version selection is rejected by actual behavior rather than trusted UI options', 'UNKNOWN_IMPLEMENTATION');

    await run(page, 'synthetic-001', 'v2');
    await page.evaluate(() => { document.getElementById('profile-id').value = 'synthetic-002'; });
    await page.locator('#check-candidate').click();
    assert.match(await page.locator('#candidate-status').textContent(), /^REJECTED — RUN_REQUIRED/);
    assert.match(await page.locator('#status').textContent(), /^Not run/);
    await assertEmpty(page);
    checked('even programmatic context changes without input events cannot reuse stale candidate authority', 'RUN_REQUIRED; all compared results cleared');

    await run(page, 'synthetic-001', 'v2');
    if (capture) {
      const screenshot = path.join(evidence, 'browser-transitions.png');
      await page.screenshot({ path: screenshot, fullPage: true });
      record.screenshot = path.relative(repo, screenshot);
    }
    await page.locator('#reset-rehearsal').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#profile-id').inputValue(), 'synthetic-001');
    assert.equal(await page.locator('#implementation').inputValue(), 'v1');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'profile-id');
    assert.match(await page.locator('#status').textContent(), /^Not run — reset/);
    await assertEmpty(page);
    checked('real keyboard reset uses native form reset without shadowing and clears all results with restored focus', await page.locator('#status').textContent());

    const omitInspector = (route) => route.abort('failed');
    await page.route('**/C020/inspector.js', omitInspector);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#run-rehearsal').isDisabled(), true);
    assert.equal(await page.locator('#check-candidate').isDisabled(), true);
    assert.match(await page.locator('#status').textContent(), /^UNAVAILABLE/);
    await page.evaluate(() => document.getElementById('rehearsal-form').requestSubmit());
    await assertEmpty(page);
    await page.locator('#reset-rehearsal').click();
    assert.match(await page.locator('#status').textContent(), /^UNAVAILABLE/);
    checked('real missing dependency load fails closed; submit and reset cannot invent a safe result', await page.locator('#status').textContent());
    await page.unroute('**/C020/inspector.js', omitInspector);
    await page.reload({ waitUntil: 'load' });
    assert.equal(await page.locator('#run-rehearsal').isDisabled(), false);
    await assertEmpty(page);

    const csp = await page.evaluate(async () => {
      const violations = [];
      document.addEventListener('securitypolicyviolation', (event) => violations.push({
        directive: event.effectiveDirective, blockedURI: event.blockedURI
      }));
      const script = document.createElement('script');
      script.textContent = 'globalThis.C021_INLINE_EXECUTED = true';
      document.body.append(script);
      const style = document.createElement('style');
      style.textContent = 'body { --c021-inline-style: executed; }';
      document.head.append(style);
      let connection;
      try { await fetch('https://example.invalid/c021-csp-check'); connection = 'unexpected-success'; }
      catch { connection = 'blocked'; }
      await new Promise((resolve) => setTimeout(resolve, 100));
      return {
        inlineExecuted: globalThis.C021_INLINE_EXECUTED === true,
        inlineStyle: getComputedStyle(document.body).getPropertyValue('--c021-inline-style'),
        connection, violations
      };
    });
    assert.equal(csp.inlineExecuted, false);
    assert.equal(csp.inlineStyle, '');
    assert.equal(csp.connection, 'blocked');
    assert.ok(csp.violations.some((item) => item.directive === 'script-src-elem'));
    assert.ok(csp.violations.some((item) => item.directive === 'style-src-elem'));
    assert.ok(csp.violations.some((item) => item.directive === 'connect-src'));
    checked('actual file-page CSP blocks injected inline script, inline style, and outbound connection without bypass', csp);
    assert.deepEqual(pageErrors, []);
    assert.equal(responses.filter((url) => !url.startsWith('file:')).length, 0);
    checked('actual page has no uncaught JavaScript errors and no successful network response', {
      pageErrors, responseCount: responses.length, nonFileResponses: 0
    });
  } catch (error) {
    failure = error;
  } finally {
    if (session) {
      const browser = session.page.context().browser();
      try {
        await session.close();
        assert.equal(browser.isConnected(), false);
        record.cleanup.browserClosed = true;
        record.helperQualification.finalSha256 = hash(fs.readFileSync(helperFile));
        assert.equal(record.helperQualification.finalSha256, publishedHelperSha256);
      } catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
      }
    }
    if (!capture) {
      try {
        assert.deepEqual(proofFingerprint(), initialProof, 'Ordinary browser verification must not alter historical proof.');
        checked('ordinary browser verification preserved every historical proof byte', 'evidence and manifest SHA-256 maps identical');
      } catch (error) { failure = failure || error; }
    }
    record.completedAtUtc = new Date().toISOString();
    record.outcome = failure ? 'failed' : 'passed';
    if (failure) record.error = { name: failure.name, message: failure.message, stack: failure.stack };
    if (capture) fs.writeFileSync(path.join(evidence, 'browser-acceptance.json'), `${JSON.stringify(record, null, 2)}\n`);
    console.log(`C021 browser: ${record.outcome}; ${record.checks.length} checks; Edge ${record.browserVersion}; closed=${record.cleanup.browserClosed}; capture=${capture}`);
  }
  if (failure) throw failure;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
