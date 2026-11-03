'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const hash = (name) => createHash('sha256').update(fs.readFileSync(path.join(__dirname, name))).digest('hex');
const proofNames = () => fs.readdirSync(path.join(__dirname, 'evidence')).map((name) => path.join('evidence', name));
const proofHashes = () => Object.fromEntries([...proofNames(), ...['evidence.json', 'result.json']
  .filter((name) => fs.existsSync(path.join(__dirname, name)))].sort().map((name) => [name, hash(name)]));
const numbered = (prefix, suffix = '.json') => fs.readdirSync(path.join(__dirname, 'evidence'))
  .filter((name) => new RegExp(`^${prefix}-\\d+${suffix.replaceAll('.', '\\.')}$`).test(name))
  .sort((left, right) => Number(left.split('-')[1]) - Number(right.split('-')[1]));
const latest = (prefix, suffix) => {
  const names = numbered(prefix, suffix);
  assert.ok(names.length, `Deliberately captured ${prefix} evidence must already exist`);
  return json(path.join('evidence', names.at(-1)));
};
const html = read('index.html');
const manifest = json('manifest.json');
const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('exact canonical S016, D-S016 and A-S016 contract preserve original dependencies and packet', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const contract = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.ok(source.includes('| S016 | **Autoscale oscillation:** Apply suitable stabilization so repeated scale-out/scale-in does not repeatedly interrupt users. |'));
  assert.ok(backlog.includes('| D-S016 | P1 | Add oscillating load and stabilization/cooldown comparison controls. | Capacity oscillations and journey failures are measured; stabilization reduces unsafe transitions without silently exceeding declared budgets. | D-S011, D-S015 |'));
  assert.ok(contract.includes('| A-S016 | D-S016 | S | Apply oscillating demand; compare stabilized versus repeated disruptive capacity changes. | SOURCE |'));
  assert.equal(manifest.title, 'Autoscale oscillation');
  assert.equal(manifest.packet, 'SC-S016');
  assert.deepEqual(manifest.originalPrerequisites, ['D-S011', 'D-S015']);
  assert.match(html, /B-S016 remains To Do, gated by CORE, DATA, ASANY, C065, C066/);
});

test('one frozen satisfier, portable entrypoint and explicit unclaimed native, runtime and parent outcomes', () => {
  assert.equal(manifest.cardId, 'A-S016');
  assert.equal(manifest.workerId, 'worker-A-S016');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S016');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.authorization, 'local-synthetic-only');
  assert.equal(manifest.mode, 'synthetic-only');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.deepEqual(manifest.dependencies, []);
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', '..', manifest.entryPoint)));
  for (const field of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[field].length > 0);
  assert.equal(manifest.syntheticInputTrace.oscillating.length, 10);
  assert.equal(manifest.syntheticInputTrace.rebound.length, 10);
});

test('prominent exact banner, worked procedure, unknowns, comparison limits and disclaimer are delivered', () => {
  assert.match(html, /role="note">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const phrase of ['Objective:', 'Preconditions and limits:', 'Conduct the comparison',
    'NOT_DEMONSTRATED', 'UNKNOWN', 'five-nines', 'Microsoft Open Source Disclaimer',
    'Failed and unknown observations remain cumulative.', 'page memory only']) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /<noscript>/);
  assert.match(read('lesson.css'), /\.training\s*\{/);
});

test('strict local CSP and external local assets exclude inline execution or management dependencies', () => {
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)|\bstyle\s*=|https?:\/\//i);
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]).sort();
  assert.deepEqual(assets, ['app.js', 'lesson.css', 'model.js']);
  for (const asset of assets) assert.ok(fs.existsSync(path.join(__dirname, asset)));
  for (const name of ['app.js', 'model.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|eval\s*\(/);
  }
});

