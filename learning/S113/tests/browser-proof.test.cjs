'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { evidence, repo, hash, lf, read, json, tree } = require('../tools/proof.cjs');
const { shouldCapture } = require('../tools/browser.cjs');
const names = () => fs.readdirSync(evidence).filter((name) => /^browser-\d+\.json$/.test(name)).sort();
const latest = () => json(path.join('evidence', names().at(-1)));
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(evidence, entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
};

test('only exact string one authorizes deliberate capture; other types and strings are denied', () => {
  for (const value of [undefined, null, '', false, true, 0, 1, [], {}, 'true', '0', '01', '1 ', ' 1', ' 1 ', '1\n', 'yes']) {
    assert.equal(shouldCapture(value), false);
  }
  assert.equal(shouldCapture('1'), true);
});

test('historical browser proof is raw-byte bound and latest proof matches current normalized inputs', () => {
  assert.ok(names().length >= 1, 'Actual browser evidence must be deliberately captured before this gate.');
  for (const name of names()) {
    const report = json(path.join('evidence', name));
    for (const entry of report.inputs) {
      const bytes = raw(entry);
      assert.equal(hash(lf(bytes)), entry.normalizedLfSha256);
      if (name === names().at(-1)) assert.equal(hash(lf(read(entry.source))), entry.normalizedLfSha256);
    }
    const observations = JSON.parse(raw(report.observationsRaw));
    assert.deepEqual(observations.steps, report.steps);
    assert.equal(observations.passed, report.passed);
    assert.deepEqual(JSON.parse(raw(report.preflightRaw).toString('utf8').replace(/^\uFEFF/, '')), report.preflight);
    assert.equal(report.captureWasExactOne, true);
  }
  const report = latest();
  assert.equal(report.passed, true);
  assert.equal(report.failure, null);
  assert.equal(report.closeAwaited, true);
  assert.equal(report.pageClosed, true);
  assert.equal(report.cardId, 'A-S113');
  assert.equal(report.workerId, 'worker-A-S113');
  assert.equal(report.packet, 'SC-S113');
  assert.equal(report.mode, 'synthetic');
  assert.equal(report.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(report.helperCanonicalLfSha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.equal(report.playwrightVersion, '1.56.1');
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.preflight.signatureStatus, 'Valid');
  assert.match(report.preflight.signer, /CN=Microsoft Corporation/);
  assert.equal(report.toolingNode, 'v22.23.4');
  assert.equal(report.productionNode24Validated, false);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.deniedNetworkRoutes, []);
  assert.ok(report.requestedUrls.every((url) => new URL(url).protocol === 'file:'));
});

test('actual DOM proves positive, negative, unknown, keyboard, errors, reset, failures and enforced CSP', () => {
  const report = latest();
  const step = (name) => {
    const match = report.steps.find((entry) => entry.name === name);
    assert.ok(match, `Missing actual DOM observation: ${name}`);
    return match.dom;
  };
  assert.equal(step('initial standalone DOM and unknown observations').nativeResetType, 'function');
  assert.equal(step('keyboard opens exact source contract through native details summary').focus, 'SUMMARY');
  assert.equal(step('keyboard exclusive fenced writer is not yet verified evacuation').gates.routes.result, 'UNKNOWN');
  assert.match(step('keyboard exclusive fenced writer is not yet verified evacuation').evacuation, /^UNVERIFIED/);
  const positive = step('keyboard positive evacuation only after both sampled routes and journeys');
  assert.equal(positive.status.result, 'positive');
  assert.equal(positive.history.length, 5);
  assert.ok(Object.values(positive.gates).every((gate) => gate.result === 'POSITIVE'));
  const cold = step('keyboard cold handoff is blocked before fencing and retains history');
  assert.equal(cold.status.result, 'negative');
  assert.equal(cold.gates.capacity.result, 'NEGATIVE');
  assert.equal(cold.gates.fence.result, 'UNKNOWN');
  assert.deepEqual(cold.history.slice(0, 5), positive.history);
  assert.equal(step('stale prerequisite and exclusive-writer check').gates.state.result, 'NEGATIVE');
  assert.match(step('split prerequisite and exclusive-writer check').gates.fence.detail, /eligible writers: 2/);
  const missing = step('missing prerequisite and exclusive-writer check');
  assert.equal(missing.status.result, 'unknown');
  assert.match(missing.metrics, /unknown: 2; effects: UNKNOWN/);
  const lag = step('route-lag sampled migration outcomes');
  assert.equal(lag.gates.fence.result, 'POSITIVE');
  assert.equal(lag.gates.routes.result, 'NEGATIVE');
  assert.equal(lag.gates.journeys.result, 'POSITIVE');
  const failure = step('journey-failure sampled migration outcomes');
  assert.equal(failure.gates.routes.result, 'POSITIVE');
  assert.equal(failure.gates.journeys.result, 'NEGATIVE');
  assert.equal(failure.samples[1].cells[5], '0');
  assert.match(failure.metrics, /Successful: 1; interrupted: 1/);
  assert.match(failure.owner, /^region-violet — epoch 8/);
  assert.equal(failure.history.length, 31);
  assert.deepEqual(step('eighth-run budget guard shows focused error without history mutation').history, failure.history);
  for (const name of ['eighth-run budget guard shows focused error without history mutation',
    'forged enabled migration control cannot bypass state-order guard',
    'strict malformed fixture input shows focused error without mutation']) {
    const dom = step(name);
    assert.equal(dom.focus, 'error');
    assert.equal(dom.error.hidden, false);
    assert.equal(dom.error.role, 'alert');
  }
  const reset = step('keyboard reset clears teaching history and restores native form defaults');
  assert.equal(reset.history.length, 0);
  assert.equal(reset.focus, 'fixture');
  assert.equal(reset.nativeResetType, 'function');
  assert.equal(step('valid action recovers error UX without a reload').error.hidden, true);
  assert.equal(step('keyboard reset after recovery clears outcomes and errors').history.length, 0);
  assert.equal(report.csp.probeContext, 'normal document external script');
  assert.equal(report.csp.inlineExecuted, false);
  assert.equal(report.csp.evalExecuted, false);
  assert.equal(report.csp.evalError, 'EvalError');
  assert.equal(report.csp.fetchResolved, false);
  assert.equal(report.csp.fetchError, 'TypeError');
  assert.ok(report.csp.violations.some((event) => event.blockedURI === 'inline'));
  assert.ok(report.csp.violations.some((event) => event.blockedURI === 'eval'));
  assert.ok(report.csp.violations.some((event) => event.directive === 'connect-src'));
  assert.ok(report.csp.violations.every((event) => event.disposition === 'enforce'));
});

test('actual browser replay with string true is read-only and preserves every historical lesson/proof byte', () => {
  const before = tree();
  const result = spawnSync(process.execPath, ['learning\\S113\\tools\\browser.cjs'],
    { cwd: repo, encoding: 'utf8', timeout: 120000, env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: 'true' } });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.signal, null);
  assert.equal(result.error, undefined);
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.passed, true);
  assert.equal(summary.readOnly, true);
  assert.equal(summary.evidenceFile, null);
  assert.equal(summary.closeAwaited, true);
  assert.equal(summary.pageClosed, true);
  assert.ok(summary.actualDomObservations >= 20);
  assert.deepEqual(tree(), before);
});
