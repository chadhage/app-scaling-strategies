'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const report = JSON.parse(fs.readFileSync(path.join(evidence, 'browser.json'), 'utf8'));
const raw = (entry) => {
  const bytes = gunzipSync(fs.readFileSync(path.join(evidence, entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
};
const step = (name) => {
  const found = report.steps.find((item) => item.name === name);
  assert.ok(found, `Missing actual DOM observation: ${name}`);
  return found.dom;
};

test('actual-browser raw proof binds observed DOM to current canonical lesson bytes', () => {
  assert.equal(report.status, 'passed');
  assert.equal(report.cardId, 'A-S110');
  assert.equal(report.workerId, 'worker-A-S110');
  assert.equal(report.packet, 'SC-S110');
  assert.equal(report.captureEnabled, true);
  assert.equal(report.lessonAndHistoryUnchangedBeforeCapture, true);
  assert.equal(report.failure, null);
  const { rawReport, ...data } = report;
  assert.deepEqual(JSON.parse(raw(rawReport)), data);
  for (const snapshot of report.snapshots) {
    const historical = raw(snapshot);
    const current = fs.readFileSync(path.join(root, snapshot.source));
    assert.equal(hash(lf(historical)), snapshot.lfSha256);
    assert.deepEqual(lf(current), lf(historical));
  }
  assert.ok(report.snapshots.some((item) => item.source === 'model.js'));
  assert.ok(report.snapshots.some((item) => item.source === 'tools\\browser.cjs'));
});

test('signed Edge, exact Playwright/helper and awaited close are measured, not inferred', () => {
  assert.match(report.runtime, /^v22\./);
  assert.equal(report.playwright, '1.56.1');
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.preflight.signatureStatus, 'Valid');
  assert.match(report.preflight.signer, /CN=Microsoft Corporation/);
  assert.equal(report.browserVersion, report.preflight.version);
  assert.deepEqual(JSON.parse(raw(report.preflightRaw)), report.preflight);
  assert.equal(report.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(report.helperCanonicalGitSha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.equal(report.closeAwaited, true);
  assert.equal(report.pageClosed, true);
  assert.deepEqual(report.pageErrors, []);
});

test('keyboard nominal-only rejection and stale-route negative remain in actual retained DOM', () => {
  const initial = step('initial standalone DOM');
  assert.equal(initial.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(initial.nativeResetType, 'function');
  const changed = step('keyboard nominal change leaves observed gates unknown');
  assert.match(changed.nominal, /100% to origin-v2/);
  assert.equal(changed.propagation, 'UNKNOWN');
  assert.equal(changed.drain, 'UNKNOWN');
  assert.equal(changed.focus, 'sample-pops');
  const premature = step('keyboard nominal-only retirement is unverified and retained');
  assert.equal(premature.decision, 'UNVERIFIED');
  assert.match(premature.oldOrigin, /^RETAINED/);
  const stale = step('keyboard stale effective route is measured despite 100 percent desired');
  assert.equal(stale.rows[1].cells[2], 'origin-v1');
  assert.equal(stale.propagation, 'NEGATIVE');
  const negative = step('keyboard negative retirement retains origin and premature history');
  assert.equal(negative.decision, 'BLOCKED');
  assert.deepEqual(negative.history.slice(0, 2), premature.history);
  assert.equal(negative.focus, 'fixture');
});

test('positive, unknown, undrained and failed journeys have distinct actual DOM results', () => {
  const before = step('positive sampled gates do not retire before operator check');
  assert.equal(before.status.result, 'positive');
  assert.equal(before.decision, 'NOT-CHECKED');
  assert.match(before.oldOrigin, /^RETAINED/);
  const positive = step('positive fixture-scoped retirement');
  assert.equal(positive.decision, 'RETIRED');
  assert.match(positive.status.text, /within this fixture/);
  const unknown = step('missing POP and old work remain unknown');
  assert.equal(unknown.status.result, 'unknown');
  assert.match(unknown.metrics, /successful: 2; interrupted: 0; unknown: 1/);
  assert.match(unknown.oldOrigin, /^RETAINED.*UNKNOWN/);
  const drain = step('converged routing cannot replace observed old-work drain');
  assert.equal(drain.propagation, 'POSITIVE');
  assert.equal(drain.drain, 'NEGATIVE');
  assert.match(drain.oldOrigin, /work: 2/);
  for (const name of ['latency interruption survives positive routing and drain', 'failed request survives positive routing and drain']) {
    const failed = step(name);
    assert.equal(failed.propagation, 'POSITIVE');
    assert.equal(failed.drain, 'POSITIVE');
    assert.equal(failed.journeys, 'NEGATIVE');
    assert.match(failed.metrics, /interrupted: 1/);
    assert.match(failed.oldOrigin, /^RETAINED/);
  }
});

test('actual bounded guard errors and keyboard reset preserve state until explicitly cleared', () => {
  const capped = step('tampered enabled seventh-run control is rejected without mutation');
  const prior = step('failed request survives positive routing and drain');
  assert.equal(capped.error.hidden, false);
  assert.match(capped.error.text, /six-run limit/);
  assert.equal(capped.focus, 'error');
  assert.deepEqual(capped.history, prior.history);
  const reset = step('keyboard reset clears state history error and restores selector focus');
  assert.equal(reset.history.length, 0);
  assert.equal(reset.error.hidden, true);
  assert.equal(reset.focus, 'fixture');
  assert.equal(reset.nativeResetType, 'function');
  assert.equal(reset.controls.find((item) => item.id === 'fixture').value, 'converged');
  assert.equal(reset.status.result, 'unknown');
  for (const name of ['malformed selection produces focused error without applying action', 'tampered out-of-order sample is rejected by state guard']) {
    const invalid = step(name);
    assert.equal(invalid.error.hidden, false);
    assert.equal(invalid.focus, 'error');
    assert.equal(invalid.history.length, 0);
  }
});

test('actual CSP rejections do not become network requests or native proof', () => {
  step('actual CSP blocks inline execution and data connection without network');
  assert.equal(report.csp.inlineExecuted, false);
  assert.equal(report.csp.connection.name, 'TypeError');
  assert.ok(report.csp.violations.some((item) => item.blockedURI === 'inline' && item.disposition === 'enforce'));
  assert.ok(report.csp.violations.some((item) => item.effectiveDirective === 'connect-src' && item.disposition === 'enforce'));
  assert.ok(report.requestedUrls.length >= 4);
  assert.ok(report.requestedUrls.every((url) => url.startsWith('file:')));
  assert.ok(report.consoleErrors.every((text) => /Content Security Policy/i.test(text)));
  assert.equal(report.nativeProof, false);
  assert.equal(report.sourceParentComplete, false);
  assert.equal(report.additionalKanoCredits, 0);
});
