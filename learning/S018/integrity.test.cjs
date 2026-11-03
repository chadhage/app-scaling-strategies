'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const hash = (name) => createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const evidenceFiles = () => fs.readdirSync(path.join(__dirname, 'evidence')).sort();
const proofHashes = () => Object.fromEntries([
  ...evidenceFiles().map((name) => path.join('evidence', name)),
  ...['evidence.json', 'result.json'].filter((name) => fs.existsSync(path.join(__dirname, name)))
].sort().map((name) => [name, hash(name)]));
const latest = (prefix, suffix = '.json') => {
  const names = evidenceFiles().filter((name) =>
    new RegExp(`^${prefix}-\\d+${suffix.replaceAll('.', '\\.')}$`).test(name))
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]));
  assert.ok(names.length, `Deliberately captured ${prefix} evidence is required`);
  return json(path.join('evidence', names.at(-1)));
};
const html = read('index.html');
const manifest = json('manifest.json');
const qualifiedHelper = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('exact canonical S018 source/card/backlog preserve packet, original D-S062 and native entry gates', () => {
  const contract = json(path.join('evidence', 'source-contract.json'));
  assert.equal(contract.cardId, 'A-S018');
  assert.equal(contract.packet, 'SC-S018');
  assert.equal(contract.readBeforeBehaviorDesign, true);
  assert.deepEqual(contract.originalParentPrerequisites, ['D-S062']);
  for (const entry of contract.rows) {
    assert.equal(sha(entry.row), entry.sha256);
    const rows = fs.readFileSync(path.join(root, entry.source), 'utf8').split(/\r?\n/);
    assert.ok(rows.includes(entry.row), entry.source);
  }
  assert.ok(contract.rows[0].row.includes('**Independent tier scaling:** Scale the constrained tier while preserving contracts and capacity limits in remaining tiers.'));
  assert.ok(contract.rows[1].row.endsWith('| D-S062 |'));
  assert.ok(contract.rows[2].row.includes('Select a bottleneck tier; identify downstream pressure caused by indiscriminate scaling.'));
  assert.ok(contract.rows[3].row.endsWith('| CORE, DATA, AKS, C076 |'));
});

test('one frozen S portable unit has a worked fixture and no native/Node24/source-parent certification', () => {
  assert.equal(manifest.cardId, 'A-S018');
  assert.equal(manifest.workerId, 'worker-A-S018');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S018');
  assert.equal(manifest.packet, 'SC-S018');
  assert.equal(manifest.source, 'S018');
  assert.equal(manifest.parent, 'D-S018');
  assert.deepEqual(manifest.originalPrerequisites, ['D-S062']);
  assert.equal(manifest.title, 'Independent tier scaling');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.mode, 'synthetic-only');
  assert.equal(manifest.authorization, 'local-implementation-only');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.deepEqual(manifest.dependencies, []);
  assert.ok(fs.existsSync(path.join(root, manifest.entryPoint)));
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length);
  assert.equal(manifest.syntheticInputTrace.journeysPerWindow, 10);
  assert.equal(manifest.syntheticInputTrace.connectionLimit, 12);
  assert.equal(manifest.syntheticInputTrace.journeyBudgetMs, 150);
});

test('prominent exact banner, finite procedure, cumulative results and unknowns are visible in portable HTML', () => {
  assert.match(html, /role="note">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const text of ['6 journeys/instance/window', '12 occupied connections', '150 ms',
    'missing', 'UNKNOWN', 'FAIL outranks UNKNOWN', 'six newest nonempty runs', 'reload', 'no real users',
    'A-S018 does not complete B-S018, D-S018, D-S062', '<noscript>']) {
    assert.ok(html.toLowerCase().includes(text.toLowerCase()), text);
  }
});

test('local-only CSP and explicit assets exclude inline execution, storage, cloud calls and frameworks', () => {
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'",
    "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)|\bstyle\s*=|https?:\/\//i);
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(assets, ['app.js', 'lesson.css', 'model.js']);
  for (const asset of assets) assert.ok(fs.existsSync(path.join(__dirname, asset)));
  for (const name of ['app.js', 'model.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|eval\s*\(/);
  }
  assert.equal(fs.existsSync(path.join(__dirname, 'package.json')), false);
});

test('six controls are labeled, IDs are unique, keyboard focus is styled and native form.reset cannot be shadowed', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const controls = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 6);
  for (const id of controls) assert.ok(html.includes(`for="${id}"`), id);
  assert.doesNotMatch(html, /(?:name|id)="reset"/i);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('lesson.css'), /:focus-visible/);
  assert.match(read('lesson.css'), /outline: 3px/);
  assert.match(read('lesson.css'), /min-width: 0/);
});

