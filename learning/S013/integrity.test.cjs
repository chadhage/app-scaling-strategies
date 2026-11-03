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
const proofHashes = () => Object.fromEntries(fs.readdirSync(path.join(__dirname, 'evidence')).sort()
  .map((name) => [name, hash(path.join('evidence', name))]));
const html = read('index.html');
const manifest = json('manifest.json');

test('canonical S013 title, D-S013 objective, original no-prerequisite row, and A-card lineage are exact', () => {
  const root = path.resolve(__dirname, '..', '..');
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const contract = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.ok(source.includes('| S013 | **Concurrency/queue-driven scale-out:** Use supported workload metrics to increase capacity before excessive request accumulation. |'));
  assert.ok(backlog.includes('| D-S013 | P1 | Add concurrency/queue-pressure controls and a supported workload-driven scaling rule. | Backlog/concurrency causes observed capacity changes; completion deadlines hold within the declared envelope; unsupported metrics are rejected. | none |'));
  assert.ok(contract.includes('| A-S013 | D-S013 | S | Increase queue/concurrency pressure; select a valid metric and evaluate deadline outcomes. | SOURCE |'));
  assert.equal(manifest.title, 'Concurrency/queue-driven scale-out');
  assert.deepEqual(manifest.originalPrerequisites, []);
  assert.match(html, /B-S013 remains To Do, gated by CORE, DATA, AKS, C076/);
});

test('one frozen satisfier has a portable entrypoint and no claimed native/runtime/parent acceptance', () => {
  for (const record of [manifest]) {
    assert.equal(record.cardId, 'A-S013');
    assert.equal(record.kano, 'S');
    assert.equal(record.kanoUnit, 'A-S013');
    assert.equal(record.packet, 'SC-S013');
    assert.equal(record.source, 'S013');
    assert.equal(record.parent, 'D-S013');
    assert.equal(record.entryGate, 'SOURCE');
    assert.equal(record.mode, 'synthetic-only');
    assert.equal(record.nativeProof, false);
    assert.equal(record.parentComplete, false);
    assert.equal(record.productionNode24Validated, false);
  }
  assert.deepEqual(manifest.dependencies, []);
  assert.ok(fs.existsSync(path.resolve(__dirname, '..', '..', manifest.entryPoint)));
});

test('exact prominent banner, worked assertions, explicit output shapes, preconditions, and limits are present', () => {
  assert.match(html, /role="note">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const phrase of ['Objective:', 'Preconditions and limits:', 'queue depth ≥ 8', 'concurrency ≥ 6',
    'original absolute deadline', 'ON_TIME', 'LATE', 'UNKNOWN', 'summary.verification',
    'state.input', 'five-nines', 'Conduct the workload-driven transition']) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.match(html, /<noscript>/);
});

