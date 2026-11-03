'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { read, json, raw, files, sha, inputHashes } = require('.\\support.cjs');

test('focused green and syntax are genuine successful commands against the exact final source bytes', () => {
  const green = json(path.join('evidence', 'focused-green.json'));
  assert.equal(green.passed, true);
  assert.equal(green.exitCode, 0);
  assert.equal(green.error, null);
  assert.deepEqual(green.inputs, inputHashes());
  assert.match(raw(green.output).toString('utf8'), /# fail 0/);
  assert.match(raw(green.output).toString('utf8'), /public success cannot certify/);
  const syntax = json(path.join('evidence', 'syntax-green.json'));
  assert.equal(syntax.passed, true);
  assert.match(syntax.node, /^v22\./);
  assert.deepEqual(syntax.inputs, inputHashes());
  assert.deepEqual(syntax.runs.map(run => run.path), files().filter(file => /\.(?:js|cjs)$/.test(file)));
  for (const run of syntax.runs) {
    assert.equal(run.exitCode, 0);
    assert.equal(run.error, null);
    raw(run.output);
  }
});

test('actual isolated-browser evidence distinguishes positive, negative, unknown, keyboard and retained reset', () => {
  const browser = json(path.join('evidence', 'browser-acceptance.json'));
  const invocation = json(path.join('evidence', 'browser-run.json'));
  assert.equal(invocation.passed, true);
  assert.equal(invocation.exitCode, 0);
  assert.match(raw(invocation.output).toString('utf8'), /# fail 0/);
  assert.deepEqual(invocation.inputs, inputHashes());
  assert.equal(browser.passed, true);
  assert.equal(browser.deliberateCapture, true);
  assert.equal(browser.mode, 'synthetic');
  assert.equal(browser.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(browser.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.match(browser.helperCommit, /^53c0c0d/);
  assert.match(browser.browserVersion, /^156\./);
  assert.match(browser.node, /^v22\./);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.externalRequests, []);
  assert.ok(browser.assetRequests.every(url => new URL(url).protocol === 'file:'));
  assert.ok(browser.assetRequests.some(url => url.endsWith('model.js')));
  assert.ok(browser.assetRequests.some(url => url.endsWith('app.js')));
  assert.ok(browser.assetRequests.some(url => url.endsWith('styles.css')));
  assert.ok(browser.initialResourceEntries.every(url => new URL(url).protocol === 'file:'));
  assert.equal(browser.formResetType, 'function');
  assert.deepEqual(browser.inputHashes, inputHashes());
  assert.equal(browser.close.awaited, true);
  assert.equal(browser.close.pageClosed, true);
  assert.equal(browser.close.error, null);
  const observations = new Map(browser.checkpoints.map(point => [point.label, point]));
  const publicOnly = observations.get('keyboard-public-only');
  assert.equal(publicOnly.privateStatus, 'unknown');
  assert.match(publicOnly.public, /success.*HTTP 200.*24 synthetic ms/);
  assert.match(publicOnly.internal, /Unknown/);
  assert.ok(publicOnly.trace.every(row => row.status === 'unknown'));
  const internal = observations.get('keyboard-public-internal');
  assert.equal(internal.privateStatus, 'unknown');
  assert.match(internal.internal, /success.*18 synthetic ms/);
  const dns = observations.get('keyboard-private-dns-failure');
  assert.equal(dns.privateStatus, 'failure');
  assert.equal(dns.trace.find(row => row.id === 'dns').status, 'failure');
  assert.match(dns.eligibility, /Not eligible/);
  const reset = observations.get('keyboard-reset-retained');
  assert.equal(reset.privateStatus, 'idle');
  assert.equal(reset.focus, 'condition');
  assert.equal(reset.history.length, 3);
  assert.equal(reset.condition, 'private-ready');
  assert.equal(reset.action, 'public-only');
  assert.match(reset.history[2], /private failure/);
  const invalid = observations.get('invalid-selection');
  assert.equal(invalid.errorHidden, false);
  assert.equal(invalid.focus, 'input-error');
  assert.equal(invalid.history.length, 3);
  const positive = observations.get('private-ready');
  assert.equal(positive.privateStatus, 'success');
  assert.ok(positive.trace.every(row => row.status === 'success'));
  assert.match(positive.eligibility, /synthetic fixture only.*unverified/);
  assert.match(positive.duration, /84 synthetic ms.*150/);
  const unrelated = observations.get('wrong-client');
  assert.equal(unrelated.privateStatus, 'unknown');
  assert.equal(unrelated.trace[0].status, 'failure');
  assert.ok(unrelated.trace.slice(1).every(row => row.status === 'unknown'));
  assert.match(unrelated.duration, /Unknown/);
  for (const [label, status] of [
    ['connection-denied', 'failure'], ['authorization-denied', 'failure'], ['wrong-dependency', 'failure'],
    ['private-unobserved', 'unknown'], ['dns-unobserved', 'unknown'], ['management-exposed', 'failure'],
    ['dependency-slow', 'failure']
  ]) {
    assert.equal(observations.get(label).privateStatus, status);
    assert.match(observations.get(label).public, /success/);
    assert.match(observations.get(label).internal, /success/);
  }
  const bound = observations.get('bound-error');
  assert.equal(bound.history.length, 12);
  assert.equal(bound.focus, 'input-error');
  assert.match(bound.counts, /Private success 1.*Private failure 6.*Private unknown 5/);
  const boundReset = observations.get('keyboard-reset-at-bound');
  assert.equal(boundReset.history.length, 12);
  assert.equal(boundReset.privateStatus, 'idle');
  assert.equal(boundReset.focus, 'condition');
  assert.equal(observations.get('bound-after-reset').history.length, 12);
  assert.equal(observations.get('bound-after-reset').focus, 'input-error');
  for (const point of browser.checkpoints) raw(point.dom);
  for (const image of browser.screenshots) raw(image);
});

test('page-owned CSP checks actually block inline/eval, not a DevTools-evaluation oracle', () => {
  const browser = json(path.join('evidence', 'browser-acceptance.json'));
  assert.equal(browser.csp.probeRan, true);
  assert.equal(browser.csp.evalBlocked, 'EvalError');
  assert.equal(browser.csp.inlineExecuted, false);
  assert.ok(browser.csp.violations.some(event => event.blockedURI === 'eval' && event.directive.startsWith('script-src')));
  assert.ok(browser.csp.violations.some(event => event.blockedURI === 'inline' && event.directive.startsWith('script-src')));
  assert.ok(browser.csp.consoleErrors.some(message => /inline script.*Content Security Policy/.test(message)));
  assert.equal(browser.csp.pageURLChanged, false);
});

test('raw-byte content index covers every owned source/proof file with no excluded mutable evidence', () => {
  const index = json(path.join('evidence', 'content-index.json'));
  const expected = files().filter(file => file !== path.join('evidence', 'content-index.json'));
  assert.equal(index.cardId, 'A-S106');
  assert.match(index.qualification, /Raw bytes/);
  assert.deepEqual(index.files.map(entry => entry.path), expected);
  assert.equal(new Set(index.files.map(entry => entry.path)).size, expected.length);
  for (const entry of index.files) {
    const bytes = read(entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
});
