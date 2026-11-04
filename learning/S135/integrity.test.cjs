'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const bytes = (name) => fs.readFileSync(path.join(__dirname, name));
const read = (name) => bytes(name).toString('utf8');
const json = (name) => JSON.parse(read(name));
const manifest = json('manifest.json');
const digest = (value, algorithm = 'sha256') => crypto.createHash(algorithm).update(value).digest('hex');
const blobOid = (value) => digest(Buffer.concat([Buffer.from(`blob ${value.length}\0`), value]), 'sha1');
const rawDir = path.join(__dirname, 'evidence', 'raw');

test('exact README S135, D-S135 acceptance, A/B cards and default SC-S135 packet are retained', () => {
  assert.equal(manifest.id, 'A-S135');
  assert.equal(manifest.sourceId, 'S135');
  assert.equal(manifest.parentId, 'D-S135');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S135');
  assert.equal(manifest.packet, 'SC-S135');
  assert.equal(manifest.objective, 'Redeliver a delayed webhook; distinguish event attempts from business effects.');
  assert.equal(manifest.sourceContract.readme, 'External webhook: Process repeated or delayed delivery without duplicate business effects.');
  assert.equal(manifest.sourceContract.backlog, 'Add sandbox webhook retries/delays during deployment changes.');
  assert.equal(manifest.sourceContract.acceptance, 'Repeated deliveries preserve one business effect and correct observable processing status.');
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.equal(source.includes('| S135 | **External webhook:** Process repeated or delayed delivery without duplicate business effects. |'), true);
  assert.equal(backlog.includes('| D-S135 | P1 | Add sandbox webhook retries/delays during deployment changes. | Repeated deliveries preserve one business effect and correct observable processing status. | D-S077 |'), true);
  assert.equal(kanban.includes('| A-S135 | D-S135 | S | Redeliver a delayed webhook; distinguish event attempts from business effects. | SOURCE |'), true);
  assert.equal(kanban.includes('| B-S135 | D-S135 | S | Conduct one sandbox webhook transition; verify correct deduplicated processing and user-visible status. | CORE, DATA, HOST |'), true);
  assert.equal(kanban.includes('every other A/B card belongs to SC-Snnn'), true);
  assert.equal(manifest.sourceContract.originalPrerequisite, 'D-S077');
  assert.equal(manifest.sourceContract.originalBase, 'H011 + P005 + HOST');
  for (const field of ['nativeProofComplete', 'sourceParentComplete', 'accepted']) assert.equal(manifest[field], false);
});

