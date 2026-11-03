'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonicalHash = (file) => sha(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')));
const sourceFiles = [
  '.gitattributes', 'README.md', 'index.html', 'styles.css', 'model.js', 'app.js', 'manifest.json',
  'writer-epochs.feature', 'tests\\model.test.cjs', 'tests\\surface.test.cjs',
  'tests\\integrity.test.cjs', 'tests\\browser.test.cjs', 'tests\\capture.cjs',
];
assert.equal(sha(fs.readFileSync(helper)), helperHash, 'Only the published qualified helper may run.');
const { openIsolatedLesson } = require(helper);
const playwrightVersion = require(path.join(repo, 'testing', 'browser', 'node_modules', 'playwright', 'package.json')).version;
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
function evidenceInventory() {
  const found = {};
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else found[path.relative(root, file)] = sha(fs.readFileSync(file));
    }
  }
  walk(path.join(root, 'evidence'));
  return found;
}

test('actual isolated DOM: writer transfer, stale replay, safety/retention failure, unknown evidence, keyboard/errors/history/reset and CSP', { timeout: 240000 }, async () => {
  const before = evidenceInventory();
  const captureId = new Date().toISOString().replace(/[:.]/g, '-');
  const proof = {
    cardId: 'A-S069', workerId: 'worker-A-S069', parentId: 'D-S069', packet: 'SC-S069',
    mode: 'synthetic', outcome: 'FAIL', runtime: process.version, playwrightVersion,
    entry: 'learning\\S069\\index.html', startedAtUtc: new Date().toISOString(),
    captureExplicitlyEnabled: capture,
    helper: { path: 'testing\\browser\\isolated.cjs', sha256: helperHash, publication: '53c0c0d' },
    testedSourceHashes: Object.fromEntries(sourceFiles.map((file) => [file, canonicalHash(file)])),
    observations: [], pageErrors: [], consoleErrors: [], exerciseNetworkRequests: [],
    probeRequests: [], probeResponses: [], screenshots: [], cleanup: {},
  };
  let session;
  let stage = 'exercise';
  try {
    assert.equal(process.version, 'v22.23.4');
    assert.equal(playwrightVersion, '1.56.1');
    if (capture) assert.equal(fs.existsSync(path.join(root, 'evidence', 'browser.json')), false, 'Deliberate capture cannot overwrite earlier proof.');
    session = await openIsolatedLesson('learning\\S069\\index.html');
    proof.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => proof.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') proof.consoleErrors.push({ stage, text: message.text() });
    });
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) (stage === 'exercise' ? proof.exerciseNetworkRequests : proof.probeRequests).push(request.url());
    });
    page.on('response', (response) => {
      if (stage === 'csp-probes' && /^https?:/.test(response.url())) proof.probeResponses.push(response.url());
    });
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.reload({ waitUntil: 'load' });
    const rows = (id) => page.locator(`#${id} tr`).evaluateAll((entries) => entries.map((row) => [...row.cells].map((cell) => cell.textContent)));
    const focused = async (id) => assert.equal(await page.evaluate(() => document.activeElement.id), id);
    const press = async (id, key = 'Enter') => {
      await page.locator(`#${id}`).focus();
      await page.keyboard.press(key);
    };
    const observe = async (name) => {
      proof.observations.push({
        name, phase: await page.locator('#phase').innerText(), gate: await page.locator('#gate').innerText(),
        authority: await page.locator('#authority-state').innerText(), grants: await page.locator('#active-grants').innerText(),
        replay: await page.locator('#replay-outcome').innerText(), writes: await page.locator('#write-counts').innerText(),
        retained: await page.locator('#retained-counts').innerText(), effects: await page.locator('#effect-count').innerText(),
        replacement: await page.locator('#replacement-outcome').innerText(), impact: await page.locator('#impact').innerText(),
        cleanup: await page.locator('#cleanup').innerText(), writeRows: await rows('write-rows'), effectRows: await rows('effect-rows'),
        assertions: await page.locator('#assertions').innerText(), trace: await page.locator('#trace').innerText(),
        history: await rows('history-rows'), prediction: await page.locator('#prediction-result').innerText(),
        alert: await page.locator('#input-error').textContent(), activeElement: await page.evaluate(() => document.activeElement.id),
      });
    };
    const screenshot = async (label) => {
      if (!capture) return;
      const file = `evidence\\browser-${captureId}-${label}.png`;
      await page.screenshot({ path: path.join(root, file), fullPage: true });
      proof.screenshots.push({ file, sha256: sha(fs.readFileSync(path.join(root, file))) });
    };
    const defaults = async () => {
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator('#authority').inputValue(), 'confirmed');
      assert.equal(await page.locator('#retention').inputValue(), 'complete');
      assert.equal(await page.locator('#prediction').inputValue(), '');
      assert.equal(await page.locator('#gate').innerText(), 'Safety gate: not evaluated');
      assert.equal(await page.locator('#authority-state').innerText(), 'Authority: not observed');
      assert.equal(await page.locator('#replay-outcome').innerText(), 'Stale grant replay: not attempted');
      assert.equal(await page.locator('#write-counts').innerText(), 'Write observations: not measured');
      assert.equal(await page.locator('#retained-counts').innerText(), 'Original acknowledgements: not verified');
      assert.equal(await page.locator('#effect-count').innerText(), 'Known effect ledger: not observed');
      assert.equal(await page.locator('#replacement-outcome').innerText(), 'Replacement write: not attempted');
      assert.equal(await page.locator('#trace').innerText(), 'No attempt started.');
      assert.equal(await page.locator('#write-rows tr').count(), 0);
      assert.equal(await page.locator('#effect-rows tr').count(), 0);
      assert.equal(await page.locator('#prediction-result').innerText(), 'Learning prediction not checked.');
      assert.equal(await page.locator('#input-error').isHidden(), true);
      assert.equal(await page.locator('#input-error').textContent(), '');
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 0);
      assert.equal(await page.locator('#assumptions').evaluate((node) => node.disabled), false);
      assert.equal(await page.locator('#begin-handoff').isEnabled(), true);
      for (const id of ['transfer-epoch', 'probe-writers', 'replay-grant', 'verify-effects', 'next-attempt', 'prediction', 'check-prediction']) {
        assert.equal(await page.locator(`#${id}`).isDisabled(), true, id);
      }
      for (const id of ['handoff-controls', 'prediction-controls']) {
        assert.equal(await page.locator(`#${id}`).evaluate((form) => typeof form.reset), 'function');
      }
      assert.equal(await page.locator('#retained-detail').isHidden(), true);
      assert.equal(await page.locator('#retained-proof').textContent(), '');
    };
    const reset = async () => {
      await press('reset-rehearsal', 'Space');
      await focused('begin-handoff');
      await defaults();
      assert.equal(await page.locator('#history-count').innerText(), 'Retained attempts: 0 / 6');
      assert.equal(await page.locator('#history-rows tr').count(), 0);
    };
    const next = async (settings) => {
      const retained = await rows('history-rows');
      await press('next-attempt');
      await focused('begin-handoff');
      await defaults();
      assert.deepEqual(await rows('history-rows'), retained);
      for (const [id, value] of Object.entries(settings || {})) await page.locator(`#${id}`).selectOption(value);
    };
    const conduct = async () => {
      for (const [id, focus] of [
        ['begin-handoff', 'transfer-epoch'], ['transfer-epoch', 'probe-writers'],
        ['probe-writers', 'replay-grant'], ['replay-grant', 'verify-effects'], ['verify-effects', 'prediction'],
      ]) {
        await press(id, id === 'transfer-epoch' ? 'Space' : 'Enter');
        await focused(focus);
      }
    };
    const prediction = async (value, correct) => {
      await page.locator('#prediction').selectOption(value);
      await press('check-prediction');
      assert.match(await page.locator('#prediction-result').innerText(), new RegExp(`Learning prediction: ${correct ? 'correct' : 'incorrect'}`));
      assert.equal(await page.locator('#prediction').isDisabled(), true);
    };

    await defaults();
    assert.equal(await page.getByRole('note').innerText(), 'Training rehearsal - synthetic data - not a live Azure result');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
    await page.keyboard.press('Enter');
    await focused('lesson-main');
    await page.locator('#authority').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#authority').inputValue(), 'bypassed');
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.locator('#authority').inputValue(), 'confirmed');

    await press('begin-handoff');
    await focused('transfer-epoch');
    assert.equal(await page.locator('#assumptions').evaluate((node) => node.disabled), true);
    assert.deepEqual((await rows('write-rows')).map((row) => row[4]), ['accepted', 'accepted']);
    await press('transfer-epoch', 'Space');
    await focused('probe-writers');
    assert.match(await page.locator('#authority-state').innerText(), /writer-new@42/);
    assert.equal(await page.locator('#write-rows tr').count(), 2);
    await press('probe-writers');
    await focused('replay-grant');
    assert.deepEqual((await rows('write-rows')).slice(2).map((row) => [row[0], row[1], row[2], row[4]]), [
      ['SYN-693', 'writer-new', '42', 'accepted'], ['SYN-694', 'writer-old', '41', 'rejected'],
      ['SYN-695', 'writer-new', '41', 'rejected'],
    ]);
    await press('replay-grant');
    assert.equal(await page.locator('#replay-outcome').innerText(), 'Stale grant replay: rejected');
    assert.equal(await page.locator('#active-grants').innerText(), 'Active grants: writer-new@42');
    await press('verify-effects');
    await focused('prediction');
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: PASS');
    assert.equal(await page.locator('#write-counts').innerText(), 'Write observations: 3 accepted / 3 rejected / 0 held / 0 unknown · attempted: 6');
    assert.equal(await page.locator('#retained-counts').innerText(), 'Original acknowledgements: 2 / 2 retained unchanged · missing: none');
    await press('check-prediction');
    await focused('prediction');
    assert.match(await page.locator('#input-error').innerText(), /Prediction requires the exact/);
    assert.equal(await page.locator('#prediction').getAttribute('aria-invalid'), 'true');
    assert.match(await page.locator('#prediction').getAttribute('aria-describedby'), /input-error/);
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: PASS');
    await prediction('FAIL', false);
    await press('inspect-attempt-1');
    await focused('retained-title');
    const first = JSON.parse(await page.locator('#retained-proof').innerText());
    assert.equal(first.verdict, 'PASS');
    assert.equal(first.prediction.correct, false);
    assert.equal(first.originalAcknowledged.length, 2);
    assert.equal(first.writes.length, 6);
    await press('hide-retained');
    await focused('inspect-attempt-1');
    await observe('confirmed fencing PASS; stale replay rejected; wrong learning answer does not change safety');

    await next({ authority: 'bypassed' });
    await conduct();
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: FAIL');
    assert.equal(await page.locator('#replay-outcome').innerText(), 'Stale grant replay: regained');
    assert.match(await page.locator('#authority-state').innerText(), /writer-old@41 · high-water epoch: 42/);
    assert.equal(await page.locator('#active-grants').innerText(), 'Active grants: writer-old@41, writer-new@42');
    assert.match(await page.locator('#write-counts').innerText(), /5 accepted \/ 1 rejected \/ 0 held \/ 0 unknown/);
    await prediction('FAIL', true);
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: FAIL');
    await observe('unsafe competing writers FAIL; stale grant regained; correct learning answer is not safety');
    await screenshot('failure');

    await next({ authority: 'unavailable' });
    await conduct();
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: UNKNOWN');
    assert.equal(await page.locator('#active-grants').innerText(), 'Active grants: UNKNOWN');
    assert.equal(await page.locator('#replacement-outcome').innerText(), 'Replacement write: held');
    assert.match(await page.locator('#write-counts').innerText(), /2 accepted \/ 0 rejected \/ 1 held \/ 3 unknown/);
    assert.deepEqual((await rows('write-rows')).slice(2).map((row) => row[4]), ['held', 'unknown', 'unknown', 'unknown']);
    await prediction('UNKNOWN', true);
    await observe('unavailable authority UNKNOWN; replacement held; missing observations are not rejection');
    await screenshot('unknown');

    await next({ authority: 'unavailable', retention: 'missing-effect' });
    await conduct();
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: FAIL');
    assert.equal(await page.locator('#retained-counts').innerText(), 'Original acknowledgements: 1 / 2 retained unchanged · missing: SYN-692');
    assert.match(await page.locator('#assertions').innerText(), /UNKNOWN/);
    assert.match(await page.locator('#assertions').innerText(), /FAIL — Both originally acknowledged/);
    await prediction('FAIL', true);
    await observe('lost acknowledged SYN-692 FAIL dominates unknown authority evidence');

    await next({ retention: 'missing-effect' });
    await conduct();
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: FAIL');
    assert.equal(await page.locator('#replacement-outcome').innerText(), 'Replacement write: accepted');
    await prediction('FAIL', true);
    await observe('confirmed fencing still FAILS when acknowledged data is missing');

    await next();
    await conduct();
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: PASS');
    await prediction('PASS', true);
    await focused('reset-rehearsal');
    assert.equal(await page.locator('#history-count').innerText(), 'Retained attempts: 6 / 6');
    assert.equal(await page.locator('#next-attempt').isDisabled(), true);
    assert.match(await page.locator('#history-limit').innerText(), /All six proofs remain/);
    await page.locator('#next-attempt').evaluate((node) => { node.disabled = false; });
    await press('next-attempt');
    await focused('input-error');
    assert.match(await page.locator('#input-error').innerText(), /capacity is six/);
    assert.equal(await page.locator('#history-rows tr').count(), 6);
    assert.equal(await page.locator('#next-attempt').isDisabled(), true);
    await press('inspect-attempt-2');
    const retainedFailure = JSON.parse(await page.locator('#retained-proof').innerText());
    assert.equal(retainedFailure.verdict, 'FAIL');
    assert.equal(retainedFailure.replayResult, 'regained');
    assert.equal(retainedFailure.prediction.correct, true);
    assert.equal(retainedFailure.originalAcknowledged.length, 2);
    assert.equal(retainedFailure.authority.grants.length, 2);
    await observe('six-proof hard cap and earlier failure retained after later PASS');
    await reset();
    await page.locator('#authority').selectOption('bypassed');
    await page.locator('#retention').selectOption('missing-effect');
    await conduct();
    assert.equal(await page.locator('#gate').innerText(), 'Safety gate: FAIL');
    assert.equal(await page.locator('#retained-counts').innerText(), 'Original acknowledgements: 1 / 2 retained unchanged · missing: SYN-692');
    await observe('sixth configuration: competing writers and missing acknowledgement both FAIL');
    await reset();

    for (const id of ['authority', 'retention']) {
      await page.locator(`#${id}`).evaluate((select) => {
        const invalid = document.createElement('option');
        invalid.value = 'unregistered-input';
        invalid.textContent = '<img src=x onerror=alert(1)>';
        select.append(invalid);
        select.value = invalid.value;
      });
      await press('begin-handoff');
      await focused(id);
      assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
      assert.equal(await page.locator(`#${id}`).getAttribute('aria-invalid'), 'true');
      assert.match(await page.locator(`#${id}`).getAttribute('aria-describedby'), /input-error/);
      assert.match(await page.locator('#input-error').innerText(), /exact primitive enum value/);
      assert.equal(await page.locator('#input-error img').count(), 0);
      await observe(`invalid ${id} is associated, rejected and mutation-free`);
      await reset();
    }
    await page.locator('#verify-effects').evaluate((node) => { node.disabled = false; });
    await press('verify-effects');
    await focused('input-error');
    assert.match(await page.locator('#input-error').innerText(), /requires phase replayed/);
    assert.equal(await page.locator('#phase').innerText(), 'Phase: idle');
    assert.equal(await page.locator('#verify-effects').isDisabled(), true);
    await reset();
    await press('begin-handoff');
    await page.locator('#begin-handoff').evaluate((node) => { node.disabled = false; });
    await press('begin-handoff');
    assert.match(await page.locator('#input-error').innerText(), /requires phase idle; current phase is begun/);
    assert.equal(await page.locator('#write-rows tr').count(), 2);
    await observe('forced skipped/repeated controls remain guarded by actual model state');
    await reset();

    const actions = ['begin-handoff', 'transfer-epoch', 'probe-writers', 'replay-grant', 'verify-effects'];
    const phases = ['idle', 'begun', 'transferred', 'probed', 'replayed', 'complete'];
    for (let count = 0; count <= actions.length; count++) {
      await page.locator('#authority').selectOption('bypassed');
      await page.locator('#retention').selectOption('missing-effect');
      for (const id of actions.slice(0, count)) await press(id);
      assert.equal(await page.locator('#phase').innerText(), `Phase: ${phases[count]}`);
      if (count === actions.length) await prediction('FAIL', true);
      await reset();
    }
    await observe('all six phases reset inputs, locks, errors, proof, predictions and history; native form.reset remains callable');
    await page.setViewportSize({ width: 360, height: 800 });
    await press('begin-handoff');
    await focused('transfer-epoch');
    proof.narrowViewport = await page.evaluate(() => {
      const active = getComputedStyle(document.activeElement);
      return {
        width: innerWidth, bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        visibleKeyboardFocus: active.outlineStyle !== 'none' && parseFloat(active.outlineWidth) >= 3,
      };
    });
    assert.equal(proof.narrowViewport.bodyOverflow, false);
    assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
    await reset();
    assert.deepEqual(proof.pageErrors, []);
    assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
    assert.deepEqual(proof.exerciseNetworkRequests, []);
    stage = 'csp-probes';
    proof.csp = await page.evaluate(async () => {
      const violations = [];
      const listener = (event) => violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI });
      document.addEventListener('securitypolicyviolation', listener);
      const script = document.createElement('script');
      script.textContent = 'globalThis.__S069InlineExecuted = true;';
      document.head.append(script);
      let connection;
      try { await fetch('https://synthetic.invalid/S069-csp-only'); connection = 'UNEXPECTED_RESPONSE'; }
      catch (error) { connection = error.name; }
      await new Promise((resolve) => setTimeout(resolve, 100));
      script.remove();
      document.removeEventListener('securitypolicyviolation', listener);
      return { inlineRan: globalThis.__S069InlineExecuted === true, connection, violations };
    });
    assert.equal(proof.csp.inlineRan, false);
    assert.equal(proof.csp.connection, 'TypeError');
    assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
    assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
    assert.deepEqual(proof.probeResponses, []);
    proof.outcome = 'PASS';
  } catch (error) {
    proof.error = { name: error.name, message: error.message, stack: error.stack };
    throw error;
  } finally {
    try {
      if (session) {
        proof.cleanup.closeAwaited = true;
        try {
          await session.close();
          proof.cleanup.closed = true;
        } catch (error) {
          proof.outcome = 'FAIL';
          proof.cleanup.error = error.message;
          throw error;
        }
      }
    } finally {
      proof.completedAtUtc = new Date().toISOString();
      if (capture) {
        const file = proof.outcome === 'PASS' ? 'browser.json' : `browser-failed-${captureId}.json`;
        fs.writeFileSync(path.join(root, 'evidence', file), `${JSON.stringify(proof, null, 2)}\n`, { flag: 'wx' });
      } else {
        assert.deepEqual(evidenceInventory(), before, 'Ordinary browser verification must not rewrite retained proof.');
      }
    }
  }
});
