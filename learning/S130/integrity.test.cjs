'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const gitBlobOid = (bytes) => digest(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1');

test('exact S130 README, D-S130 acceptance, portable card, packet and native sibling are retained', () => {
  assert.equal(manifest.id, 'A-S130');
  assert.equal(manifest.sourceId, 'S130');
  assert.equal(manifest.parentId, 'D-S130');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S130');
  assert.equal(manifest.packet, 'SC-S130');
  assert.equal(manifest.mode, 'portable-synthetic');
  assert.equal(manifest.objective, 'Compare single/multi-instance Flex traces; unknown completion or grace limits cannot be certified away.');
  assert.equal(manifest.sourceContract.acceptance, 'Real grace/version/capacity behavior is measured; single-instance downtime and unobservable completion are disclosed rather than reported as guaranteed continuity.');
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.equal(source.includes('| S130 | **Functions, Flex Consumption:** Test rolling site updates, mixed-version compatibility, execution grace limits, and sufficient multi-instance capacity. |'), true);
  assert.equal(backlog.includes('| D-S130 | P1 | Add available Flex rolling-update presets, including multi-instance and single-instance comparisons. | Real grace/version/capacity behavior is measured; single-instance downtime and unobservable completion are disclosed rather than reported as guaranteed continuity. | P004, D-S041, D-S048 |'), true);
  assert.equal(kanban.includes('| A-S130 | D-S130 | S | Compare single/multi-instance Flex traces; unknown completion or grace limits cannot be certified away. | SOURCE |'), true);
  assert.equal(kanban.includes('| B-S130 | D-S130 | S | Conduct one available Flex preset; verify native grace/version observations and explicitly bounded conclusions. | CORE, DATA, FN, C081 |'), true);
  for (const field of ['nativeProofComplete', 'sourceParentComplete', 'accepted']) assert.equal(manifest[field], false);
});

test('documented grace, capacity, version and unobservable-completion limits are not fabricated native claims', () => {
  assert.deepEqual(manifest.documentedConstraints.references, [
    'https://learn.microsoft.com/en-us/azure/azure-functions/flex-consumption-site-updates',
    'https://learn.microsoft.com/en-us/azure/azure-functions/functions-scale#timeout',
  ]);
  assert.equal(manifest.documentedConstraints.rollingGraceReferenceSeconds, 3600);
  assert.equal(manifest.documentedConstraints.platformUpdateGraceReferenceSeconds, 600);
  assert.equal(manifest.documentedConstraints.httpResponseLimitSeconds, 230);
  assert.match(manifest.documentedConstraints.completion, /not authoritative completion/);
  assert.match(manifest.documentedConstraints.capacity, /not guaranteed before the next drain/);
  assert.match(manifest.documentedConstraints.singleInstance, /brief downtime/);
  const documentation = read('README.txt');
  for (const phrase of ['DATA ONLY', 'UNKNOWN in EVERY preset', 'original B-S130 Kano unit', 'readiness=false', 'REAL behavior', 'Parent alone accepts A-S130 once', 'zero extra credits', 'known unattended context/page/cleanup lifecycle limitations', 'inactive', 'Node.js 24']) {
    assert.equal(documentation.includes(phrase), true, phrase);
  }
  assert.match(manifest.verification.iac, /^N\/A evaluated after genuine assertion RED/);
  assert.equal(manifest.syntheticInputs.maximumActions, 12);
  assert.equal(manifest.syntheticInputs.maximumMeasuredRuns, 4);
  assert.deepEqual(manifest.syntheticInputs.presets, Object.keys(require('./model.js').PRESETS));
});

