'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const readBytes = (name) => fs.readFileSync(path.join(__dirname, name));
const read = (name) => readBytes(name).toString('utf8');
const hash = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const canonicalLf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const blobOid = (bytes) => hash(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1');
const manifest = JSON.parse(read('manifest.json'));

test('exact S132 README, D-S132 acceptance/dependency, A/B cards and packet are verified', () => {
  assert.equal(manifest.id, 'A-S132');
  assert.equal(manifest.sourceId, 'S132');
  assert.equal(manifest.parentId, 'D-S132');
  assert.equal(manifest.packet, 'SC-S132');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S132');
  assert.equal(manifest.mode, 'portable-synthetic');
  assert.equal(manifest.objective, 'Finish a sign-in across cutover; detect forced restart or lost callback state.');
  assert.equal(manifest.sourceContract.acceptance, 'The user finishes login without restarting, losing state, or exceeding the agreed budget.');
  assert.equal(manifest.sourceContract.dependency, 'D-S035');
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.equal(source.includes(manifest.sourceContract.readmeRow), true);
  assert.equal(backlog.includes(manifest.sourceContract.backlogRow), true);
  for (const field of ['portableRow', 'nativeRow', 'packetRule']) assert.equal(kanban.includes(manifest.sourceContract[field]), true, field);
  for (const flag of ['nativeProofComplete', 'sourceParentComplete', 'productionNode24Validated', 'accepted']) assert.equal(manifest[flag], false);
  assert.equal(manifest.extraKanoCredits, 0);
  assert.deepEqual(manifest.syntheticInputs.presets, Object.keys(require('./model.js').SCENARIOS));
  assert.equal(manifest.syntheticInputs.maximumActions, 16);
  assert.equal(manifest.syntheticInputs.maximumMeasuredRuns, 4);
});

test('the standalone lesson has early narrow CSP, semantic UX and no active identity/network/storage/resource code', () => {
  const html = read('index.html');
  assert.equal(html.includes(manifest.banner), true);
  assert.equal(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), true);
  assert.equal(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), true);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "font-src 'none'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.equal(html.includes(directive), true, directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|<script[^>]*>[^<]+\S[^<]*<\/script>/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1]), ['lesson.css']);
  assert.doesNotMatch(html, /<a\b[^>]*href=/i);
  assert.equal(html.includes('csp-probe.js'), false);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible.*3px/);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|innerHTML|\beval\s*\(|\bsetTimeout\s*\(|Math\.random|Date\.now|\brequire\s*\(|https?:\/\//);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
});

test('raw genuine assertion RED and keyboard-loadable stub remain exact outside autodiscovery', () => {
  const stdout = read(path.join('evidence', 'raw', 'red.stdout.tap'));
  assert.match(stdout, /not ok 1/);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /started/);
  assert.match(stdout, /idle/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|ENOENT/);
  const red = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  assert.equal(red.childExitCode, 1);
  assert.equal(red.errorCode, 'ERR_ASSERTION');
  assert.equal(red.stdoutSha256, hash(readBytes(path.join('evidence', 'raw', 'red.stdout.tap'))));
  assert.equal(red.stderrSha256, hash(readBytes(path.join('evidence', 'raw', 'red.stderr.txt'))));
  assert.match(red.iac, /^N\/A evaluated after genuine assertion RED/);
  for (const [file, digest] of Object.entries(red.archivedStubSha256)) {
    assert.equal(hash(readBytes(path.join('evidence', 'red-stub', file))), digest, file);
    assert.doesNotMatch(file, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  }
  const observed = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(observed.phaseAfterKeyboardStart, 'idle');
  assert.equal(observed.historyAfterKeyboardStart, '0 / 16');
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.deepEqual(observed.pageErrors, []);
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.execute(stub.createState(), { type: 'start', scenarioId: 'compatible', budgetMs: 2000 }).phase, 'idle');
});

