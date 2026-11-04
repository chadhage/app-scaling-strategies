'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const {
  root, repo, HELPER_SHA256, sha, ownedHashes, testedSourceHashes,
} = require('.\\provenance.cjs');
const { BANNER, FIXTURE_IDS, GUARDS } = require('..\\model.js');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
assert.equal(sha(fs.readFileSync(helper)), HELPER_SHA256, 'Only the exact published isolated helper is permitted.');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM: required retirement gates, keyboard, errors, retained original journey, reset, limits and native CSP',
  { timeout: 180000 }, async () => {
    const before = ownedHashes();
    const proof = {
      schemaVersion: 1, cardId: 'A-S150', workerId: 'worker-A-S150',
      mode: 'FIXED_FICTIONAL_TEACHING_DATA', entry: 'learning\\S150\\index.html',
      result: 'FAIL', captureExplicitlyEnabled: capture, startedAtUtc: new Date().toISOString(),
      runtime: process.version, playwrightVersion, helperSha256: HELPER_SHA256,
      testedSourceHashes: testedSourceHashes(), groups: [], observations: [],
      pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [], cspProbeRequests: [],
      cspProbeResponses: [], cspViolations: [], cleanup: {},
      deletionPerformed: false, nativeMigrationObserved: false, productionNode24Validated: false,
      lifecyclePrototypeQualified: false, helperUnattendedCIQualified: false,
    };
    let session;
    let failure;
    let phase = 'tooling-preflight';
    let stage = 'exercise';
    try {
      assert.equal(process.version, 'v22.23.4');
      assert.equal(playwrightVersion, '1.56.1');
      const signature = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', `
        $ErrorActionPreference='Stop'
        $edge=Join-Path \${env:ProgramFiles(x86)} 'Microsoft\\Edge\\Application\\msedge.exe'
        $signature=Get-AuthenticodeSignature -LiteralPath $edge
        @{version=(Get-Item -LiteralPath $edge).VersionInfo.FileVersion;status=[string]$signature.Status;signer=$signature.SignerCertificate.Subject} | ConvertTo-Json -Compress
      `], { cwd: repo, encoding: 'utf8' });
      assert.equal(signature.status, 0, signature.stderr);
      proof.edgeProvenance = JSON.parse(signature.stdout);
      assert.equal(proof.edgeProvenance.version, '156.0.4314.50');
      assert.equal(proof.edgeProvenance.status, 'Valid');
      assert.match(proof.edgeProvenance.signer, /CN=Microsoft Corporation/);
      phase = 'lesson-load';
      session = await openIsolatedLesson('learning\\S150\\index.html');
      proof.browserVersion = session.browserVersion;
      assert.equal(session.browserVersion, '156.0.4314.50');
      const page = session.page;
      page.on('pageerror', (error) => proof.pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
      });
      page.on('request', (request) => {
        if (/^https?:/.test(request.url())) {
          (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.cspProbeRequests).push(request.url());
        }
      });
      page.on('response', (response) => {
        if (/^https?:/.test(response.url()) && stage === 'csp') proof.cspProbeResponses.push(response.url());
      });
      await page.route(/^https?:/, (route) => route.abort('blockedbyclient'));
      await page.setViewportSize({ width: 1100, height: 950 });
      await page.reload({ waitUntil: 'load' });
      phase = 'ui-exercise';
      const text = (id) => page.locator(`#${id}`).textContent();
      const report = async () => JSON.parse(await page.locator('#export-report').inputValue());
      const current = async () => (await report()).current;
      const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
      const press = async (id, key = 'Enter') => {
        await page.locator(`#${id}`).focus();
        await page.keyboard.press(key);
      };
      const reset = async () => { await press('reset-lesson', 'Space'); };
      const begin = async (id) => {
        await page.locator('#fixture').selectOption(id);
        await press('begin-run');
      };
      const action = async (id) => {
        await page.locator('#action').selectOption(id);
        await press('conduct');
      };
      const answer = async (guardId, dependencyId, decision) => {
        await page.locator('#guard').selectOption(guardId);
        await page.locator('#dependency').selectOption(dependencyId);
        await page.locator('#decision').selectOption(decision);
        await press('check-answer', 'Space');
      };
      const observe = async (name) => {
        const state = await report();
        proof.groups.push(name);
        proof.observations.push({
          name, phase: await text('phase'), decision: await text('retirement-decision'),
          inventoryVerifier: await text('inventory-verifier'), controlVerifier: await text('control-verifier'),
          learnerAnswer: await text('answer-verifier'), impact: await text('impact'),
          cleanup: await text('cleanup'), error: await text('input-error'),
          totals: state.totals, historyCount: state.history.length,
          current: state.current ? {
            fixture: state.current.fixture, lifecycle: state.current.lifecycle,
            inventory: state.current.evidence.inventory,
            decision: state.current.latest?.decision ?? null,
            guards: state.current.latest?.guards.map((guard) => ({
              id: guard.id, dependencyId: guard.dependencyId, required: guard.required, status: guard.status,
            })) ?? [],
            userImpact: state.current.latest?.userImpact ?? null,
            attemptDecisions: state.current.attempts.map((attempt) => attempt.decision),
          } : null,
        });
      };
      const defaults = async () => {
        const state = await report();
        assert.equal(state.current, null);
        assert.deepEqual(state.history, []);
        assert.ok(Object.values(state.totals).every((value) => value === 0));
        assert.equal(await text('phase'), 'Lesson: idle');
        assert.equal(await text('retirement-decision'), 'Decision: NOT_CHECKED');
        assert.equal(await text('inventory-verifier'), 'Inventory verifier: NOT_CHECKED');
        assert.equal(await text('control-verifier'), 'Safety-control verifier: NOT_CHECKED');
        assert.equal(await text('answer-verifier'), 'Learner answer: NOT_CHECKED');
        assert.equal(await text('current-proof'), 'No verification recorded.');
        assert.equal(await text('trace-proof'), 'No rehearsal started.');
        assert.equal(await text('history-proof'), 'No archived rehearsals.');
        assert.equal(await page.locator('#input-error').isHidden(), true);
        assert.equal(await text('input-error'), '');
        assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
        assert.equal(await page.locator('#inventory-rows tr').count(), 0);
        assert.equal(await page.locator('#guard-rows tr').count(), 0);
        for (const [id, value] of Object.entries({
          fixture: 'outstanding', action: 'verify', guard: '', dependency: '', decision: '',
        })) assert.equal(await page.locator(`#${id}`).inputValue(), value);
        for (const id of ['current-detail', 'trace-detail', 'history-detail']) {
          assert.equal(await page.locator(`#${id}`).evaluate((node) => node.open), false);
        }
        assert.equal(await page.locator('#begin-run').isEnabled(), true);
        for (const id of ['conduct', 'action', 'guard', 'dependency', 'decision', 'check-answer', 'archive-run']) {
          assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
        }
        for (const id of ['fixture-form', 'action-form', 'answer-form']) {
          assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
          assert.equal(await page.locator(`#${id}`).evaluate((form) => form.elements.namedItem('reset')), null);
        }
        assert.equal(state.deletionPerformed, false);
        assert.equal(state.sourceParentComplete, false);
      };
      assert.equal(await text('training-banner'), BANNER);
      assert.equal(await page.title(), 'S150 · Verify old-version retirement');
      await defaults();
      await reset();
      await focused('fixture');
      await page.keyboard.press('Tab');
      await focused('begin-run');
      const outline = await page.locator('#begin-run').evaluate((node) => getComputedStyle(node).outlineWidth);
      assert.equal(outline, '3px');
      await page.keyboard.press('Enter');
      await focused('action');
      await page.keyboard.press('Tab');
      await focused('conduct');
      await page.keyboard.press('Enter');
      await focused('guard');
      assert.equal((await current()).latest.decision, 'REJECTED');
      assert.ok((await text('signals')).includes('100%'));
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await focused('dependency');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await focused('decision');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await focused('check-answer');
      await page.keyboard.press('Space');
      assert.equal((await current()).latest.learnerCheck.status, 'FAIL', 'Passing routing guard is the wrong deletion-prevention answer.');
      assert.equal((await current()).latest.decision, 'REJECTED');
      await observe('keyboard-conduct-inspect-select-wrong-answer');

      for (const id of FIXTURE_IDS) {
        await reset();
        await begin(id);
        await action('verify');
        const state = await current();
        const result = state.latest;
        const expected = id === 'clear' ? 'SIMULATED_RETIRED' : id === 'unobserved' ? 'HELD_UNVERIFIED' : 'REJECTED';
        assert.equal(result.decision, expected, id);
        assert.equal(await page.locator('#inventory-rows tr').count(), 6, id);
        assert.equal(await page.locator('#guard-rows tr').count(), GUARDS.length, id);
        assert.deepEqual(result.guards.map((guard) => [guard.id, guard.dependencyId]),
          GUARDS.map((guard) => [guard.id, guard.dependencyId]));
        assert.equal(result.controlVerifier.status, 'PASS');
        assert.equal(result.deletionPerformed, false);
        assert.equal(result.migrationCertified, false);
        if (id === 'clear') {
          await answer('no-v1-dependencies', 'all-required-inventory', expected);
          assert.equal(result.userImpact.classification, 'SYNTHETIC_UNINTERRUPTED_TRANSITION');
        } else {
          const guard = result.guards.find((item) => item.status !== 'PASS');
          await answer(guard.id, guard.dependencyId, expected);
          if (id === 'unobserved') {
            assert.equal(result.unknown.length, GUARDS.length);
            assert.ok((await text('inventory-rows')).includes('UNKNOWN (unobserved)'));
          }
          if (id === 'mixed-unknown') {
            assert.ok(result.blocked.includes('work-drain'));
            assert.ok(result.unknown.includes('asset-contracts'));
          }
        }
        assert.equal((await current()).latest.learnerCheck.status, 'PASS', id);
        await observe(`matrix-${id}`);
      }

      await reset();
      await begin('clear');
      await action('verify');
      await focused('guard');
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      await focused('dependency');
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      await focused('decision');
      await page.keyboard.press('End');
      await page.keyboard.press('Tab');
      await focused('check-answer');
      await page.keyboard.press('Space');
      assert.equal((await current()).latest.learnerCheck.status, 'PASS');
      assert.equal(await page.locator('#conduct').isDisabled(), true);
      await observe('keyboard-positive-summary-data-only');

      await reset();
      await begin('outstanding');
      const beforeError = await report();
      await action('record-proofs');
      assert.match(await text('input-error'), /^ERR_STATE:/);
      await focused('input-error');
      assert.equal(await page.locator('#action').getAttribute('aria-invalid'), 'true');
      assert.deepEqual(await report(), beforeError);
      await action('verify');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      await press('check-answer');
      assert.match(await text('input-error'), /^ERR_INPUT:/);
      await focused('input-error');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 3);
      const beforeInvalid = await report();
      await page.evaluate(() => {
        const option = document.createElement('option');
        option.value = '__proto__';
        option.textContent = 'invalid test token';
        document.getElementById('guard').append(option);
        document.getElementById('guard').value = '__proto__';
        document.getElementById('answer-form').requestSubmit();
        option.remove();
      });
      assert.match(await text('input-error'), /^ERR_INPUT:/);
      assert.deepEqual(await report(), beforeInvalid);
      await observe('invalid-input-and-out-of-order-focused-errors');
      for (const id of ['current-detail', 'trace-detail', 'history-detail']) {
        await page.locator(`#${id} summary`).click();
      }
      await reset();
      await defaults();
      await focused('fixture');
      await observe('reset-clears-errors-details-history-and-native-form-defaults');

      await begin('outstanding');
      await action('verify');
      await answer('session-handoff', 'session-v1', 'REJECTED');
      await action('record-proofs');
      await action('verify');
      assert.deepEqual((await current()).latest.blocked, ['rollback-retention']);
      await action('observe-retention-end');
      await action('verify');
      const interrupted = await current();
      assert.equal(interrupted.latest.decision, 'SIMULATED_RETIRED');
      assert.equal(interrupted.latest.userImpact.classification, 'INTERRUPTED_TRANSITION');
      assert.equal(interrupted.latest.userImpact.originalJourneyId, 'journey-order-17');
      assert.equal(interrupted.latest.userImpact.originalBudgetMs, 2500);
      assert.equal(interrupted.latest.userImpact.elapsedMs, 2701);
      assert.deepEqual(interrupted.attempts.map((attempt) => attempt.decision),
        ['REJECTED', 'REJECTED', 'SIMULATED_RETIRED']);
      await press('archive-run');
      await begin('unobserved');
      await action('verify');
      const retained = await report();
      assert.equal(retained.history.length, 1);
      assert.equal(retained.history[0].attempts[0].userImpact.elapsedMs, 2601);
      assert.equal(retained.history[0].evidence.journey.events[0].status, 'ERROR');
      assert.equal(retained.totals.attempts, 4);
      assert.equal(retained.totals.attemptedJourneys, 2);
      assert.equal(retained.totals.interruptedJourneys, 1);
      assert.equal(retained.totals.unverifiedJourneys, 1);
      await page.locator('#history-detail summary').click();
      assert.equal(JSON.parse(await text('history-proof'))[0].attempts[0].decision, 'REJECTED');
      await observe('same-original-journey-earlier-interruption-and-rejected-attempts-retained');

      await reset();
      await begin('routing-remains');
      for (let i = 0; i < 5; i++) await action('verify');
      const beforeBound = await report();
      await action('verify');
      assert.match(await text('input-error'), /^ERR_LIMIT:/);
      assert.deepEqual(await report(), beforeBound);
      await focused('input-error');
      await press('archive-run');
      for (let i = 1; i < 4; i++) {
        await begin('clear');
        await action('verify');
        await press('archive-run');
      }
      assert.equal((await report()).history.length, 4);
      const fullHistory = await report();
      await press('begin-run');
      assert.match(await text('input-error'), /^ERR_LIMIT:/);
      assert.deepEqual(await report(), fullHistory);
      await observe('attempt-and-retained-history-bounds-do-not-evict');
      await reset();
      await defaults();
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('#training-banner').isVisible(), true);
      await page.locator('#export-report').focus();
      await page.keyboard.press('Control+A');
      assert.equal(await page.locator('#export-report').evaluate((node) => node.selectionEnd - node.selectionStart), (await page.locator('#export-report').inputValue()).length);
      assert.equal(await page.locator('#export-report').getAttribute('readonly'), '');
      await observe('responsive-and-keyboard-readable-export-no-download');

      stage = 'csp';
      phase = 'native-csp-probes';
      const originalURL = page.url();
      await page.evaluate(async () => {
        globalThis.__s150Csp = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s150Csp.push({ directive: event.effectiveDirective, blockedURI: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s150InlineExecuted = true';
        document.body.append(script);
        const style = document.createElement('style');
        style.textContent = '#training-banner { display: none !important; }';
        document.head.append(style);
        await fetch('https://example.invalid/s150-csp').catch(() => {});
        const frame = document.createElement('iframe');
        frame.src = 'https://example.invalid/s150-frame';
        document.body.append(frame);
        const object = document.createElement('object');
        object.type = 'text/html';
        object.data = 'https://example.invalid/s150-object';
        document.body.append(object);
        const workerURL = URL.createObjectURL(new Blob(['self.postMessage("unexpected")'], { type: 'text/javascript' }));
        try {
          const worker = new Worker(workerURL);
          worker.terminate();
        } catch {}
        URL.revokeObjectURL(workerURL);
        const base = document.createElement('base');
        base.href = 'https://example.invalid/s150-base/';
        document.head.append(base);
        const form = document.createElement('form');
        form.action = 'https://example.invalid/s150-form';
        form.method = 'post';
        document.body.append(form);
        HTMLFormElement.prototype.submit.call(form);
      });
      await page.waitForTimeout(400);
      proof.cspViolations = await page.evaluate(() => globalThis.__s150Csp);
      const directives = new Set(proof.cspViolations.map((event) => event.directive));
      for (const directive of ['script-src-elem', 'style-src-elem', 'connect-src', 'frame-src',
        'object-src', 'worker-src', 'base-uri', 'form-action']) assert.ok(directives.has(directive), directive);
      assert.equal(await page.evaluate(() => globalThis.__s150InlineExecuted === true), false);
      assert.equal(await page.locator('#training-banner').isVisible(), true);
      assert.equal(page.url(), originalURL);
      assert.equal(await page.evaluate(() => document.baseURI), originalURL);
      assert.deepEqual(proof.cspProbeResponses, []);
      await observe('native-CSP-inline-style-network-frame-object-worker-base-and-form-denials');
      assert.deepEqual(proof.exerciseNetworkRequests, []);
      assert.deepEqual(proof.pageErrors, []);
      assert.deepEqual(proof.consoleErrors.filter((message) => message.stage === 'exercise'), []);
      assert.equal(proof.groups.filter((group) => group.startsWith('matrix-')).length, FIXTURE_IDS.length);
      proof.result = 'PASS';
    } catch (error) {
      failure = error;
      proof.failure = { phase, name: error.name, message: error.message, code: error.code ?? null, stack: error.stack };
    } finally {
      try {
        if (session) {
          await session.close();
          proof.cleanup.awaitedFinallyClose = true;
        } else proof.cleanup.loadFailedBeforeSession = true;
      } catch (error) {
        proof.cleanup.failure = { message: error.message, stack: error.stack };
        proof.result = 'FAIL';
        failure = failure ? new AggregateError([failure, error], 'Browser assertion and cleanup failed') : error;
      }
      proof.finishedAtUtc = new Date().toISOString();
      if (!capture) {
        try {
          assert.deepEqual(ownedHashes(), before, 'Normal verification must preserve all owned source and historical proof bytes.');
          proof.normalVerificationReadOnly = true;
        } catch (error) { failure = failure ? new AggregateError([failure, error], 'Browser and byte integrity failed') : error; }
      } else {
        const name = `browser-${randomUUID()}.raw.json`;
        fs.writeFileSync(path.join(root, 'evidence', name), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
        console.log(`Deliberate unique raw browser capture: learning\\S150\\evidence\\${name} (${proof.result})`);
      }
    }
    if (failure) throw failure;
  });
