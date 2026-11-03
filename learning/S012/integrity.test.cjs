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
const proofHashes = () => Object.fromEntries(fs.readdirSync(path.join(__dirname, 'evidence'))
  .map((name) => [name, hash(path.join('evidence', name))]));
const html = read('index.html');
const manifest = json('manifest.json');

test('source title/objective and original D-S012/P001 lineage are exact, not guessed', () => {
  const readme = fs.readFileSync(path.join(__dirname, '..', '..', 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(__dirname, '..', '..', '.docs', 'wiki', 'backlog.md'), 'utf8');
  const contract = fs.readFileSync(path.join(__dirname, '..', '..', '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.ok(readme.includes('| S012 | **CPU/memory-driven scale-out:** Scale before resource saturation causes queuing or latency-budget violations. |'));
  assert.match(backlog, /\| D-S012 \| P1 \| Add CPU\/memory load controls and supported native metric-based autoscale configuration\./);
  assert.match(contract, /\| A-S012 \| D-S012 \| S \| Raise synthetic CPU\/memory demand; explain rule triggers without inferring user success\./);
  assert.equal(manifest.title, 'CPU/memory-driven scale-out');
  assert.deepEqual(manifest.originalPrerequisites, ['P001']);
  assert.match(html, /B-S012 remains To Do, gated by CORE, DATA, ASANY, C066/);
});

test('one frozen satisfier, portable entrypoint, and explicit unclaimed native/runtime/parent outcomes', () => {
  assert.equal(manifest.cardId, 'A-S012');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S012');
  assert.equal(manifest.packet, 'SC-S012');
  assert.equal(manifest.mode, 'synthetic-only');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.parentComplete, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.deepEqual(manifest.dependencies, []);
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', '..', manifest.entryPoint)));
});

test('prominent exact training banner, objective, preconditions, assertions and limitations are delivered', () => {
  assert.match(html, /role="note">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const phrase of ['Objective:', 'Preconditions and limits:', 'Conduct the preemptive transition',
    'Metric and capacity observations are not client evidence.', 'five-nines', 'UNKNOWN']) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /<noscript>/);
});

test('strict local CSP and local external assets exclude inline execution and cloud/runtime dependencies', () => {
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /\bon\w+\s*=|<script(?![^>]*\bsrc=)|\bstyle\s*=|https?:\/\//i);
  const assets = [...html.matchAll(/(?:src|href)="([^"#]+)"/g)].map((match) => match[1]);
  assert.deepEqual(assets.sort(), ['app.js', 'lesson.css', 'model.js']);
  for (const asset of assets) assert.ok(fs.existsSync(path.join(__dirname, asset)));
  for (const name of ['app.js', 'model.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|innerHTML|eval\s*\(/);
  }
});

test('native form reset cannot be shadowed and all operator inputs have labels', () => {
  assert.doesNotMatch(html, /(?:name|id)="reset"/i);
  assert.match(read('app.js'), /form\.reset\(\)/);
  const ids = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 6);
  for (const id of ids) assert.ok(html.includes(`for="${id}"`), id);
  assert.ok(read('lesson.css').includes(':focus-visible'));
  assert.ok(read('lesson.css').includes('min-width: 0'));
});

test('BDD and archived source/tests genuinely preceded 44 behavioral assertion failures', () => {
  const red = json(path.join('evidence', 'red.json'));
  const raw = read(path.join('evidence', 'red.tap.txt'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.assertionFailures, 44);
  assert.equal(red.loadableStub, true);
  assert.equal(red.snapshotsAutoDiscovered, false);
  assert.match(raw, /# tests 45/);
  assert.match(raw, /# pass 1/);
  assert.match(raw, /# fail 44/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError|TypeError:/);
  assert.equal(hash(path.join('evidence', 'red.tap.txt')), red.logSha256);
  assert.equal(hash(path.join('evidence', 'red.stub.js.txt')), red.stubSha256);
  assert.equal(hash(path.join('evidence', 'red.spec.cjs.txt')), red.testsSha256);
  assert.equal(hash('model.test.cjs'), red.testsSha256, 'The same 45 assertions remain the behavioral acceptance suite');
  assert.equal(hash('cpu-memory-scale-out.feature'), red.featureSha256);
});

test('archived no-op stub actually loads and demonstrates absent behavior, not a missing-code RED', () => {
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(path.join('evidence', 'red.stub.js.txt')), context);
  const stub = context.module.exports;
  assert.equal(typeof stub.initial, 'function');
  assert.equal(typeof stub.reduce, 'function');
  assert.equal(typeof stub.summarize, 'function');
  assert.equal(stub.reduce(stub.initial(), { type: 'tick' }).clockSeconds, 0);
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence'))) {
    assert.doesNotMatch(name, /\.test\.(?:cjs|js|mjs)$/);
  }
});

test('IaC N/A is explicit, resource-free, and chronologically after RED', () => {
  const iac = json(path.join('evidence', 'iac-na.json'));
  const red = json(path.join('evidence', 'red.json'));
  assert.equal(iac.result, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) > Date.parse(red.finishedAtUtc));
  assert.equal(iac.precedingRedSha256, hash(path.join('evidence', 'red.json')));
  assert.match(iac.reason, /No cloud, IaC, scaffold, identity, deployment, expenditure, framework, or dependency work/);
});

test('browser code pins offline pairing, uses the verified isolated helper, and awaits close in finally', () => {
  const browser = read('browser.test.cjs');
  assert.match(browser, /assert\.equal\(playwright\.version, '1\.56\.1'\)/);
  assert.match(browser, /Get-AuthenticodeSignature/);
  assert.match(browser, /assert\.match\(signature\.productVersion, \/\^156/);
  assert.match(browser, /openIsolatedLesson\('learning\\\\S012\\\\index\.html'\)/);
  assert.match(browser, /finally \{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(browser, /ignoreHTTPSErrors|bypassCSP\s*:\s*true|--no-sandbox|chromium\.launch|npm install|playwright install/);
});

test('ordinary verification demonstrably leaves all saved proof byte-identical', () => {
  const before = proofHashes();
  const result = spawnSync(process.execPath, [path.join(__dirname, 'verify.cjs'), 'green'], {
    cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: '0' }, windowsHide: true
  });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /Historical evidence byte hashes unchanged/);
  assert.deepEqual(proofHashes(), before);
});

test('capture is explicit, append-only, and never an ordinary verification side effect', () => {
  for (const filename of ['verify.cjs', 'browser.test.cjs']) {
    const source = read(filename);
    assert.match(source, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
    assert.match(source, /if \(capture\)/);
    assert.match(source, /while \(fs\.existsSync/);
    assert.doesNotMatch(source, /unlink|rmSync|renameSync|truncate/);
  }
  assert.equal(read('.gitattributes').replace(/\r\n/g, '\n'), '* -text whitespace=cr-at-eol\nevidence/*.txt whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof\n');
});

test('all retained numbered run logs still match their recorded byte hashes, including the failed first attempt', () => {
  const directory = path.join(__dirname, 'evidence');
  for (const name of fs.readdirSync(directory).filter((entry) => /^(?:green|syntax|browser|integrity)-\d+\.json$/.test(entry))) {
    const record = json(path.join('evidence', name));
    assert.equal(record.captureWasExplicit, true, name);
    assert.equal(record.rawLogSha256, hash(path.join('evidence', record.rawLog)), name);
  }
  const iac = json(path.join('evidence', 'iac-na.json'));
  const green = json(path.join('evidence', 'green-1.json'));
  assert.ok(Date.parse(green.startedAtUtc) > Date.parse(iac.recordedAtUtc));
  assert.equal(green.passed, true);
  assert.equal(green.sourceHashes['model.js'], hash('model.js'));
  assert.equal(green.sourceHashes['model.test.cjs'], hash('model.test.cjs'));
  const rejected = json(path.join('evidence', 'publication-precheck-1.json'));
  assert.equal(rejected.exitCode, 2);
  assert.equal(rejected.rawLogSha256, hash(path.join('evidence', rejected.rawLog)));
  assert.equal(rejected.commitCreated, false);
  assert.equal(rejected.tagCreated, false);
  assert.equal(rejected.pushAttempted, false);
});

test('latest actual headless observations prove the pinned pairing, cleanup, DOM claims and enforced CSP', () => {
  const names = fs.readdirSync(path.join(__dirname, 'evidence'))
    .filter((name) => /^browser-\d+-observations\.json$/.test(name))
    .sort((left, right) => Number(left.split('-')[1]) - Number(right.split('-')[1]));
  assert.ok(names.length > 0, 'Actual browser observations must already have been deliberately captured');
  const observed = json(path.join('evidence', names.at(-1)));
  assert.equal(observed.status, 'passed');
  assert.equal(observed.playwright, '1.56.1');
  assert.match(observed.browserVersion, /^156\./);
  assert.equal(observed.signedBrowser.status, 'Valid');
  assert.match(observed.signedBrowser.signer, /Microsoft Corporation/);
  assert.equal(observed.closeAwaited, true);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.externalCompleted, []);
  assert.equal(observed.nativeProof, false);
  assert.equal(observed.productionNode24Validated, false);
  assert.equal(observed.parentComplete, false);
  assert.equal(observed.cases.length, 18);
  assert.ok(observed.cases.every((entry) => entry.status === 'passed'));
  for (const [name, digest] of Object.entries(observed.sourceHashes)) assert.equal(hash(name), digest, name);
  const positive = observed.cases.find((entry) => entry.name.startsWith('keyboard-only transition'));
  assert.equal(positive.observed.summary.users.uninterrupted, 30);
  assert.equal(positive.dom.verdict, 'PASS');
  assert.ok(positive.observed.summary.transition.addedInstanceSamples > 0);
  const csp = observed.cases.find((entry) => entry.csp)?.csp;
  assert.ok(csp);
  assert.equal(csp.inlineRan, false);
  assert.equal(csp.connection, 'blocked');
  assert.ok(csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.ok(csp.violations.some((entry) => entry.directive.startsWith('script-src')));
});