test('helper/capture contracts and honest single-unit native remainder are retained', () => {
  assert.equal(hash(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read('browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /finally \{\s+try \{\s+await session\.close\(\)/);
  assert.match(browser, /Normal verification must remain READ-ONLY/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|--no-sandbox|--disable-web-security|process\.env\.CAPTURE_BROWSER_EVIDENCE\s*=(?!=)/);
  assert.equal(read('.gitattributes').replace(/\r\n/g, '\n'), '* text=auto eol=lf\nevidence/raw/** -text -diff\nevidence/red-stub/** -text -diff\n');
  assert.match(manifest.verification.iac, /^N\/A evaluated after genuine assertion RED/);
  assert.equal(manifest.relevantToDo.cardId, 'B-S132');
  assert.equal(manifest.relevantToDo.kanoUnit, 'B-S132');
  assert.equal(manifest.relevantToDo.state, 'To Do');
  assert.equal(manifest.relevantToDo.readiness, false);
  assert.equal(manifest.relevantToDo.admissionImplied, false);
  const documentation = read('README.txt');
  for (const phrase of ['DATA ONLY', 'readiness=false', 'Parent alone accepts A-S132 once', 'zero extra', 'inactive recovery prototype is unqualified', 'Node.js 24', 'D-S132 and its D-S035 dependency remain source-parent incomplete']) {
    assert.equal(documentation.includes(phrase), true, phrase);
  }
});

test('observed raw bytes and canonical LF/Git blob identities are distinct and immutable', () => {
  const inventory = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(inventory.cardId, 'A-S132');
  assert.equal(inventory.oneOriginalUnit, true);
  assert.equal(inventory.extraKanoCredits, 0);
  assert.equal(inventory.sourceContract.acceptance, manifest.sourceContract.acceptance);
  for (const entry of inventory.files) {
    const bytes = readBytes(entry.path);
    const canonical = entry.gitTextMode === 'lf' ? canonicalLf(bytes) : bytes;
    assert.equal(hash(canonical), entry.canonicalSha256, entry.path);
    assert.equal(blobOid(canonical), entry.canonicalGitBlobOid, entry.path);
    assert.equal(hash(bytes) === entry.rawSha256 || entry.gitTextMode === 'lf' && hash(bytes) === entry.canonicalSha256, true, `${entry.path}: raw bytes cannot be mislabeled as canonical Git bytes`);
    if (entry.gitTextMode === 'raw') assert.equal(hash(bytes), entry.rawSha256, `${entry.path}: exact historical raw proof`);
  }
  assert.equal(inventory.files.some((entry) => entry.observedLineEndings === 'CRLF' && entry.rawSha256 !== entry.canonicalSha256), true, 'Retain the actual raw CRLF versus canonical Git LF distinction.');
});

test('successful actual browser evidence binds current fixed source/test/spec/stub bytes and observed UX/CSP', () => {
  const inventory = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  const raw = path.join(__dirname, 'evidence', 'raw');
  const captures = fs.readdirSync(raw).filter((name) => /^browser-[a-zA-Z0-9-]+\.json$/.test(name)).sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(raw, name), 'utf8')));
  const current = captures.filter((capture) => capture.success === true && inventory.files.every((entry) => {
    const captured = capture.rawLessonHashesBefore?.[entry.path];
    return captured === entry.rawSha256 || entry.gitTextMode === 'lf' && captured === entry.canonicalSha256;
  }));
  assert.equal(current.length > 0, true, 'Actual successful capture must bind all current fixed source/test/spec and exact historical stub/RED bytes.');
  const observed = current[current.length - 1];
  assert.equal(observed.helperSha256, manifest.verification.publishedHelperSha256);
  assert.equal(observed.node, 'v22.23.4');
  assert.equal(observed.playwright, '1.56.1');
  assert.equal(observed.browser, '156.0.4314.50');
  assert.equal(observed.checks.length, 11);
  assert.equal(observed.checks.every((check) => check.passed), true);
  assert.deepEqual(observed.failures, []);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.remoteRequests, []);
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.equal(observed.lessonAndExistingProofUnchanged, true);
  assert.equal(observed.nativeProof, false);
  assert.equal(observed.sourceParentComplete, false);
  assert.equal(observed.productionNode24Validated, false);
  assert.equal(observed.extraKanoCredits, 0);
  for (const name of [
    'standalone-native-keyboard', 'out-of-order-error', 'invalid-budget-safe-hold', 'invalid-preset-safe-hold',
    'callback-200-not-completion', 'full-original-sign-in-positive', 'detected-lost-state',
    'detected-state-mismatch', 'detected-wrong-identity', 'detected-session-mismatch',
    'detected-forced-restart', 'detected-incompatible-state-version', 'detected-wrong-route', 'detected-wrong-page',
    'slow-200-original-budget-pinned', 'budget-one-ms-over', 'budget-equality-positive',
    'retained-callback-unobserved', 'retained-timing-unobserved', 'bounded-retained-negative-unknown-positive-history',
    'native-prototype-reset-after-shadow', 'controlled-missing-model-no-success', 'actual-csp-denials-no-live-network',
    'normal-verification-read-only',
  ]) assert.equal(observed.observations.some((item) => item.name === name), true, name);
  for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
    assert.equal(observed.csp.violations.some((item) => item.directive === directive), true, directive);
  }
});
