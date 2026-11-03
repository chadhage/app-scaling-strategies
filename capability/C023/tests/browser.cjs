'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(root, '..', '..');
const helperPath = path.join(repositoryRoot, 'testing', 'browser', 'isolated.cjs');
const qualifiedHelperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const observedHelperSha256 = crypto.createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
assert.equal(observedHelperSha256, qualifiedHelperSha256, 'Final browser qualification requires the exact published 53c0c0d82cc1 helper, not the abandoned lifecycle prototype.');
const { openIsolatedLesson } = require(helperPath);
const { getProfileV2 } = require('../../C020/profiles.cjs');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const output = path.join(root, 'evidence', 'browser-acceptance-published-helper.json');
const completeImage = path.join(root, 'evidence', 'browser-complete-published-helper.png');
const unknownImage = path.join(root, 'evidence', 'browser-unknown-published-helper.png');
if (capture && [output, completeImage, unknownImage].some((file) => fs.existsSync(file))) {
  throw new Error('Historical browser proof already exists. Ordinary reruns are read-only; do not overwrite or delete proof.');
}
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const record = {
  cardId: 'C023', parents: ['H005', 'P005'], startedAtUtc: new Date().toISOString(),
  mode: 'actual-file-DOM-isolated-headless', captureRequested: capture, outcome: 'not-run',
  testRuntime: process.version, engine: 'Microsoft Edge (Chromium)', checks: [],
  chromiumSandbox: true, unsafeFlagsUsed: false, integratedForegroundLeaseUsed: false,
  qualifications: {
    nativeProof: false, durableStorageImplemented: false, externalEffectsImplemented: false,
    productionNode24Validated: false, cloudCalls: 0, spend: 0
  },
  helper: {
    path: 'testing\\browser\\isolated.cjs', api: 'openIsolatedLesson',
    sha256: observedHelperSha256, requiredSha256: qualifiedHelperSha256,
    publishedCommit: '53c0c0d82cc1db6780a87ac2b1085734af6d5c60',
    publishedPairingQualified: true, abandonedLifecyclePrototypeUsed: false
  },
  sourceHashes: Object.fromEntries(['index.html', 'ledger.js', 'page.js', 'styles.css', 'tests\\browser.cjs'].map((file) =>
    [path.join('capability', 'C023', file), hash(path.join(root, file))])),
  dependencySourceHashes: Object.fromEntries(['contract.js', 'profiles.cjs'].map((file) =>
    [path.join('capability', 'C020', file), hash(path.join(root, '..', 'C020', file))])),
  cleanup: { browserClosed: false, listenersCreated: 0, foregroundLeaseUsed: false }
};
function checked(name, observed) {
  record.checks.push({ name, passed: true, observed });
  console.log(`PASS ${name}`);
}

