'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const helperPath = path.resolve(__dirname, '..', '..', '..', 'testing', 'browser', 'isolated.cjs');
const helperSha256 = createHash('sha256').update(fs.readFileSync(helperPath)).digest('hex');
const { openIsolatedLesson } = require(helperPath);
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';

function writeCapture(observation, screenshot) {
  if (!capture) return;
  const raw = path.resolve(__dirname, '..', 'evidence', 'raw');
  fs.mkdirSync(raw, { recursive: true });
  const id = `browser-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const destination = path.join(raw, id);
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'observation.json'), JSON.stringify(observation, null, 2) + '\n', { flag: 'wx' });
  if (screenshot) fs.writeFileSync(path.join(destination, 'retained-history.png'), screenshot, { flag: 'wx' });
  console.log(`Deliberate unique raw browser capture: learning\\S144\\evidence\\raw\\${id}`);
}

test('actual isolated browser: keyboard, combined pass/failure/unknown, retained history, errors, reset, and CSP', {
  timeout: 180000,
}, async () => {
  const observation = {
    schemaVersion: 1, cardId: 'A-S144', workerId: 'worker-A-S144',
    mode: 'real-local-browser-check-of-fixed-fictional-teaching-data-only',
    helperSha256, runtime: process.version, playwright: '1.56.1',
    startedAtUtc: new Date().toISOString(), outcome: 'running',
    cases: [], pageErrors: [], unexpectedNetworkRequests: [], cleanup: 'not-yet-observed',
    nativeProof: false, productionNode24Proof: false, originalSourceParentProof: false,
  };
  let session;
  let screenshot;
  let failure;
  async function check(name, action) {
    try {
      const actual = await action();
      observation.cases.push({ name, passed: true, actual });
    } catch (error) {
      observation.cases.push({
        name, passed: false,
        error: { name: error.name, message: error.message, stack: error.stack, actual: error.actual, expected: error.expected },
      });
      throw error;
    }
  }
  try {
    assert.equal(helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
    assert.equal(process.version, 'v22.23.4');
    assert.equal(require(path.join(path.dirname(helperPath), 'node_modules', 'playwright', 'package.json')).version, '1.56.1');
    session = await openIsolatedLesson('learning\\S144\\index.html');
    observation.browserVersion = session.browserVersion;
    assert.match(session.browserVersion, /^156\./);
    const page = session.page;
    page.on('pageerror', (error) => observation.pageErrors.push(error.message));
    page.on('request', (request) => {
      if (/^https?:/.test(request.url())) observation.unexpectedNetworkRequests.push(request.url());
    });
    const text = (id) => page.locator(`#${id}`).textContent();
    const active = () => page.evaluate(() => document.activeElement.id);
    async function reset() {
      await page.locator('#start-again').click();
      assert.match(await text('phase'), /^idle/);
      assert.equal(await page.locator('#history').isVisible(), false);
      assert.equal(await page.locator('#trace').isVisible(), false);
    }
    async function run(profile) {
      await page.locator('#profile').selectOption(profile);
      await page.locator('#conduct').click();
      assert.equal(await page.locator('#trace').isVisible(), false);
      await page.locator('#inspect').click();
      assert.equal(await page.locator('#trace').isVisible(), true);
      await page.locator('#measure').click();
      return JSON.parse(await text('raw-output'));
    }

    await check('initial load and keyboard invalid-selection error', async () => {
      assert.equal(await text('training-banner'), 'Training rehearsal - synthetic data - not a live Azure result');
      await page.locator('#profile').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'conduct');
      await page.keyboard.press('Enter');
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.match(await text('error'), /Choose one of the four fixed teaching profiles/);
      assert.equal(await active(), 'error');
      assert.match(await text('phase'), /^idle · revision 0$/);
      return { banner: await text('training-banner'), error: await text('error'), focus: await active(), phase: await text('phase') };
    });

    await check('keyboard conduct-inspect-measure inclusive boundary', async () => {
      await page.locator('#profile').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#profile').inputValue(), 'boundary');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      assert.match(await text('phase'), /^conducted/);
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#trace').isVisible(), false);
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'inspect');
      await page.keyboard.press('Enter');
      assert.match(await text('phase'), /^inspected/);
      assert.equal(await page.locator('#isolated-rows tr').count(), 5);
      assert.equal(await page.locator('#tier-rows tr').count(), 5);
      assert.equal(await page.locator('#contributor-rows tr').count(), 3);
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'measure');
      await page.keyboard.press('Enter');
      const actual = JSON.parse(await text('raw-output'));
      assert.equal(actual.shared.observedConnections, 12);
      assert.equal(actual.verdict, 'pass');
      assert.equal(actual.throughput.knownLowerBoundPerSecond, 0.3);
      assert.equal(actual.journeys.every((row) => row.completedMs === 1500), true);
      assert.equal(await page.locator('#mitigate').isDisabled(), true);
      assert.match(await text('queue-result'), /Queue depth 4 \/ 4: pass\. Worker wait 400 \/ 400 ms: pass/);
      assert.match(await text('history-summary'), /3 attempted; 3 successful; 0 interrupted; 0 unknown/);
      return { measurement: actual, resourceDOM: await text('resource-result'), queueDOM: await text('queue-result'), historyDOM: await text('history-summary') };
    });

    await check('keyboard evidence-based identification and explicit reset', async () => {
      await page.locator('#bottleneck-choice').focus();
      await page.keyboard.press('Home');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.locator('#bottleneck-choice').inputValue(), 'within-observed-budgets');
      await page.keyboard.press('Tab');
      assert.equal(await active(), 'identify');
      await page.keyboard.press('Enter');
      assert.match(await text('feedback'), /^Correct:/);
      const feedback = await text('feedback');
      await page.locator('#start-again').focus();
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'profile');
      assert.equal(await page.locator('#profile').inputValue(), '');
      assert.equal(await page.locator('#history').isVisible(), false);
      assert.equal(await page.locator('#measurement').isVisible(), false);
      assert.equal(await text('raw-output'), '');
      assert.equal(await text('feedback'), '');
      assert.match(await text('phase'), /^idle · revision 5$/);
      assert.match(await text('notice'), /Explicit reset cleared/);
      return { feedback, resetPhase: await text('phase'), resetFocus: await active(), clearedMeasurement: await text('raw-output') };
    });

    await check('forged DOM selection is rejected and reset recovers without a form.reset shadow', async () => {
      await page.evaluate(() => {
        const option = new Option('Forged input', 'forged');
        document.getElementById('profile').add(option);
        document.getElementById('profile').value = 'forged';
      });
      await page.locator('#conduct').click();
      assert.match(await text('error'), /fixed teaching profiles/);
      assert.equal(await active(), 'error');
      const rejected = await text('error');
      await reset();
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await text('error'), '');
      assert.equal(await page.locator('#profile').isDisabled(), false);
      assert.equal(await page.evaluate(() => typeof document.getElementById('conduct-form').reset), 'function');
      await page.evaluate(() => document.querySelector('#profile option[value="forged"]').remove());
      return { rejected, resetError: await text('error'), resetPhase: await text('phase'), nativeFormResetType: 'function' };
    });

    await check('coupled overload exposes exact shared and downstream breach plus affected journeys', async () => {
      const actual = await run('overload');
      assert.equal(actual.isolated.passingTierIds.length, 5);
      assert.equal(actual.shared.observedConnections, 16);
      assert.deepEqual(actual.counts, { attempted: 3, successful: 0, interrupted: 2, unknown: 1 });
      assert.equal(actual.verdict, 'fail');
      assert.equal(actual.bottleneck.rootCause, 'unobserved');
      assert.equal(await page.locator('#journey-rows tr').count(), 3);
      assert.match(await text('resource-result'), /16 \/ 12; fail/);
      assert.match(await text('queue-result'), /Queue depth 8 \/ 4: fail\. Worker wait 600 \/ 400 ms: fail/);
      const rendered = await page.locator('#journey-rows').innerText();
      assert.match(rendered, /initial-browse.*1600.*interrupted/s);
      assert.match(rendered, /initial-checkout.*lost-client-state/s);
      assert.match(rendered, /initial-export.*unobserved.*unknown.*client-completion/s);
      await page.locator('#bottleneck-choice').selectOption('worker-queue');
      await page.locator('#identify').click();
      assert.match(await text('feedback'), /^Not supported:/);
      const wrongFeedback = await text('feedback');
      await page.locator('#bottleneck-choice').selectOption('database-connections');
      await page.locator('#identify').click();
      assert.match(await text('feedback'), /^Correct:/);
      return { measurement: actual, journeyDOM: rendered, wrongFeedback, correctFeedback: await text('feedback') };
    });

    await check('unrelated successful probe has no causal or completion effect', async () => {
      const before = { output: await text('raw-output'), history: await text('history-summary') };
      await page.locator('#probe').click();
      assert.match(await text('probe-result'), /Unrelated probe: HTTP 200/);
      assert.match(await text('probe-result'), /establishes neither/);
      assert.equal(await text('raw-output'), before.output);
      assert.equal(await text('history-summary'), before.history);
      assert.equal(await page.locator('#probe').isDisabled(), true);
      return { probeDOM: await text('probe-result'), unchangedMeasuredOutput: true, unchangedHistory: await text('history-summary') };
    });

    await check('fresh mitigation passes but retained interrupted and unknown original journeys do not change', async () => {
      await page.locator('#mitigate').click();
      assert.match(await text('phase'), /^conducted.*mitigated/);
      assert.equal(await page.locator('#measurement').isVisible(), false);
      assert.match(await text('history-summary'), /2 interrupted; 1 unknown/);
      await page.locator('#inspect').click();
      await page.locator('#measure').click();
      const actual = JSON.parse(await text('raw-output'));
      assert.equal(actual.windowId, 'combined-follow-up');
      assert.equal(actual.shared.observedConnections, 11);
      assert.equal(actual.verdict, 'pass');
      assert.match(await text('history-summary'), /2 measured windows: 6 attempted; 3 successful; 2 interrupted; 1 unknown\. Retained verdict: fail/);
      assert.match(await text('retained-original'), /initial-browse.*initial-checkout.*initial-export/);
      assert.match(await page.locator('#history-list').innerText(), /combined-initial: fail.*initial-export unknown/s);
      assert.equal(await page.locator('#mitigate').isDisabled(), true);
      assert.equal(await page.locator('#measure').isDisabled(), true);
      if (capture) screenshot = await page.screenshot({ fullPage: true });
      return {
        measurement: actual, retainedHistoryDOM: await text('history-summary'),
        retainedJourneyDOM: await text('retained-original'),
        screenshotState: capture ? 'overload plus fresh passing mitigation and retained original outcomes' : 'not captured',
      };
    });

    await check('unknown DOM reports missing completion and resource, not empty-success', async () => {
      await reset();
      const actual = await run('unknown');
      assert.equal(actual.verdict, 'unknown');
      assert.equal(actual.shared.observedConnections, null);
      assert.equal(actual.throughput.status, 'unknown');
      assert.deepEqual(actual.counts, { attempted: 3, successful: 0, interrupted: 0, unknown: 3 });
      assert.match(await text('resource-result'), /unobserved \/ 12; unknown/);
      assert.match(await text('current-verdict'), /UNKNOWN/);
      await page.locator('#bottleneck-choice').selectOption('unobserved');
      await page.locator('#identify').click();
      assert.match(await text('feedback'), /^Correct:/);
      return { measurement: actual, verdictDOM: await text('current-verdict'), resourceDOM: await text('resource-result'), feedback: await text('feedback') };
    });

    await check('known latency interruption DOM does not invent an unobserved shared cause', async () => {
      await reset();
      const actual = await run('gap');
      assert.equal(actual.verdict, 'fail');
      assert.equal(actual.shared.status, 'unknown');
      assert.equal(actual.bottleneck.observedResource, null);
      assert.equal(actual.journeys[0].completedMs, 1501);
      assert.equal(actual.journeys[2].completedMs, null);
      assert.match(await page.locator('#journey-rows').innerText(), /1501.*original-latency-budget/s);
      await page.locator('#bottleneck-choice').selectOption('unobserved');
      await page.locator('#identify').click();
      assert.match(await text('feedback'), /^Correct:/);
      assert.match(await text('bottleneck-result'), /Physical root cause: unobserved/);
      return { measurement: actual, bottleneckDOM: await text('bottleneck-result'), feedback: await text('feedback') };
    });

    await check('actual script and style CSP enforcement, without network probes or unsafe flags', async () => {
      await page.evaluate(() => {
        globalThis.__s144Violations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
          globalThis.__s144Violations.push({
            directive: event.effectiveDirective, blockedURI: event.blockedURI,
          });
        });
        const script = document.createElement('script');
        script.textContent = 'globalThis.__s144Forbidden = true;';
        document.body.append(script);
        const style = document.createElement('style');
        style.textContent = '#training-banner { --s144-forbidden-style: injected; }';
        document.head.append(style);
      });
      await page.waitForFunction(() => globalThis.__s144Violations.length >= 2);
      const actual = await page.evaluate(() => ({
        violations: globalThis.__s144Violations,
        forbiddenScriptExecuted: globalThis.__s144Forbidden === true,
        forbiddenStyle: getComputedStyle(document.getElementById('training-banner')).getPropertyValue('--s144-forbidden-style'),
        allowedExternalStyle: getComputedStyle(document.getElementById('training-banner')).backgroundColor,
        policy: document.querySelector('meta[http-equiv="Content-Security-Policy"]').content,
      }));
      assert.equal(actual.forbiddenScriptExecuted, false);
      assert.equal(actual.forbiddenStyle, '');
      assert.equal(actual.allowedExternalStyle, 'rgb(22, 57, 80)');
      assert.ok(actual.violations.some((item) => item.directive.startsWith('script-src') && item.blockedURI === 'inline'));
      assert.ok(actual.violations.some((item) => item.directive.startsWith('style-src') && item.blockedURI === 'inline'));
      assert.match(actual.policy, /connect-src 'none'/);
      assert.match(actual.policy, /form-action 'none'/);
      assert.deepEqual(observation.unexpectedNetworkRequests, []);
      return actual;
    });

    await check('final keyboard reset clears error, selections, measurements and history', async () => {
      await page.locator('#start-again').focus();
      await page.keyboard.press('Enter');
      assert.equal(await active(), 'profile');
      assert.equal(await page.locator('#profile').inputValue(), '');
      assert.equal(await page.locator('#bottleneck-choice').inputValue(), '');
      assert.equal(await page.locator('#error').isVisible(), false);
      assert.equal(await page.locator('#history').isVisible(), false);
      assert.equal(await page.locator('#trace').isVisible(), false);
      assert.equal(await text('raw-output'), '');
      assert.equal(await text('feedback'), '');
      assert.deepEqual(observation.pageErrors, []);
      assert.deepEqual(observation.unexpectedNetworkRequests, []);
      return { phase: await text('phase'), focus: await active(), historyVisible: false, output: await text('raw-output'), pageErrors: observation.pageErrors };
    });
    observation.outcome = 'passed';
  } catch (error) {
    failure = error;
    observation.outcome = 'failed';
    observation.failure = { name: error.name, message: error.message, stack: error.stack };
  } finally {
    try {
      if (session) {
        await session.close();
        observation.cleanup = 'published helper close awaited and returned';
      } else {
        observation.cleanup = 'No returned session; setup cleanup not independently observed';
      }
    } catch (error) {
      observation.cleanup = `close rejected: ${error.message}`;
      observation.outcome = 'failed';
      failure = failure ? new AggregateError([failure, error], 'Browser verification and cleanup both failed') : error;
    }
    observation.finishedAtUtc = new Date().toISOString();
    writeCapture(observation, screenshot);
  }
  if (failure) throw failure;
});
