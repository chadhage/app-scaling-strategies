'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const directory = __dirname;
const repo = path.resolve(directory, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const pinnedHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
assert.equal(hash(helper), pinnedHash, 'only the exact published helper is authorized');
const { openIsolatedLesson } = require(helper);
const tooling = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json'));
const evidence = path.join(directory, 'evidence');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const historicalHashes = () => Object.fromEntries(fs.readdirSync(evidence)
  .filter((name) => fs.statSync(path.join(evidence, name)).isFile())
  .map((name) => [name, hash(path.join(evidence, name))]));

test('S015 actual isolated browser: DOM, keyboard, errors, failures, reset, and enforced CSP', { timeout: 180000 }, async (t) => {
  assert.equal(tooling.version, '1.56.1');
  assert.equal(process.version, 'v22.23.4');
  const signature = JSON.parse(fs.readFileSync(path.join(evidence, 'browser-provenance.json'), 'utf8'));
  assert.equal(signature.status, 'Valid');
  assert.match(signature.signer, /Microsoft Corporation/);
  assert.match(signature.productVersion, /^156\./);
  assert.equal(hash(signature.path), signature.sha256);
  const before = historicalHashes();
  const report = {
    cardId: 'A-S015', workerId: 'worker-A-S015', kano: 'S', kanoUnit: 'A-S015', packet: 'SC-S015',
    mode: 'actual-isolated-browser-testing-of-synthetic-lesson',
    startedAtUtc: new Date().toISOString(), runtime: process.version, playwright: tooling.version,
    helper: 'testing\\browser\\isolated.cjs', helperCommit: signature.helperCommit, helperSha256: hash(helper),
    browserProvenance: signature, entryPoint: 'learning\\S015\\index.html',
    sourceHashes: Object.fromEntries(['index.html', 'lesson.css', 'scale-in.js', 'lesson.js', 'browser.test.cjs']
      .map((name) => [name, hash(path.join(directory, name))])),
    captureExplicitlyEnabled: capture, cases: [], applicationErrors: [], externalCompleted: [],
    escapedCspRequests: [], cspViolations: [], closeAwaited: false,
    nativeProof: false, parentComplete: false, productionNode24Validated: false,
    lifecycleRecoveryQualified: false, status: 'running'
  };
  let session;
  try {
    session = await openIsolatedLesson('learning\\S015\\index.html');
    const { page } = session;
    report.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    page.on('pageerror', (error) => report.applicationErrors.push(error.message));
    page.on('requestfinished', (request) => {
      if (!request.url().startsWith('file:')) report.externalCompleted.push(request.url());
    });
    await page.route('https://s015.invalid/**', async (route) => {
      report.escapedCspRequests.push(route.request().url());
      await route.abort('blockedbyclient');
    });
    const read = async () => JSON.parse(await page.locator('#run-evidence').textContent());
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const advance = async (count) => {
      for (let n = 0; n < count; n++) await press('advance-clock');
    };
    const start = () => press('start-rehearsal');
    const close = async () => { await press('close-admission', 'Space'); await press('probe-admission'); };
    const conduct = async (name, check) => {
      await t.test(name, async () => {
        try {
          await page.reload({ waitUntil: 'load' });
          await page.locator('#run-evidence').waitFor({ state: 'attached' });
          await check();
          report.cases.push({ name, status: 'passed', observation: await read() });
        } catch (error) {
          report.cases.push({ name, status: 'failed', error: error.message,
            observation: await read().catch(() => null) });
          throw error;
        }
      });
    };

    await conduct('local DOM, exact banner, labels, baseline, and keyboard tab order', async () => {
      assert.match(await page.title(), /S015.*Horizontal scale-in/);
      assert.equal(await page.getByRole('note').textContent(), 'Training rehearsal - synthetic data - not a live Azure result');
      assert.equal((await read()).result.verifier, 'NOT_RUN');
      assert.equal((await read()).metrics.attempted, 0);
      assert.equal(await page.getByLabel('Declared fixture mechanism').count(), 1);
      assert.equal(await page.getByLabel('Original work budget (1–12 ticks)').count(), 1);
      assert.equal(await page.locator('#input-error').isVisible(), false);
      assert.equal(await page.locator('noscript').isVisible(), false);
      await page.locator('#mechanism').focus();
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#condition').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('#request-ticks').evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.locator('#condition').evaluate((element) => element === document.activeElement), true);
    });

    await conduct('keyboard drain observes closure, completion, actual retirement, and post-retirement routing', async () => {
      await start();
      assert.equal(await page.locator('#request-ticks').isDisabled(), true);
      await close();
      assert.equal((await read()).actualCapacity, 2);
      await advance(4);
      await press('retire-capacity', 'Space');
      assert.equal((await read()).result.verifier, 'UNKNOWN');
      await press('probe-admission');
      await press('verify-result');
      const state = await read();
      assert.equal(state.result.verifier, 'PASS');
      assert.equal(state.result.workOutcome, 'SUCCESS');
      assert.equal(state.actualCapacity, 1);
      assert.equal(state.metrics.succeeded, 2);
      assert.equal(state.work[1].effects, 1);
      assert.equal(await page.locator('#work-rows tr').count(), 2);
      assert.equal(await page.locator('#probe-rows tr').count(), 2);
      assert.equal(await page.locator('#verify-result').evaluate((element) => element === document.activeElement), true);
    });

    await conduct('keyboard continuation retires A while job on B still uses its original budget', async () => {
      await page.locator('#mechanism').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#mechanism').inputValue(), 'checkpoint');
      await start();
      await close();
      await press('checkpoint-job', 'Space');
      await advance(2);
      await press('retire-capacity');
      let state = await read();
      assert.equal(state.actualCapacity, 1);
      assert.equal(state.metrics.pending, 1);
      assert.equal(state.work[0].owner, 'retiring-A');
      assert.equal(state.work[1].owner, 'retained-B');
      assert.equal(state.work[1].deadline, 6);
      await press('probe-admission');
      await advance(2);
      await press('verify-result');
      state = await read();
      assert.equal(state.result.verifier, 'PASS');
      assert.equal(state.work[1].completedAt, 4);
      assert.equal(state.work[1].effects, 1);
    });

    await conduct('premature and unsupported actions visibly block without invented completion', async () => {
      await press('retire-capacity');
      assert.equal((await read()).lastAction.verdict, 'BLOCKED');
      await start();
      await close();
      await press('retire-capacity');
      assert.equal((await read()).lastAction.verdict, 'BLOCKED');
      await press('checkpoint-job');
      const state = await read();
      assert.equal(state.lastAction.verdict, 'BLOCKED');
      assert.equal(state.actualCapacity, 2);
      assert.equal(state.metrics.pending, 2);
      assert.equal(state.metrics.failed, 0);
    });

    await conduct('malformed, fractional, and unsupported inputs show alerts and keyboard reset restores defaults', async () => {
      await page.locator('#request-ticks').fill('');
      await start();
      assert.equal((await read()).result.verifier, 'INVALID');
      assert.equal(await page.getByRole('alert').isVisible(), true);
      assert.equal(await page.locator('#request-ticks').getAttribute('aria-invalid'), 'true');
      await page.locator('#request-ticks').fill('1.5');
      await start();
      assert.equal((await read()).metrics.attempted, 0);
      await page.locator('#request-ticks').fill('2');
      await page.locator('#condition').selectOption('checkpoint-missing');
      await start();
      assert.equal((await read()).lastAction.verdict, 'INVALID');
      await press('restart-rehearsal', 'Space');
      assert.equal(await page.locator('#request-ticks').inputValue(), '2');
      assert.equal(await page.locator('#condition').inputValue(), 'healthy');
      assert.equal(await page.locator('#request-ticks').getAttribute('aria-invalid'), null);
      assert.equal(await page.getByRole('alert').isVisible(), false);
      assert.equal((await read()).archives.length, 1);
      assert.equal(await page.locator('form').evaluate((form) => typeof form.reset), 'function');
    });

    await conduct('confirmed fault retains lost-work failure and complete history through keyboard reset', async () => {
      await page.locator('#request-ticks').fill('3');
      await start();
      await close();
      await press('force-retirement');
      assert.equal((await read()).lastAction.verdict, 'INVALID');
      assert.equal(await page.getByRole('alert').isVisible(), true);
      await press('fault-consent', 'Space');
      await press('force-retirement');
      await advance(5);
      const failed = await read();
      assert.equal(failed.metrics.failed, 2);
      assert.equal(failed.result.workOutcome, 'INTERRUPTED');
      assert.equal(failed.result.verifier, 'FAIL');
      assert.equal(failed.work[1].effects, 0);
      await press('restart-rehearsal', 'Space');
      const reset = await read();
      assert.equal(reset.phase, 'IDLE');
      assert.equal(reset.actualCapacity, 2);
      assert.equal(reset.archives.length, 1);
      assert.deepEqual(reset.archives[0].events, failed.events);
      assert.equal(reset.archives[0].metrics.failed, 2);
      assert.equal(await page.locator('#request-ticks').inputValue(), '2');
      assert.equal(await page.locator('#fault-consent').isChecked(), false);
      assert.equal(await page.locator('#request-ticks').isDisabled(), false);
      assert.equal(await page.locator('#restart-rehearsal').evaluate((element) => element === document.activeElement), true);
      await start();
      assert.equal((await read()).archives[0].result.verifier, 'FAIL');
    });

    await conduct('missing durable checkpoint holds ownership but later observed drain can still succeed', async () => {
      await page.locator('#mechanism').selectOption('checkpoint');
      await page.locator('#condition').selectOption('checkpoint-missing');
      await start();
      await close();
      await press('checkpoint-job');
      let state = await read();
      assert.equal(state.lastAction.verdict, 'UNKNOWN');
      assert.equal(state.work[1].owner, 'retiring-A');
      await advance(2);
      await press('retire-capacity');
      assert.equal((await read()).lastAction.verdict, 'BLOCKED');
      await advance(2);
      await press('retire-capacity');
      await press('probe-admission');
      await press('verify-result');
      state = await read();
      assert.equal(state.result.verifier, 'PASS');
      assert.ok(state.events.some((event) => event.action === 'checkpoint' && event.verdict === 'UNKNOWN'));
    });

    await conduct('opaque host cannot invent admission, retirement, or fault execution', async () => {
      await page.locator('#mechanism').selectOption('opaque');
      await start();
      await close();
      await press('fault-consent', 'Space');
      await press('force-retirement');
      assert.equal((await read()).lastAction.verdict, 'UNKNOWN');
      await advance(4);
      await press('retire-capacity');
      await press('verify-result');
      const state = await read();
      assert.equal(state.actualCapacity, 2);
      assert.equal(state.admission, 'UNKNOWN');
      assert.equal(state.probes[0].owner, null);
      assert.equal(state.metrics.succeeded, 2);
      assert.equal(state.result.verifier, 'UNKNOWN');
    });

    await conduct('missing completion remains unknown and prevents retirement', async () => {
      await page.locator('#condition').selectOption('missing-completion');
      await start();
      await close();
      await advance(4);
      await press('retire-capacity');
      const state = await read();
      assert.equal(state.lastAction.verdict, 'UNKNOWN');
      assert.equal(state.actualCapacity, 2);
      assert.equal(state.metrics.succeeded, 1);
      assert.equal(state.metrics.unknown, 1);
      assert.equal(state.metrics.observedSuccessRate, 50);
      assert.equal(state.result.workOutcome, 'UNKNOWN');
    });

    await conduct('unobserved retirement keeps actual capacity explicitly unknown', async () => {
      await page.locator('#condition').selectOption('retirement-unobserved');
      await start();
      await close();
      await advance(4);
      await press('retire-capacity');
      await press('probe-admission');
      await press('verify-result');
      const state = await read();
      assert.equal(state.actualCapacity, null);
      assert.equal(await page.locator('#capacity').textContent(), 'UNKNOWN');
      assert.equal(state.metrics.succeeded, 2);
      assert.equal(state.result.verifier, 'UNKNOWN');
    });

    await conduct('stale route fails closure and is rejected rather than admitted after forced retirement', async () => {
      await page.locator('#condition').selectOption('stale-routing');
      await start();
      await close();
      await advance(4);
      await press('retire-capacity');
      assert.equal((await read()).lastAction.verdict, 'FAIL');
      assert.equal((await read()).actualCapacity, 2);
      await press('fault-consent', 'Space');
      await press('force-retirement');
      await press('probe-admission');
      const state = await read();
      assert.equal(state.metrics.newToRetiring, 1);
      assert.equal(state.metrics.rejectedToRetiring, 1);
      assert.equal(state.probes.at(-1).accepted, false);
      assert.equal(state.result.workOutcome, 'SUCCESS');
      assert.equal(state.result.verifier, 'FAIL');
    });

    await conduct('drain budget failure does not falsely classify completed work as interrupted', async () => {
      await page.locator('#drain-budget').fill('3');
      await start();
      await close();
      await advance(4);
      await press('retire-capacity');
      const state = await read();
      assert.equal(state.result.verifier, 'FAIL');
      assert.equal(state.result.workOutcome, 'SUCCESS');
      assert.equal(state.actualCapacity, 2);
      assert.equal(state.metrics.succeeded, 2);
    });

    await conduct('late admitted work is interrupted even if the remaining retirement checks pass', async () => {
      await page.locator('#work-budget').fill('3');
      await start();
      await close();
      await advance(4);
      await press('retire-capacity');
      await press('probe-admission');
      await press('verify-result');
      const state = await read();
      assert.equal(state.metrics.failed, 1);
      assert.equal(state.metrics.succeeded, 1);
      assert.equal(state.result.workOutcome, 'INTERRUPTED');
      assert.equal(state.result.verifier, 'FAIL');
      assert.equal(state.actualCapacity, 1);
    });

    await conduct('known original-budget failure survives separate unknown completion proof', async () => {
      await page.locator('#condition').selectOption('missing-completion');
      await page.locator('#request-ticks').fill('4');
      await page.locator('#job-ticks').fill('2');
      await page.locator('#work-budget').fill('1');
      await start();
      await close();
      await advance(4);
      await press('verify-result');
      const state = await read();
      assert.equal(state.metrics.failed, 2);
      assert.equal(state.result.verifier, 'FAIL');
      assert.equal(state.result.workOutcome, 'INTERRUPTED');
      assert.ok(state.assertions.some((item) => item.verdict === 'UNKNOWN'));
    });

    await conduct('full in-memory archives refuse reset instead of silently evicting earlier attempts', async () => {
      for (let n = 0; n < 4; n++) {
        await start();
        await press('restart-rehearsal', 'Space');
      }
      await start();
      const saved = (await read()).archives;
      await press('restart-rehearsal', 'Space');
      const state = await read();
      assert.equal(state.lastAction.verdict, 'LIMIT');
      assert.equal(state.phase, 'RUNNING');
      assert.deepEqual(state.archives, saved);
      assert.match(await page.locator('#action-status').textContent(), /Archive full/);
    });

    await conduct('narrow viewport, keyboard focus, and actual inline/connect/form CSP enforcement', async () => {
      await page.setViewportSize({ width: 360, height: 900 });
      await start();
      await press('advance-clock');
      const outline = await page.locator('#advance-clock').evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: parseFloat(style.outlineWidth), style: style.outlineStyle };
      });
      assert.ok(outline.width >= 3);
      assert.notEqual(outline.style, 'none');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.evaluate(async () => {
        window.__s015Violations = [];
        window.__s015InlineRan = false;
        document.addEventListener('securitypolicyviolation', (event) => {
          window.__s015Violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
        });
        const script = document.createElement('script');
        script.textContent = 'window.__s015InlineRan = true';
        document.head.appendChild(script);
        try { await fetch('https://s015.invalid/csp-probe'); } catch {}
        const form = document.createElement('form');
        form.action = 'https://s015.invalid/forbidden-form';
        form.method = 'get';
        document.body.appendChild(form);
        form.submit();
      });
      await page.waitForFunction(() => window.__s015Violations.some((entry) => entry.directive === 'form-action'));
      report.cspViolations = await page.evaluate(() => window.__s015Violations);
      assert.equal(await page.evaluate(() => window.__s015InlineRan), false);
      assert.ok(report.cspViolations.some((entry) => /^script-src/.test(entry.directive)));
      assert.ok(report.cspViolations.some((entry) => entry.directive === 'connect-src'));
      assert.ok(report.cspViolations.some((entry) => entry.directive === 'form-action'));
      assert.equal(report.escapedCspRequests.length, 0, 'CSP blocked before the defensive test route');
      assert.match(page.url(), /S015\/index\.html$/);
    });

    assert.deepEqual(report.applicationErrors, []);
    assert.deepEqual(report.externalCompleted, []);
    report.status = report.cases.every((entry) => entry.status === 'passed') ? 'passed' : 'failed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.message;
    throw error;
  } finally {
    try {
      if (session) {
        await session.close();
        report.closeAwaited = true;
      }
    } catch (error) {
      report.status = 'failed';
      report.cleanupError = error.message;
      throw error;
    } finally {
      report.finishedAtUtc = new Date().toISOString();
      if (capture) {
        const attempts = fs.readdirSync(evidence).filter((name) => /^browser-attempt-\d+\.json$/.test(name));
        const next = Math.max(0, ...attempts.map((name) => Number(name.match(/\d+/)[0]))) + 1;
        fs.writeFileSync(path.join(evidence, `browser-attempt-${String(next).padStart(2, '0')}.json`), JSON.stringify(report, null, 2) + '\n');
        if (report.status === 'passed') {
          fs.writeFileSync(path.join(evidence, 'browser-observations.json'), JSON.stringify(report, null, 2) + '\n');
        }
      } else {
        assert.deepEqual(historicalHashes(), before, 'ordinary verification must not rewrite historical proof');
      }
    }
  }
});