test('strict CSP permits only local external assets and prohibits management/network/inline execution', () => {
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "font-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) {
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

test('native form reset is never shadowed and every operator input has a matching label', () => {
  assert.doesNotMatch(html, /(?:name|id)="reset"/i);
  assert.match(read('app.js'), /form\.reset\(\)/);
  const ids = [...html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, 5);
  for (const id of ids) assert.ok(html.includes(`for="${id}"`), id);
  assert.ok(read('lesson.css').includes(':focus-visible'));
  assert.ok(read('lesson.css').includes('min-width: 0'));
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /role="alert" hidden/);
});

test('BDD preceded a genuinely loadable stub, 50 real assertion failures, and explicit resource-free IaC N/A', () => {
  const stub = json(path.join('evidence', 'stub-1.json'));
  const red = json(path.join('evidence', 'red-1.json'));
  const iac = json(path.join('evidence', 'iac-na.json'));
  const raw = read(path.join('evidence', 'red-1.stdout.txt'));
  assert.equal(stub.commands[0].exitCode, 0);
  assert.equal(red.commands[0].exitCode, 1);
  assert.equal(red.expectedExitCode, 1);
  assert.equal(red.outcome, 'EXPECTED_BEHAVIORAL_RED');
  assert.equal((raw.match(/code: 'ERR_ASSERTION'/g) || []).length, 50);
  assert.match(raw, /# tests 51/);
  assert.match(raw, /# pass 1/);
  assert.match(raw, /# fail 50/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError|TypeError:/);
  assert.equal(hash(path.join('evidence', 'red.stub.js.txt')), red.sourceHashes['model.js']);
  assert.equal(hash(path.join('evidence', 'red.spec.cjs.txt')), red.sourceHashes['model.test.cjs']);
  assert.equal(hash('model.test.cjs'), red.sourceHashes['model.test.cjs'], 'The unchanged 51 behavioral assertions must become GREEN');
  assert.equal(hash('queue-concurrency-scale-out.feature'), red.sourceHashes['queue-concurrency-scale-out.feature']);
  assert.equal(iac.result, 'N/A');
  assert.equal(iac.precedingRedSha256, hash(path.join('evidence', 'red-1.json')));
  assert.equal(iac.precedingStubSha256, hash(path.join('evidence', 'stub-1.json')));
  assert.ok(Date.parse(iac.featureWrittenAtUtc) < Date.parse(stub.startedAtUtc));
  assert.ok(Date.parse(stub.finishedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.finishedAtUtc) < Date.parse(iac.recordedAtUtc));
  assert.match(iac.reason, /No cloud, IaC, scaffold, identity, deployment, expenditure, framework, or dependency work/);
});

test('retained RED snapshots load, demonstrate absent behavior, and cannot be auto-discovered as test files', () => {
  const context = { module: { exports: {} } };
  vm.runInNewContext(read(path.join('evidence', 'red.stub.js.txt')), context);
  const stub = context.module.exports;
  for (const name of ['initial', 'reduce', 'summarize']) assert.equal(typeof stub[name], 'function');
  assert.equal(stub.reduce(stub.initial(), { type: 'tick' }).clockSeconds, 0);
  assert.equal(stub.reduce(stub.initial(), { type: 'enqueue' }).jobs.length, 0);
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence'))) {
    assert.doesNotMatch(name, /\.test\.(?:cjs|js|mjs)$/);
  }
});

test('all captured command records preserve exact separately hashed raw stdout/stderr and source hashes', () => {
  const records = fs.readdirSync(path.join(__dirname, 'evidence')).filter((name) => /^(?:stub|red|green|syntax|browser|integrity)-\d+\.json$/.test(name));
  assert.ok(records.length >= 4);
  for (const name of records) {
    const record = json(path.join('evidence', name));
    assert.equal(record.captureWasExplicit, true, name);
    for (const stream of ['stdout', 'stderr']) {
      assert.equal(hash(path.join('evidence', record.raw[stream].path)), record.raw[stream].sha256, `${name}: ${stream}`);
    }
    assert.ok(record.commands.length);
    assert.ok(record.sourceHashes['model.js']);
    assert.ok(record.sourceHashes['model.test.cjs']);
  }
});

test('browser code pins the approved published helper and offline signed pairing, with awaited close in finally', () => {
  const browser = read('browser.test.cjs');
  assert.match(browser, /assert\.equal\(playwright\.version, '1\.56\.1'\)/);
  assert.match(browser, /Get-AuthenticodeSignature/);
  assert.match(browser, /assert\.match\(signature\.productVersion, \/\^156/);
  assert.match(browser, /86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055/);
  assert.match(browser, /53c0c0d:testing\/browser\/isolated\.cjs/);
  assert.match(browser, /openIsolatedLesson\('learning\\\\S013\\\\index\.html'\)/);
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
  assert.match(result.stdout, /Historical bundle\/evidence byte hashes unchanged/);
  assert.deepEqual(proofHashes(), before);
});

test('capture is explicit, append-only, and never an ordinary verification side effect', () => {
  for (const filename of ['verify.cjs', 'browser.test.cjs']) {
    const source = read(filename);
    assert.match(source, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
    assert.match(source, /if \(capture\)/);
    assert.match(source, /flag: 'wx'/);
    assert.match(source, /while \(fs\.existsSync/);
    assert.doesNotMatch(source, /\b(?:rmSync|unlinkSync|truncateSync|renameSync)\s*\(/);
  }
  const attrs = read('.gitattributes').replace(/\r\n/g, '\n');
  assert.equal(attrs, '* -text whitespace=cr-at-eol\nevidence/*.txt whitespace=cr-at-eol,-blank-at-eol,-blank-at-eof\n');
});

test('published actual browser proof is complete, source-pinned, signed, isolated, and closed', () => {
  const index = json('evidence.json');
  const browser = index.stages.find((entry) => entry.stage === 'actual real-headless browser');
  assert.ok(browser);
  const relative = browser.observations.replace(/^learning\\S013\\/, '');
  const report = json(relative);
  assert.equal(hash(relative), browser.observationsSha256);
  assert.equal(report.status, 'passed');
  assert.equal(report.cases.length, 23);
  assert.ok(report.cases.every((entry) => entry.status === 'passed'));
  assert.equal(report.closeAwaited, true);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.externalCompleted, []);
  assert.equal(report.signedBrowser.status, 'Valid');
  assert.match(report.signedBrowser.signer, /Microsoft Corporation/);
  assert.equal(report.browserVersion, report.signedBrowser.productVersion);
  assert.match(report.browserVersion, /^156\./);
  assert.equal(report.playwright, '1.56.1');
  assert.match(report.node, /^v22\./);
  assert.equal(report.helperCommit, '53c0c0d');
  assert.equal(report.helperSha256, index.runtime.helperCheckoutSha256);
  assert.equal(report.publishedHelperBlobSha256, index.runtime.helperGitBlobSha256);
  for (const [name, digest] of Object.entries(report.sourceHashes)) assert.equal(hash(name), digest, name);
  const csp = report.cases.find((entry) => entry.name.startsWith('actual restrictive CSP'));
  assert.equal(csp.csp.inlineRan, false);
  assert.equal(csp.csp.connection, 'blocked');
  for (const directive of ['connect-src', 'form-action']) {
    assert.ok(csp.csp.violations.some((entry) => entry.directive === directive), directive);
  }
  assert.ok(csp.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
});

test('failed browser lineage remains hashed and is not misrepresented as genuine TDD RED or native proof', () => {
  const index = json('evidence.json');
  assert.equal(index.nativeProof, false);
  assert.equal(index.parentComplete, false);
  assert.equal(index.runtime.productionNode24Validated, false);
  assert.equal(index.kanoUnit, 'A-S013');
  assert.equal(index.kano, 'S');
  assert.deepEqual(index.originalPrerequisites, []);
  const earlier = index.retainedEarlierRuns[0];
  const relative = earlier.observations.replace(/^learning\\S013\\/, '');
  const report = json(relative);
  assert.equal(hash(relative), earlier.observationsSha256);
  assert.equal(report.status, 'failed');
  assert.equal(report.cases.filter((entry) => entry.status === 'failed').length, 2);
  assert.equal(report.closeAwaited, true);
  for (const remainder of index.remainingToDo) {
    assert.equal(remainder.readiness, false);
    assert.ok(remainder.blocker);
  }
  assert.match(read('README.md'), /21 leaf scenarios and failed two/);
  assert.match(read('README.md'), /B-S013[\s\S]*CORE, DATA, AKS, C076/);
});

test('the same pure model loads in a browser-like global without Node or runtime dependencies', () => {
  const context = {};
  vm.runInNewContext(read('model.js'), context);
  const model = context.QueueScaleRehearsal;
  assert.ok(model);
  let state = model.reduce(model.initial(), { type: 'enqueue' });
  for (let count = 0; count < 3; count += 1) state = model.reduce(state, { type: 'tick' });
  assert.equal(model.summarize(state).verification.verdict, 'PASS');
  assert.equal(state.jobs.filter((job) => job.status === 'ON_TIME').length, 12);
});
