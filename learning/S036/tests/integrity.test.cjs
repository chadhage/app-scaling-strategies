'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const evidence = path.join(lesson, 'evidence');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const expectedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('owned manifest declares exact source, frozen card/packet, synthetic limits and native remainder', () => {
  const manifest = json('manifest.json');
  const proof = json('evidence.json');
  for (const value of [manifest, proof]) {
    assert.equal(value.cardId, 'A-S036');
    assert.equal(value.workerId, 'worker-A-S036');
    assert.equal(value.kano, 'S');
    assert.equal(value.kanoUnit, 'A-S036');
    assert.equal(value.packet, 'SC-S036');
    assert.equal(value.parent, 'D-S036');
    assert.equal(value.nativeProof, false);
    assert.equal(value.parentComplete, false);
    assert.equal(value.productionNode24Validated, false);
  }
  assert.equal(manifest.entryPoint, path.join('learning', 'S036', 'index.html'));
  assert.equal(manifest.testTooling.helperSha256, expectedHelper);
  assert.deepEqual(manifest.nativeRemainderGates, ['CORE', 'DATA', 'HOST']);
  assert.match(manifest.infrastructure, /^N\/A/);
  assert.ok(manifest.preconditions.length && manifest.actions.length && manifest.expectedAssertions.length && manifest.limits.length);
  const source = json(path.join('evidence', 'source-contract.json'));
  assert.equal(source.source, '| S036 | **Existing form submission:** Accept valid anti-forgery tokens generated before migration without weakening validation. |');
  assert.match(source.backlog, /Valid prior tokens succeed under compatible configuration; forged tokens remain rejected/);
  assert.match(source.card, /Submit an old form after cutover; distinguish valid prior tokens from forged ones/);
  assert.match(source.nativeRemainder, /CORE, DATA, HOST/);
  assert.match(source.atomicAndPortableContract, /BDD specification, genuine behavioral TDD red, the IaC step/);
});

test('static page uses local assets, exact banner, CSP and non-shadowing native reset', () => {
  const html = read('index.html');
  const app = read('app.js');
  const model = read('antiforgery.js');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /<(?:iframe|object|embed)\b|\son\w+\s*=|\sstyle\s*=|(?:id|name)\s*=\s*["']reset["']/i);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["'](?:https?:|\/\/|data:)/i);
  assert.doesNotMatch(app + model, /\b(?:fetch|XMLHttpRequest|WebSocket|Worker|eval|localStorage|sessionStorage)\b|\.innerHTML|document\.cookie|https?:\/\//);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('published browser helper and original RED snapshots retain exact hashes and real assertion provenance', () => {
  const helper = path.resolve(lesson, '..', '..', 'testing', 'browser', 'isolated.cjs');
  assert.equal(hash(fs.readFileSync(helper)), expectedHelper);
  const red = json(path.join('evidence', 'red-001.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.error, null);
  const stdout = read(path.join('evidence', red.stdout));
  assert.match(stdout, /code: 'ERR_ASSERTION'/);
  assert.match(stdout, /actual: 'unknown'/);
  assert.match(stdout, /expected: 'accepted'/);
  assert.match(stdout, /# tests 7/);
  assert.match(stdout, /# pass 1/);
  assert.match(stdout, /# fail 6/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
  const snapshots = [
    ['antiforgery.js', 'antiforgery.stub.snapshot.txt'],
    ['existing-form.feature', 'bdd.feature.snapshot.txt'],
    [path.join('tests', 'model.test.cjs'), 'model.assertions.snapshot.txt']
  ];
  for (const [source, snapshot] of snapshots) {
    assert.equal(hash(fs.readFileSync(path.join(evidence, 'red', snapshot))), red.sourceHashes[source]);
  }
  assert.equal(json(path.join('evidence', 'iac-na.json')).precedingRed, 'red-001.json');
});

test('every retained raw run matches byte lengths and SHA256; latest qualified runs match current owned sources', () => {
  const captures = fs.readdirSync(evidence).filter((name) => /^(?:red|green|syntax|browser|integrity)-\d{3}\.json$/.test(name)).sort();
  for (const name of captures) {
    const metadata = json(path.join('evidence', name));
    assert.equal(metadata.captureWasExplicit, true);
    for (const stream of ['stdout', 'stderr']) {
      const bytes = fs.readFileSync(path.join(evidence, metadata[stream]));
      assert.equal(bytes.length, metadata[`${stream}Bytes`], `${name} ${stream} length`);
      assert.equal(hash(bytes), metadata[`${stream}Sha256`], `${name} ${stream} bytes`);
    }
  }
  for (const stage of ['green', 'syntax', 'browser']) {
    const names = captures.filter((name) => name.startsWith(`${stage}-`));
    assert.ok(names.length, `${stage} evidence required; capture is deliberate, not an ordinary verification side effect.`);
    const latest = json(path.join('evidence', names.at(-1)));
    assert.equal(latest.exitCode, 0, `${stage} must actually pass.`);
    assert.equal(latest.passed, true);
    assert.equal(latest.error, null);
    for (const [file, expected] of Object.entries(latest.sourceHashes)) {
      assert.equal(hash(fs.readFileSync(path.join(lesson, file))), expected, `${stage} current ${file}`);
    }
  }
  const browserLog = read(path.join('evidence', captures.filter((name) => name.startsWith('browser-')).at(-1).replace('.json', '.stdout.tap.txt')));
  assert.match(browserLog, /"pageClosed":true,"browserDisconnected":true/);
  assert.match(browserLog, /"externalRequestsReachingGuard":0/);
  assert.match(browserLog, /"playwrightVersion":"1.56.1"/);
  assert.match(browserLog, /"browserVersion":"156.0.4314.50"/);
  assert.match(browserLog, /"signatureStatus":"Valid"/);
});
