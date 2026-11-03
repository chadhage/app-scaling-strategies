'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, sourcePaths, digest, canonical, blob, rawPaths } = require('./seal.cjs');
const read = (file) => fs.readFileSync(path.join(root, file));

test('retained source seal qualifies canonical Git-source integrity and byte-exact raw evidence', () => {
  const seal = JSON.parse(read('evidence/integrity.json'));
  assert.equal(seal.cardId, 'A-S065');
  assert.deepEqual(seal.source.map((entry) => entry.path), sourcePaths);
  assert.deepEqual(seal.raw.map((entry) => entry.path), [...rawPaths('evidence/red'), ...rawPaths('evidence/raw')]);
  for (const entry of seal.source) {
    const raw = read(entry.path);
    const bytes = canonical(raw);
    assert.equal(digest(bytes), entry.canonicalSha256, entry.path);
    assert.equal(bytes.length, entry.canonicalBytes, entry.path);
    assert.equal(blob(entry.path, raw), entry.gitBlobOid, entry.path);
    assert.equal(blob(entry.path, bytes, false), entry.gitBlobOid, entry.path);
  }
  for (const entry of seal.raw) {
    const bytes = read(entry.path);
    assert.equal(digest(bytes), entry.rawSha256, entry.path);
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(blob(entry.path, bytes), entry.gitBlobOid, entry.path);
    assert.equal(blob(entry.path, bytes, false), entry.gitBlobOid, entry.path);
  }
  assert.equal(digest(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))),
    '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});

test('retained proof records genuine assertion RED and actual bounded browser acceptance without native credit', () => {
  const red = JSON.parse(read('evidence/red/run.json'));
  assert.equal(red.loadExitCode, 0);
  assert.equal(red.testExitCode, 1);
  assert.match(read('evidence/red/node-red.tap').toString('utf8'), /code: 'ERR_ASSERTION'/);
  assert.match(read('evidence/red/model.stub.js.txt').toString('utf8'), /verdict: 'unknown'/);
  assert.ok(read('evidence/red/node-red.tap').includes(Buffer.from('\r\n')));
  const browser = JSON.parse(read('evidence/raw/browser.json'));
  assert.equal(browser.captureOptIn, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.equal(browser.nativeQualified, false);
  assert.equal(browser.playwright, '1.56.1');
  assert.match(browser.browser, /^156\./);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.screenshotSha256, digest(read('evidence/raw/browser.png')));
  assert.equal(browser.domSha256, digest(read('evidence/raw/browser-dom.html')));
  assert.deepEqual(browser.unexpectedPageErrors, []);
  const names = browser.checks.map((check) => check.name);
  for (const name of ['keyboard-safe', 'routing-gap-failure-retained-after-recovery',
    'simultaneous-active-owners-fail-with-twelve-successes', 'missing-acknowledged-effect-failure',
    'missing-cutover-unknown', 'all-observations-unknown-and-six-attempt-bound',
    'reset-six-completed-attempts', 'invalid-enum-error', 'stale-route-to-fenced-owner',
    'prediction-cannot-overwrite-run', 'reset-in-flight-and-retained-failure',
    'narrow-layout-and-keyboard-focus', 'actual-enforced-csp']) assert.ok(names.includes(name), name);
  assert.equal(browser.csp.inlineScriptRan, false);
  assert.equal(browser.csp.inlineHandlerRan, false);
  assert.equal(browser.csp.fetchRejected, true);
  assert.ok(browser.csp.violations.some((event) => event.directive === 'connect-src'));
  const provenance = JSON.parse(read('evidence/provenance.json'));
  assert.equal(provenance.sourceReadBeforeBehaviorDesign, true);
  assert.equal(provenance.kanoUnits, 1);
  assert.equal(provenance.nativeSourceAcceptanceSatisfied, false);
  const tooling = JSON.parse(read('evidence/raw/tooling.json'));
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /Microsoft Corporation/);
  assert.equal(tooling.playwright.version, '1.56.1');
  assert.equal(tooling.helper.sha256.toLowerCase(), browser.helperSha256);
  assert.match(read('evidence/raw/node-green.tap').toString('utf8'), /# fail 0/);
});