test('standalone resources have narrow early CSP, labeled controls and no active network/storage/management code', () => {
  const html = read('index.html');
  assert.equal(html.includes(manifest.banner), true);
  assert.equal(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), true);
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
  for (const name of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|\beval\s*\(|innerHTML|\bsetTimeout\s*\(|Math\.random|Date\.now|\brequire\s*\(/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
});

test('genuine assertion RED and the loadable keyboard-observed stub are preserved outside autodiscovery', () => {
  const raw = read(path.join('evidence', 'raw', 'red.stdout.tap'));
  assert.match(raw, /not ok 1/);
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /loaded/);
  assert.match(raw, /empty/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|ENOENT/);
  const red = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  assert.equal(red.childExitCode, 1);
  assert.equal(red.errorCode, 'ERR_ASSERTION');
  assert.equal(red.stdoutSha256, digest(fs.readFileSync(path.join(__dirname, 'evidence', 'raw', 'red.stdout.tap'))));
  assert.equal(red.stderrSha256, digest(fs.readFileSync(path.join(__dirname, 'evidence', 'raw', 'red.stderr.txt'))));
  assert.match(red.iac, /^N\/A evaluated after genuine RED/);
  for (const [name, hash] of Object.entries(red.archivedStubSha256)) {
    assert.equal(digest(fs.readFileSync(path.join(__dirname, 'evidence', 'red-stub', name))), hash, name);
    assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  }
  const observed = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(observed.phaseAfterKeyboardLoad, 'empty');
  assert.equal(observed.historyAfterKeyboardLoad, '0 / 12');
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.deepEqual(observed.pageErrors, []);
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.execute(stub.createState(), { type: 'load', presetId: 'multi-compatible', version: 'v2' }).phase, 'empty');
});

test('published isolated helper and exact capture gating remain pinned without lifecycle overclaims', () => {
  assert.equal(digest(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read('browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /finally \{\s+try \{\s+await session\.close\(\)/);
  assert.match(browser, /Normal browser verification must remain READ-ONLY/);
  assert.doesNotMatch(browser, /no-sandbox|ignoreHTTPSErrors|channel:\s*['"]chrome|prototype-recovery/);
  assert.equal(manifest.limits.some((limit) => limit.includes('inactive recovery prototype remains unqualified')), true);
});

test('raw-byte proof, canonical LF and Git object identities are separately checked read-only', () => {
  const inventory = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.selfExcluded, true);
  assert.equal(inventory.captureFilesExcludedToAvoidCircularity, true);
  assert.equal(read('.gitattributes').replace(/\r\n/g, '\n'), '* text=auto eol=lf\nevidence/raw/** -text -diff\nevidence/red-stub/** -text -diff\n');
  const names = new Set();
  for (const entry of inventory.files) {
    assert.equal(names.has(entry.path), false);
    names.add(entry.path);
    const bytes = fs.readFileSync(path.join(__dirname, entry.path));
    const canonicalLf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    const raw = digest(bytes);
    assert.equal(digest(canonicalLf), entry.canonicalLfSha256, entry.path);
    if (entry.gitTextMode === 'raw') {
      assert.equal(raw, entry.rawSha256, `raw bytes: ${entry.path}`);
      assert.equal(bytes.length, entry.rawByteLength);
    } else {
      assert.equal(raw === entry.rawSha256 || raw === entry.canonicalLfSha256, true, `raw measured or published LF bytes: ${entry.path}`);
    }
    assert.equal(gitBlobOid(entry.gitTextMode === 'raw' ? bytes : canonicalLf), entry.canonicalGitBlobOid, `canonical Git blob: ${entry.path}`);
  }
  for (const required of ['.gitattributes', 'manifest.json', 'README.txt', 'flex-traces.feature', 'model.js', 'app.js', 'index.html', 'lesson.css', 'model.test.cjs', 'browser.test.cjs', 'integrity.test.cjs', path.join('evidence', 'raw', 'red.stdout.tap'), path.join('evidence', 'red-stub', 'assertions.cjs')]) {
    assert.equal(names.has(required), true, required);
  }
});

test('retained successful actual-browser proof binds current source bytes and includes failure/reset/CSP observations', () => {
  const inventory = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  const rawDirectory = path.join(__dirname, 'evidence', 'raw');
  const captures = fs.readdirSync(rawDirectory).filter((name) => /^browser-\d.*\.json$/.test(name))
    .map((name) => JSON.parse(fs.readFileSync(path.join(rawDirectory, name), 'utf8')));
  const current = captures.filter((capture) => capture.success === true && inventory.files.every((entry) => {
    const captured = capture.rawLessonHashesBefore?.[entry.path];
    return captured === entry.rawSha256 || (entry.gitTextMode === 'lf' && captured === entry.canonicalLfSha256);
  }));
  assert.equal(current.length > 0, true, 'A successful actual capture must bind all current fixed runtime/spec/test and RED/stub bytes.');
  const observed = current[current.length - 1];
  assert.equal(observed.helperSha256, manifest.verification.publishedHelperSha256);
  assert.equal(observed.node, 'v22.23.4');
  assert.equal(observed.playwright, '1.56.1');
  assert.equal(observed.browser, '156.0.4314.50');
  assert.equal(observed.checks.length, 10);
  assert.equal(observed.checks.every((check) => check.passed === true), true);
  assert.deepEqual(observed.failures, []);
  assert.deepEqual(observed.pageErrors, []);
  assert.deepEqual(observed.remoteRequests, []);
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.equal(observed.lessonAndExistingProofUnchanged, true);
  assert.equal(observed.nativeProof, false);
  assert.equal(observed.productionNode24Validated, false);
  assert.equal(observed.extraKanoCredits, 0);
  for (const name of [
    'standalone-keyboard', 'invalid-token', 'invalid-preset-safe-hold',
    'single-instance-interrupted-polling-completed-work',
    'multi-instance-bounded-positive-not-fleet-completion',
    'mixed-version-state-and-effect-failure', 'three-instances-insufficient-ready-capacity',
    'rolling-grace-exceeded', 'unknown-grace-execution-effect-version-retained',
    'platform-update-distinct-ten-minute-grace', 'recreate-immediate-termination',
    'bounded-history-no-pruning', 'keyboard-native-reset-after-shadow',
    'actual-missing-model-failure-ux', 'actual-csp-denials-no-live-network',
    'read-only-sources-and-existing-proof',
  ]) assert.equal(observed.observations.some((entry) => entry.name === name), true, name);
  assert.equal(observed.csp.inlineScriptBlocked, true);
  assert.equal(observed.csp.inlineEventBlocked, true);
  assert.equal(observed.csp.evalBlocked, true);
  assert.equal(observed.csp.inlineStyleBlocked, true);
  assert.equal(observed.csp.connectBlocked, true);
  assert.equal(observed.csp.imageBlocked, true);
  assert.equal(observed.csp.formNavigationBlocked, true);
  for (const directive of ['script-src-elem', 'script-src-attr', 'script-src', 'style-src-attr', 'connect-src', 'img-src', 'frame-src', 'form-action']) {
    assert.equal(observed.csp.violations.some((entry) => entry.directive === directive), true, directive);
  }
});