test('native form reset cannot be shadowed; seven operator controls have labels and unique IDs', () => {
  assert.doesNotMatch(html, /(?:name|id)="reset"/i);
  assert.match(read('app.js'), /form\.reset\(\)/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  const controls = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(controls.length, 7);
  for (const id of controls) assert.ok(html.includes(`for="${id}"`), id);
  assert.ok(read('lesson.css').includes(':focus-visible'));
  assert.ok(read('lesson.css').includes('min-width: 0'));
});

test('both genuine RED runs and the corrected example remain preserved with exact assertion-only provenance', () => {
  for (const [metadata, raw, spec] of [
    ['red.json', 'red.tap.txt', 'red.spec.cjs.txt'],
    ['red-2.json', 'red-2.tap.txt', 'red-2.spec.cjs.txt']
  ]) {
    const record = json(path.join('evidence', metadata));
    const output = read(path.join('evidence', raw));
    assert.equal(record.exitCode, 1);
    assert.equal(record.tests, 43);
    assert.equal(record.passes, 1);
    assert.equal(record.failures, 42);
    assert.equal(record.assertionFailures, 42);
    assert.equal(record.loadableStub, true);
    assert.equal(record.snapshotsAutoDiscovered, false);
    assert.match(output, /# tests 43/);
    assert.match(output, /# pass 1/);
    assert.match(output, /# fail 42/);
    assert.doesNotMatch(output, /MODULE_NOT_FOUND|SyntaxError|TypeError:/);
    assert.equal(record.logSha256, hash(path.join('evidence', raw)));
    assert.equal(record.testsSha256, hash(path.join('evidence', spec)));
    assert.equal(record.stubSha256, hash(path.join('evidence', 'red.stub.js.txt')));
    assert.equal(record.featureSha256, hash('autoscale-oscillation.feature'));
  }
  const refined = json(path.join('evidence', 'red-2.json'));
  assert.match(refined.refinement, /five to four windows/);
  assert.equal(refined.testsSha256, hash('model.test.cjs'), 'The unchanged refined-RED suite is the green acceptance suite');
});

test('archived stub genuinely loads and lacks behavior; saved RED snapshots are not auto-discovered tests', () => {
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(path.join('evidence', 'red.stub.js.txt')), context);
  const stub = context.module.exports;
  for (const name of ['initial', 'reduce', 'summarize']) assert.equal(typeof stub[name], 'function');
  assert.equal(stub.reduce(stub.initial(), { type: 'step', condition: 'complete' }).cursor, 0);
  assert.equal(stub.summarize(stub.initial()).verification.verdict, 'NOT_RUN');
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence'))) {
    assert.doesNotMatch(name, /\.test\.(?:cjs|js|mjs)$/);
  }
});

test('explicit resource-free IaC N/A follows each RED before the first implementation green', () => {
  for (const [iacName, redName] of [['iac-na.json', 'red.json'], ['iac-2-na.json', 'red-2.json']]) {
    const iac = json(path.join('evidence', iacName));
    const red = json(path.join('evidence', redName));
    assert.equal(iac.result, 'N/A');
    assert.equal(iac.implementationStarted, false);
    assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
    assert.equal(iac.precedingRedSha256, hash(path.join('evidence', redName)));
    assert.match(iac.reason, /No cloud, IaC, scaffold, identity, deployment, expenditure, framework, or dependency work/);
  }
  const firstGreen = json(path.join('evidence', 'green-1.json'));
  const iac = json(path.join('evidence', 'iac-2-na.json'));
  assert.ok(Date.parse(firstGreen.startedAtUtc) > Date.parse(iac.recordedAtUtc));
  assert.equal(firstGreen.passed, true);
});

test('browser code pins the published helper and approved offline pairing with awaited finally cleanup', () => {
  const browser = read('browser.test.cjs');
  const actualHash = hash(path.join('..', '..', 'testing', 'browser', 'isolated.cjs'));
  assert.equal(actualHash, helperHash);
  assert.equal(manifest.testTooling.helperSha256, helperHash);
  assert.match(browser, /assert\.equal\(playwright\.version, '1\.56\.1'\)/);
  assert.match(browser, /Get-AuthenticodeSignature/);
  assert.match(browser, /assert\.match\(signature\.productVersion, \/\^156/);
  assert.match(browser, /openIsolatedLesson\('learning\\\\S016\\\\index\.html'\)/);
  assert.match(browser, /finally \{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(browser, /ignoreHTTPSErrors|bypassCSP\s*:\s*true|--no-sandbox|chromium\.launch|npm install|playwright install|lifecycle\.cjs/);
});

test('ordinary verification demonstrably leaves all saved proof and publication metadata byte-identical', () => {
  const before = proofHashes();
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify.cjs'), 'green'], {
    cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '0' }, windowsHide: true
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /Historical evidence byte hashes unchanged/);
  assert.deepEqual(proofHashes(), before);
});

test('capture requires explicit opt-in, uses append-only new files and preserves proof bytes across checkout', () => {
  for (const filename of ['verify.cjs', 'browser.test.cjs']) {
    const source = read(filename);
    assert.match(source, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
    assert.match(source, /if \(capture\)/);
    assert.match(source, /while \(fs\.existsSync/);
    assert.match(source, /flag: 'wx'/);
    assert.doesNotMatch(source, /unlink|rmSync|renameSync|truncate/);
  }
  assert.equal(read('.gitattributes').replace(/\r\n/g, '\n'),
    '* -text whitespace=cr-at-eol\nevidence/*.txt whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof\n');
});

test('all retained numbered run logs match byte hashes and current green/syntax assets are qualified', () => {
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence'))
    .filter((entry) => /^(?:green|syntax|browser|integrity)-\d+\.json$/.test(entry))) {
    const record = json(path.join('evidence', name));
    assert.equal(record.captureWasExplicit, true, name);
    assert.equal(record.rawLogSha256, hash(path.join('evidence', record.rawLog)), name);
  }
  const green = latest('green');
  assert.equal(green.passed, true);
  assert.equal(green.sourceHashes['model.js'], hash('model.js'));
  assert.equal(green.sourceHashes['model.test.cjs'], hash('model.test.cjs'));
  const syntax = latest('syntax');
  assert.equal(syntax.passed, true);
  assert.equal(syntax.syntaxFiles.length, 6);
  for (const name of syntax.syntaxFiles) assert.equal(syntax.sourceHashes[name], hash(name), name);
});

test('latest real browser proof contains actual comparison, failure, unknown, error, reset, keyboard and CSP assertions', () => {
  const observed = latest('browser', '-observations.json');
  assert.equal(observed.status, 'passed');
  assert.equal(observed.node, 'v22.23.4');
  assert.equal(observed.playwright, '1.56.1');
  assert.match(observed.browserVersion, /^156\./);
  assert.equal(observed.signedBrowser.status, 'Valid');
  assert.match(observed.signedBrowser.signer, /Microsoft Corporation/);
  assert.equal(observed.helperSha256, helperHash);
  assert.equal(observed.closeAwaited, true);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.externalCompleted, []);
  assert.equal(observed.nativeProof, false);
  assert.equal(observed.productionNode24Validated, false);
  assert.equal(observed.parentComplete, false);
  assert.equal(observed.cases.length, 18);
  assert.ok(observed.cases.every((entry) => entry.status === 'passed'));
  for (const [name, digest] of Object.entries(observed.sourceHashes)) assert.equal(hash(name), digest, name);
  const positive = observed.cases.find((entry) => entry.name.startsWith('keyboard-only same-trace'));
  assert.equal(positive.observed.summary.lanes.stabilized.uninterrupted, 40);
  assert.equal(positive.observed.summary.lanes.immediate.interrupted, 21);
  assert.equal(positive.dom.verdict, 'PASS');
  assert.equal(positive.dom.journeyRows, 80);
  const cooldown = observed.cases.find((entry) => entry.name.startsWith('fewer changes with excessive cooldown'));
  assert.equal(cooldown.observed.summary.lanes.stabilized.interrupted, 12);
  assert.equal(cooldown.dom.verdict, 'FAIL');
  assert.ok(observed.cases.some((entry) => entry.dom.verdict === 'UNKNOWN'));
  assert.ok(observed.cases.some((entry) => entry.observed.archives?.[0]?.uiError));
  assert.ok(observed.cases.some((entry) => entry.layout?.outlineWidth === '3px'));
  const csp = observed.cases.find((entry) => entry.csp)?.csp;
  assert.ok(csp);
  assert.equal(csp.inlineRan, false);
  assert.equal(csp.connection, 'blocked');
  assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.ok(csp.violations.some((entry) => entry.directive.startsWith('script-src')));
});
