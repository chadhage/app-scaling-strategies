'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
function raw(entry) {
  const bytes = gunzipSync(read(path.join('evidence', entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
}
const green = json('evidence\\green.json');
const syntax = json('evidence\\syntax.json');
const browser = json('evidence\\browser-001.json');
const step = (name) => {
  const found = browser.steps.find((item) => item.name === name);
  assert.ok(found, `Actual DOM observation missing: ${name}`);
  return found.dom;
};

test('focused green and syntax are real retained outputs with unchanged source provenance', () => {
  assert.equal(green.status, 0);
  assert.equal(syntax.status, 0);
  assert.match(raw(green.stdout).toString('utf8'), /# pass 15/);
  assert.match(raw(green.stdout).toString('utf8'), /# fail 0/);
  assert.match(raw(syntax.stdout).toString('utf8'), /Syntax PASS/);
  for (const record of [green, syntax]) {
    assert.equal(record.error, null);
    raw(record.stderr);
    for (const entry of record.snapshots) assert.deepEqual(lf(raw(entry)), lf(read(entry.source)));
  }
  const iac = json('evidence\\iac-na.json');
  assert.ok(Date.parse(iac.finishedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.ok(Date.parse(green.finishedAtUtc) <= Date.parse(syntax.startedAtUtc));
  assert.ok(Date.parse(syntax.finishedAtUtc) <= Date.parse(browser.startedAtUtc));
});

test('actual browser proof retains DOM bytes, signed tooling, exact sources and awaited cleanup', () => {
  assert.equal(browser.cardId, 'A-S109');
  assert.equal(browser.status, 'passed');
  assert.equal(browser.failure, null);
  assert.match(browser.runtime, /^v22\./);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.helperCommit, '53c0c0d');
  assert.equal(browser.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.preflight.signatureStatus, 'Valid');
  assert.match(browser.preflight.signer, /CN=Microsoft Corporation/);
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.browserVersion, browser.preflight.version);
  assert.deepEqual(JSON.parse(raw(browser.preflightStdout).toString('utf8')), browser.preflight);
  assert.deepEqual(JSON.parse(raw(browser.rawObservations).toString('utf8')), browser.steps);
  assert.equal(browser.steps.length, 15);
  assert.deepEqual(browser.cleanup, { closeAwaited: true, pageClosed: true });
  assert.equal(browser.ownedFilesUnchangedDuringVerification, true);
  assert.deepEqual(browser.pageErrors, []);
  for (const entry of browser.snapshots) assert.deepEqual(lf(raw(entry)), lf(read(entry.source)));
  for (const observed of browser.steps) {
    assert.equal(observed.dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(observed.dom.nativeSnat, /Native Azure SNAT: unverified/);
  }
  assert.equal(browser.nativeSnat, 'unverified');
  assert.equal(browser.nativeAzureValidated, false);
  assert.equal(browser.productionNode24Validated, false);
  assert.equal(browser.sourceParentComplete, false);
  assert.equal(browser.additionalKanoCredits, 0);
  assert.ok(browser.requestedUrls.length > 0);
  assert.ok(browser.requestedUrls.every(({ url }) => new URL(url).protocol === 'file:'));
});

test('positive, negative, unknown, error, keyboard limit and reset were observed rather than inferred', () => {
  const pending = step('keyboard raised-demand command remains pending until inspection');
  assert.equal(pending.result, 'pending');
  assert.equal(pending.focus, 'inspect');
  assert.match(pending.metrics, /not inspected/);
  const negative = step('keyboard inspection measures negative fictional capacity and interrupted journeys');
  assert.equal(negative.result, 'negative');
  assert.equal(negative.focus, 'level');
  assert.match(negative.metrics, /completed: 12; failed: 8; p95 latency: 240 ms/);
  const error = step('invalid typed choice exposes error and preserves prior negative history');
  assert.equal(error.result, 'negative');
  assert.equal(error.error.hidden, false);
  assert.equal(error.history.length, 2);
  const positive = step('same raised demand pooled: positive synthetic result, native SNAT unverified');
  assert.equal(positive.result, 'positive');
  assert.match(positive.metrics, /completed: 20; failed: 0; p95 latency: 90 ms/);
  const unknown = step('missing capacity and journeys stay unknown despite nominal counts');
  assert.equal(unknown.result, 'unknown');
  assert.match(unknown.summary, /demand: 96; strategy: pooled; connections: 24/);
  assert.match(unknown.metrics, /model capacity: not observed/);
  const ceiling = step('positive port headroom cannot hide negative journey budget');
  assert.equal(ceiling.result, 'negative');
  assert.match(ceiling.capacity, /gate: positive/);
  assert.match(ceiling.journey, /gate: negative/);
  const limit = step('state guard rejects programmatic attempt beyond disabled controls without erasing outcomes');
  assert.equal(limit.history.length, 12);
  assert.match(limit.error.text, /Six-attempt limit reached/);
  assert.equal(limit.focus, 'reset-lesson');
  const reset = step('keyboard explicit reset clears errors/history and restores defaults and focus');
  assert.equal(reset.formResetType, 'function');
  assert.equal(reset.history.length, 0);
  assert.equal(reset.error.hidden, true);
  assert.equal(reset.focus, 'level');
  assert.match(reset.counters, /Attempts: 0 \/ 6; positive: 0; negative: 0; unknown: 0; pending: 0/);
  assert.equal(reset.controls.find((item) => item.id === 'level').value, 'baseline');
  assert.equal(reset.controls.find((item) => item.id === 'strategy').value, 'direct');
});

test('actual script failures and CSP enforcement remain explicit, local and fail-closed', () => {
  const csp = browser.steps.find((item) => item.csp);
  assert.deepEqual(csp.csp, { inlineExecuted: false, handlerExecuted: false, fetchRejected: true });
  for (const directive of ['script-src-elem', 'script-src-attr', 'connect-src']) {
    assert.ok(csp.violations.some((item) => item.directive === directive));
  }
  for (const name of [
    'actual missing model resource fails closed with visible error and disabled controls',
    'actual missing controller resource retains static unavailable error and disabled controls',
  ]) {
    const dom = step(name);
    assert.equal(dom.bootError.hidden, false);
    assert.ok(dom.controls.every((item) => item.disabled));
    assert.equal(dom.history.length, 0);
    assert.equal(dom.result, 'unknown');
  }
  assert.ok(browser.requestFailures.some((item) => item.url.endsWith('/model.js')));
  assert.ok(browser.requestFailures.some((item) => item.url.endsWith('/lesson.js')));
  assert.ok(browser.consoleErrors.every((message) =>
    /Content Security Policy|net::ERR_FAILED|Failed to load resource/i.test(message)));
  const recovered = step('owned resource failure recovery reload restores clean lesson without claiming prior results');
  assert.equal(recovered.bootError.hidden, true);
  assert.equal(recovered.history.length, 0);
});
