'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const directory = __dirname;
const root = path.resolve(directory, '..', '..');
const evidence = path.join(directory, 'evidence');
const text = (name) => fs.readFileSync(path.join(directory, name), 'utf8');
const json = (name) => JSON.parse(text(name));
const hash = (name) => createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex');
function latest(prefix) {
  const records = fs.readdirSync(evidence)
    .map((name) => ({ name, match: name.match(new RegExp(`^${prefix}-(\\d+)\\.json$`)) }))
    .filter((entry) => entry.match).sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
  assert.ok(records.length > 0, `Retained ${prefix} capture is required.`);
  return json(path.join('evidence', records[0].name));
}

test('manifest preserves the exact original frozen S024 source, card contract, packet and native remainder', () => {
  const manifest = json('manifest.json');
  const source = json(path.join('evidence', 'source-contract.json'));
  assert.equal(manifest.cardId, 'A-S024');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S024');
  assert.equal(manifest.packet, 'SC-S024');
  assert.equal(manifest.source, 'S024');
  assert.equal(manifest.parent, 'D-S024');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.equal(manifest.parentComplete, false);
  assert.deepEqual(manifest.dependencies, []);
  assert.deepEqual(manifest.originalParentPrerequisites, ['P001', 'D-S022']);
  assert.deepEqual(manifest.nativeRemainderGates, ['CORE', 'DATA', 'ASANY', 'C064']);
  for (const [file, field, prefix] of [
    ['README.md', 'canonicalReadmeRow', '| S024 |'],
    [path.join('.docs', 'wiki', 'backlog.md'), 'backlogRow', '| D-S024 |'],
    [path.join('.docs', 'wiki', 'kanban.md'), 'cardRow', '| A-S024 |']
  ]) {
    const row = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).find((line) => line.startsWith(prefix));
    assert.equal(source[field], row);
  }
  assert.match(source.canonicalReadmeRow, /effective production settings.*background work/);
  assert.match(source.portableAndAtomicContract, /## Atomic card contract/);
  assert.match(source.portableAndAtomicContract, /### Portable A-card lesson contract/);
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.admittedCard.owner, 'worker-A-S024');
  for (const name of [manifest.entryPoint, manifest.feature, ...manifest.tests]) {
    assert.ok(fs.statSync(path.join(root, name)).isFile());
  }
  for (const key of ['objective', 'preconditions', 'actions', 'syntheticInputTrace', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[key] && Object.keys(manifest[key]).length > 0, key);
  }
});

