'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(lesson, file));
const json = (file) => JSON.parse(read(file));
const evidence = (file) => path.join('evidence', file);

function raw(name, expected) {
  const record = json(evidence(`${name}.raw.json`));
  assert.equal(record.cardId, 'A-S042');
  assert.equal(record.expectedExitCode, expected);
  assert.equal(record.exitCode, expected);
  assert.equal(record.processError, null);
  assert.equal(record.signal, null);
  assert.equal(record.nodeVersion, 'v22.23.4');
  for (const stream of Object.values(record.streams)) {
    const bytes = Buffer.from(stream.base64, 'base64');
    assert.equal(sha(bytes), stream.sha256);
    assert.equal(bytes.toString('utf8'), stream.utf8);
  }
  return record;
}

test('preserved loadable stub and exact assertions reproduce genuine behavioral RED', () => {
  const load = raw('stub-load', 0);
  const red = raw('red', 1);
  const replay = raw('red-replay', 1);
  const stubHash = sha(read(evidence(path.join('red', 'model.source.snapshot'))));
  const assertionsHash = sha(read(evidence(path.join('red', 'assertion.source.snapshot'))));
  assert.equal(load.sourceSha256, stubHash);
  assert.equal(red.sourceSha256, stubHash);
  assert.equal(red.testSha256, assertionsHash);
  assert.equal(sha(read(path.join('tests', 'core.test.cjs'))), assertionsHash);
  assert.equal(sha(read('long-work.feature')), sha(read(evidence(path.join('red', 'bdd.feature.snapshot')))));
  assert.notEqual(sha(read('long-work.js')), stubHash);
  assert.match(load.streams.stdout.utf8, /"status":"unknown"/);
  for (const record of [red, replay]) {
    assert.match(record.streams.stdout.utf8, /# pass 1\b/);
    assert.match(record.streams.stdout.utf8, /# fail 4\b/);
    assert.match(record.streams.stdout.utf8, /ERR_ASSERTION/);
    assert.doesNotMatch(record.streams.stdout.utf8 + record.streams.stderr.utf8,
      /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
  }
});

test('IaC N/A is explicit after RED and before implemented green evidence', () => {
  const decision = json(evidence('iac-na.json'));
  const red = raw('red', 1);
  const green = raw('model-green', 0);
  assert.equal(decision.status, 'N/A');
  assert.equal(decision.beforeImplementation, true);
  assert.equal(decision.afterRedFinishedAtUtc, red.finishedAtUtc);
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(decision.decidedAtUtc));
  assert.ok(Date.parse(decision.decidedAtUtc) < Date.parse(green.startedAtUtc));
  assert.equal(green.sourceSha256, sha(read('long-work.js')));
  assert.match(green.streams.stdout.utf8, /# pass 21\b/);
  assert.match(green.streams.stdout.utf8, /# fail 0\b/);
});

test('source and retained-proof hash bindings reject silent refresh or tampering', () => {
  const maps = [
    json(evidence('source-hashes.json')),
    json(evidence('integrity.json')),
  ];
  for (const map of maps) {
    assert.equal(map.cardId, 'A-S042');
    assert.equal(map.algorithm, 'SHA-256');
    assert.ok(Object.keys(map.files).length >= 10);
    for (const [file, hash] of Object.entries(map.files)) {
      const resolved = path.resolve(lesson, file);
      assert.ok(resolved.startsWith(`${lesson}${path.sep}`), 'Hashes may bind only the owned scope.');
      assert.equal(sha(fs.readFileSync(resolved)), hash, file);
    }
  }
  const actualSources = [];
  function walk(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      if (item.name === 'evidence') continue;
      const target = path.join(directory, item.name);
      if (item.isDirectory()) walk(target);
      else actualSources.push(path.relative(lesson, target));
    }
  }
  walk(lesson);
  assert.deepEqual(Object.keys(maps[0].files).sort(), actualSources.sort());
});

test('actual browser evidence binds current lesson and qualified offline helper only', () => {
  const proof = json(evidence('browser-001.json'));
  const tooling = json(evidence('tooling.json'));
  const source = json(evidence('source-contract.json'));
  const expected = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(proof.cardId, 'A-S042');
  assert.equal(proof.captureFlag, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.equal(proof.helperSha256, expected);
  assert.equal(sha(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), expected);
  assert.equal(proof.browserVersion, '156.0.4314.50');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.equal(proof.nodeVersion, 'v22.23.4');
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /Microsoft Corporation/);
  assert.equal(tooling.helperSha256, expected);
  assert.equal(tooling.helperCommit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(proof.awaitedFinallyClose, true);
  assert.equal(proof.nativeAzureResult, 'unknown');
  for (const [file, hash] of Object.entries(proof.applicationHashes)) assert.equal(sha(read(file)), hash, file);
  const names = proof.observations.map((item) => item.name);
  for (const name of [
    'keyboard-default-drain-and-check', 'retry-fails-original-budget-despite-fast-attempt',
    'missing-proof-unknown-with-failures-retained', 'malformed-controls-fail-closed-with-history',
    'seventh-run-rejected-without-pruning', 'keyboard-reset-restores-exact-defaults-and-focus',
    'forced-successor-stop-not-saved-by-checkpoint', 'actual-csp-and-narrow-layout',
  ]) assert.ok(names.includes(name), name);
  const csp = proof.observations.find((item) => item.name === 'actual-csp-and-narrow-layout');
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.fetchBlocked, true);
  assert.deepEqual(csp.networkRoutes, []);
  assert.deepEqual(csp.pageErrors, []);
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.cardId, 'A-S042');
  assert.equal(source.packet, 'SC-S042');
  assert.equal(source.ownership, 'learning\\S042\\**');
});

test('focused syntax and browser capture retain successful raw command provenance', () => {
  const syntax = raw('syntax-green', 0);
  const browser = raw('browser-capture', 0);
  assert.match(syntax.streams.stdout.utf8, /# fail 0\b/);
  assert.match(browser.streams.stdout.utf8, /# pass 1\b/);
  assert.match(browser.streams.stdout.utf8, /# fail 0\b/);
  assert.equal(browser.sourceSha256, sha(read('long-work.js')));
});
