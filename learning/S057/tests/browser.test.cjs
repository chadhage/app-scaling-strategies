'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperSha256 = hash(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function proofHashes() {
  const result = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else result[path.relative(root, target)] = hash(fs.readFileSync(target));
    }
  }
  walk(path.join(root, 'evidence'));
  return result;
}

test('actual Edge: old HTML after deploy, retirement failures, unknowns, keyboard, errors, reset and CSP', async () => {
  if (capture) assert.match(process.env.BROWSER_EVIDENCE_RUN || '', /^browser-run-\d{3}$/, 'Use the explicit capture runner');
  const before = proofHashes();
  const report = {
    cardId: 'A-S057', parentId: 'D-S057', packet: 'SC-S057', executionMode: 'synthetic',
    qualifiedRun: process.env.BROWSER_EVIDENCE_RUN || null, startedAtUtc: new Date().toISOString(),
    helper: 'testing\\browser\\isolated.cjs', helperSha256, helperPublication: '53c0c0d',
    node: process.version,
    playwrightVersion: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    observations: [], pageErrors: [], exerciseNetworkRequests: [], escapedProbeRequests: [],
    cleanup: { awaitedFinallyClose: false, pageClosed: false }, passed: false,
    sources: ['model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'tests\\browser.test.cjs', 'tests\\csp-probe.js']
      .map((file) => ({ path: file, lfSha256: hash(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'))) })),
  };
  let session;
  let failure;
  try {
    session = await openIsolatedLesson('learning\\S057\\index.html');
    report.browserVersion = session.browserVersion;
    const page = session.page;
    const requests = [];
    page.on('pageerror', (error) => report.pageErrors.push(error.message));
    page.on('request', (request) => { if (!request.url().startsWith('file:')) requests.push(request.url()); });
    await page.route('**/*', (route) => {
      if (!route.request().url().startsWith('file:')) {
        report.escapedProbeRequests.push(route.request().url());
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    const snapshot = async (label) => {
      const dom = await page.evaluate(() => {
        const get = (id) => document.getElementById(id);
        return {
          title: document.title, activeElement: document.activeElement.id || document.activeElement.className,
          banner: document.querySelector('.banner').textContent,
          progress: get('progress').textContent, outcome: get('outcome').dataset.outcome,
          htmlState: get('html-state').textContent, retirement: get('retirement').textContent,
          pages: get('pages').textContent, metrics: get('metrics').textContent, error: get('error').textContent,
          assets: [...get('assets').children].map((item) => item.textContent),
          trace: [...get('trace').rows].map((row) => ({ outcome: row.dataset.outcome, text: row.textContent })),
          history: [...get('history').children].map((item) => ({ outcome: item.dataset.outcome, text: item.textContent })),
          historyBound: get('history-bound').textContent,
          values: Object.fromEntries(['observation', 'retireTarget', 'prediction'].map((id) => [id, get(id).value])),
          configurationDisabled: get('configuration').disabled,
          inputsEffectivelyDisabled: ['observation', 'retireTarget'].map((id) => get(id).matches(':disabled')),
          buttons: Object.fromEntries(['start', 'deploy', 'retire', 'load-old', 'load-new', 'again', 'check'].map((id) => [id, get(id).disabled])),
          prediction: get('prediction-result').textContent, verdict: get('prediction-result').dataset.verdict,
          nativeFormReset: typeof get('controls').reset,
        };
      });
      report.observations.push({ label, observedAtUtc: new Date().toISOString(), dom });
      return dom;
    };
    const tabTo = async (id) => {
      for (let index = 0; index < 20; index += 1) {
        if (await page.evaluate(() => document.activeElement.id) === id) return;
        await page.keyboard.press('Tab');
      }
      assert.fail(`Keyboard did not reach ${id}`);
    };
    const conduct = async ({ observation = 'complete', retireTarget = 'script', retire = false } = {}) => {
      await page.locator('#observation').selectOption(observation);
      await page.locator('#retireTarget').selectOption(retireTarget);
      await page.locator('#start').click();
      await page.locator('#deploy').click();
      if (retire) await page.locator('#retire').click();
      await page.locator('#load-old').click();
      await page.locator('#load-new').click();
    };
    const another = async () => page.locator('#again').click();
    const assertReset = async (label) => {
      const dom = await snapshot(label);
      assert.equal(dom.outcome, 'unknown');
      assert.equal(dom.history.length, 0);
      assert.equal(dom.trace.length, 0);
      assert.equal(dom.error, '');
      assert.equal(dom.verdict, 'none');
      assert.equal(dom.nativeFormReset, 'function');
      assert.equal(dom.activeElement, 'observation');
      assert.equal(dom.configurationDisabled, false);
      assert.deepEqual(dom.values, { observation: 'complete', retireTarget: 'script', prediction: '' });
      assert.match(dom.metrics, /Attempted 0.*Success 0.*Failure 0.*Unknown 4.*pending 4/);
    };

    let dom = await snapshot('initial actual DOM: empty sample is unknown');
    assert.equal(dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(dom.outcome, 'unknown');
    assert.equal(dom.nativeFormReset, 'function');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    await tabTo('start');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard cache v1 locks configuration and focuses deploy');
    assert.equal(dom.activeElement, 'deploy');
    assert.ok(dom.inputsEffectivelyDisabled.every(Boolean));
    assert.match(dom.htmlState, /Cached HTML: v1.*Published HTML: v1/);
    await page.locator('#controls').dispatchEvent('submit');
    dom = await snapshot('duplicate start is a handled phase error without progress');
    assert.match(dom.error, /phase/i);
    assert.equal(dom.trace.length, 0);
    await page.locator('#deploy').press('Space');
    dom = await snapshot('publish v2 without rewriting cached v1 references');
    assert.equal(dom.outcome, 'unknown');
    assert.match(dom.htmlState, /Cached HTML: v1.*Published HTML: v2/);
    assert.ok(dom.assets.every((asset) => asset.includes('available')));
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'load-old');
    await page.keyboard.press('Space');
    dom = await snapshot('old HTML resolves two old assets but new page is still pending');
    assert.equal(dom.outcome, 'unknown');
    assert.equal(dom.trace.length, 2);
    assert.match(dom.pages, /Cached old page: success.*Current new page: unknown/);
    assert.match(dom.metrics, /Success 2.*Failure 0.*Unknown 2.*pending 2/);
    assert.ok(dom.trace[0].text.includes('/assets/app.a17c.js200success'));
    await page.keyboard.press('Space');
    dom = await snapshot('keyboard current-page comparison completes retained-assets success');
    assert.equal(dom.outcome, 'success');
    assert.equal(dom.activeElement, 'prediction');
    assert.equal(dom.trace.length, 4);
    assert.match(dom.metrics, /Success 4.*Failure 0.*Unknown 0/);
    await page.locator('#check').click();
    dom = await snapshot('empty prediction handled without altering measured outcome');
    assert.match(dom.error, /valid prediction/i);
    assert.equal(dom.outcome, 'success');
    await page.locator('#prediction').selectOption('failure');
    await page.locator('#check').click();
    assert.equal(await page.locator('#prediction-result').getAttribute('data-verdict'), 'RETRY');
    await page.locator('#prediction').focus();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard prediction PASS is distinct from page result');
    assert.equal(dom.verdict, 'PASS');
    assert.equal(dom.outcome, 'success');

    await another();
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'tampered'; option.textContent = 'Tampered';
      document.getElementById('observation').append(option);
    });
    await page.locator('#observation').selectOption('tampered');
    await page.locator('#start').click();
    dom = await snapshot('tampered DOM configuration is rejected and history is unchanged');
    assert.match(dom.error, /configuration/i);
    assert.equal(dom.history.length, 1);
    assert.equal(dom.trace.length, 0);
    assert.equal(dom.configurationDisabled, false);
    await page.locator('#observation').selectOption('complete');
    await page.locator('#start').click();
    await page.locator('#deploy').click();
    await page.locator('#retire').click();
    await page.locator('#load-old').click();
    dom = await snapshot('early old-script retirement visibly breaks existing page before new-page check');
    assert.equal(dom.outcome, 'failure');
    assert.equal(dom.trace[0].outcome, 'failure');
    assert.ok(dom.trace[0].text.includes('/assets/app.a17c.js404failure'));
    assert.match(dom.metrics, /Success 1.*Failure 1.*Unknown 2.*pending 2/);
    await page.locator('#load-new').click();
    await page.locator('#prediction').selectOption('failure');
    await page.locator('#check').click();
    dom = await snapshot('successful new HTML and correct failure prediction do not erase old-page failure');
    assert.equal(dom.outcome, 'failure');
    assert.match(dom.pages, /Cached old page: failure.*Current new page: success/);
    assert.equal(dom.verdict, 'PASS');
    assert.deepEqual(dom.history.map((item) => item.outcome), ['success', 'failure']);

    await another();
    await conduct({ retire: true, retireTarget: 'all-old' });
    dom = await snapshot('both old assets retired: two observed 404s; new assets still resolve');
    assert.equal(dom.outcome, 'failure');
    assert.equal(dom.trace.filter((row) => row.outcome === 'failure').length, 2);
    assert.match(dom.metrics, /Success 2.*Failure 2.*Unknown 0/);

    await another();
    await conduct({ observation: 'withhold-old-script' });
    dom = await snapshot('withheld old-script observation remains unknown, not a synthetic success');
    assert.equal(dom.outcome, 'unknown');
    assert.ok(dom.trace[0].text.includes('unobservedunknown'));
    assert.match(dom.pages, /Cached old page: unknown.*Current new page: success/);
    assert.match(dom.metrics, /Success 3.*Failure 0.*Unknown 1.*pending 0/);
    await page.locator('#prediction').selectOption('unknown');
    await page.locator('#check').click();
    assert.equal(await page.locator('#prediction-result').getAttribute('data-verdict'), 'PASS');

    await another();
    await conduct({ observation: 'withhold-old-script', retireTarget: 'all-old', retire: true });
    dom = await snapshot('known missing stylesheet dominates unknown script while preserving both observations');
    assert.equal(dom.outcome, 'failure');
    assert.match(dom.metrics, /Success 2.*Failure 1.*Unknown 1/);
    await another();
    await conduct();
    dom = await snapshot('later retained-assets success preserves all previous failures and unknowns at six-attempt cap');
    assert.deepEqual(dom.history.map((item) => item.outcome), ['success', 'failure', 'failure', 'unknown', 'failure', 'success']);
    assert.equal(dom.buttons.again, true);
    assert.match(dom.historyBound, /6 \/ 6.*History limit reached/);
    await page.locator('#again').dispatchEvent('click');
    dom = await snapshot('forced seventh-attempt command is handled without pruning history');
    assert.match(dom.error, /six|limit/i);
    assert.equal(dom.history.length, 6);
    await page.locator('#reset-lesson').press('Space');
    await assertReset('keyboard reset clears all history, prediction and error and restores defaults');
    await page.locator('#observation').selectOption('withhold-old-script');
    await page.locator('#retireTarget').selectOption('all-old');
    await page.locator('#start').click();
    await page.locator('#deploy').click();
    await page.locator('#reset-lesson').press('Enter');
    await assertReset('reset during active deployment also restores all defaults and clears active work');
    assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1);
    report.exerciseNetworkRequests = [...requests];
    assert.deepEqual(report.exerciseNetworkRequests, []);
    await page.evaluate((src) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('The approved external CSP probe did not load'));
      document.head.append(script);
    }), pathToFileURL(path.join(root, 'tests', 'csp-probe.js')).href);
    await page.waitForFunction(() => {
      const probe = globalThis.__s057CspProbe;
      return probe && probe.connectionBlocked && probe.evalBlocked
        && ['script-src-elem', 'script-src-attr', 'script-src', 'connect-src', 'form-action']
          .every((directive) => probe.violations.some((item) => item.directive === directive));
    });
    report.csp = await page.evaluate(() => globalThis.__s057CspProbe);
    assert.equal(report.csp.inlineRan, false);
    assert.equal(report.csp.handlerRan, false);
    assert.equal(report.csp.evalRan, false);
    assert.deepEqual(report.escapedProbeRequests, []);
    dom = await snapshot('actual CSP blocks inline code, handlers, eval, connections and form submission');
    assert.equal(dom.outcome, 'unknown');
    assert.deepEqual(report.pageErrors, []);
    report.passed = true;
  } catch (error) {
    failure = error;
    report.error = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      if (session) {
        await session.close();
        report.cleanup.awaitedFinallyClose = true;
        report.cleanup.pageClosed = session.page.isClosed();
      }
    } catch (error) {
      report.passed = false;
      failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
      report.cleanup.error = error.message;
    }
    report.completedAtUtc = new Date().toISOString();
    if (capture) {
      const target = path.join(root, 'evidence', `${process.env.BROWSER_EVIDENCE_RUN}.observations.json`);
      fs.writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      if (report.passed) fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), `${JSON.stringify(report, null, 2)}\n`);
    } else {
      assert.deepEqual(proofHashes(), before, 'Normal verification must not write evidence');
    }
  }
  if (failure) throw failure;
  assert.ok(report.cleanup.awaitedFinallyClose && report.cleanup.pageClosed);
});
