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
  const hashes = {};
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false, relative);
    if (entry.isDirectory()) Object.assign(hashes, ownedHashes(path.join(directory, entry.name), relative));
    else {
      assert.equal(entry.isFile(), true, relative);
      hashes[relative] = sha256(fs.readFileSync(path.join(directory, entry.name)));
    }
  }
  return hashes;
}

test('actual isolated S126 DOM, keyboard, error/reset, failure, retirement and CSP', { timeout: 150000 }, async (t) => {
  assert.equal(process.version, 'v22.23.4');
  assert.equal(require(path.join(root, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
  const before = ownedHashes();
  const observations = [];
  const checks = [];
  const failures = [];
  const pageErrors = [];
  const remoteRequests = [];
  const failedAssets = [];
  const session = await openIsolatedLesson(path.join('learning', 'S126', 'index.html'));
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
  const check = (name, action) => t.test(name, async () => {
    try { await action(); checks.push({ name, passed: true }); }
    catch (error) {
      failures.push({ name, message: error.message });
      checks.push({ name, passed: false });
      throw error;
    }
  });
  const observe = async (name, extra = {}) => {
    const observation = await page.evaluate(() => {
      const fields = {};
      for (const id of [
        'phase', 'readiness', 'preview', 'desired', 'observed', 'last-observed', 'routing',
        'lifecycle', 'canary-result', 'promotion-result', 'audit', 'rollback', 'attempted',
        'journeys', 'safe-holds', 'verifier', 'user-impact', 'retirement', 'history-count',
        'archived-count', 'error', 'status',
      ]) {
        const target = document.getElementById(id);
        if (target) fields[id] = target.textContent;
      }
      const rows = (id) => Array.from(document.querySelectorAll(`#${id} > tr`), (row) =>
        Array.from(row.querySelectorAll('td'), (cell) => cell.textContent));
      return {
        fields, previewRows: rows('preview-rows'), requestRows: rows('request-rows'),
        journeyRows: rows('journey-rows'),
        retainedHistory: Array.from(document.querySelectorAll('#history > li'), (item) => item.textContent),
        archivedRunResults: Array.from(document.querySelectorAll('#archives > li > p'), (item) => item.textContent),
        latestFixedData: document.getElementById('data')?.textContent ?? null,
        activeElement: document.activeElement?.id ?? null,
      };
    });
    observations.push({ name, ...observation, ...extra });
  };
  const reset = async (fixture = 'healthy') => {
    await key('reset-button');
    assert.equal(await page.locator('#phase').textContent(), 'baseline');
    assert.equal(await page.locator('#history-count').textContent(), '0 / 20');
    assert.equal(await page.locator('#error').textContent(), '');
    assert.equal(await page.locator('#fixture').evaluate((element) => document.activeElement === element), true);
    await page.locator('#fixture').selectOption(fixture);
  };
  const record = async (fixture = 'healthy') => {
    await reset(fixture);
    await page.locator('#token').press('Enter');
    assert.equal(await page.locator('#phase').textContent(), 'prepared');
  };
  const eligible = async (fixture = 'healthy') => {
    await record(fixture);
    await key('inspect-button');
    assert.equal(await page.locator('#readiness').textContent(), 'pass');
    await key('preview-button');
    assert.equal(await page.locator('#preview').textContent(), 'pass');
  };
  const canary = async (fixture = 'healthy') => {
    await eligible(fixture);
    await page.locator('#allocation').selectOption('80/20/0');
    await key('split-button');
    assert.equal(await page.locator('#phase').textContent(), 'canary-unmeasured');
    await key('measure-button');
    assert.equal(await page.locator('#phase').textContent(), 'canary-measured');
  };
  const promote = async (fixture = 'healthy') => {
    await canary(fixture);
    assert.equal(await page.locator('#canary-result').textContent(), 'pass');
    await page.locator('#allocation').selectOption('0/100/0');
    await key('split-button');
    await key('measure-button');
    assert.equal(await page.locator('#phase').textContent(), 'promotion-measured');
  };
  const reload = async () => {
    await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href, { waitUntil: 'load', timeout: 15000 });
    assert.equal(await page.locator('#phase').textContent(), 'baseline');
  };
  try {
    assert.equal(session.browserVersion, '156.0.4314.50');
    await check('standalone load, exact banner, semantic labels and visible native keyboard focus', async () => {
      assert.equal(await page.title(), 'S126 - Multiple revision rehearsal');
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.getByLabel('Fixed observation fixture', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Candidate software token (exactly v2)', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('Fixed ordinary split (old / canary / preview)', { exact: true }).count(), 1);
      assert.equal(await page.getByRole('alert').count(), 1);
      assert.equal(await page.locator('#status').getAttribute('role'), 'status');
      await page.locator('#fixture').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#token').evaluate((element) => document.activeElement === element), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#prepare-button').evaluate((element) => document.activeElement === element), true);
      const outline = await page.locator('#prepare-button').evaluate((element) => getComputedStyle(element).outlineWidth);
      assert.equal(outline, '3px');
      await observe('standalone-native-keyboard-load', { outline });
    });
    await check('typed token/fixture/allocation errors retain state and safe holds remain visible', async () => {
      await reset();
      for (const invalid of [' v2', 'v2 ', '2', '<script>v2</script>']) {
        await page.locator('#token').fill(invalid);
        await page.locator('#token').press('Enter');
        assert.match(await page.locator('#error').textContent(), /ERR_INPUT.*exactly v2/);
        assert.equal(await page.locator('#phase').textContent(), 'baseline');
        assert.equal(await page.locator('#history > li').count(), 0);
        assert.equal(await page.locator('#token').evaluate((element) => document.activeElement === element), true);
        await observe('typed-invalid-token', { input: invalid });
      }
      await page.locator('#token').fill('v2');
      for (const [id, value, button] of [['fixture', '__proto__', 'prepare-button'], ['allocation', '80/20/0 ', 'split-button']]) {
        await page.locator(`#${id}`).evaluate((select, value) => {
          const option = document.createElement('option'); option.value = value; option.id = 'forged-option';
          select.append(option); select.value = value;
        }, value);
        await key(button);
        assert.match(await page.locator('#error').textContent(), /ERR_INPUT/);
        assert.equal(await page.locator('#history > li').count(), 0);
        await observe('typed-forged-control-option', { control: id, input: value });
        await page.locator('#forged-option').evaluate((element) => element.remove());
        await page.locator(`#${id}`).selectOption(id === 'fixture' ? 'healthy' : '80/20/0');
      }
      await key('retire-button');
      assert.match(await page.locator('#error').textContent(), /Safe hold/);
      assert.equal(await page.locator('#safe-holds').textContent(), '1');
      assert.equal(await page.locator('#attempted').textContent(), '0');
      assert.equal(await page.locator('#preview').textContent(), 'unobserved');
      assert.equal(await page.locator('#lifecycle').textContent(), 'active / active / active');
      await observe('premature-retirement-safe-hold');
    });
    await check('successful probes and software tokens cannot certify failed or unknown readiness', async () => {
      for (const [fixture, expected] of [['probe-only', 'fail'], ['readiness-unknown', 'unknown']]) {
        await record(fixture);
        assert.equal(await page.locator('#readiness').textContent(), 'unobserved');
        assert.equal(await page.locator('#attempted').textContent(), '0');
        await key('inspect-button');
        assert.equal(await page.locator('#readiness').textContent(), expected);
        assert.equal(await page.locator('#phase').textContent(), 'prepared');
        await observe('measured-readiness', { fixture, expected });
        await key('split-button');
        assert.match(await page.locator('#error').textContent(), /Safe hold/);
        assert.equal(await page.locator('#desired').textContent(), 'old 100% / canary 0% / preview 0%');
      }
    });
    await check('selected callback, direct-label denial and unknown preview paths are real independent gates', async () => {
      for (const [fixture, expected] of [['preview-leak', 'fail'], ['callback-broken', 'fail'], ['preview-unknown', 'unknown']]) {
        await record(fixture);
        await key('inspect-button');
        await key('preview-button');
        assert.equal(await page.locator('#preview').textContent(), expected);
        assert.equal(await page.locator('#preview-rows > tr').count(), 7);
        await observe('measured-preview-paths', { fixture, expected });
        await key('split-button');
        assert.equal(await page.locator('#phase').textContent(), 'ready');
        assert.equal(await page.locator('#attempted').textContent(), '0');
        assert.match(await page.locator('#error').textContent(), /preview authorization/);
      }
    });
    await check('weighted canary, measured promotion and independent old gates retire exactly one record', async () => {
      await eligible();
      assert.equal(await page.locator('#preview-rows > tr').count(), 7);
      assert.equal(await page.locator('#preview-rows > tr').nth(5).locator('td').nth(3).textContent(), '403');
      await key('split-button');
      assert.equal(await page.locator('#observed').textContent(), 'unknown — no current routing observation');
      assert.equal(await page.locator('#attempted').textContent(), '0');
      await observe('desired-canary-is-not-observed-routing');
      await key('measure-button');
      assert.equal(await page.locator('#canary-result').textContent(), 'pass');
      assert.equal(await page.locator('#request-rows > tr').count(), 10);
      assert.equal(await page.locator('#attempted').textContent(), '2');
      assert.equal(await page.locator('#journeys').textContent(), 'successful 2 / interrupted 0 / unknown 0');
      assert.match(await page.locator('#user-impact').textContent(), /not proof that all real users migrated/);
      await observe('measured-bounded-canary-not-all-users');
      await page.locator('#allocation').selectOption('0/100/0');
      await key('split-button');
      assert.match(await page.locator('#observed').textContent(), /^unknown/);
      assert.equal(await page.locator('#last-observed').textContent(), 'old 80% / canary 20% / preview 0%');
      await key('measure-button');
      assert.equal(await page.locator('#promotion-result').textContent(), 'pass');
      assert.equal(await page.locator('#attempted').textContent(), '5');
      await key('retire-button');
      assert.equal(await page.locator('#phase').textContent(), 'promotion-measured');
      assert.match(await page.locator('#retirement').textContent(), /held/);
      await observe('zero-old-weight-without-old-audit-held');
      await key('audit-button');
      assert.equal(await page.locator('#audit').textContent(), 'pass');
      await key('retire-button');
      assert.equal(await page.locator('#phase').textContent(), 'retired');
      assert.equal(await page.locator('#lifecycle').textContent(), 'retired / active / active');
      assert.equal(await page.locator('#retirement').textContent(), 'allowed for old teaching record only');
      assert.equal(await page.locator('#journeys').textContent(), 'successful 5 / interrupted 0 / unknown 0');
      assert.equal(await page.locator('#history > li').count(), 10);
      await observe('positive-controlled-teaching-retirement');
      await key('preview-button');
      assert.equal(await page.locator('#phase').textContent(), 'retired');
      assert.equal(await page.locator('#preview').textContent(), 'pass');
      assert.equal(await page.locator('#preview-rows > tr').nth(1).locator('td').nth(4).textContent(), 'fiction-preview-r3');
      assert.equal(await page.locator('#preview-rows > tr').nth(2).locator('td').nth(4).textContent(), 'fiction-canary-r2');
      assert.equal(await page.locator('#preview-rows > tr').nth(5).locator('td').nth(3).textContent(), '403');
      await observe('post-retirement-authorized-preview-paths');
      await key('rollback-button');
      assert.equal(await page.locator('#phase').textContent(), 'retired');
      assert.match(await page.locator('#error').textContent(), /cannot be silently resurrected/);
      await observe('retired-old-cannot-be-rolled-back');
    });
    await check('zero-weight pinned user, unknown routing/journey and pending/unknown old work cannot retire', async () => {
      for (const [fixture, verifier, journeys] of [
        ['preview-after-promotion', 'fail', 'successful 5 / interrupted 0 / unknown 0'],
        ['pinned-old', 'fail', 'successful 4 / interrupted 0 / unknown 1'],
        ['route-unknown', 'unknown', 'successful 5 / interrupted 0 / unknown 0'],
        ['journey-unknown', 'unknown', 'successful 4 / interrupted 0 / unknown 1'],
        ['old-work', 'fail', 'successful 5 / interrupted 0 / unknown 0'],
        ['drain-unknown', 'unknown', 'successful 5 / interrupted 0 / unknown 0'],
      ]) {
        await promote(fixture);
        assert.equal(await page.locator('#desired').textContent(), 'old 0% / canary 100% / preview 0%');
        assert.equal(await page.locator('#attempted').textContent(), '5');
        assert.equal(await page.locator('#journeys').textContent(), journeys);
        if (fixture === 'route-unknown') {
          assert.match(await page.locator('#observed').textContent(), /^unknown/);
          assert.equal(await page.locator('#last-observed').textContent(), 'old 80% / canary 20% / preview 0%');
          assert.equal(await page.locator('#routing').textContent(), 'unknown');
        }
        if (fixture === 'pinned-old') {
          assert.equal(await page.locator('#observed').textContent(), 'old 0% / canary 100% / preview 0%');
          assert.equal(await page.locator('#request-rows > tr').first().locator('td').nth(3).textContent(), 'fiction-old-r1');
          assert.equal(await page.locator('#journey-rows > tr').first().locator('td').last().textContent(), 'unknown');
        }
        if (fixture === 'preview-after-promotion') {
          assert.equal(await page.locator('#routing').textContent(), 'pass');
          assert.equal(await page.locator('#preview').textContent(), 'fail');
          assert.equal(await page.locator('#preview-rows > tr').nth(5).locator('td').nth(3).textContent(), '200');
          await observe('post-promotion-preview-leak-despite-successful-journeys');
        }
        await observe('measured-promotion-with-independent-limit', { fixture });
        await key('audit-button');
        await key('retire-button');
        assert.equal(await page.locator('#verifier').textContent(), verifier);
        assert.equal(await page.locator('#phase').textContent(), 'promotion-measured');
        assert.equal(await page.locator('#lifecycle').textContent(), 'active / active / active');
        assert.match(await page.locator('#retirement').textContent(), /held/);
        await observe('measured-retirement-held', { fixture });
      }
    });
    await check('compatible rollback retains interrupted denominator and reset archives earlier results', async () => {
      await canary('candidate-fault');
      assert.equal(await page.locator('#canary-result').textContent(), 'fail');
      assert.equal(await page.locator('#journeys').textContent(), 'successful 1 / interrupted 1 / unknown 0');
      const history = await page.locator('#history > li').allTextContents();
      await observe('canary-interruption-before-recovery');
      await page.locator('#allocation').selectOption('0/100/0');
      await key('split-button');
      assert.equal(await page.locator('#phase').textContent(), 'canary-measured');
      await key('rollback-button');
      assert.equal(await page.locator('#phase').textContent(), 'rolled-back');
      assert.equal(await page.locator('#rollback').textContent(), 'pass');
      assert.equal(await page.locator('#observed').textContent(), 'old 100% / canary 0% / preview 0%');
      assert.equal(await page.locator('#attempted').textContent(), '4');
      assert.equal(await page.locator('#journeys').textContent(), 'successful 3 / interrupted 1 / unknown 0');
      assert.deepEqual((await page.locator('#history > li').allTextContents()).slice(0, history.length), history);
      assert.match(await page.locator('#user-impact').textContent(), /failures before recovery remain counted/);
      await observe('compatible-rollback-preserves-earlier-failure');
      await reset();
      assert.match(await page.locator('#archives > li > p').last().textContent(), /interrupted 1/);
      await observe('keyboard-reset-archives-interrupted-run');
    });
    await check('incompatible and unknown old state compatibility visibly block rollback', async () => {
      for (const [fixture, expected] of [['rollback-incompatible', 'fail'], ['rollback-unknown', 'unknown']]) {
        await canary(fixture);
        const prior = await page.locator('#journeys').textContent();
        await key('rollback-button');
        assert.equal(await page.locator('#rollback').textContent(), expected);
        assert.equal(await page.locator('#phase').textContent(), 'canary-measured');
        assert.equal(await page.locator('#journeys').textContent(), prior);
        assert.equal(await page.locator('#attempted').textContent(), '2');
        assert.match(await page.locator('#error').textContent(), /compatible state/);
        await observe('rollback-state-compatibility-held', { fixture });
      }
    });
    await check('history cap never prunes and keyboard reset restores baseline focus', async () => {
      await reset();
      for (let index = 0; index < 20; index++) await key('retire-button');
      const history = await page.locator('#history > li').allTextContents();
      assert.equal(history.length, 20);
      await key('inspect-button');
      assert.deepEqual(await page.locator('#history > li').allTextContents(), history);
      assert.match(await page.locator('#error').textContent(), /ERR_LIMIT.*All 20 actions are retained/);
      assert.equal(await page.locator('#reset-button').evaluate((element) => document.activeElement === element), true);
      await observe('twenty-action-history-cap');
      await reset();
      assert.equal(await page.locator('#token').inputValue(), 'v2');
      assert.equal(await page.locator('#allocation').inputValue(), '80/20/0');
      assert.equal(await page.locator('#fixture').isDisabled(), false);
      assert.equal(await page.locator('#archives > li').last().locator(':scope > ol > li').count(), 20);
      await observe('keyboard-reset-retains-full-prior-history');
    });
    await check('a named reset control cannot shadow the prototype form reset', async () => {
      await eligible();
      await page.evaluate(() => {
        const shadow = document.createElement('input');
        shadow.type = 'hidden'; shadow.name = 'reset'; shadow.id = 'reset-shadow';
        document.getElementById('plan-form').append(shadow);
      });
      assert.equal(await page.locator('#plan-form').evaluate((form) => typeof form.reset), 'object');
      await page.locator('#token').fill('wrong');
      await reset();
      assert.equal(await page.locator('#token').inputValue(), 'v2');
      await observe('prototype-reset-survives-reset-name-shadow');
      await page.locator('#reset-shadow').evaluate((element) => element.remove());
    });
    await check('twenty prior reset runs are retained; full archive rejects reset without pruning', async () => {
      await reload();
      for (let index = 0; index < 20; index++) {
        await key('retire-button');
        await reset();
      }
      const archives = await page.locator('#archives > li > p').allTextContents();
      assert.equal(archives.length, 20);
      await key('retire-button');
      await key('reset-button');
      assert.match(await page.locator('#error').textContent(), /All 20 prior runs are retained without pruning/);
      assert.deepEqual(await page.locator('#archives > li > p').allTextContents(), archives);
      assert.equal(await page.locator('#history > li').count(), 1);
      assert.equal(await page.locator('#error').evaluate((element) => document.activeElement === element), true);
      await observe('bounded-reset-archive-limit');
      await reload();
    });
    await check('actual enforced CSP blocks inline script/events/style, eval, connection, image, frame and form', async () => {
      const initialUrl = page.url();
      await page.evaluate(() => {
        const script = document.createElement('script');
        script.src = new URL('evidence/csp-probe.js', globalThis.location.href).href;
        document.body.append(script);
      });
      await page.waitForFunction(() => {
        const probe = globalThis.__s126CspProbe;
        return probe?.done && ['connect-src', 'img-src', 'frame-src', 'form-action'].every(
          (directive) => probe.violations.some((event) => event.effectiveDirective === directive),
        );
      });
      const csp = await page.evaluate(() => globalThis.__s126CspProbe);
      for (const field of ['inlineBlocked', 'inlineEventBlocked', 'inlineStyleBlocked', 'evalBlocked', 'connectionRejected', 'imageRejected']) {
        assert.equal(csp[field], true, field);
      }
      assert.equal(csp.evalErrorName, 'EvalError');
      assert.equal(csp.violations.some((event) => event.blockedURI === 'inline'), true);
      assert.equal(csp.violations.some((event) => event.blockedURI === 'eval'), true);
      assert.equal(csp.violations.every((event) => event.disposition === 'enforce'), true);
      assert.equal(page.url(), initialUrl);
      await observe('actual-csp-enforcement', { csp, navigationUnchanged: true });
    });
    await check('actual missing-model asset failure is visible, controls safe and reload/reset recover', async () => {
      await page.goto(pathToFileURL(path.join(__dirname, 'evidence', 'missing-model.html')).href, { waitUntil: 'load', timeout: 15000 });
      assert.equal(await page.locator('.banner').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal(await page.locator('#phase').textContent(), 'unavailable');
      assert.match(await page.locator('#error').textContent(), /no revision, routing or retirement action was performed/);
      assert.equal(await page.locator('button:not(:disabled), input:not(:disabled), select:not(:disabled)').count(), 0);
      assert.equal(failedAssets.some((asset) => asset.url.endsWith('absent-model.js')), true);
      assert.equal(await page.locator('#error').evaluate((element) => document.activeElement === element), true);
      await observe('actual-missing-local-model-safe-failure', { failedAssets: [...failedAssets] });
      await reload();
      await reset();
      await observe('reload-reset-after-visible-failure');
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
  assert.deepEqual(after, before, 'All existing owned source and raw proof bytes must remain unchanged.');
  if (process.env.CAPTURE_BROWSER_EVIDENCE === '1') {
    const capture = {
      cardId: 'A-S126', sourceId: 'S126', parentId: 'D-S126', packet: 'SC-S126',
      mode: 'portable-synthetic', observedAtUtc: new Date().toISOString(),
      verified: failures.length === 0, checks, failures, observations,
      tooling: { node: process.version, playwright: '1.56.1', browser: session.browserVersion,
        helper: 'testing\\browser\\isolated.cjs at 53c0c0d', helperSha256 },
      rawSourceHashesBefore: before, existingOwnedBytesUnchanged: true, awaitedCleanupCompleted,
      pageErrors, remoteRequests, failedAssets, iac: 'N/A; no IaC generated',
      nativeProofComplete: false, sourceParentComplete: false, productionNode24Validated: false,
      unattendedHelperQualified: false, inactivePrototypeUsed: false,
      kanoUnit: 'A-S126', frozenKano: 'S', extraKanoCredits: 0,
    };
    const filename = `browser-${capture.observedAtUtc.replace(/[:.]/g, '-')}-${crypto.randomUUID()}.json`;
    const relative = path.join('evidence', 'raw', filename);
    fs.writeFileSync(path.join(__dirname, relative), `${JSON.stringify(capture, null, 2)}\n`, { flag: 'wx' });
    console.log(JSON.stringify({ deliberateCapture: relative, verified: capture.verified, checks: checks.length, observations: observations.length, awaitedCleanupCompleted }));
  }
});