test('genuine behavioral RED, raw byte hashes and non-discovered snapshots remain intact before IaC N/A', () => {
  const red = json(path.join('evidence', 'red.json'));
  const iac = json(path.join('evidence', 'iac-na.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.syntaxExitCode, 0);
  assert.equal(red.missingToolsOrCode, false);
  assert.equal(red.intentionalRed, true);
  assert.equal(hash(path.join('evidence', red.stdout)), red.stdoutSha256);
  assert.equal(hash(path.join('evidence', red.stderr)), red.stderrSha256);
  assert.match(text(path.join('evidence', red.stdout)), /ERR_ASSERTION/);
  assert.match(text(path.join('evidence', red.stdout)), /actual: 'unknown'/);
  assert.match(text(path.join('evidence', red.stdout)), /expected: 'success'/);
  for (const [name, expected] of Object.entries(red.snapshots)) {
    assert.ok(name.endsWith('.txt'));
    assert.equal(hash(path.join('evidence', name)), expected);
  }
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(text(path.join('evidence', 'red-stub.js.txt')), sandbox);
  const stub = sandbox.module.exports;
  const result = stub.summarize(stub.validate(stub.create(), json('manifest.json').syntheticInputTrace.safe));
  assert.equal(result.verdict, 'unknown');
  assert.throws(() => assert.equal(result.verdict, 'success'), { code: 'ERR_ASSERTION' });
  assert.equal(iac.status, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.match(iac.reason, /Resource-free/);
});

test('standalone page has explicit honest limits, local assets, CSP, keyboard semantics and no execution channels', () => {
  const html = text('index.html');
  const app = text('app.js');
  const model = text('model.js');
  const banner = 'Training rehearsal - synthetic data - not a live Azure result';
  assert.equal(html.split(banner).length - 1, 1);
  assert.match(html, /role="note"/);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<noscript>/);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "base-uri 'none'", "form-action 'none'", "object-src 'none'", "worker-src 'none'"
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)|(?:href|src)="(?:https?:|\/\/|data:)|(?:id|name)="reset"/i);
  assert.match(html, /id="archive-run" type="button"/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /controls\.scope\.focus\(\)/);
  assert.match(text('lesson.css'), /:focus-visible\s*\{\s*outline: 3px/);
  assert.doesNotMatch(app + model, /innerHTML|outerHTML|document\.write|\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|Worker\s*\(|setTimeout|setInterval|localStorage|sessionStorage|Math\.random|Date\s*[.(]/);
  assert.match(text('README.md'), /CORE, DATA, ASANY, C064/);
  assert.match(text('README.md'), /No separate test, plumbing or refinement unit/);
});

test('retained green and syntax captures have exact raw output and current source hashes', () => {
  for (const stage of ['green', 'syntax']) {
    const record = latest(stage);
    assert.equal(record.passed, true);
    assert.equal(record.captureWasExplicit, true);
    assert.equal(record.node, 'v22.23.4');
    assert.ok(record.commands.length > 0);
    assert.ok(record.commands.every((command) => command.exitCode === 0 && !command.error));
    assert.equal(hash(path.join('evidence', record.stdout)), record.stdoutSha256);
    assert.equal(hash(path.join('evidence', record.stderr)), record.stderrSha256);
    for (const [name, expected] of Object.entries(record.sourceHashes)) assert.equal(hash(name), expected, name);
    const iac = json(path.join('evidence', 'iac-na.json'));
    assert.ok(Date.parse(record.startedAtUtc) >= Date.parse(iac.recordedAtUtc));
    if (stage === 'syntax') {
      assert.deepEqual(record.syntaxFiles.sort(), fs.readdirSync(directory).filter((name) => /\.(?:js|cjs)$/.test(name)).sort());
    }
  }
});

test('retained actual browser proof used the exact published helper, signed offline pairing and awaited cleanup', () => {
  const observation = latest('browser-observation');
  const browser = latest('browser');
  assert.equal(observation.status, 'passed');
  assert.equal(browser.passed, true);
  assert.equal(observation.closeAwaited, true);
  assert.equal(observation.node, 'v22.23.4');
  assert.equal(observation.playwright, '1.56.1');
  assert.equal(observation.signedBrowser.status, 'Valid');
  assert.match(observation.signedBrowser.signer, /Microsoft Corporation/);
  assert.match(observation.browserVersion, /^156\./);
  assert.equal(observation.browserVersion, observation.signedBrowser.productVersion);
  assert.equal(observation.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(observation.helperPublishedCommit, '53c0c0d');
  assert.deepEqual(observation.pageErrors, []);
  assert.deepEqual(observation.externalCompleted, []);
  assert.equal(observation.cases.length, 9);
  assert.ok(observation.cases.every((entry) => entry.status === 'passed'));
  const csp = observation.cases.find((entry) => entry.csp).csp;
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.fetchRejected, true);
  assert.ok(csp.violations.some((entry) => entry.directive.startsWith('script-src')));
  assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.equal(hash(path.join('evidence', browser.stdout)), browser.stdoutSha256);
  assert.equal(hash(path.join('evidence', browser.stderr)), browser.stderrSha256);
  for (const record of [observation, browser]) {
    for (const [name, expected] of Object.entries(record.sourceHashes)) assert.equal(hash(name), expected, name);
    assert.equal(record.captureWasExplicit, true);
  }
});
