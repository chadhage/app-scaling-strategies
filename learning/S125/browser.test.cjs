'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const helperPath = path.join(root, 'testing', 'browser', 'isolated.cjs');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const helperSha256 = sha256(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);

function ownedHashes(directory = __dirname, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) Object.assign(result, ownedHashes(path.join(directory, entry.name), relative));
    else {
      assert.equal(entry.isFile(), true);
      result[relative] = sha256(fs.readFileSync(path.join(directory, entry.name)));
    }
  }
  return result;
}

test('actual isolated S125 DOM, keyboard, results, error/reset, failure and CSP', { timeout: 120000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const before = ownedHashes();
  const observations = [];
  const failures = [];
  const pageErrors = [];
  const remoteRequests = [];
  const failedAssets = [];
  const checks = [];
  const check = (name, action) => t.test(name, async () => {
    try {
      await action();
      checks.push({ name, passed: true });
    } catch (error) {
      failures.push({ name, message: error.message });
      checks.push({ name, passed: false });
      throw error;
    }
  });
  const session = await openIsolatedLesson(path.join('learning', 'S125', 'index.html'));
  const page = session.page;
  let awaitedCleanupCompleted = false;
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/^(https?|wss?):/i.test(request.url())) remoteRequests.push(request.url());
  });
  page.on('requestfailed', (request) => failedAssets.push({ url: request.url(), error: request.failure()?.errorText }));
  const key = async (id) => {
    await page.locator(`#${id}`).focus();
    await page.keyboard.press('Enter');
  };
  const reset = async (fixture = 'ready') => {
    await key('reset-button');
    assert.equal(await page.locator('#phase').textContent(), 'baseline');
    assert.equal(await page.locator('#history-count').textContent(), '0 / 12');
    assert.equal(await page.locator('#fixture').evaluate((element) => document.activeElement === element), true);
    await page.locator('#fixture').selectOption(fixture);
  };
  const record = async (fixture = 'ready') => {
    await reset(fixture);
    await page.locator('#candidate-version').press('Enter');
    assert.equal(await page.locator('#phase').textContent(), 'awaiting-readiness');
  };
  const prepared = async (fixture = 'ready') => {
    await record(fixture);
    await key('readiness-button');
    assert.equal(await page.locator('#phase').textContent(), 'ready-awaiting-traffic');
  };
  const switched = async (fixture = 'ready') => {
    await prepared(fixture);
    await key('traffic-button');
    assert.equal(await page.locator('#phase').textContent(), 'switched-awaiting-continuity');
  };
  const observe = async (name, extra = {}) => {
    const data = await page.evaluate(() => {
      const fields = {};
      for (const id of [
        'phase', 'candidate', 'readiness', 'traffic-result', 'traffic', 'last-traffic',
        'old-lifecycle', 'candidate-lifecycle', 'replica-target', 'change-kind',
        'sessions', 'work', 'attempted', 'journeys', 'safe-holds', 'completed', 'outcome', 'error', 'status',
      ]) {
        const element = document.getElementById(id);
        if (element) fields[id] = element.textContent;
      }
      return {
        fields, retainedHistory: Array.from(document.querySelectorAll('#history > li'), (element) => element.textContent),
        latestFixedData: document.getElementById('observations')?.textContent ?? null,
      };
    });
    observations.push({ name, ...data, ...extra });
  };
  try {
    assert.equal(session.browserVersion, '156.0.4314.50');
    await check('standalone load, exact banner, labels and native keyboard focus', async () => {
      assert.equal(await page.title(), 'S125 - Single ACA revision rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fixed observation fixture', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Candidate software token (exactly v2)', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.getByRole('status').count(), 1);
      await page.locator('#fixture').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#candidate-version').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#update-button').evaluate((element) => document.activeElement === element), true);
      const outline = await page.locator('#update-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outline, '3px');
      assert.equal(await page.locator('#phase').textContent(), 'baseline');
      await observe('standalone-keyboard-load', { outline });
    });
    await check('typed errors retain baseline/history and semantic guards are visible', async () => {
      await reset();
      for (const invalid of [' v2', 'v2 ', '2', '<script>v2</script>']) {
        await page.locator('#candidate-version').fill(invalid);
        await page.locator('#candidate-version').press('Enter');
        assert.match(await page.locator('#error').textContent(), /exactly v2/);
        assert.equal(await page.locator('#phase').textContent(), 'baseline');
        assert.equal(await page.locator('#history > li').count(), 0);
        assert.equal(await page.locator('#candidate-version').evaluate((element) => document.activeElement === element), true);
        await observe('invalid-token', { input: invalid });
      }
      await page.locator('#candidate-version').fill('v2');
      await key('traffic-button');
      assert.match(await page.locator('#error').textContent(), /Safe hold/);
      assert.equal(await page.locator('#safe-holds').textContent(), '1');
      assert.equal(await page.locator('#traffic').textContent(), 'old 100% / candidate 0%');
      assert.equal(await page.locator('#attempted').textContent(), '0');
      await observe('premature-traffic-safe-hold');
      await reset();
      assert.equal(await page.locator('#error').textContent(), '');
    });
    await check('nominal update keeps old route and cannot claim readiness or traffic', async () => {
      await record();
      assert.equal(await page.locator('#readiness').textContent(), 'unobserved');
      assert.equal(await page.locator('#traffic-result').textContent(), 'unobserved');
      assert.equal(await page.locator('#traffic').textContent(), 'old 100% / candidate 0%');
      assert.equal(await page.locator('#old-lifecycle').textContent(), 'active');
      assert.equal(await page.locator('#candidate').textContent(), 'lesson-api--r2 / fictional-image-v2');
      assert.equal(await page.locator('#replica-target').textContent(), '2 before / 2 after');
      assert.match(await page.locator('#change-kind').textContent(), /not compute-capacity scaling/);
      assert.equal(await page.locator('#completed').textContent(), 'false');
      assert.equal(await page.locator('#fixture').isDisabled(), true);
      await observe('nominal-update-is-not-observed-transition');
    });
    await check('ready permits but does not observe replacement; independent switch and continuity', async () => {
      await key('readiness-button');
      assert.equal(await page.locator('#readiness').textContent(), 'positive');
      assert.equal(await page.locator('#traffic-result').textContent(), 'unobserved');
      assert.equal(await page.locator('#old-lifecycle').textContent(), 'active');
      assert.equal(await page.locator('#traffic').textContent(), 'old 100% / candidate 0%');
      await observe('readiness-positive-no-switch-yet');
      await key('traffic-button');
      assert.equal(await page.locator('#traffic-result').textContent(), 'positive');
      assert.equal(await page.locator('#traffic').textContent(), 'old 0% / candidate 100%');
      assert.equal(await page.locator('#old-lifecycle').textContent(), 'inactive');
      assert.equal(await page.locator('#sessions').textContent(), 'unobserved');
      assert.equal(await page.locator('#work').textContent(), 'unobserved');
      assert.equal(await page.locator('#completed').textContent(), 'false');
      await observe('observed-switch-continuity-still-unverified');
      await key('continuity-button');
      assert.equal(await page.locator('#phase').textContent(), 'verified-synthetic');
      assert.equal(await page.locator('#sessions').textContent(), 'positive');
      assert.equal(await page.locator('#work').textContent(), 'positive');
      assert.equal(await page.locator('#attempted').textContent(), '2');
      assert.equal(await page.locator('#journeys').textContent(), '2 / 0 / 0');
      assert.equal(await page.locator('#completed').textContent(), 'true');
      assert.equal(await page.locator('#history > li').count(), 4);
      await observe('independently-verified-synthetic-continuity');
    });
    await check('failed and unknown readiness keep old active at 100% without traffic claims', async () => {
      for (const fixture of ['provision-failed', 'replicas-short', 'startup-failed', 'probe-failed', 'readiness-unknown']) {
        await record(fixture);
        await key('readiness-button');
        const expected = fixture === 'readiness-unknown' ? 'unknown' : 'negative';
        assert.equal(await page.locator('#readiness').textContent(), expected);
        assert.equal(await page.locator('#outcome').textContent(), expected);
        assert.equal(await page.locator('#old-lifecycle').textContent(), 'active');
        assert.equal(await page.locator('#traffic').textContent(), 'old 100% / candidate 0%');
        await observe(fixture);
        await key('traffic-button');
        assert.equal(await page.locator('#traffic-result').textContent(), 'unobserved');
        assert.equal(await page.locator('#attempted').textContent(), '0');
        assert.equal(await page.locator('#completed').textContent(), 'false');
        assert.equal(await page.locator('#history > li').count(), 3);
      }
    });
    await check('mismatching or unknown current traffic does not masquerade as replacement', async () => {
      for (const [fixture, result, route, lifecycle] of [
        ['traffic-mismatch', 'negative', 'old 100% / candidate 0%', 'active'],
        ['traffic-unknown', 'unknown', 'unknown', 'unknown'],
      ]) {
        await prepared(fixture);
        await key('traffic-button');
        assert.equal(await page.locator('#traffic-result').textContent(), result);
        assert.equal(await page.locator('#traffic').textContent(), route);
        assert.equal(await page.locator('#old-lifecycle').textContent(), lifecycle);
        assert.equal(await page.locator('#last-traffic').textContent(), 'old 100% / candidate 0%');
        await observe(fixture);
        await key('continuity-button');
        assert.equal(await page.locator('#attempted').textContent(), '0');
        assert.equal(await page.locator('#completed').textContent(), 'false');
      }
    });
    await check('session failures and old-work failures/unknowns remain independent measured results', async () => {
      for (const [fixture, sessions, work, outcome, journeys] of [
        ['session-lost', 'negative', 'positive', 'negative', '1 / 1 / 0'],
        ['work-interrupted', 'positive', 'negative', 'negative', '2 / 0 / 0'],
        ['work-unknown', 'positive', 'unknown', 'unknown', '2 / 0 / 0'],
        ['journey-unknown', 'unknown', 'positive', 'unknown', '1 / 0 / 1'],
        ['latency-breach', 'negative', 'positive', 'negative', '1 / 1 / 0'],
      ]) {
        await switched(fixture);
        await key('continuity-button');
        assert.equal(await page.locator('#sessions').textContent(), sessions);
        assert.equal(await page.locator('#work').textContent(), work);
        assert.equal(await page.locator('#outcome').textContent(), outcome);
        assert.equal(await page.locator('#attempted').textContent(), '2');
        assert.equal(await page.locator('#journeys').textContent(), journeys);
        assert.equal(await page.locator('#completed').textContent(), 'false');
        await observe(fixture);
        const originalHistory = await page.locator('#history > li').allTextContents();
        await key('continuity-button');
        assert.deepEqual((await page.locator('#history > li').allTextContents()).slice(0, 4), originalHistory);
        assert.equal(await page.locator('#journeys').textContent(), journeys);
        assert.equal(await page.locator('#completed').textContent(), 'false');
      }
    });
    await check('history bound retains twelve actions and keyboard reset restores state/focus', async () => {
      await reset();
      for (let index = 0; index < 12; index++) await key('traffic-button');
      const history = await page.locator('#history > li').allTextContents();
      assert.equal(history.length, 12);
      await key('traffic-button');
      assert.deepEqual(await page.locator('#history > li').allTextContents(), history);
      assert.match(await page.locator('#error').textContent(), /All 12 actions are retained/);
      assert.equal(await page.locator('#reset-button').evaluate((element) => document.activeElement === element), true);
      await observe('history-limit-safe-error');
      await reset();
      assert.equal(await page.locator('#candidate-version').inputValue(), 'v2');
      assert.equal(await page.locator('#fixture').isDisabled(), false);
      assert.equal(await page.locator('#traffic').textContent(), 'old 100% / candidate 0%');
      assert.equal(await page.locator('#completed').textContent(), 'false');
      await observe('keyboard-reset');
    });
    await check('a control named reset does not shadow the real reset operation', async () => {
      await page.evaluate(() => {
        const shadow = document.createElement('input');
        shadow.name = 'reset';
        shadow.id = 'reset-shadow';
        shadow.type = 'hidden';
        document.getElementById('candidate-form').append(shadow);
      });
      assert.equal(await page.locator('#candidate-form').evaluate((form) => typeof form.reset), 'object');
      await page.locator('#candidate-version').fill('wrong');
      await key('reset-button');
      assert.equal(await page.locator('#candidate-version').inputValue(), 'v2');
      assert.equal(await page.locator('#fixture').evaluate((element) => document.activeElement === element), true);
      await observe('prototype-reset-survives-shadow');
      await page.locator('#reset-shadow').evaluate((element) => element.remove());
    });
    await check('actual CSP blocks script/event/style, eval, connection, image, frame and form attempts', async () => {
      const initialUrl = page.url();
      await page.evaluate(() => {
        const probe = document.createElement('script');
        probe.src = new URL('evidence/csp-probe.js', globalThis.location.href).href;
        document.body.append(probe);
      });
      await page.waitForFunction(() => {
        const probe = globalThis.__s125CspProbe;
        return probe?.done && ['connect-src', 'img-src', 'frame-src', 'form-action'].every(
          (directive) => probe.violations.some((violation) => violation.effectiveDirective === directive),
        );
      });
      const csp = await page.evaluate(() => globalThis.__s125CspProbe);
      assert.equal(csp.inlineBlocked, true);
      assert.equal(csp.inlineEventBlocked, true);
      assert.equal(csp.evalBlocked, true);
      assert.equal(csp.evalErrorName, 'EvalError');
      assert.equal(csp.inlineStyleBlocked, true);
      assert.equal(csp.connectionRejected, true);
      assert.equal(csp.imageRejected, true);
      assert.equal(page.url(), initialUrl);
      assert.equal(csp.violations.some((violation) => violation.blockedURI === 'eval'), true);
      assert.equal(csp.violations.some((violation) => violation.blockedURI === 'inline'), true);
      assert.equal(csp.violations.every((violation) => violation.disposition === 'enforce'), true);
      await observe('actual-csp-enforcement', { csp, navigationUnchanged: true });
    });
    await check('missing local model fails visibly and normal reload/reset recovers safely', async () => {
      await page.goto(pathToFileURL(path.join(__dirname, 'evidence', 'missing-model.html')).href, { waitUntil: 'load', timeout: 15000 });
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#phase').textContent(), 'unavailable');
      assert.match(await page.locator('#error').textContent(), /no update was performed/);
      assert.equal(await page.locator('button:not(:disabled)').count(), 0);
      assert.equal(failedAssets.some((asset) => asset.url.endsWith('model-missing.js')), true);
      await observe('actual-missing-model-safe-failure', { failedAssets: [...failedAssets] });
      await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, { waitUntil: 'load', timeout: 15000 });
      await reset();
      assert.equal(await page.locator('#error').textContent(), '');
      await observe('reload-and-keyboard-reset-after-safe-failure');
    });
    await check('no unexpected page exceptions or HTTP/WebSocket requests', async () => {
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(remoteRequests, []);
    });
  } finally {
    await session.close();
    awaitedCleanupCompleted = true;
  }
  const after = ownedHashes();
  for (const [file, hash] of Object.entries(before)) assert.equal(after[file], hash, `Existing owned bytes changed: ${file}`);
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    assert.deepEqual(after, before);
    const capture = {
      cardId: 'A-S125', sourceId: 'S125', parentId: 'D-S125', packet: 'SC-S125',
      mode: 'portable-synthetic', observedAtUtc: new Date().toISOString(),
      verified: failures.length === 0, checks, failures, observations,
      tooling: { node: process.version, playwright: '1.56.1', browser: session.browserVersion,
        helper: 'testing\\browser\\isolated.cjs at 53c0c0d', helperSha256 },
      rawSourceHashesBefore: before, existingOwnedBytesUnchanged: true, awaitedCleanupCompleted,
      pageErrors, remoteRequests, failedAssets, iac: 'N/A; no IaC generated',
      nativeProofComplete: false, sourceParentComplete: false, productionNode24Validated: false,
      unattendedHelperQualified: false, inactivePrototypeUsed: false,
      kanoUnit: 'A-S125', frozenKano: 'S', extraKanoCredits: 0,
    };
    const name = `browser-${capture.observedAtUtc.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
    const relative = path.join('evidence', 'raw', name);
    fs.writeFileSync(path.join(__dirname, relative), `${JSON.stringify(capture, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ deliberateCapture: relative, verified: capture.verified, checks: checks.length, awaitedCleanupCompleted }));
  } else {
    assert.deepEqual(after, before, 'Normal verification must be read-only, even when capture env is truthy but not exactly 1.');
  }
});
