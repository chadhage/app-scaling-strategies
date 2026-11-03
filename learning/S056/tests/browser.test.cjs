'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const helperPath = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = sha(fs.readFileSync(helperPath));
assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function proofHashes() {
  const hashes = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else hashes[path.relative(evidence, target)] = sha(fs.readFileSync(target));
    }
  }
  walk(evidence);
  return hashes;
}

test('actual isolated Edge DOM, keyboard, errors, failures, retained history, reset and restrictive CSP', { timeout: 180000 }, async () => {
  const before = proofHashes();
  const report = {
    cardId: 'A-S056', parentId: 'D-S056', packet: 'SC-S056', executionMode: 'synthetic',
    startedAtUtc: new Date().toISOString(), deliberateCapture: capture,
    helper: 'testing\\browser\\isolated.cjs', helperSha256, helperPublication: '53c0c0d',
    node: process.version,
    playwrightVersion: require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version,
    productionNode24Certification: false,
    limits: 'Finite local model only; no native broker/protocol or source-parent proof. Published helper lifecycle limitation remains.',
    sources: ['index.html', 'model.js', 'app.js', 'styles.css', 'manifest.json', 'event-schema.feature',
      'tests\\browser.test.cjs', 'tests\\csp-probe.js'].map((file) => ({
      path: file, canonicalSha256: sha(canonical(fs.readFileSync(path.join(root, file)))),
    })),
    observations: [], pageErrors: [], exerciseNetworkRequests: [], escapedProbeRequests: [],
    cleanup: { awaitedFinallyClose: false, pageClosed: false }, passed: false,
  };
  let session;
  let failure;
  try {
    assert.equal(report.playwrightVersion, '1.56.1');
    assert.match(report.node, /^v22\./);
    session = await openIsolatedLesson('learning\\S056\\index.html');
    report.browserVersion = session.browserVersion;
    assert.match(report.browserVersion, /^156\./);
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
        const fields = ['schema', 'oldReader', 'checks', 'observation'];
        return {
          title: document.title, activeElement: document.activeElement.id || document.activeElement.className,
          banner: document.querySelector('.banner').textContent, progress: get('progress').textContent,
          outcome: get('outcome').dataset.outcome, outcomeText: get('outcome').textContent,
          decision: get('gate').dataset.decision, gate: get('gate').textContent,
          metrics: get('metrics').textContent, coverage: get('coverage').textContent, error: get('error').textContent,
          trace: [...get('trace').rows].map((row) => ({ outcome: row.dataset.outcome, text: row.textContent })),
          history: [...get('history').children].map((entry) => ({
            outcome: entry.dataset.outcome, summary: entry.querySelector('summary').textContent,
            receipt: JSON.parse(entry.querySelector('pre').textContent),
          })),
          values: Object.fromEntries(fields.map((id) => [id, get(id).value])),
          configurationDisabled: get('configuration').disabled,
          inputsEffectivelyDisabled: fields.map((id) => get(id).matches(':disabled')),
          buttons: Object.fromEntries(['start', 'step', 'introduce', 'again', 'check'].map((id) => [id, get(id).disabled])),
          prediction: get('prediction').value, verdict: get('prediction-result').dataset.verdict,
          predictionText: get('prediction-result').textContent, nativeFormReset: typeof get('controls').reset,
        };
      });
      report.observations.push({ label, observedAtUtc: new Date().toISOString(), dom });
      return dom;
    };
    const defaults = { schema: 'additive', oldReader: 'tolerant',
      checks: 'contracts-effects', observation: 'complete' };
    const choose = async (config) => {
      for (const [id, value] of Object.entries({ ...defaults, ...config })) {
        await page.locator(`#${id}`).selectOption(value);
      }
    };
    const conduct = async (config = {}) => {
      await choose(config);
      await page.locator('#start').click();
      for (let index = 0; index < 4; index += 1) await page.locator('#step').click();
      await page.locator('#introduce').click();
      assert.equal(await page.locator('#prediction').inputValue(), '', 'a prior attempt must not prefill a new prediction');
    };
    const tabTo = async (id) => {
      for (let index = 0; index < 16; index += 1) {
        if (await page.evaluate(() => document.activeElement.id) === id) return;
        await page.keyboard.press('Tab');
      }
      assert.fail(`Keyboard did not reach ${id}.`);
    };
    const assertReset = async (label) => {
      const dom = await snapshot(label);
      assert.deepEqual(dom.values, defaults);
      assert.equal(dom.outcome, 'unknown');
      assert.equal(dom.decision, 'pending');
      assert.equal(dom.trace.length, 0);
      assert.equal(dom.history.length, 0);
      assert.equal(dom.prediction, '');
      assert.equal(dom.verdict, 'none');
      assert.equal(dom.error, '');
      assert.equal(dom.configurationDisabled, false);
      assert.equal(dom.nativeFormReset, 'function');
      assert.equal(dom.activeElement, 'schema');
    };

    let dom = await snapshot('initial actual DOM and synthetic label');
    assert.equal(dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.equal(dom.outcome, 'unknown');
    assert.equal(dom.nativeFormReset, 'function');
    assert.equal(dom.trace.length, 0);
    assert.equal(dom.history.length, 0);
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
    await page.keyboard.press('Enter');
    await tabTo('start');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard start pins configuration');
    assert.equal(dom.activeElement, 'step');
    assert.ok(dom.inputsEffectivelyDisabled.every(Boolean));
    await page.keyboard.press('Space');
    dom = await snapshot('one observed success is not a complete compatibility result');
    assert.equal(dom.trace.length, 1);
    assert.equal(dom.outcome, 'unknown');
    assert.equal(dom.buttons.introduce, true);
    await page.locator('#introduce').dispatchEvent('click');
    dom = await snapshot('early introduction is a handled phase error');
    assert.match(dom.error, /phase/);
    assert.equal(dom.trace.length, 1);
    assert.equal(dom.decision, 'pending');
    await page.locator('#controls').dispatchEvent('submit');
    assert.match(await page.locator('#error').textContent(), /phase/);
    for (let index = 0; index < 3; index += 1) await page.locator('#step').press('Space');
    dom = await snapshot('four keyboard checks measure compatible overlap before expansion');
    assert.equal(dom.outcome, 'success');
    assert.equal(dom.activeElement, 'introduce');
    assert.equal(dom.decision, 'pending');
    assert.equal(dom.history.length, 0);
    assert.match(dom.metrics, /Success 4.*Failure 0.*Unknown 0.*Correct effects 4.*7500 \/ intended 7500/);
    await page.keyboard.press('Space');
    dom = await snapshot('keyboard introduction stores all four correct receipts');
    assert.equal(dom.decision, 'introduced');
    assert.equal(dom.history.length, 1);
    assert.equal(dom.activeElement, 'prediction');
    assert.deepEqual(dom.history[0].receipt.rows.map((row) => row.appliedCents), [1250, 1250, 2500, 2500]);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    dom = await snapshot('keyboard prediction PASS is separate from compatibility success');
    assert.equal(dom.verdict, 'PASS');
    assert.equal(dom.outcome, 'success');
    assert.equal(dom.history[0].receipt.prediction.verdict, 'PASS');
    await page.locator('#history summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#history details').getAttribute('open'), '');
    await snapshot('native retained receipt details open by keyboard');
    await page.locator('#again').click();
    await page.evaluate(() => {
      const option = document.createElement('option');
      option.value = 'tampered'; option.textContent = 'Tampered';
      document.getElementById('schema').append(option);
    });
    await page.locator('#schema').selectOption('tampered');
    await page.locator('#start').click();
    dom = await snapshot('invalid DOM select value is rejected without clearing retained history');
    assert.match(dom.error, /input/);
    assert.equal(dom.trace.length, 0);
    assert.equal(dom.history.length, 1);
    await page.evaluate(() => document.querySelector('#schema option[value="tampered"]').remove());
    await choose({});
    await page.locator('#start').click();
    await page.evaluate(() => { document.getElementById('schema').value = 'renamed'; });
    await page.locator('#step').click();
    dom = await snapshot('mutated disabled choice cannot reuse pinned evidence');
    assert.match(dom.error, /pinned/);
    assert.equal(dom.trace.length, 0);
    assert.equal(dom.history.length, 1);
    await page.locator('#reset-all').click();
    await assertReset('reset restores defaults and clears errors, trace, prediction and retained history');

    const cases = [
      { config: { schema: 'renamed' }, outcome: 'failure', label: 'rename blocks old consumer despite new-reader success' },
      { config: { schema: 'unit-drift' }, outcome: 'failure', label: 'interpretable shape with wrong integer-cent business effects fails' },
      { config: { oldReader: 'strict' }, outcome: 'failure', label: 'strict old reader rejects additive fields' },
      { config: { schema: 'unit-drift', checks: 'shape-only' }, outcome: 'unknown', label: 'shape-only receipts leave business effects unknown' },
      { config: { schema: 'renamed', checks: 'new-only' }, outcome: 'unknown', label: 'new-only success has no old-consumer compatibility proof' },
      { config: { observation: 'withhold-old' }, outcome: 'unknown', label: 'withheld old receipts block introduction as unknown' },
    ];
    for (const item of cases) {
      await conduct(item.config);
      dom = await snapshot(item.label);
      assert.equal(dom.outcome, item.outcome);
      assert.equal(dom.decision, 'blocked');
      assert.equal(dom.trace.length, 4);
      assert.equal(dom.history.at(-1).outcome, item.outcome);
      assert.equal(dom.history.at(-1).receipt.introduced, false);
      if (item.config.schema === 'renamed' && item.config.checks !== 'new-only') {
        assert.equal(dom.trace[2].outcome, 'failure');
        assert.equal(dom.trace[3].outcome, 'success');
      }
      if (item.config.schema === 'unit-drift' && item.config.checks !== 'shape-only') {
        assert.match(dom.metrics, /Interpretable 4.*Wrong effects 2.*2550 \/ intended 7500/);
      }
      if (item.config.checks === 'shape-only') assert.match(dom.metrics, /Measured effects 0\/4/);
      if (item.config.checks === 'new-only' || item.config.observation === 'withhold-old') {
        assert.match(dom.coverage, /Old-consumer evidence 0\/2/);
      }
      await page.locator('#check').click();
      assert.match(await page.locator('#error').textContent(), /input/);
      await page.locator('#prediction').selectOption('success');
      await page.locator('#check').click();
      assert.equal(await page.locator('#prediction-result').getAttribute('data-verdict'), 'FAIL');
      assert.equal(await page.locator('#outcome').getAttribute('data-outcome'), item.outcome);
      await page.locator('#again').click();
    }
    dom = await snapshot('six failure/unknown attempts and their predictions remain retained');
    const firstRetained = dom.history[0];
    assert.equal(dom.history.length, 6);
    assert.equal(firstRetained.outcome, 'failure');
    await conduct();
    await page.locator('#again').click();
    await conduct({ schema: 'renamed' });
    dom = await snapshot('eight attempts retain earlier failed receipts without pruning');
    assert.equal(dom.history.length, 8);
    assert.deepEqual(dom.history[0], firstRetained);
    await page.locator('#again').click();
    assert.equal(await page.locator('#start').isDisabled(), true);
    await page.locator('#controls').dispatchEvent('submit');
    dom = await snapshot('ninth start is refused and all eight receipts remain');
    assert.match(dom.error, /eight attempts/);
    assert.equal(dom.history.length, 8);
    assert.deepEqual(dom.history[0], firstRetained);
    await page.locator('#reset-all').focus();
    await page.keyboard.press('Space');
    await assertReset('keyboard full reset at history bound');
    await page.locator('#start').click();
    await page.locator('#step').click();
    await page.locator('#reset-all').focus();
    await page.keyboard.press('Space');
    await assertReset('keyboard reset during incomplete preflight');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobile = await page.evaluate(() => ({
      width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      visibleControlWidth: document.getElementById('schema').getBoundingClientRect().width,
    }));
    report.mobile = mobile;
    assert.ok(mobile.scrollWidth <= mobile.width, 'mobile layout must not overflow the page');
    assert.ok(mobile.visibleControlWidth > 100 && mobile.visibleControlWidth < mobile.width);
    report.exerciseNetworkRequests = [...requests];
    assert.deepEqual(report.exerciseNetworkRequests, []);
    assert.deepEqual(report.pageErrors, []);

    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = new URL('tests/csp-probe.js', location.href).href;
      document.body.append(script);
    });
    await page.waitForFunction(() => {
      const probe = globalThis.__s056PolicyProbe;
      return probe && probe.done && probe.workerRejected
        && ['connect-src', 'frame-src', 'form-action', 'worker-src']
          .every((directive) => probe.violations.some((item) => item.directive === directive))
        && probe.violations.some((item) => item.directive.startsWith('script-src'))
        && probe.violations.some((item) => item.directive.startsWith('style-src'));
    });
    report.csp = await page.evaluate(() => ({
      ...globalThis.__s056PolicyProbe,
      inlineRan: globalThis.__s056InlineRan === true,
      handlerRan: globalThis.__s056HandlerRan === true,
      inlineStyleApplied: getComputedStyle(document.documentElement).getPropertyValue('--s056-inline-style').trim(),
      policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      url: location.href,
    }));
    assert.equal(report.csp.loaded, true);
    assert.equal(report.csp.inlineRan, false);
    assert.equal(report.csp.handlerRan, false);
    assert.equal(report.csp.inlineStyleApplied, '');
    assert.equal(report.csp.connectionRejected, true);
    assert.equal(report.csp.workerRejected, true);
    assert.equal(new URL(report.csp.url).protocol, 'file:');
    assert.deepEqual(report.escapedProbeRequests, []);
    assert.deepEqual(requests, []);
    assert.deepEqual(report.pageErrors, []);
    await snapshot('actual browser CSP blocks inline code, handlers, styles, connect, form, frame and worker probes');
    await page.reload({ waitUntil: 'load' });
    await page.locator('#reset-all').click();
    await assertReset('clean page reload and reset after deliberately blocked CSP probes');
  } catch (error) {
    failure = error;
    report.failure = { message: error.message, stack: error.stack };
  } finally {
    try {
      if (session) {
        await session.close();
        report.cleanup.awaitedFinallyClose = true;
        report.cleanup.pageClosed = session.page.isClosed();
        assert.equal(report.cleanup.pageClosed, true);
      }
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'Browser check and owned cleanup failed') : error;
      report.cleanup.error = error.message;
    }
    report.completedAtUtc = new Date().toISOString();
    report.passed = !failure;
    if (capture) fs.writeFileSync(path.join(evidence, 'browser.json'), `${JSON.stringify(report, null, 2)}\n`);
  }
  if (!capture) assert.deepEqual(proofHashes(), before, 'Ordinary browser verification must not rewrite proof.');
  if (failure) throw failure;
  console.log(`A-S056 actual Edge ${report.browserVersion}: ${report.observations.length} DOM observations, CSP denial, awaited finally cleanup; proof ${capture ? 'deliberately captured' : 'unchanged'}.`);
});
