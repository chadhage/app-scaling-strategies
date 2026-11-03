'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'evidence', name), 'utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

test('sealed owned inventory binds lesson sources and historical proof without rewriting files', () => {
  const seal = read('integrity.json');
  assert.equal(seal.cardId, 'A-S044');
  assert.equal(seal.algorithm, 'SHA-256');
  assert.deepEqual(seal.exclusions, ['evidence\\integrity.json', 'evidence\\verify.raw.json']);
  const actual = fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .filter((name) => !seal.exclusions.includes(name)).sort();
  assert.deepEqual(Object.keys(seal.files).sort(), actual);
  for (const [name, expected] of Object.entries(seal.files)) {
    assert.equal(path.isAbsolute(name), false);
    assert.doesNotMatch(name, /(?:^|\\)\.\.(?:\\|$)|:/);
    assert.equal(hash(fs.readFileSync(path.join(root, name))), expected, name);
  }
});

test('captured green and syntax retain verbatim output and successful actual exit codes', () => {
  for (const name of ['green.raw.json', 'syntax.raw.json']) {
    const record = read(name);
    assert.equal(record.exitCode, 0, name);
    assert.equal(record.error, null);
    for (const stream of ['stdout', 'stderr']) {
      const bytes = Buffer.from(record[`${stream}Base64`], 'base64');
      assert.equal(hash(bytes), record[`${stream}Sha256`]);
      assert.equal(bytes.toString('utf8'), record[stream]);
    }
  }
  assert.match(read('green.raw.json').stdout, /# tests 21\n# suites 0\n# pass 21\n# fail 0/);
  const syntax = read('syntax.raw.json').stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(syntax.length, 7);
  assert.ok(syntax.every((item) => item.exitCode === 0 && item.stderr === ''));
});

test('actual browser evidence is qualified, closed, and honest about failures versus unknowns', () => {
  const browser = read('browser.json');
  const raw = read('browser.raw.json');
  assert.equal(raw.exitCode, 0);
  assert.equal(browser.passed, true);
  assert.equal(browser.provenance.runtime, 'v22.23.4');
  assert.equal(browser.provenance.playwright, '1.56.1');
  assert.match(browser.provenance.browserVersion, /^156\./);
  assert.equal(browser.provenance.signer.status, 'Valid');
  assert.equal(browser.provenance.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.provenance.browserSecurityBypassed, false);
  assert.equal(browser.provenance.finallyAwaitedClose, true);
  assert.equal(browser.defensiveRouteAttempts, 0);
  assert.deepEqual(browser.externalRequests, []);
  assert.deepEqual(browser.pageErrors, []);
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.connection, 'blocked');
  for (const verdict of ['PASS', 'FAIL', 'UNKNOWN']) {
    assert.ok(browser.observations.some((item) => item.actualVerdict === verdict));
  }
  assert.ok(browser.observations.some((item) => /checksum error/.test(item.check)));
  assert.ok(browser.observations.some((item) => /final exact defaults/.test(item.check)));
});