test('all raw RED bytes and non-auto-discovered snapshots remain exactly attributable', () => {
  for (const stem of ['red', 'red-2']) {
    const record = json(path.join('evidence', `${stem}.json`));
    assert.equal(record.commands[0].exitCode, 1);
    assert.equal(record.node, 'v22.23.4');
    assert.equal(record.captureWasExplicit, true);
    for (const stream of ['stdout', 'stderr']) {
      const name = path.join('evidence', record.raw[stream]);
      assert.equal(hash(name), record.raw[`${stream}Sha256`]);
      assert.equal(fs.statSync(path.join(__dirname, name)).size, record.raw[`${stream}Bytes`]);
    }
    for (const [name, expected] of Object.entries(record.snapshots)) {
      assert.ok(name.endsWith('-snapshot.txt'));
      assert.equal(hash(path.join('evidence', name)), expected);
    }
  }
  const refined = json(path.join('evidence', 'red-2.json'));
  assert.equal(refined.assertionFailures, 31);
  assert.equal(refined.failedTests, 31);
  assert.equal(refined.missingCodeOrToolFailure, false);
  const output = read(path.join('evidence', 'red-2.stdout.txt'));
  assert.match(output, /# tests 32/);
  assert.match(output, /# pass 1/);
  assert.match(output, /# fail 31/);
  assert.equal((output.match(/name: 'AssertionError'/g) || []).length, 31);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|name: '(?:TypeError|SyntaxError)'/);
  assert.equal(refined.sourceHashes['model.test.cjs'], hash('model.test.cjs'), 'The refined RED specification is unchanged for GREEN');
  assert.equal(refined.sourceHashes['independent-tier-scaling.feature'], hash('independent-tier-scaling.feature'));
});

test('archived RED stub loads and genuinely lacks scaling, while earlier mixed RED is honestly retained', () => {
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(path.join('evidence', 'red-2-model-snapshot.txt')), context);
  const stub = context.module.exports;
  assert.equal(typeof stub.createLesson, 'function');
  assert.equal(typeof stub.dispatch, 'function');
  const state = stub.createLesson();
  assert.equal(stub.dispatch(state, { type: 'scale', tier: 'api', count: 2 }).current.counts.api, 1);
  assert.equal(state.current.observations.length, 0);
  const first = read(path.join('evidence', 'red.stdout.txt'));
  assert.equal((first.match(/name: 'AssertionError'/g) || []).length, 27);
  assert.equal((first.match(/name: '(?:TypeError|SyntaxError)'/g) || []).length, 4);
  const evidence = json('evidence.json');
  assert.match(evidence.originalRedCaveat, /27.*assertion.*4.*fixture/i);
  assert.match(evidence.originalRedCaveat, /retained/i);
});

test('IaC is explicitly N/A after refined behavioral RED and before implementation GREEN', () => {
  const red = json(path.join('evidence', 'red-2.json'));
  const iac = json(path.join('evidence', 'iac-na.json'));
  const green = latest('green');
  assert.equal(iac.result, 'N/A');
  assert.equal(iac.afterBehavioralRed, 'red-2.json');
  assert.equal(iac.beforeImplementation, true);
  assert.ok(Date.parse(red.finishedAtUtc) <= Date.parse(iac.recordedAtUtc));
  assert.ok(Date.parse(iac.recordedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.match(iac.reason, /resource-free/i);
});

test('focused GREEN and syntax raw provenance match the current owned executable sources', () => {
  for (const prefix of ['green', 'syntax']) {
    const record = latest(prefix);
    assert.equal(record.passed, true);
    assert.ok(record.commands.every((command) => command.exitCode === 0 && !command.error));
    for (const [name, expected] of Object.entries(record.sourceHashes)) assert.equal(hash(name), expected, name);
    assert.equal(hash(path.join('evidence', record.raw.stdout)), record.raw.stdoutSha256);
    assert.equal(hash(path.join('evidence', record.raw.stderr)), record.raw.stderrSha256);
  }
  const green = latest('green');
  assert.match(read(path.join('evidence', green.raw.stdout)), /# tests 32/);
  assert.match(read(path.join('evidence', green.raw.stdout)), /# pass 32/);
  assert.match(read(path.join('evidence', green.raw.stdout)), /# fail 0/);
  const executable = fs.readdirSync(__dirname).filter((name) => /\.(?:js|cjs)$/.test(name)).sort();
  assert.deepEqual(latest('syntax').commands.map((command) => path.basename(command.command.at(-1))).sort(), executable);
});

test('actual browser DOM, keyboard, error, reset, failure, missing evidence and CSP observations have exact offline provenance', () => {
  const record = latest('browser', '-observations.json');
  assert.equal(record.status, 'passed');
  assert.equal(record.closeAwaited, true);
  assert.equal(record.node, 'v22.23.4');
  assert.equal(record.playwright, '1.56.1');
  assert.equal(record.signedBrowser.status, 'Valid');
  assert.match(record.signedBrowser.signer, /Microsoft Corporation/);
  assert.match(record.browserVersion, /^156\./);
  assert.equal(record.browserVersion, record.signedBrowser.productVersion);
  assert.equal(record.helperSha256, qualifiedHelper);
  assert.equal(record.helperPublishedCommit, '53c0c0d');
  assert.equal(record.cases.length, 18);
  assert.ok(record.cases.every((entry) => entry.status === 'passed'));
  assert.deepEqual(record.pageErrors, []);
  assert.deepEqual(record.externalCompleted, []);
  for (const [name, expected] of Object.entries(record.sourceHashes)) assert.equal(hash(name), expected, name);
  const csp = record.cases.find((entry) => entry.name.startsWith('enforced CSP')).csp;
  assert.equal(csp.inlineRan, false);
  assert.equal(csp.connection, 'blocked');
  assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
  const run = latest('browser');
  assert.equal(run.passed, true);
  assert.equal(hash(path.join('evidence', run.raw.stdout)), run.raw.stdoutSha256);
  assert.equal(hash(path.join('evidence', run.raw.stderr)), run.raw.stderrSha256);
  assert.ok(Date.parse(run.startedAtUtc) <= Date.parse(record.startedAtUtc));
  assert.ok(Date.parse(record.finishedAtUtc) <= Date.parse(run.finishedAtUtc));
  assert.match(read(path.join('evidence', run.raw.stdout)), /Captured actual browser observations:/);
  const first = json(path.join('evidence', 'browser-1.json'));
  const caveat = json(path.join('evidence', 'browser-first-attempt-caveat.json'));
  assert.equal(first.passed, false);
  assert.equal(caveat.attempt, 'browser-1.json');
  assert.equal(caveat.abandonedLifecyclePrototypeUsed, false);
});

test('only the exact published isolated helper is used, always with awaited finally close; no prototype or security bypass', () => {
  const helper = path.join(root, 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha(fs.readFileSync(helper)), qualifiedHelper);
  assert.equal(manifest.testTooling.helperSha256, qualifiedHelper);
  const source = read('browser.test.cjs');
  assert.match(source, /openIsolatedLesson\('learning\\\\S018\\\\index\.html'\)/);
  assert.match(source, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(source, /ignoreHTTPSErrors|bypassCSP|--no-sandbox|disable-web-security|chromium\.launch|connectOverCDP/);
  assert.equal(manifest.nativeProof, false);
});

test('owned publication preserves exact source/proof bytes and retains the genuine failed index check', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* -text whitespace=cr-at-eol/m);
  assert.doesNotMatch(attributes, /\beol=lf\b/);
  const failure = json(path.join('evidence', 'publication-1-indexcheck.json'));
  assert.equal(failure.exitCode, 2);
  assert.equal(failure.firstPublicationCreatedCommit, false);
  assert.equal(failure.firstPublicationCreatedTag, false);
  assert.equal(failure.captureWasExplicit, true);
  for (const stream of ['stdout', 'stderr']) {
    const record = failure.raw[stream];
    assert.equal(hash(path.join('evidence', record.path)), record.sha256);
    assert.equal(fs.statSync(path.join(__dirname, 'evidence', record.path)).size, record.bytes);
  }
  assert.match(read(path.join('evidence', failure.raw.stdout.path)), /red-2-bdd-snapshot\.txt:1: trailing whitespace/);
});

test('an actual ordinary verification rerun is read-only to every retained proof byte', () => {
  const before = proofHashes();
  const env = { ...process.env };
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify.cjs'), 'green'], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000, env
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  assert.match(result.stdout, /Historical proof byte hashes unchanged \(read-only verification\)/);
  assert.deepEqual(proofHashes(), before);
});
