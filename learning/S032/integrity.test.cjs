'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const evidence = path.join(__dirname, 'evidence');
const text = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const json = (name) => JSON.parse(text(name));
const hash = (name) => createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex');
function latest(prefix) {
  const candidates = fs.readdirSync(evidence)
    .map((name) => ({ name, match: name.match(new RegExp(`^${prefix}-(\\d+)\\.json$`)) }))
    .filter((entry) => entry.match).sort((a, b) => Number(b.match[1]) - Number(a.match[1]));
  assert.ok(candidates.length > 0, `Retained ${prefix} capture is required.`);
  return json(path.join('evidence', candidates[0].name));
}
function raw(record) {
  assert.equal(hash(path.join('evidence', record.stdout)), record.stdoutSha256);
  assert.equal(hash(path.join('evidence', record.stderr)), record.stderrSha256);
}
function currentSources(record) {
  for (const [name, expected] of Object.entries(record.sourceHashes)) assert.equal(hash(name), expected, name);
}

test('manifest preserves exact S032 source, frozen unit, packet, portable contract and genuine native remainder', () => {
  const manifest = json('manifest.json');
  const source = json(path.join('evidence', 'source-contract.json'));
  assert.equal(manifest.cardId, 'A-S032');
  assert.equal(manifest.source, 'S032');
  assert.equal(manifest.parent, 'D-S032');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S032');
  assert.equal(manifest.packet, 'SC-S032');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.deepEqual(manifest.dependencies, []);
  assert.deepEqual(manifest.originalParentPrerequisites, ['P001']);
  assert.deepEqual(manifest.nativeRemainderGates, ['CORE', 'DATA', 'ASANY', 'C108']);
  for (const flag of ['nativeProof', 'productionNode24Validated', 'parentComplete', 'reliabilityGuarantee']) {
    assert.equal(manifest[flag], false);
  }
  for (const [file, field, prefix] of [
    ['README.md', 'canonicalReadmeRow', '| S032 |'],
    [path.join('.docs', 'wiki', 'backlog.md'), 'backlogRow', '| D-S032 |'],
    [path.join('.docs', 'wiki', 'kanban.md'), 'cardRow', '| A-S032 |'],
    [path.join('.docs', 'wiki', 'kanban.md'), 'nativeRemainderRow', '| B-S032 |']
  ]) {
    const row = fs.readFileSync(path.join(root, file), 'utf8').split(/\r?\n/).find((line) => line.startsWith(prefix));
    assert.equal(source[field], row);
  }
  assert.match(source.canonicalReadmeRow, /Slot-routing cookie transition.*pinned users/);
  assert.match(source.backlogRow, /retirement waits for unresolved pinned clients/);
  assert.match(source.portableAndAtomicContract, /## Atomic card contract/);
  assert.match(source.portableAndAtomicContract, /### Portable A-card lesson contract/);
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.admittedCard.owner, 'worker-A-S032');
  assert.equal(source.admittedCard.packet, 'SC-S032');
  for (const name of [manifest.entryPoint, manifest.feature, ...manifest.tests]) {
    assert.ok(fs.statSync(path.join(root, name)).isFile(), name);
  }
  for (const key of ['objective', 'preconditions', 'actions', 'syntheticInputTrace', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[key] && Object.keys(manifest[key]).length > 0, key);
  }
});

test('one loadable stub produced seven genuine assertion REDs with immutable raw snapshots before IaC N/A', () => {
  const red = json(path.join('evidence', 'red.json'));
  const iac = json(path.join('evidence', 'iac-na.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.syntaxExitCode, 0);
  assert.equal(red.missingToolsOrCode, false);
  assert.equal(red.intentionalRed, true);
  assert.equal(red.passed, true);
  raw(red);
  const output = text(path.join('evidence', red.stdout));
  assert.match(output, /ERR_ASSERTION/);
  assert.match(output, /# tests 8/);
  assert.match(output, /# pass 1/);
  assert.match(output, /# fail 7/);
  assert.doesNotMatch(output, /Cannot find module|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/);
  for (const [name, expected] of Object.entries(red.snapshots)) {
    assert.ok(name.endsWith('.snapshot.txt'));
    assert.equal(hash(path.join('evidence', name)), expected);
  }
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(text(path.join('evidence', 'red-stub.js.snapshot.txt')), sandbox);
  const stub = sandbox.module.exports;
  const view = stub.inspect(stub.apply(stub.create(), { type: 'replay' }));
  assert.equal(view.completed, 0);
  assert.throws(() => assert.equal(view.completed, 4), { code: 'ERR_ASSERTION' });
  assert.equal(view.verdict, 'unknown');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.afterBehavioralRed, true);
  assert.equal(iac.redSha256, hash(path.join('evidence', 'red.json')));
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.match(iac.reason, /Resource-free/);
});

test('portable UI has restrictive local-only CSP, honest limits, keyboard/reset semantics and no execution channels', () => {
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
    "form-action 'none'", "base-uri 'none'", "object-src 'none'", "worker-src 'none'", "frame-src 'none'"
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)|(?:href|src)="(?:https?:|\/\/|data:)|(?:id|name)="reset"/i);
  assert.match(html, /id="archive-run" type="button"/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /controls\.weight\.focus\(\)/);
  assert.match(text('lesson.css'), /:focus-visible\s*\{\s*outline: 3px/);
  assert.doesNotMatch(app + model,
    /innerHTML|outerHTML|document\.write|document\.cookie|\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|Worker\s*\(|setTimeout|setInterval|localStorage|sessionStorage|Math\.random|Date\s*[.(]/);
  assert.match(text('README.md'), /CORE, DATA, ASANY, C108/);
  assert.match(text('README.md'), /No separate test, plumbing or refinement unit/);
  assert.match(text('verify.cjs'), /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(text('verify.cjs'), /Ordinary verification must not add, remove or rewrite retained proof/);
});

test('retained green and syntax captures match current source and raw bytes without hiding failed stages', () => {
  const iac = json(path.join('evidence', 'iac-na.json'));
  for (const stage of ['green', 'syntax']) {
    const record = latest(stage);
    assert.equal(record.passed, true);
    assert.equal(record.captureWasExplicit, true);
    assert.equal(record.node, 'v22.23.4');
    assert.ok(record.commands.length > 0);
    assert.ok(record.commands.every((command) => command.exitCode === 0 && !command.error));
    raw(record);
    currentSources(record);
    assert.ok(Date.parse(record.startedAtUtc) >= Date.parse(iac.recordedAtUtc));
    if (stage === 'green') {
      assert.match(text(path.join('evidence', record.stdout)), /# tests 26/);
      assert.match(text(path.join('evidence', record.stdout)), /# fail 0/);
    } else {
      assert.deepEqual(record.syntaxFiles.sort(),
        fs.readdirSync(__dirname).filter((name) => /\.(?:js|cjs)$/.test(name)).sort());
    }
  }
});

test('actual ten-leaf browser proof uses the published signed offline pair and awaited owned cleanup', () => {
  const browser = latest('browser');
  const observation = latest('browser-observation');
  assert.equal(browser.passed, true);
  assert.equal(observation.status, 'passed');
  assert.equal(observation.captureWasExplicit, true);
  assert.equal(observation.closeAwaited, true);
  assert.equal(observation.node, 'v22.23.4');
  assert.equal(observation.playwright, '1.56.1');
  assert.equal(observation.signedBrowser.status, 'Valid');
  assert.match(observation.signedBrowser.signer, /Microsoft Corporation/);
  assert.match(observation.browserVersion, /^156\./);
  assert.equal(observation.browserVersion, observation.signedBrowser.productVersion);
  assert.equal(observation.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(observation.helperPublishedCommit, '53c0c0d');
  assert.equal(observation.openAPI, 'openIsolatedLesson');
  assert.equal(observation.passedLeafChecks, 10);
  assert.equal(observation.observations.length, 10);
  assert.equal(observation.outsideRequestsRouted, 0);
  assert.deepEqual(observation.pageErrors, []);
  assert.ok(observation.observations.every((entry) => entry.passed));
  const csp = observation.observations.at(-1).details;
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.handlerExecuted, false);
  assert.equal(csp.connectionBlocked, true);
  for (const directive of ['script-src-elem', 'script-src-attr', 'connect-src', 'base-uri', 'form-action']) {
    assert.ok(csp.violations.some((entry) => entry.directive === directive));
  }
  assert.equal(observation.cleanup.listenersStarted, 0);
  assert.equal(observation.cleanup.foregroundLeases, 0);
  assert.equal(observation.cleanup.unownedCleanupPerformed, false);
  assert.equal(observation.nativeProof, false);
  assert.equal(observation.productionNode24Validated, false);
  raw(browser);
  currentSources(browser);
  currentSources(observation);
});
