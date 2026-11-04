'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const argumentsList = process.argv.slice(2);
const requestedScope = argumentsList.length === 0 ? 'full' :
  argumentsList.length === 1 && argumentsList[0] === '--csp-only' ? 'csp-only' : 'invalid';
const unique = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`;
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(file));
const relative = (file) => path.relative(repository, file);
const helperPath = path.join(repository, manifest.browserAuthority.helperPath);
const recordPath = path.join(root, 'evidence', `browser-${unique}.json`);
const evidenceRoot = path.join(root, 'evidence');
const record = {
  schema: 'C048/browser-proof/1', cardId: 'C048', workerId: 'worker-C048', kano: 'D', parents: ['H009'],
  startedAtUtc: new Date().toISOString(), runtime: process.version, captureRequested: capture,
  mode: 'actual-isolated-file-DOM-and-keyboard-over-bundled-models', requestedScope, outcome: 'not-run', checks: [], images: [],
  helper: {
    path: manifest.browserAuthority.helperPath, api: 'openIsolatedLesson',
    commit: manifest.browserAuthority.helperCommit, requiredSha256: manifest.browserAuthority.helperSha256,
    abandonedLifecyclePrototypeUsed: false
  },
  sourceHashes: Object.fromEntries(['C048.feature', 'admission.js', 'index.html', 'page.js', 'styles.css',
    'manifest.json', 'CONTRACT.txt', 'tests\\browser.cjs'].map((name) => [
    relative(path.join(root, name)), fileHash(path.join(root, name))
  ])),
  qualifications: {
    nativeQualified: false, productionNode24Validated: false, actualCapacityOrControlAPI: false,
    cloudCalls: 0, spend: 0, fixtureEventAcceptance: 'local modeled contract, not real queue or protocol proof',
    browserObservation: 'bundled catalog/model replay, not HTTP/live provider', unattendedLifecycleQualified: false
  },
  cleanup: { browserClosed: false, awaitedFinallyClose: false, listenersCreated: 0, foregroundLeaseUsed: false },
  chromiumSandbox: true, unsafeFlagsUsed: false
};
record.sourceGitCanonicalHashes = Object.fromEntries(Object.keys(record.sourceHashes).map((file) => {
  const bytes = fs.readFileSync(path.join(repository, file));
  return [file, hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')))];
}));
record.sourceRawCRLF = Object.fromEntries(Object.keys(record.sourceHashes).map((file) => [
  file, (fs.readFileSync(path.join(repository, file), 'utf8').match(/\r\n/g) || []).length
]));

function proofDigest() {
  const files = [];
  function visit(directory) {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([relative(file), fileHash(file)]);
    }
  }
  visit(evidenceRoot);
  const summary = path.join(root, 'evidence.json');
  if (fs.existsSync(summary)) files.push([relative(summary), fileHash(summary)]);
  return hash(Buffer.from(JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b)))));
}

function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

async function cspEvidence(page) {
  return page.evaluate(async () => {
    const violations = [];
    const listener = (event) => violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
    document.addEventListener('securitypolicyviolation', listener);
    const script = document.createElement('script');
    script.textContent = 'globalThis.__c048InlineExecuted = true;';
    document.head.append(script);
    let fetchRejected = false;
    try { await fetch('https://example.invalid/c048-must-not-leave-browser'); } catch { fetchRejected = true; }
    let workerConstructorRejected = false;
    let workerErrorObserved = false;
    let workerMessageReceived = false;
    let worker;
    const workerURL = URL.createObjectURL(new Blob(['postMessage("forbidden")'], { type: 'text/javascript' }));
    try {
      worker = new Worker(workerURL);
      worker.addEventListener('error', (event) => { workerErrorObserved = true; event.preventDefault(); });
      worker.addEventListener('message', () => { workerMessageReceived = true; });
    } catch { workerConstructorRejected = true; }
    const frame = document.createElement('iframe');
    frame.src = 'data:text/html,blocked';
    document.body.append(frame);
    const object = document.createElement('object');
    object.data = 'data:text/html,blocked';
    document.body.append(object);
    await new Promise((resolve) => setTimeout(resolve, 300));
    document.removeEventListener('securitypolicyviolation', listener);
    if (worker) worker.terminate();
    script.remove(); frame.remove(); object.remove(); URL.revokeObjectURL(workerURL);
    return {
      violations, fetchRejected, workerConstructorRejected, workerErrorObserved, workerMessageReceived,
      inlineExecuted: globalThis.__c048InlineExecuted === true
    };
  });
}

function assertCSP(observed) {
  assert.equal(observed.inlineExecuted, false);
  assert.equal(observed.fetchRejected, true);
  assert.equal(observed.workerMessageReceived, false);
  assert.equal(observed.workerConstructorRejected || observed.workerErrorObserved, true,
    'The worker must be actually refused either synchronously or through its native error event.');
  for (const directive of ['script-src', 'connect-src', 'worker-src', 'frame-src', 'object-src']) {
    assert.ok(observed.violations.some((entry) => entry.directive.startsWith(directive)), `Actual CSP violation missing ${directive}`);
  }
}

async function main() {
  const before = proofDigest();
  let session;
  let failure;
  try {
    assert.notEqual(requestedScope, 'invalid', 'Only no arguments (full) or explicit --csp-only is supported.');
    assert.match(process.version, /^v22\./);
    record.helper.observedSha256 = fileHash(helperPath);
    assert.equal(record.helper.observedSha256, record.helper.requiredSha256, 'Only the exact published helper is qualified.');
    const browserSource = JSON.parse(fs.readFileSync(path.join(repository, 'testing', 'browser', 'evidence', 'browser-source.json')));
    const executable = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    assert.equal(browserSource.path, executable);
    assert.equal(browserSource.signatureStatus, 'Valid');
    assert.match(browserSource.signer, /Microsoft Corporation/);
    assert.equal(fileHash(executable), browserSource.sha256.toLowerCase());
    const signatureTool = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
    const signatureCommand = `$ErrorActionPreference='Stop';$p='${executable}';$s=Get-AuthenticodeSignature -LiteralPath $p;[pscustomobject]@{status=[string]$s.Status;signer=$s.SignerCertificate.Subject;version=(Get-Item -LiteralPath $p).VersionInfo.FileVersion;signatureToolVersion=$PSVersionTable.PSVersion.ToString()}|ConvertTo-Json -Compress`;
    record.installedBinary = {
      path: executable, sha256: fileHash(executable), signatureTool,
      ...JSON.parse(execFileSync(signatureTool, ['-NoProfile', '-NonInteractive', '-Command', signatureCommand], {
        encoding: 'utf8', timeout: 30000
      }))
    };
    assert.equal(record.installedBinary.status, 'Valid');
    assert.match(record.installedBinary.signer, /Microsoft Corporation/);
    assert.equal(record.installedBinary.version, browserSource.version);
    const { openIsolatedLesson } = require(helperPath);
    record.playwrightVersion = require(path.join(repository, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    record.dependencies = [...manifest.sourceLineage, ...manifest.acceptedDependencies].map((item) => {
      assert.equal(fileHash(path.join(repository, item.path)), item.rawSha256);
      return { path: item.path, rawSha256: item.rawSha256, commit: item.commit };
    });
    session = await openIsolatedLesson(path.join('capability', 'C048', 'index.html'));
    record.browserVersion = session.browserVersion;
    assert.match(record.browserVersion, /^156\./);
    const { page } = session;
    const pageErrors = [];
    const httpRequests = [];
    const httpResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (request) => { if (/^https?:/i.test(request.url())) httpRequests.push(request.url()); });
    page.on('response', (response) => { if (/^https?:/i.test(response.url())) httpResponses.push(response.url()); });
    await page.route(/^https?:\/\//i, (route) => route.abort('blockedbyclient'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('admit-candidate').disabled);
    if (requestedScope === 'csp-only') {
      const csp = await cspEvidence(page);
      record.cspObservation = { csp, httpRequests, httpResponses, pageErrors };
      console.log('ACTUAL_CSP_OBSERVATION ' + JSON.stringify(record.cspObservation));
      assertCSP(csp);
      assert.deepEqual(httpRequests, []);
      assert.deepEqual(httpResponses, []);
      assert.deepEqual(pageErrors, []);
      checked('focused actual CSP refusals only; not full DOM/admission acceptance', record.cspObservation);
      record.outcome = 'passed';
      return;
    }
    const state = async () => JSON.parse(await page.locator('#session-export').inputValue());
    const activate = async (name) => {
      await page.getByRole('button', { name, exact: true }).focus();
      await page.keyboard.press('Enter');
    };
    const reject = async (code, original, operation = 'Expand locally') => {
      await activate(operation);
      assert.match(await page.locator('#status').textContent(), new RegExp(`^REJECTED — ${code}`));
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
      const after = await state();
      assert.deepEqual(after.active, original.active);
      assert.equal(after.counts.admissions, original.counts.admissions);
      assert.equal(after.counts.expansions, original.counts.expansions);
      assert.equal(after.counts.modeledEffectApplications, original.counts.modeledEffectApplications);
      assert.equal(after.history.at(-1).result.code, code);
      return after;
    };

    assert.equal(await page.locator('#training-banner').textContent(), manifest.banner);
    assert.match(await page.locator('#status').textContent(), /^NOT RUN/);
    assert.equal((await state()).active, null);
    assert.equal((await state()).counts.modeledEffectApplications, 0);
    assert.match(await page.locator('#scope-notes').textContent(), /Node24 qualification remain incomplete/);
    checked('signed Edge 156 file page starts synthetic and unrun with no admission/effect', {
      banner: manifest.banner, binary: record.installedBinary, counts: (await state()).counts
    });

    await page.getByLabel('Synthetic release ID', { exact: true }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('release-001');
    for (const id of ['implementation', 'profile-id', 'data-api', 'data-consumer', 'data-consumer-schema', 'data-adapter']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
    }
    await page.getByRole('button', { name: 'Inspect candidate only', exact: true }).focus();
    const outline = await page.locator('#inspect-candidate').evaluate((button) => getComputedStyle(button).outlineWidth);
    assert.equal(outline, '3px');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#status').textContent(), /^INSPECTED ONLY/);
    const inspected = await state();
    assert.equal(inspected.counts.inspections, 1);
    assert.equal(inspected.counts.admissions, 0);
    assert.equal(inspected.counts.modeledEffectApplications, 0);
    checked('actual Tab, visible focus and Enter conduct only inspection, never admission', { outline, counts: inspected.counts });

    await page.getByLabel('DATA source API contract', { exact: true }).selectOption('getProfile/2');
    assert.match(await page.locator('#inspection').textContent(), /^STALE/);
    assert.equal(await page.locator('#consumer-results tr').count(), 0);
    const initialBlocked = await reject('DATA_INCOMPATIBLE', inspected, 'Admit locally');
    assert.equal(JSON.parse(initialBlocked.history.at(-1).request.candidateJSON).data.adapterId, 'none');
    assert.deepEqual(initialBlocked.history[0], inspected.history[0]);
    checked('actual bad old DATA consumer blocks admit with zero state admission/effects after stale inspection', initialBlocked.counts);

    await page.getByLabel('Explicit DATA adapter', { exact: true }).selectOption('C021/getProfile-2-to-1/r1');
    await activate('Admit locally');
    assert.match(await page.locator('#status').textContent(), /^LOCAL ADMITTED/);
    const admitted = await state();
    assert.equal(admitted.active.stage, 'admitted');
    assert.equal(admitted.counts.admissions, 1);
    assert.equal(admitted.counts.modeledEffectApplications, 3);
    const { getProfileV1, getProfileV2 } = require('../../C020/profiles.cjs');
    const { oldConsumer } = require('../../C020/inspector.js');
    assert.deepEqual(admitted.active.eligibility.checks[0].semantics, oldConsumer(getProfileV1({ profileId: 'synthetic-001' })));
    assert.equal(admitted.active.job.view.counters.effectApplications, 3);
    checked('explicit unchanged C021 adapter permits actual local admission only after both gates and preserves full semantics', admitted.active.eligibility);

    await page.getByLabel('Complete candidate JSON', { exact: true }).fill('{');
    await reject('INVALID_JSON', admitted, 'Inspect candidate only');
    assert.equal(await page.locator('#consumer-results tr').count(), 0);
    checked('malformed JSON replaces stale success with a visible handled rejection and unchanged admitted job', 'INVALID_JSON');
    const forged = JSON.parse(JSON.stringify(admitted.active.candidate));
    forged.verdict = 'eligible';
    forged.provenance = { authenticated: true };
    await page.getByLabel('Complete candidate JSON', { exact: true }).fill(JSON.stringify(forged));
    await reject('INVALID_CANDIDATE', admitted);
    checked('caller eligible verdict/provenance cannot bypass actual expansion guard', 'INVALID_CANDIDATE');

    await page.getByLabel('Explicit DATA adapter', { exact: true }).selectOption('none');
    await reject('DATA_INCOMPATIBLE', admitted);
    checked('raw getProfile/2 old consumer also blocks actual expansion and preserves prior admission/effects', 'DATA_INCOMPATIBLE');
    await page.getByLabel('DATA source API contract', { exact: true }).selectOption('getProfile/1');
    await page.getByLabel('C020 source implementation', { exact: true }).selectOption('v2');
    await page.getByLabel("EVENT consumer's declared work version", { exact: true }).fill('profile-effects/2');
    await reject('EVENT_DECLARATION_MISMATCH', admitted);
    assert.match(await page.locator('#consumer-results').textContent(), /DATA_COMPATIBLE/);
    checked('actual incompatible EVENT consumer blocks expansion despite compatible DATA/implementation v2', 'EVENT_DECLARATION_MISMATCH');

    await page.getByLabel("EVENT consumer's declared work version", { exact: true }).fill('profile-effects/1');
    await page.getByLabel('EVENT evidence kind', { exact: true }).selectOption('unknown');
    const unknown = await reject('EVENT_EVIDENCE_UNKNOWN', admitted);
    checked('unknown EVENT evidence cannot expand or create another modeled effect', unknown.counts);
    if (capture) {
      const bytes = await page.screenshot({ fullPage: true });
      const file = path.join(evidenceRoot, `browser-${unique}-unknown.png`);
      fs.writeFileSync(file, bytes, { flag: 'wx' });
      record.images.push({ path: relative(file), sha256: hash(bytes), observation: 'actual EVENT unknown blocked expansion' });
    }

    await page.getByLabel('EVENT evidence kind', { exact: true }).selectOption('modeled-plan');
    await page.getByLabel('EVENT source state schema', { exact: true }).fill('C023/2');
    await reject('EVENT_SCHEMA_INCOMPATIBLE', admitted);
    checked('incompatible EVENT source schema blocks actual expansion before admission/effect change', 'EVENT_SCHEMA_INCOMPATIBLE');
    await page.getByLabel('EVENT source state schema', { exact: true }).fill('C023/1');
    await page.getByLabel('EVENT source work version', { exact: true }).fill('profile-effects/2');
    await reject('EVENT_WORK_INCOMPATIBLE', admitted);
    checked('incompatible work schema blocks actual expansion', 'EVENT_WORK_INCOMPATIBLE');
    await page.getByLabel('EVENT source work version', { exact: true }).fill('profile-effects/1');

    for (const [label, bad, good, code] of [
      ['Declared DATA consumer', 'unknown', 'old-profile/1', 'DATA_CONSUMER_UNKNOWN'],
      ['Declared EVENT consumer', 'unknown', 'profile-effects-consumer/1', 'EVENT_CONSUMER_UNKNOWN'],
      ['C020 source implementation', 'v3', 'v2', 'UNKNOWN_IMPLEMENTATION'],
      ['C020 synthetic profile', 'synthetic-999', 'synthetic-001', 'UNKNOWN_PROFILE'],
      ['DATA evidence kind', 'unknown', 'bundled-catalog', 'DATA_EVIDENCE_UNKNOWN']
    ]) {
      await page.getByLabel(label, { exact: true }).selectOption(bad);
      await reject(code, admitted);
      await page.getByLabel(label, { exact: true }).selectOption(good);
      checked(`actual ${code} negative cannot grant expansion or add effects`, code);
    }

    await activate('Inspect candidate only');
    assert.match(await page.locator('#status').textContent(), /^INSPECTED ONLY/);
    assert.equal((await state()).counts.expansions, 0);
    await activate('Expand locally');
    assert.match(await page.locator('#status').textContent(), /^LOCAL EXPANDED/);
    const expanded = await state();
    assert.equal(expanded.active.stage, 'expanded');
    assert.equal(expanded.counts.expansions, 1);
    assert.equal(expanded.counts.modeledEffectApplications, 3);
    assert.equal(expanded.active.eligibility.checks[0].sourceStamp.implementationVersion, '2.0.0');
    assert.deepEqual(expanded.active.job, admitted.active.job);
    checked('fresh compatible v2/getProfile1 expands through the actual guard without reapplying original C023 effects', expanded.counts);
    await reject('ALREADY_EXPANDED', expanded);
    checked('closed local expansion bound rejects an additional expansion', 'ALREADY_EXPANDED');

    const browserGuard = await page.evaluate(() => {
      const fixture = C048Admission.createSession({ sessionId: 'session-browser-stale' });
      const text = document.getElementById('candidate-json').value;
      fixture.dispatch({ schema: 'C048/command/1', type: 'inspect', requestId: 'request-inspect', expectedRevision: 0, candidateJSON: text });
      const result = fixture.dispatch({
        schema: 'C048/command/1', type: 'admit', requestId: 'request-stale', expectedRevision: 0, candidateJSON: text
      });
      const snapshot = fixture.read();
      let adoptionCode;
      try { fixture.read(JSON.parse(JSON.stringify(snapshot))); } catch (error) { adoptionCode = error.code; }
      return { code: result.code, active: snapshot.active, counts: snapshot.counts, adoptionCode };
    });
    assert.equal(browserGuard.code, 'STALE_REVISION');
    assert.equal(browserGuard.active, null);
    assert.equal(browserGuard.counts.modeledEffectApplications, 0);
    assert.equal(browserGuard.adoptionCode, 'READ_ONLY_SNAPSHOT');
    checked('real browser factory rejects stale revision and imported-state adoption in a separate modeled private session', browserGuard);

    const beforeReset = await state();
    assert.equal(await page.locator('#archive-reset').getAttribute('type'), 'reset');
    assert.equal(await page.evaluate(() => typeof document.getElementById('admission-form').reset), 'function');
    await activate('Archive and reset');
    await page.waitForFunction(() => document.getElementById('data-api').value === 'getProfile/1' &&
      document.getElementById('implementation').value === 'v1' && document.getElementById('candidate-json').value.includes('C048/candidate/1'));
    const reset = await state();
    assert.match(await page.locator('#status').textContent(), /^RESET/);
    assert.match(await page.locator('#inspection').textContent(), /^NOT INSPECTED/);
    assert.equal(reset.active, null);
    assert.deepEqual(reset.archives[0], beforeReset.active);
    assert.deepEqual(reset.history.slice(0, beforeReset.history.length), beforeReset.history);
    assert.equal(reset.counts.modeledEffectApplications, 3);
    assert.equal(await page.getByLabel('Explicit DATA adapter', { exact: true }).inputValue(), 'none');
    assert.equal(await page.getByLabel('C020 synthetic profile', { exact: true }).inputValue(), 'synthetic-001');
    checked('native keyboard reset restores exact starters without reset shadowing and archives all prior history/effects', {
      archiveCount: reset.archives.length, historyCount: reset.history.length, counts: reset.counts
    });
    await reject('RELEASE_REPLAY', reset, 'Admit locally');
    checked('native reset cannot permit replay of a retained release/work identity', 'RELEASE_REPLAY');

    await page.getByLabel('Synthetic release ID', { exact: true }).fill('release-002');
    await page.getByLabel('C020 source implementation', { exact: true }).selectOption('v2');
    await page.getByLabel('C020 synthetic profile', { exact: true }).selectOption('synthetic-002');
    await activate('Admit locally');
    const second = await state();
    assert.match(await page.locator('#status').textContent(), /^LOCAL ADMITTED/);
    assert.equal(second.counts.admissions, 2);
    assert.equal(second.counts.modeledEffectApplications, 6);
    assert.deepEqual(second.active.eligibility.checks[0].semantics, oldConsumer(getProfileV2({ profileId: 'synthetic-002' })));
    assert.deepEqual(second.active.eligibility.checks[0].semantics.preferences.topics, []);
    assert.deepEqual(second.archives[0], reset.archives[0]);
    checked('actual second profile/v2 uses unchanged catalog semantics including empty topics and a new retained work identity', second.counts);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await activate('Archive and reset');
    await page.waitForFunction(() => document.getElementById('release-id').value === 'release-001');
    const final = await state();
    assert.equal(final.active, null);
    assert.equal(final.archives.length, 2);
    assert.equal(final.counts.modeledEffectApplications, 6);
    await activate('Select session JSON');
    const selected = await page.locator('#session-export').evaluate((element) => ({
      readonly: element.readOnly, focused: document.activeElement === element,
      selected: element.selectionStart === 0 && element.selectionEnd === element.value.length
    }));
    assert.deepEqual(selected, { readonly: true, focused: true, selected: true });
    checked('390px layout and native export/reset retain two jobs, all rejections and six modeled applications', {
      selected, counts: final.counts, archives: final.archives.length, history: final.history.length
    });
    if (capture) {
      const bytes = await page.screenshot({ fullPage: true });
      const file = path.join(evidenceRoot, `browser-${unique}-reset.png`);
      fs.writeFileSync(file, bytes, { flag: 'wx' });
      record.images.push({ path: relative(file), sha256: hash(bytes), observation: 'actual narrow reset retaining history and six modeled applications' });
    }

    const csp = await cspEvidence(page);
    record.cspObservation = { csp, httpRequests, httpResponses, pageErrors };
    console.log('ACTUAL_CSP_OBSERVATION ' + JSON.stringify(record.cspObservation));
    assertCSP(csp);
    assert.deepEqual(httpRequests, []);
    assert.deepEqual(httpResponses, []);
    assert.deepEqual(pageErrors, []);
    checked('actual CSP denies inline code, connections, workers, frames and objects before HTTP/network; no unhandled errors', {
      csp, httpRequests, httpResponses, pageErrors
    });
    record.finalSession = {
      active: final.active, counts: final.counts, archives: final.archives.length,
      history: final.history.length, lastRevision: final.revision,
      rejectionCodes: [...new Set(final.history.filter((entry) => entry.result.outcome === 'rejected').map((entry) => entry.result.code))]
    };
    record.outcome = 'passed';
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = { name: error.name, code: error.code || null, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        await session.close();
        record.cleanup.browserClosed = true;
        record.cleanup.awaitedFinallyClose = true;
      } catch (error) {
        record.cleanup.failure = { message: error.message, stack: error.stack };
        failure = failure ? new AggregateError([failure, error], 'Browser check and exact-session cleanup both failed.') : error;
        record.outcome = 'failed';
      }
    }
    record.finishedAtUtc = new Date().toISOString();
    record.helper.finalSha256 = fileHash(helperPath);
    if (record.helper.finalSha256 !== record.helper.requiredSha256) {
      failure = failure || new Error('Published helper changed during browser qualification.');
      record.outcome = 'failed';
    }
    if (!capture) {
      const after = proofDigest();
      record.readOnlyVerification = { before, after, unchanged: before === after };
      if (before !== after) {
        failure = failure || new Error('Ordinary browser verification changed proof bytes.');
        record.outcome = 'failed';
      }
    }
    if (capture) {
      fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
      console.log(`BROWSER_RECORD ${relative(recordPath)}`);
    } else {
      console.log('READ_ONLY_BROWSER_PROOF unchanged=' + record.readOnlyVerification.unchanged);
    }
    console.log(`BROWSER_${record.outcome.toUpperCase()} checks=${record.checks.length} closed=${record.cleanup.browserClosed}`);
    if (failure) throw failure;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