test('fixed DATA inputs, unknown recovery limits and original bounded native remainder are documented honestly', () => {
  const model = require('./model.js');
  assert.equal(manifest.mode, 'portable-synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.deepEqual(manifest.syntheticInputs.presets, Object.keys(model.PRESETS));
  assert.equal(manifest.syntheticInputs.eventId, model.CONFIG.eventId);
  assert.equal(manifest.syntheticInputs.intendedEffectId, model.CONFIG.intendedEffectId);
  assert.equal(manifest.syntheticInputs.budgetMs, 1000);
  assert.equal(manifest.syntheticInputs.originalStartMs, 0);
  assert.equal(manifest.syntheticInputs.maximumActions, 16);
  assert.equal(manifest.syntheticInputs.maximumMeasuredRuns, 4);
  assert.match(manifest.verification.iac, /^N\/A evaluated after genuine assertion RED/);
  const documentation = read('README.txt');
  for (const phrase of [
    'DATA ONLY', 'same effect snapshot shown twice is NOT two new effects',
    'UNKNOWN / UNVERIFIED', 'Recovery cannot erase an original unknown',
    'readiness=false', 'original B-S135 Kano unit', 'Parent alone accepts A-S135 once',
    'zero extra credits', 'Node.js 24', 'inactive recovery prototype remains unqualified',
    'C005-C008/local-harness catalog integration is parent-owned and untouched',
  ]) assert.equal(documentation.includes(phrase), true, phrase);
  assert.match(documentation, /IaC N\/A was evaluated AFTER genuine RED/);
  assert.equal(manifest.sourceContract.nativeEntryGate, 'CORE, DATA, HOST');
});

test('standalone runtime has early narrow CSP, labeled keyboard controls and no active network/storage/effect operation', () => {
  const html = read('index.html');
  assert.equal(html.includes(manifest.banner), true);
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), true);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "font-src 'none'", "object-src 'none'", "base-uri 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.equal(html.includes(directive), true, directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|<script[^>]*>[^<]+\S[^<]*<\/script>/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1]), ['lesson.css']);
  assert.doesNotMatch(html, /<a\b[^>]*href=|\sstyle\s*=/i);
  assert.equal(html.includes('csp-probe.js'), false);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  for (const id of ['preset', 'event-token', 'budget']) assert.equal(html.includes(`<label for="${id}">`), true);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible\s*\{[^}]*3px/);
  for (const name of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|\beval\s*\(|innerHTML|\bsetTimeout\s*\(|\bsetInterval\s*\(|Math\.random|Date\.now|\brequire\s*\(/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
});

test('genuine assertion RED, exact loadable stub and keyboard observation precede implementation and IaC N/A', () => {
  const summary = json(path.join('evidence', 'raw', 'red-summary.json'));
  const stdout = bytes(path.join('evidence', 'raw', 'red.stdout.tap'));
  const stderr = bytes(path.join('evidence', 'raw', 'red.stderr.txt'));
  assert.equal(summary.childExitCode, 1);
  assert.equal(summary.errorCode, 'ERR_ASSERTION');
  assert.equal(summary.expectedPhase, 'loaded');
  assert.equal(summary.observedPhase, 'ready');
  assert.match(stdout.toString(), /not ok 1/);
  assert.match(stdout.toString(), /ERR_ASSERTION/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(), /MODULE_NOT_FOUND|ENOENT/);
  assert.equal(summary.stdoutSha256, digest(stdout));
  assert.equal(summary.stderrSha256, digest(stderr));
  const measuredSources = json(path.join('evidence', 'source-hashes.json')).sources;
  assert.equal(summary.bddSha256, measuredSources.find((entry) => entry.path === 'webhook-redelivery.feature').rawSha256);
  assert.equal(summary.earlyBytePolicySha256, measuredSources.find((entry) => entry.path === '.gitattributes').rawSha256);
  assert.match(summary.iac, /^N\/A evaluated after genuine RED/);
  assert.equal(Date.parse(summary.iacEvaluatedAtUtc) >= Date.parse(summary.genuineRedAtUtc), true);
  for (const [name, hash] of Object.entries(summary.archivedStubSha256)) {
    assert.equal(digest(bytes(path.join('evidence', 'red-stub', name))), hash, name);
    assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  }
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.execute(stub.createState(), {
    type: 'load', presetId: 'stable-key', eventId: 'fictional-event-135', budgetMs: 1000,
  }).phase, 'ready');
  const observation = json(path.join('evidence', 'raw', 'stub-browser.json'));
  assert.equal(observation.phaseAfterKeyboardLoad, 'ready');
  assert.equal(observation.historyAfterKeyboardLoad, '0 / 16');
  assert.equal(observation.awaitedCleanupCompleted, true);
  assert.deepEqual(observation.pageErrors, []);
});

test('published helper is pinned and only exact deliberate capture exclusively writes a new browser observation', () => {
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(digest(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  const browser = read('browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /await openIsolatedLesson\('learning\\\\S135\\\\index\.html'\)/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(browser, /require\([^)]*(?:recovery|prototype)[^)]*\)/i);
  assert.doesNotMatch(browser, /chromium\.launch|bypassCSP:\s*true|--no-sandbox|ignoreHTTPSErrors/);
  assert.match(manifest.verification.normalVerification, /READ-ONLY/);
  assert.match(manifest.verification.deliberateCapture, /exclusive-create/);
});

test('actual green browser proof contains all required observations, retained unknowns, CSP enforcement and awaited cleanup', () => {
  const reports = fs.readdirSync(rawDir).filter((name) => /^browser-.*\.json$/.test(name)).map((name) => json(path.join('evidence', 'raw', name)));
  const good = reports.find((report) => !report.failure && !report.cleanupFailure && report.groups.length === 11 && report.groups.every((group) => group.passed));
  assert.ok(good, 'at least one actual passing browser capture is required; earlier failures remain preserved');
  assert.equal(good.cardId, 'A-S135');
  assert.equal(good.helperSha256, manifest.verification.publishedHelperSha256);
  assert.equal(good.playwrightVersion, '1.56.1');
  assert.match(good.nodeVersion, /^v22\./);
  assert.match(good.browserVersion, /^156\./);
  assert.equal(good.awaitedCleanupCompleted, true);
  assert.deepEqual(good.pageErrors, []);
  assert.deepEqual(good.unexpectedNetworkRequests, []);
  const keyboard = good.groups.find((group) => group.name.startsWith('actual Tab'));
  assert.deepEqual(keyboard.focusSequence, ['preset', 'event-token', 'budget', 'load', 'cutover', 'redeliver', 'measure']);
  assert.equal(keyboard.outline, '3px');
  const scenarios = good.groups.find((group) => group.name.startsWith('actual fixed presets')).presets;
  assert.equal(scenarios.length, 6);
  for (const id of ['lost-ack', 'unknown-completion']) {
    const observed = scenarios.find((preset) => preset.presetId === id);
    assert.equal(observed.counts['positive-count'], '0');
    assert.equal(observed.counts['unknown-count'], '1');
    assert.match(observed.result, /unknown \/ unverified/);
  }
  const retained = good.groups.find((group) => group.name.startsWith('a later positive'));
  assert.equal(retained.counts['history-count'], '12 / 16');
  assert.equal(retained.counts['negative-count'], '1');
  assert.equal(retained.counts['unknown-count'], '1');
  const reset = good.groups.find((group) => group.name.startsWith('native prototype reset'));
  assert.equal(reset.shadowed, true);
  assert.equal(reset.focusAfterReset, 'preset');
  const unavailable = good.groups.find((group) => group.name.startsWith('missing local model'));
  assert.match(unavailable.error, /ERR_LESSON_UNAVAILABLE/);
  const csp = good.groups.find((group) => group.name.startsWith('actual enforced CSP'));
  assert.equal(csp.navigationUnchanged, true);
  assert.equal(csp.probe.connectionBlocked, true);
  for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-elem', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
    assert.equal(csp.probe.violations.some((event) => event.directive === directive && event.disposition === 'enforce'), true, directive);
  }
});

test('raw byte attributes precede capture and raw SHA-256 remains separate from canonical LF and Git identity', () => {
  const ledger = json(path.join('evidence', 'source-hashes.json'));
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.rawPolicy, '-text -diff');
  assert.match(ledger.exclusions, /self|verification receipts/);
  const expectedSources = [
    '.gitattributes', 'README.txt', 'app.js', 'browser.test.cjs', 'index.html',
    'integrity.test.cjs', 'lesson.css', 'manifest.json', 'model.js', 'model.test.cjs',
    'webhook-redelivery.feature', 'evidence\\fixtures\\csp-probe.js',
  ];
  assert.deepEqual(ledger.sources.map((entry) => entry.path).sort(), expectedSources.sort());
  for (const entry of ledger.sources) {
    const current = bytes(entry.path);
    const canonical = Buffer.from(current.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    assert.equal(entry.canonicalLfByteLength, canonical.length, entry.path);
    assert.equal(entry.canonicalLfSha256, digest(canonical), entry.path);
    assert.equal(entry.canonicalGitBlobOid, blobOid(canonical), entry.path);
    assert.match(entry.rawSha256, /^[a-f0-9]{64}$/);
    assert.match(entry.rawGitBlobOid, /^[a-f0-9]{40}$/);
    if (digest(current) === entry.rawSha256) assert.equal(entry.rawByteLength, current.length, entry.path);
  }
  for (const entry of ledger.archivedRawProof) {
    const raw = bytes(entry.path);
    const text = raw.toString('utf8');
    const canonical = Buffer.from(text.replace(/\r\n/g, '\n'), 'utf8');
    assert.equal(entry.rawByteLength, raw.length, entry.path);
    assert.equal(entry.rawSha256, digest(raw), entry.path);
    assert.equal(entry.rawGitBlobOid, blobOid(raw), entry.path);
    assert.deepEqual(entry.rawLineEndings, {
      crlf: (text.match(/\r\n/g) || []).length,
      lf: (text.match(/(?<!\r)\n/g) || []).length,
      bareCr: (text.match(/\r(?!\n)/g) || []).length,
    }, entry.path);
    assert.equal(entry.canonicalLfByteLength, canonical.length, entry.path);
    assert.equal(entry.canonicalLfSha256, digest(canonical), entry.path);
    assert.equal(entry.canonicalGitBlobOid, blobOid(canonical), entry.path);
  }
  const attributes = execFileSync('git', ['check-attr', 'text', 'diff', '--',
    'learning\\S135\\evidence\\raw\\red.stdout.tap',
    'learning\\S135\\evidence\\red-stub\\model.js'], { cwd: root, encoding: 'utf8' });
  assert.equal((attributes.match(/: (?:text|diff): unset/g) || []).length, 4);
});

test('preserved focused command receipts have valid raw output hashes and honest statuses', () => {
  const names = fs.readdirSync(rawDir).filter((name) => /-run\.json$/.test(name));
  assert.ok(names.length > 0, 'focused raw command proof is retained');
  for (const name of names) {
    const receipt = json(path.join('evidence', 'raw', name));
    for (const execution of receipt.executions) {
      assert.equal(digest(bytes(path.join('evidence', 'raw', execution.stdoutFile))), execution.stdoutSha256);
      assert.equal(digest(bytes(path.join('evidence', 'raw', execution.stderrFile))), execution.stderrSha256);
      assert.equal(typeof execution.exitCode, 'number');
    }
    if (receipt.readOnlyVerified) {
      assert.equal(receipt.beforeTreeSha256, receipt.afterTreeSha256);
      assert.equal(receipt.beforeFileCount, receipt.afterFileCount);
      assert.notEqual(receipt.captureValue, '1');
      assert.equal(receipt.executions.every((execution) => execution.exitCode === 0), true);
    }
  }
});
