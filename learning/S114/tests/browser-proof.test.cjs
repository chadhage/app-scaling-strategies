'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
function raw(entry) {
  const bytes = gunzipSync(read(path.join('evidence', entry.file)));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.crlf);
  return bytes;
}
const proof = json('evidence\\browser.json');
const observed = JSON.parse(raw(proof.stdout).toString('utf8'));
const step = (name) => {
  const matches = observed.steps.filter((item) => item.name === name);
  assert.equal(matches.length, 1, `Missing actual browser observation: ${name}`);
  return matches[0].dom;
};

test('passing actual DOM proof binds exact executed files, signed approved tooling and awaited cleanup', () => {
  assert.equal(proof.cardId, 'A-S114');
  assert.equal(proof.kanoUnit, 'A-S114');
  assert.equal(proof.kano, 'S');
  assert.equal(proof.packet, 'SC-S114');
  assert.equal(proof.status, 'passed');
  assert.equal(proof.exitStatus, 0);
  assert.equal(proof.signal, null);
  assert.equal(proof.error, null);
  assert.equal(observed.status, 'passed');
  assert.equal(observed.readOnlyVerified, true);
  assert.equal(proof.nodeVersion, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.preflight.signatureStatus, 'Valid');
  assert.match(proof.preflight.signer, /CN=Microsoft Corporation/);
  assert.equal(proof.browserVersion, proof.preflight.version);
  assert.deepEqual(JSON.parse(raw(proof.preflightStdout).toString('utf8').replace(/^\uFEFF/, '')), proof.preflight);
  assert.equal(proof.helperWorkingSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(proof.helperCanonicalGitSha256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.deepEqual(proof.cleanup, { requested: true, awaited: true, pageClosed: true });
  assert.deepEqual(observed.cleanup, proof.cleanup);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.consoleErrors.filter((item) => item.phase !== 'csp'), []);
  assert.ok(observed.requestedUrls.length > 0 && observed.requestedUrls.every((url) => url.startsWith('file:')));
  assert.equal(raw(proof.stderr).length, 0);
  for (const snapshot of proof.snapshots) assert.deepEqual(read(snapshot.source), raw(snapshot));
  for (const name of ['model.js', 'lesson.js', 'index.html', 'lesson.css', 'manifest.json', '.gitattributes', 'tests\\browser-proof.test.cjs', 'tools\\browser.cjs']) assert.ok(proof.snapshots.some((snapshot) => snapshot.source === name));
  assert.equal(proof.captureGuard.acceptedValue, '1');
  assert.equal(proof.captureGuard.observedValue, '1');
  assert.equal(proof.captureGuard.normalVerificationReadOnly, true);
  assert.equal(proof.sourceParentComplete, false);
  assert.equal(proof.nativeValidation, false);
  assert.equal(proof.productionNode24Validated, false);
  assert.equal(proof.additionalKanoCredits, 0);
});

test('actual keyboard progression measures the positive fixture without making a region claim', () => {
  const initial = step('initial standalone DOM');
  assert.equal(initial.history.length, 0);
  assert.equal(initial.nativeResetType, 'function');
  const isolated = step('keyboard isolation labels are not detection or regional proof');
  assert.equal(isolated.focus, 'detect');
  assert.ok(Object.values(isolated.checks).every((result) => result === 'UNKNOWN'));
  assert.equal(step('keyboard bounded detection and non-certifying proxy').focus, 'recover');
  assert.equal(step('keyboard alternate capacity and data gate before journeys').checks.transactions, 'UNKNOWN');
  const positive = step('keyboard positive fixture with measured clients and interruption');
  assert.equal(positive.status.result, 'positive');
  assert.ok(Object.values(positive.checks).every((result) => result === 'POSITIVE'));
  assert.match(positive.details.budget, /30 total interrupted seconds \/ 60s budget/);
  assert.match(positive.journeys[0].text, /lesson-session-001/);
  assert.match(positive.journeys[1].text, /committed-once; effects: 1/);
  for (const item of observed.steps) {
    assert.equal(item.dom.banner, 'Training rehearsal - synthetic data - not a live Azure result');
    assert.match(item.dom.regional, /Full regional continuity: UNKNOWN/);
    assert.match(item.dom.regional, /cannot certify an actual Azure-region outage or full regional continuity/);
  }
});

test('actual measured negatives and unknown proxy evidence remain honest with retained prior history', () => {
  const capacity = step('negative surviving capacity despite healthy shallow origins');
  assert.equal(capacity.checks.capacity, 'NEGATIVE');
  assert.equal(capacity.checks.transactions, 'UNKNOWN');
  assert.match(capacity.recovery, /blocked; destination NONE/);
  assert.deepEqual(capacity.history.slice(0, 4), step('keyboard positive fixture with measured clients and interruption').history);
  const unknown = step('unknown HTTP-only proxy cannot certify regional continuity');
  assert.ok(Object.values(unknown.checks).every((result) => result === 'UNKNOWN'));
  assert.match(unknown.proxy, /north-a healthy; south-a healthy/);
  assert.match(unknown.metrics, /positive 0; interrupted 0; unknown 2/);
  assert.equal(step('negative required data availability').checks.data, 'NEGATIVE');
  const budget = step('negative interruption budget despite completed clients');
  assert.equal(budget.checks.clientRecovery, 'POSITIVE');
  assert.equal(budget.checks.budget, 'NEGATIVE');
  assert.match(budget.details.budget, /75 total interrupted seconds \/ 60s budget/);
  const duplicate = step('negative duplicate transaction effects despite healthy proxy');
  assert.equal(duplicate.checks.transactions, 'NEGATIVE');
  assert.match(duplicate.details.transactions, /2 total effects \/ 1 required/);
  assert.equal(duplicate.history.length, 24);
});

test('actual invalid-input, state-order, bound, keyboard reset and startup-error UX is observed', () => {
  const bounded = step('forced seventh action is rejected with focused error and retained history');
  assert.equal(bounded.focus, 'error');
  assert.equal(bounded.history.length, 24);
  const reset = step('keyboard reset restores defaults and native form method');
  assert.equal(reset.nativeResetType, 'function');
  assert.equal(reset.controls.budget.value, '60');
  assert.equal(reset.controls.fixture.value, 'alternate-ready');
  assert.equal(reset.history.length, 0);
  for (const name of ['malformed raw budget has focused error without history mutation', 'unknown fixture input is rejected without losing positive history', 'forced out-of-order journey action has focused error and unchanged state']) {
    const dom = step(name);
    assert.equal(dom.error.hidden, false);
    assert.equal(dom.focus, 'error');
    assert.ok(dom.history.length >= 4);
  }
  const finalReset = step('error recovery reset clears trace and restores initial unknown checks');
  assert.equal(finalReset.error.hidden, true);
  assert.equal(finalReset.history.length, 0);
  assert.match(step('deliberate local model omission exposes visible startup failure').error.text, /model\.js did not load/);
  assert.match(step('startup failure reset cannot fabricate a result').error.text, /Reset cannot fabricate a result/);
  assert.equal(step('complete bundle restored after deliberate startup error probe').error.hidden, true);
});

test('actual CSP rejects inline execution and an owned local-file connection without security bypass', () => {
  assert.equal(observed.csp.inlineExecuted, false);
  assert.equal(observed.csp.connectionBlocked, true);
  assert.ok(observed.csp.violations.some((item) => item.directive.startsWith('script-src') && item.blockedURI === 'inline'));
  assert.ok(observed.csp.violations.some((item) => item.directive === 'connect-src'));
  assert.ok(observed.consoleErrors.some((item) => item.phase === 'csp'));
  step('CSP blocks benign inline script and owned local-file connection probes');
});

test('focused GREEN and syntax/integrity preceded actual browser capture', () => {
  const green = json('evidence\\green.json');
  assert.equal(green.status, 'passed');
  for (const command of green.commands) {
    assert.equal(command.status, 0);
    assert.equal(command.signal, null);
    assert.equal(command.error, null);
    raw(command.stdout);
    raw(command.stderr);
  }
  assert.ok(green.commands.some((command) => command.args.includes('learning\\S114\\tools\\syntax.cjs')));
  assert.ok(green.commands.some((command) => command.args.includes('learning\\S114\\tests\\model.test.cjs') && command.args.includes('learning\\S114\\tests\\integrity.test.cjs')));
  assert.ok(Date.parse(json('evidence\\iac-na.json').recordedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.ok(Date.parse(green.finishedAtUtc) <= Date.parse(proof.startedAtUtc));
  for (const snapshot of green.snapshots) assert.deepEqual(read(snapshot.source), raw(snapshot));
});
