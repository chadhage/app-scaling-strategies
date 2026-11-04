'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { captureEnabled, captureBrowserEvidence } = require('..\\capture.cjs');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, 'evidence', name));

test('capture enables only the exact deliberate string 1; other values cannot write proof', () => {
  assert.equal(captureEnabled('1'), true);
  for (const value of [undefined, null, false, true, 1, 0, '', 'true', 'yes', '01', ' 1', '1 ', '0']) assert.equal(captureEnabled(value), false);
  const original = process.env.CAPTURE_BROWSER_EVIDENCE;
  const files = ['browser.json', path.join('raw', 'browser-observation.json')];
  const before = files.map(read);
  try {
    for (const value of ['true', 'yes', '01', '0', '']) {
      process.env.CAPTURE_BROWSER_EVIDENCE = value;
      assert.equal(captureBrowserEvidence({ not: 'a browser observation' }), false);
    }
    delete process.env.CAPTURE_BROWSER_EVIDENCE;
    assert.equal(captureBrowserEvidence({ not: 'a browser observation' }), false);
  } finally {
    if (original === undefined) delete process.env.CAPTURE_BROWSER_EVIDENCE;
    else process.env.CAPTURE_BROWSER_EVIDENCE = original;
  }
  files.forEach((file, index) => assert.deepEqual(read(file), before[index]));
});

test('published actual-browser observations preserve raw proof and all qualification limits', () => {
  const raw = read(path.join('raw', 'browser-observation.json'));
  const canonical = Buffer.from(read('browser.json').toString('utf8').replace(/\r\n/g, '\n'));
  assert.deepEqual(canonical, raw);
  const report = JSON.parse(raw);
  assert.equal(report.cardId, 'A-S127');
  assert.equal(report.kanoUnit, 'A-S127');
  assert.equal(report.packet, 'SC-S127');
  assert.equal(report.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(report.tooling.playwright, '1.56.1');
  assert.match(report.tooling.runtime, /^v22\./);
  assert.equal(report.tooling.browserVersions.every((version) => /^156\./.test(version)), true);
  assert.equal(report.tooling.helperPinnedRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(report.checks.every((check) => check.passed), true);
  assert.ok(report.checks.length >= 25);
  for (const id of ['keyboard-positive-rollout-grace', 'canonical-input-error-focus-no-state-mutation', 'dom-reenabled-control-still-enforces-stage-guard', 'prestop-inside-short-grace-interrupts-old-work', 'unknown-business-state-not-success', 'desired-replicas-not-observed-ready', 'independent-node-loss', 'independent-zone-loss', 'independent-region-loss', 'independent-unrecorded', 'actual-csp-blocks-inline-style-image-connect-form', 'actual-startup-missing-model.html', 'actual-startup-missing-app.html']) {
    assert.ok(report.checks.some((check) => check.id === id), id);
  }
  assert.deepEqual(report.cleanup, { sessionsOpened: 3, sessionsClosed: 3, awaitedFinallyClose: true });
  assert.deepEqual(report.qualification, { native: false, sourceParentComplete: false, productionNode24: false, unattendedLifecycleRecovery: false, additionalCredits: 0 });
});
