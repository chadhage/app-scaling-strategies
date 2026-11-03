'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperSha256 = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonicalHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
assert.equal(sha(fs.readFileSync(helper)), helperSha256);
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

test('actual isolated DOM: authority, four outcomes, keyboard, errors, history, all-phase reset and enforced CSP', { timeout: 180000 }, async () => {
  const proofPath = path.join(root, 'evidence', 'browser-acceptance.json');
  const proof = {
    schemaVersion: 1, cardId: 'A-S078', workerId: 'worker-A-S078', mode: 'synthetic',
    entry: 'learning\\S078\\index.html', runtime: process.version, playwrightVersion,
    startedAtUtc: new Date().toISOString(), captureExplicitlyEnabled: capture, outcome: 'FAIL',
    helper: { path: 'testing\\browser\\isolated.cjs', publication: '53c0c0d', sha256: helperSha256 },
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [], probeNetworkRequests: [],
    cleanup: { awaitedFinallyClose: false },
    limits: [
      'No actual scheduler, lease, fencing, effect execution, Azure or source-parent certification.',
      'Known helper lifecycle limitation remains; no abandoned prototype or unattended-runner certification.',
      'CSP form-action/worker-src are declared; file-origin restrictions are not independent worker-src qualification.',
    ],
    sourceHashes: Object.fromEntries([
      'index.html', 'styles.css', 'model.js', 'app.js', 'tests\\browser.test.cjs', 'tests\\csp-probe.js',
    ].map((file) => [file, canonicalHash(file)])),
  };
  let session;
  let failure;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) assert.equal(fs.existsSync(proofPath), false, 'Capture may not overwrite historical observations');
    session = await openIsolatedLesson('learning\\S078\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.equal(session.browserVersion, '156.0.4314.50');
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/i.test(request.url())) {
        (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeNetworkRequests)
          .push({ url: request.url(), method: request.method() });
      }
    });
    await page.reload({ waitUntil: 'load' });
    const rows = (id) => page.locator(`#${id} tr`).evaluateAll((entries) =>
      entries.map((entry) => [...entry.cells].map((cell) => cell.textContent)));
    const retained = () => page.locator('#history-ledgers pre').allTextContents();
    const focus = () => page.evaluate(() => document.activeElement.id);
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(),
        lease: await page.locator('#lease-summary').innerText(), fence: await page.locator('#fence-summary').innerText(),
        verdict: await page.locator('#verdict').innerText(), metrics: await page.locator('#metrics').innerText(),
        uncertainty: await page.locator('#uncertainty').innerText(),
        leases: await rows('lease-ledger'), schedulers: await rows('scheduler-ledger'), effects: await rows('effect-ledger'),
        history: await rows('history'), trace: await page.locator('#trace').innerText(),
        feedback: await page.locator('#answer-feedback').innerText(),
        error: await page.locator('#input-error').textContent(), focus: await focus(),
      });
    };
    const ready = async (historyCount) => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: ready');
      assert.equal(await page.locator('#verdict').innerText(), 'Synthetic result: NOT_EVALUATED');
      assert.equal(await page.locator('#lease-summary').innerText(), 'Current lease: none');
      assert.equal(await page.locator('#fence-summary').innerText(), 'Effect-boundary fence: not started');
      assert.equal(await page.locator('#metrics').innerText(), 'No scheduling or effects observed.');
      assert.equal(await page.locator('#uncertainty').innerText(), 'No effect conclusion yet.');
      assert.equal(await page.locator('#impact').innerText(), 'No occurrence has been evaluated.');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#answer-feedback').innerText(), 'Interpretation not checked.');
      for (const id of ['lease-ledger', 'scheduler-ledger', 'effect-ledger']) assert.deepEqual(await rows(id), []);
      assert.equal((await rows('history')).length, historyCount);
      assert.equal((await retained()).length, historyCount);
      assert.equal(await page.locator('#history-count').innerText(), `Retained attempts: ${historyCount} / 6`);
      assert.equal(await page.locator('#protection').inputValue(), 'fenced');
      assert.equal(await page.locator('#receipt').inputValue(), 'observed');
      assert.equal(await page.locator('#executor-choice').inputValue(), '');
      assert.equal(await page.locator('#outcome-choice').inputValue(), '');
      assert.equal(await page.locator('#start-schedulers').isEnabled(), true);
      for (const id of ['handoff-lease', 'execute-occurrence', 'new-attempt', 'check-answer']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true);
      }
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      for (const id of ['configuration', 'interpretation']) {
        assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
      }
    };
    const reset = async (name) => {
      await page.locator('#reset-rehearsal').focus();
      await page.keyboard.press('Space');
      await ready(0);
      assert.equal(await page.locator('#attempt-count').innerText(), 'Attempt: 1 / 6');
      assert.equal(await focus(), 'start-schedulers');
      await observe(name);
    };
    const start = async () => {
      await page.locator('#start-schedulers').focus();
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: started');
      assert.equal(await focus(), 'handoff-lease');
      assert.equal(await page.locator('#protection').isDisabled(), true);
      assert.equal(await page.locator('#receipt').isDisabled(), true);
      assert.deepEqual((await rows('scheduler-ledger')).map((row) => row.slice(0, 3)), [
        ['v1', 'JOB-078@6', '7'], ['v2', 'JOB-078@6', 'none'],
      ]);
      assert.deepEqual(await rows('lease-ledger'), [['v1', '7', '0', '5', 'current']]);
      assert.match(await page.locator('#metrics').innerText(), /Candidates: 2; duplicate schedules: 1/);
    };
    const advance = async () => {
      await page.keyboard.press('Space');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: handoff');
      assert.equal(await focus(), 'execute-occurrence');
      assert.deepEqual(await rows('lease-ledger'), [
        ['v1', '7', '0', '5', 'expired'], ['v2', '8', '6', '10', 'current'],
      ]);
      assert.match(await page.locator('#lease-summary').innerText(), /v2, epoch 8.*tick 6/);
      assert.deepEqual((await rows('scheduler-ledger')).map((row) => [row[0], row[2], row[3]]), [
        ['v1', '7', '4'], ['v2', '8', '6'],
      ]);
    };
    const finish = async (verdict) => {
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#phase').innerText(), 'Phase: evaluated');
      assert.equal(await page.locator('#verdict').innerText(), `Synthetic result: ${verdict}`);
      assert.equal(await focus(), 'executor-choice');
      assert.equal(await page.locator('#execute-occurrence').isDisabled(), true);
      assert.equal(await page.locator('#check-answer').isEnabled(), true);
    };
    const next = async (expectedHistory) => {
      const before = await retained();
      await page.locator('#new-attempt').focus();
      await page.keyboard.press('Space');
      await ready(expectedHistory);
      assert.deepEqual(await retained(), before);
      assert.equal(await focus(), 'start-schedulers');
    };

    await ready(0);
    assert.equal(await page.locator('#synthetic-banner').innerText(),
      'Training rehearsal - synthetic data - not a live Azure result');
    await page.locator('#protection').focus();
    await page.keyboard.press('Tab');
    assert.equal(await focus(), 'receipt');
    await page.keyboard.press('Tab');
    assert.equal(await focus(), 'start-schedulers');
    await observe('initial DOM and keyboard order');
    await page.locator('#protection').evaluate((select) => { select.value = 'unsupported'; });
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#phase').innerText(), 'Phase: ready');
    assert.equal(await page.locator('#input-error').isVisible(), true);
    assert.match(await page.locator('#input-error').innerText(), /listed protection/);
    assert.equal(await page.locator('#protection').getAttribute('aria-invalid'), 'true');
    assert.equal(await focus(), 'protection');
    assert.deepEqual(await rows('scheduler-ledger'), []);
    await observe('malformed input rejected without advancement');
    await reset('reset clears malformed input and error');

    await page.locator('#execute-occurrence').evaluate((button) => button.dispatchEvent(new Event('click', { bubbles: true })));
    assert.equal(await page.locator('#phase').innerText(), 'Phase: ready');
    assert.match(await page.locator('#input-error').innerText(), /authentic handoff state/);
    await observe('programmatic wrong-order action rejected');
    await reset('ready-phase reset');

    await start();
    await observe('two schedulers propose one occurrence');
    await advance();
    assert.match(await page.locator('#fence-summary').innerText(), /epoch 8 and current lease owner/);
    await observe('expired v1 lease and current v2 fencing evidence');
    await finish('PASS');
    assert.deepEqual(await rows('effect-ledger'), [['v2', '8', 'observed', '1', 'valid']]);
    assert.equal((await rows('scheduler-ledger'))[0][5], 'rejected-stale');
    await observe('fencing permits only valid executor v2');

    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#executor-choice').inputValue(), 'v2');
    await page.keyboard.press('Tab');
    assert.equal(await focus(), 'outcome-choice');
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    assert.equal(await focus(), 'check-answer');
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#answer-feedback').innerText(), /^Correct interpretation/);
    await observe('keyboard-only valid executor and outcome interpretation');

    await next(1);
    await page.locator('#protection').focus();
    await page.keyboard.press('End');
    assert.equal(await page.locator('#protection').inputValue(), 'lease-only');
    await start();
    await advance();
    assert.match(await page.locator('#fence-summary').innerText(), /NOT ENFORCED/);
    await finish('FAIL');
    assert.deepEqual(await rows('effect-ledger'), [
      ['v1', '7', 'observed', '1', 'INVALID'], ['v2', '8', 'observed', '1', 'valid'],
    ]);
    assert.match(await page.locator('#metrics').innerText(), /known effects: 2; duplicate effects: 1; invalid executor effects: 1; unresolved effects: 0/);
    const failedHistory = await retained();
    await page.locator('#check-answer').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[aria-invalid="true"]').count(), 2);
    assert.equal(await page.locator('#input-error').isVisible(), true);
    assert.equal(await focus(), 'executor-choice');
    await observe('empty interpretation is an explicit input error');
    await page.locator('#executor-choice').selectOption('v1');
    await page.locator('#outcome-choice').selectOption('PASS');
    await page.locator('#check-answer').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#answer-feedback').innerText(), /^Incorrect.*v2.*FAIL/);
    assert.equal(await page.locator('#verdict').innerText(), 'Synthetic result: FAIL');
    assert.deepEqual(await retained(), failedHistory);
    await observe('wrong answer cannot repair invalid duplicate effects');
    await page.locator('#executor-choice').selectOption('v2');
    await page.locator('#outcome-choice').selectOption('FAIL');
    await page.locator('#check-answer').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#answer-feedback').innerText(), /^Correct interpretation/);
    assert.deepEqual(await retained(), failedHistory);

    await next(2);
    await page.locator('#receipt').selectOption('missing');
    await start();
    await advance();
    await finish('UNKNOWN');
    assert.deepEqual(await rows('effect-ledger'), [['v2', '8', 'missing', 'unknown', 'valid']]);
    assert.match(await page.locator('#metrics').innerText(), /known effects: 0; duplicate effects: 0; invalid executor effects: 0; unresolved effects: 1/);
    await observe('missing receipt remains UNKNOWN without hiding known ownership');

    await next(3);
    await page.locator('#protection').selectOption('lease-only');
    await page.locator('#receipt').selectOption('missing');
    await start();
    await advance();
    await finish('FAIL');
    assert.deepEqual(await rows('effect-ledger'), [
      ['v1', '7', 'observed', '1', 'INVALID'], ['v2', '8', 'missing', 'unknown', 'valid'],
    ]);
    assert.match(await page.locator('#metrics').innerText(), /known effects: 1; duplicate effects: 0; invalid executor effects: 1; unresolved effects: 1/);
    assert.deepEqual((await rows('history')).map((row) => row[3]), ['PASS', 'FAIL', 'UNKNOWN', 'FAIL']);
    await observe('known invalid effect is FAIL while unresolved effect remains counted');
    proof.retainedFourConfigurationLedgers = (await retained()).map((entry) => JSON.parse(entry));
    for (let count = 4; count < 6; count += 1) {
      await next(count);
      await start();
      await advance();
      await finish('PASS');
    }
    assert.equal(await page.locator('#new-attempt').isDisabled(), true);
    assert.equal(await page.locator('#history-count').innerText(), 'Retained attempts: 6 / 6');
    const fullHistory = await retained();
    await page.locator('#new-attempt').evaluate((button) => button.dispatchEvent(new Event('click', { bubbles: true })));
    assert.match(await page.locator('#input-error').innerText(), /Six attempts retained/);
    assert.deepEqual(await retained(), fullHistory);
    await observe('six-attempt limit cannot discard completed history');
    await reset('evaluated-phase reset clears all six histories');

    await start();
    await reset('started-phase reset');
    await start();
    await advance();
    await reset('handoff-phase reset');
    await start();
    await advance();
    await finish('PASS');
    await page.locator('#executor-choice').selectOption('v1');
    await page.locator('#outcome-choice').selectOption('FAIL');
    await page.locator('#check-answer').focus();
    await page.keyboard.press('Enter');
    await reset('answered-phase reset clears interpretation and ledgers');
    await page.setViewportSize({ width: 360, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.notEqual(await page.locator('#start-schedulers').evaluate((button) => getComputedStyle(button).outlineStyle), 'none');
    await observe('narrow viewport and visible keyboard focus');
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);

    stage = 'csp-probe';
    await page.evaluate((url) => new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Owned external CSP probe could not load'));
      document.head.append(script);
    }), pathToFileURL(path.join(__dirname, 'csp-probe.js')).href);
    await page.waitForFunction(() => {
      const required = ['script-src-elem', 'style-src-elem', 'connect-src', 'base-uri', 'frame-src', 'object-src'];
      return required.every((directive) => globalThis.S078CspProbe.violations.some((entry) => entry.directive === directive));
    }, null, { timeout: 10000 });
    proof.csp = await page.evaluate(async () => {
      await globalThis.S078CspProbe.done;
      const { done, ...result } = globalThis.S078CspProbe;
      return result;
    });
    assert.equal(proof.csp.inlineExecuted, false);
    assert.equal(proof.csp.inlineStyleApplied, false);
    assert.equal(proof.csp.connectDenied, true);
    assert.equal(proof.csp.finalBase, proof.csp.originalBase);
    const directives = proof.csp.violations.map((entry) => entry.directive);
    for (const directive of ['script-src-elem', 'style-src-elem', 'connect-src', 'base-uri', 'frame-src', 'object-src']) {
      assert.ok(directives.includes(directive), `Browser must enforce ${directive}; observed: ${JSON.stringify(directives)}`);
    }
    assert.deepEqual(proof.probeNetworkRequests, []);
    assert.deepEqual(proof.pageErrors, []);
    await observe('actual CSP violations block synthetic inline/connect/base/frame/object probes');
    proof.outcome = 'PASS';
  } catch (error) {
    failure = error;
    proof.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    if (session) {
      try {
        await session.close();
        proof.cleanup.awaitedFinallyClose = true;
      } catch (error) {
        proof.cleanup.error = error.message;
        proof.outcome = 'FAIL';
        failure = failure ? new AggregateError([failure, error], 'Browser check and cleanup failed') : error;
      }
    }
    proof.completedAtUtc = new Date().toISOString();
    if (capture) fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
  }
  if (failure) throw failure;
  assert.equal(proof.cleanup.awaitedFinallyClose, true);
});