async function main() {
  let session;
  let failure;
  try {
    assert.equal(typeof openIsolatedLesson, 'function');
    session = await openIsolatedLesson(path.join('capability', 'C023', 'index.html'));
    record.browserVersion = session.browserVersion;
    record.playwrightVersion = require(path.join(repositoryRoot, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
    assert.equal(record.playwrightVersion, '1.56.1');
    assert.match(record.browserVersion, /^156\./);
    const { page } = session;
    const pageErrors = [];
    const networkResponses = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('response', (response) => {
      if (/^https?:/i.test(response.url())) networkResponses.push(response.url());
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !document.getElementById('create-job').disabled);
    const sessionState = async () => JSON.parse(await page.locator('#export-json').inputValue());
    const count = async (id) => Number(await page.locator(`#${id}`).textContent());
    const click = async (name) => page.getByRole('button', { name, exact: true }).click();
    const normalResume = async () => {
      await page.getByLabel('Interruption boundary', { exact: true }).selectOption('none');
      await page.getByRole('button', { name: 'Resume from checkpoint', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#status').textContent(), /^LOCAL MODEL COMPLETE/);
    };
    const archive = async () => {
      await page.getByRole('button', { name: 'Archive and reset', exact: true }).focus();
      await page.keyboard.press('Enter');
      assert.match(await page.locator('#status').textContent(), /^RESET/);
      assert.equal((await sessionState()).active, null);
    };
    const create = async () => {
      await click('Create job');
      assert.match(await page.locator('#status').textContent(), /^READY/);
    };
    assert.match(await page.locator('#status').textContent(), /^NOT RUN/);
    assert.equal((await sessionState()).active, null);
    assert.equal(await page.getByRole('button', { name: 'Run planned job', exact: true }).isDisabled(), true);
    assert.match(await page.locator('main').textContent(), /not a live Azure result/);
    assert.match(await page.locator('main').textContent(), /exactly-once cloud guarantee/);
    checked('file page starts unrun, bounded and explicitly synthetic with no successful observations', 'active=null; run disabled');

    await page.getByLabel('Synthetic job ID', { exact: true }).click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('job-001');
    for (const id of ['work-version', 'profile-id', 'implementation', 'create-job']) {
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), id);
    }
    const outline = await page.locator('#create-job').evaluate((button) => getComputedStyle(button).outlineWidth);
    assert.equal(outline, '3px');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#status').textContent(), /^READY/);
    const initial = (await sessionState()).active;
    assert.equal(await count('planned-count'), 3);
    assert.equal(await count('committed-count'), 0);
    assert.equal(await page.getByLabel('Synthetic job ID', { exact: true }).isDisabled(), true);
    assert.equal(await page.locator('#effects tr').count(), 3);
    checked('actual Tab/Enter creates an explicit versioned job; labels, visible focus, plan and immutable config are usable', {
      workId: initial.plan.workId, workVersion: initial.plan.workVersion, outline, plannedEffects: 3
    });

    await page.getByRole('button', { name: 'Run planned job', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#status').textContent(), /^INTERRUPTED/);
    assert.equal(await count('committed-count'), 1);
    assert.equal(await count('application-count'), 1);
    assert.equal(await count('checkpoint-count'), 0);
    assert.equal(await count('checkpoint-next'), 0);
    const cut = (await sessionState()).active;
    assert.equal(cut.view.attempts[0].outcome, 'interrupted');
    checked('actual DOM interrupts after local commit and before acknowledgment/checkpoint', cut.view.counters);

    await click('Resume from checkpoint');
    assert.match(await page.locator('#status').textContent(), /^REJECTED — UNREACHABLE_INTERRUPTION/);
    assert.deepEqual((await sessionState()).active, cut);
    assert.equal(await page.locator('#error').getAttribute('role'), 'alert');
    checked('unreachable repeat-commit target rejects visibly and preserves the exact original job', 'UNREACHABLE_INTERRUPTION');

    const tampered = JSON.parse(JSON.stringify(cut));
    tampered.view.checkpointNext = 1;
    await page.getByLabel('Candidate job snapshot JSON', { exact: true }).fill(JSON.stringify(tampered));
    await click('Inspect snapshot without replacing active job');
    assert.match(await page.locator('#snapshot-status').textContent(), /^REJECTED — INVALID_STATE/);
    assert.deepEqual((await sessionState()).active, cut);
    for (const text of ['{', '', '<img src=x onerror=alert(1)>']) {
      await page.getByLabel('Candidate job snapshot JSON', { exact: true }).fill(text);
      await click('Inspect snapshot without replacing active job');
      assert.match(await page.locator('#status').textContent(), /^REJECTED — INVALID_SNAPSHOT/);
    }
    assert.equal(await page.locator('img').count(), 0);
    checked('actual snapshot inspector rejects forged checkpoint, malformed/empty JSON and markup without stale success or script injection', 'active committed=1, checkpoint=0 unchanged');

    await page.getByLabel('Candidate job snapshot JSON', { exact: true }).fill(JSON.stringify(initial));
    await click('Inspect snapshot without replacing active job');
    assert.match(await page.locator('#snapshot-status').textContent(), /^VALID LOCAL SNAPSHOT — ready; 0 known commits. READ ONLY/);
    assert.deepEqual((await sessionState()).active, cut);
    assert.equal(await count('committed-count'), 1);
    checked('valid older zero-commit snapshot is read-only and cannot silently erase a known live commit', 'active snapshot byte-equivalent to original cut');

    const inspectionCount = (await sessionState()).readOnlyInspections.length;
    await page.getByLabel('Candidate job snapshot JSON', { exact: true }).fill('{');
    assert.match(await page.locator('#snapshot-status').textContent(), /^NOT INSPECTED — candidate changed/);
    assert.match(await page.locator('#status').textContent(), /^CANDIDATE CHANGED/);
    assert.equal((await sessionState()).readOnlyInspections.length, inspectionCount);
    assert.deepEqual((await sessionState()).active, cut);
    checked('editing candidate JSON invalidates stale successful inspection while retaining the original observation and active job', 'NOT INSPECTED; history retained');

    await normalResume();
    const complete = (await sessionState()).active;
    assert.equal(await count('committed-count'), 3);
    assert.equal(await count('application-count'), 3);
    assert.equal(await count('suppressed-count'), 1);
    assert.equal(await count('checkpoint-next'), 3);
    assert.equal(new Set(complete.view.applications.map((entry) => entry.effectKey)).size, 3);
    assert.deepEqual(complete.journal[0], cut.journal[0]);
    assert.deepEqual(complete.view.attempts[0], cut.view.attempts[0]);
    assert.equal(complete.view.attempts[1].outcome, 'complete');
    assert.equal(await page.getByRole('button', { name: 'Resume from checkpoint', exact: true }).isDisabled(), true);
    assert.match(await page.locator('#attempts').textContent(), /original outcome interrupted/);
    if (capture) await page.screenshot({ path: completeImage, fullPage: true });
    checked('keyboard resume suppresses the known post-checkpoint duplicate and preserves original interruption evidence', complete.view.counters);

    const rejectedBeforeReset = (await sessionState()).rejections.length;
    await archive();
    const reset = await sessionState();
    assert.equal(reset.archives.length, 1);
    assert.deepEqual(reset.archives[0].state, complete);
    assert.equal(reset.rejections.length, rejectedBeforeReset);
    assert.equal(await count('session-applications'), 3);
    assert.equal(await page.getByLabel('Synthetic job ID', { exact: true }).inputValue(), 'job-002');
    assert.equal(await page.locator('#snapshot-input').inputValue(), '');
    assert.equal(await page.locator('#error').isHidden(), true);
    checked('keyboard archive/reset retains exact original job, effects and rejected-operation history', {
      archives: reset.archives.length, retainedRejections: reset.rejections.length, retainedApplications: 3
    });

    await page.getByLabel('Synthetic job ID', { exact: true }).fill('');
    await click('Create job');
    assert.match(await page.locator('#status').textContent(), /^REJECTED — INVALID_JOB_ID/);
    assert.equal(await page.locator('#committed-count').textContent(), '—');
    assert.equal((await sessionState()).active, null);
    assert.equal((await sessionState()).archives.length, 1);
    await page.getByLabel('Synthetic job ID', { exact: true }).fill('job-001');
    await click('Create job');
    assert.match(await page.locator('#status').textContent(), /^REJECTED — WORK_ID_REUSED/);
    await page.getByRole('button', { name: 'Archive and reset', exact: true }).click();
    assert.equal((await sessionState()).archives.length, 1);
    assert.ok((await sessionState()).rejections.length > rejectedBeforeReset);
    checked('empty identity and retained work-identity reuse reject; repeated reset does not delete history or duplicate archives', 'INVALID_JOB_ID and WORK_ID_REUSED');

    await page.getByLabel('C020 synthetic profile', { exact: true }).selectOption('synthetic-002');
    await page.getByLabel('C020 source implementation', { exact: true }).selectOption('v2');
    await create();
    const v2 = (await sessionState()).active;
    const actualV2 = getProfileV2({ profileId: 'synthetic-002' });
    assert.deepEqual(v2.plan.source.profile, actualV2.profile);
    assert.deepEqual(v2.plan.source.stamp, actualV2.stamp);
    checked('file UI reuses real C020 second profile/v2 lineage without a copied catalog or new HTTP observation', v2.plan.source);

    await page.getByLabel('Interruption boundary', { exact: true }).selectOption('unknown-ack');
    await page.getByLabel('Effect to interrupt', { exact: true }).selectOption('1');
    await click('Run planned job');
    assert.match(await page.locator('#status').textContent(), /^UNKNOWN/);
    assert.equal(await count('committed-count'), 1);
    assert.equal(await count('checkpoint-next'), 1);
    assert.equal(await count('unknown-count'), 1);
    assert.equal(await page.getByRole('button', { name: 'Resume from checkpoint', exact: true }).isDisabled(), true);
    assert.match(await page.locator('#result-note').textContent(), /known lower bound/);
    assert.match(await page.locator('#effects').textContent(), /UNKNOWN — reconcile; not counted as committed/);
    const unknown = (await sessionState()).active;
    if (capture) await page.screenshot({ path: unknownImage, fullPage: true });
    checked('unknown acknowledgment stays explicitly unknown, not committed; real UI blocks retries', unknown.view.counters);

    await click('Record synthetic observation');
    assert.match(await page.locator('#status').textContent(), /^UNKNOWN/);
    assert.equal(await count('unknown-count'), 1);
    assert.equal(await count('committed-count'), 1);
    assert.equal(await page.getByRole('button', { name: 'Resume from checkpoint', exact: true }).isDisabled(), true);
    checked('still-unknown synthetic observation neither invents a commit nor enables resume', 'unknown=1 known=1 retry disabled');

    await page.getByLabel('Synthetic reconciliation observation', { exact: true }).selectOption('observed-committed');
    await click('Record synthetic observation');
    assert.match(await page.locator('#status').textContent(), /^SYNTHETIC RECONCILIATION ONLY/);
    assert.equal(await count('unknown-count'), 0);
    assert.equal(await count('committed-count'), 2);
    assert.equal(await count('checkpoint-next'), 1);
    await normalResume();
    const resolved = (await sessionState()).active;
    assert.equal(resolved.view.counters.effectApplications, 3);
    assert.equal(resolved.view.counters.duplicateSuppressions, 1);
    assert.equal(resolved.view.attempts[0].outcome, 'unknown');
    assert.equal(resolved.view.ledger[1].origin, 'synthetic-reconciliation');
    assert.deepEqual(resolved.journal[0], unknown.journal[0]);
    checked('explicit synthetic committed observation is provenance-labeled; resume suppresses it once and retains original unknown', resolved.view.counters);

    await archive();
    await create();
    await page.getByLabel('Interruption boundary', { exact: true }).selectOption('unknown-ack');
    await click('Run planned job');
    assert.equal(await count('committed-count'), 0);
    await page.getByLabel('Synthetic reconciliation observation', { exact: true }).selectOption('observed-absent');
    await click('Record synthetic observation');
    assert.equal(await count('committed-count'), 0);
    await normalResume();
    const absent = (await sessionState()).active;
    assert.equal(absent.view.counters.effectApplications, 3);
    assert.equal(absent.view.counters.duplicateSuppressions, 0);
    assert.equal(absent.view.attempts[0].outcome, 'unknown');
    checked('synthetic absent observation records no commit and permits one modeled retry per effect', absent.view.counters);

    for (const boundary of ['before-commit', 'after-commit', 'before-checkpoint', 'after-checkpoint']) {
      await archive();
      await create();
      await page.getByLabel('Interruption boundary', { exact: true }).selectOption(boundary);
      await page.getByLabel('Effect to interrupt', { exact: true }).selectOption('1');
      await click('Run planned job');
      const before = (await sessionState()).active;
      assert.equal(before.view.counters.effectApplications, boundary === 'before-commit' ? 1 : 2);
      assert.equal(before.view.checkpointNext, boundary === 'after-checkpoint' ? 2 : 1);
      if (boundary === 'after-checkpoint') {
        await page.getByLabel('Effect to interrupt', { exact: true }).selectOption('0');
        await click('Resume from checkpoint');
        assert.match(await page.locator('#status').textContent(), /^REJECTED — INVALID_INTERRUPTION_TARGET/);
        assert.deepEqual((await sessionState()).active, before);
      }
      await normalResume();
      const after = (await sessionState()).active;
      assert.equal(after.view.counters.effectApplications, 3);
      assert.equal(after.view.counters.committedEffects, 3);
      assert.equal(after.view.counters.duplicateSuppressions, ['after-commit', 'before-checkpoint'].includes(boundary) ? 1 : 0);
      assert.deepEqual(after.journal[0], before.journal[0]);
      assert.equal(after.view.attempts[0].outcome, 'interrupted');
      checked(`actual file DOM ${boundary} cut and failure-resume preserve effect counts and history`, after.view.counters);
    }

    await click('Copy active snapshot into inspector');
    await click('Inspect snapshot without replacing active job');
    assert.match(await page.locator('#snapshot-status').textContent(), /^VALID LOCAL SNAPSHOT — complete/);
    checked('copyable completed snapshot replays and validates through the real inspector without replacing active state', 'complete known commits=3');

    const csp = await page.evaluate(async () => {
      const violations = [];
      const listener = (event) => violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      document.addEventListener('securitypolicyviolation', listener);
      const script = document.createElement('script');
      script.textContent = 'globalThis.__c023InlineExecuted = true;';
      document.head.append(script);
      let fetchRejected = false;
      try { await fetch('https://example.invalid/c023-blocked'); } catch { fetchRejected = true; }
      await new Promise((resolve) => setTimeout(resolve, 100));
      document.removeEventListener('securitypolicyviolation', listener);
      script.remove();
      return { violations, fetchRejected, inlineExecuted: globalThis.__c023InlineExecuted === true };
    });
    assert.equal(csp.fetchRejected, true);
    assert.equal(csp.inlineExecuted, false);
    assert.ok(csp.violations.some((violation) => violation.directive.startsWith('script-src') && violation.blocked === 'inline'));
    assert.ok(csp.violations.some((violation) => violation.directive === 'connect-src'));
    assert.deepEqual(networkResponses, []);
    checked('actual CSP blocks inline code and outbound connection attempt before any HTTP response; no unsafe bypass', csp);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.getByRole('button', { name: 'Archive and reset', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Create job', exact: true }).isEnabled(), true);
    assert.equal((await sessionState()).archives.length, 7);
    assert.equal(await count('session-applications'), 21);
    checked('narrow viewport stays within page width and keyboard reset retains all seven jobs and 21 known applications', '390px; no page-level horizontal overflow');
    assert.deepEqual(pageErrors, []);
    checked('expected failures are handled without uncaught browser errors or unowned HTTP responses', { pageErrors, networkResponses });
    record.outcome = 'passed';
    record.finalSession = {
      archivedJobs: (await sessionState()).archives.length,
      knownRetainedApplications: await count('session-applications'),
      retainedRejections: (await sessionState()).rejections.length
    };
  } catch (error) {
    failure = error;
    record.outcome = 'failed';
    record.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try { await session.close(); record.cleanup.browserClosed = true; }
      catch (error) {
        failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
        record.outcome = 'failed';
        record.cleanup.error = error.message;
      }
    }
    record.finishedAtUtc = new Date().toISOString();
    record.checksPassed = record.checks.length;
    if (capture) {
      record.screenshots = [completeImage, unknownImage].filter((file) => fs.existsSync(file)).map((file) => ({
        path: path.relative(repositoryRoot, file), sha256: hash(file)
      }));
      fs.writeFileSync(output, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
    }
  }
  if (failure) throw failure;
  console.log(`Actual browser GREEN: ${record.checksPassed} checks; Edge ${record.browserVersion}; Playwright ${record.playwrightVersion}; browserClosed=${record.cleanup.browserClosed}; historicalProofWritten=${capture}.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
