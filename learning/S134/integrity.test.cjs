'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const bytes = (file) => fs.readFileSync(path.join(__dirname, file));
const manifest = JSON.parse(read('manifest.json'));
const digest = (data, algorithm = 'sha256') => crypto.createHash(algorithm).update(data).digest('hex');
const gitBlob = (data) => digest(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data]), 'sha1');

test('exact S134 README, D-S134 acceptance, portable card and independent SC-S134 native remainder are retained', () => {
  assert.equal(manifest.id, 'A-S134');
  assert.equal(manifest.sourceId, 'S134');
  assert.equal(manifest.parentId, 'D-S134');
  assert.equal(manifest.packet, 'SC-S134');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S134');
  assert.equal(manifest.mode, 'portable-synthetic');
  assert.equal(manifest.objective, 'Retry checkout after response loss; select the ledger showing one correct order.');
  assert.equal(manifest.sourceContract.acceptance, 'Exactly one intended order/effect is recorded with a correct client result or explicit unresolved failure.');
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.equal(source.includes('| S134 | **Checkout/order submission:** Produce one order with the correct result despite retries or routing changes. |'), true);
  assert.equal(backlog.includes('| D-S134 | P0 | Add synthetic checkout/order submission with response-loss and retry controls. | Exactly one intended order/effect is recorded with a correct client result or explicit unresolved failure. | D-S049 |'), true);
  assert.equal(kanban.includes('| A-S134 | D-S134 | S | Retry checkout after response loss; select the ledger showing one correct order. | SOURCE |'), true);
  assert.equal(kanban.includes('| B-S134 | D-S134 | S | Conduct one synthetic checkout transition; verify real effect counts and honest unresolved outcomes. | CORE, DATA, HOST |'), true);
  assert.equal(manifest.packetContract.portableUnit, 'A-S134');
  assert.equal(manifest.packetContract.nativeUnit, 'B-S134');
  assert.equal(manifest.nativeRemainder.cardId, 'B-S134');
  assert.equal(manifest.nativeRemainder.kanoUnit, 'B-S134');
  assert.equal(manifest.nativeRemainder.readiness, false);
  assert.match(manifest.nativeRemainder.blocker, /CORE\/DATA\/HOST.*D-S049/);
  for (const field of ['nativeProofComplete', 'sourceParentComplete', 'accepted']) assert.equal(manifest[field], false);
});

test('fictional-only domain, bounded measurements and missing-ACK semantics are documented without native or extra-credit claims', () => {
  const lesson = require('./model.js');
  assert.deepEqual(manifest.syntheticInputs.ledgers, lesson.LEDGER_IDS);
  assert.equal(manifest.syntheticInputs.checkoutToken, lesson.INTENT.checkoutId);
  assert.equal(manifest.syntheticInputs.maximumActions, lesson.MAX_ACTIONS);
  assert.equal(manifest.syntheticInputs.maximumMeasuredRuns, lesson.MAX_RUNS);
  const documentation = read('README.txt');
  for (const phrase of [
    'FIXED FICTIONAL TEACHING DATA ONLY', 'No actual payment, business, user-data, network or database operation',
    'neither failure nor success nor permission', 'UNKNOWN AT', 'BOUNDARY remain in EVERY run',
    'NORMAL VERIFICATION IS READ-ONLY', 'original B-S134 Kano unit', 'readiness=false',
    'Parent alone accepts A-S134 once', 'zero extra credits', 'PARENT-OWNED',
    'Node.js 24', 'inactive recovery prototype is UNQUALIFIED',
  ]) assert.equal(documentation.includes(phrase), true, phrase);
  assert.match(manifest.verification.iac, /^N\/A evaluated after genuine assertion RED/);
  assert.match(read('checkout.feature'), /Feature: Select one correct fictional checkout ledger/);
  assert.match(read('checkout.feature'), /Missing acknowledgements are neither success nor failure/);
  assert.equal(lesson.LEDGERS.unobserved.orders, null);
  assert.equal(lesson.LEDGERS.unobserved.effects, null);
  assert.equal(lesson.LEDGERS.unacknowledged.retry.ack, 'missing');
});

test('standalone HTML has early strict CSP, labeled local controls and no active network, storage, payment or management code', () => {
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
  assert.doesNotMatch(html, /<a\b[^>]*href=|<form\b[^>]*\baction=|<input\b[^>]*\bname="reset"/i);
  assert.equal(html.includes('csp-probe.js'), false);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible.*3px/);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|\beval\s*\(|innerHTML|\bsetTimeout\s*\(|Math\.random|Date\.now|\brequire\s*\(/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
});

test('genuine assertion RED, loadable keyboard-observed stub and exact raw proof remain outside autodiscovery', () => {
  const raw = read(path.join('evidence', 'raw', 'red.stdout.tap'));
  assert.match(raw, /not ok 1/);
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /expected: 'lost'/);
  assert.match(raw, /actual: 'ready'/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
  const red = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  assert.equal(red.childExitCode, 1);
  assert.equal(red.errorCode, 'ERR_ASSERTION');
  assert.match(red.iac, /^N\/A evaluated after genuine assertion RED/);
  const originalBdd = bytes(path.join('evidence', 'red-stub', 'checkout.feature'));
  assert.equal(red.bddSha256, digest(originalBdd));
  assert.equal(originalBdd.toString('utf8').replace(/\r\n/g, '\n'), read('checkout.feature').replace(/\r\n/g, '\n'));
  assert.equal(red.stdoutSha256, digest(bytes(path.join('evidence', 'raw', 'red.stdout.tap'))));
  assert.equal(red.stderrSha256, digest(bytes(path.join('evidence', 'raw', 'red.stderr.txt'))));
  for (const [name, hash] of Object.entries(red.archivedStubSha256)) {
    assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
    assert.equal(hash, digest(bytes(path.join('evidence', 'red-stub', name))), name);
  }
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.execute(stub.createState(), { type: 'load', checkoutId: 'CHECKOUT-DEMO-01' }).phase, 'ready');
  const observation = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(observation.phaseAfterKeyboardLoad, 'ready');
  assert.equal(observation.historyAfterKeyboardLoad, '0 / 16');
  assert.equal(observation.awaitedCleanupCompleted, true);
  assert.deepEqual(observation.pageErrors, []);
  assert.equal(observation.browser, '156.0.4314.50');
  assert.equal(red.extraKanoCredits, 0);
});

test('published isolated helper is pinned, finally-close is awaited, and exact deliberate capture is exclusive', () => {
  assert.equal(digest(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read('browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /finally \{\s+try \{\s+if \(session\) \{\s+await session\.close\(\)/);
  assert.match(browser, /lessonAndExistingProofUnchanged/);
  assert.match(read(path.join('evidence', 'csp-probe.js')), /ordinary external self-script, not privileged Playwright evaluation/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|bypassCSP\s*:\s*true|disable-web-security|no-sandbox/);
  assert.match(manifest.limits.join('\n'), /known unattended context\/page\/cleanup lifecycle limitations/);
  assert.match(manifest.limits.join('\n'), /inactive recovery prototype is unqualified/);
});

test('early narrow attributes distinguish raw proof bytes from canonical LF and actual Git-filtered blob identity', () => {
  assert.equal(read('.gitattributes').replace(/\r\n/g, '\n'), '* text=auto eol=lf\nevidence/raw/** -text -diff\nevidence/red-stub/** -text -diff\n');
  const recorded = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(recorded.cardId, 'A-S134');
  assert.equal(recorded.gitHashAlgorithm, 'sha1');
  assert.equal(recorded.rawAndCanonicalAreSeparate, true);
  assert.equal(recorded.excludesSelfAndLaterUniqueCaptures, true);
  for (const [file, entry] of Object.entries(recorded.files)) {
    const raw = bytes(file);
    const canonical = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    const rawProof = file.startsWith(`evidence${path.sep}raw${path.sep}`)
      || file.startsWith(`evidence${path.sep}red-stub${path.sep}`);
    const gitBytes = rawProof ? raw : canonical;
    assert.equal(entry.rawBytes, raw.length, file);
    assert.equal(entry.rawSha256, digest(raw), file);
    assert.equal(entry.crlfPairs, (raw.toString('utf8').match(/\r\n/g) || []).length, file);
    assert.equal(entry.canonicalLfBytes, canonical.length, file);
    assert.equal(entry.canonicalLfSha256, digest(canonical), file);
    assert.equal(entry.gitTextHandling, rawProof ? 'raw-preserved' : 'LF-canonical', file);
    assert.equal(entry.gitFilteredSha256, digest(gitBytes), file);
    assert.equal(entry.canonicalGitBlobOid, gitBlob(gitBytes), file);
    const absolute = path.join(__dirname, file);
    const result = spawnSync('git', ['hash-object', `--path=${path.basename(absolute)}`, '--stdin'], {
      cwd: path.dirname(absolute), input: raw, timeout: 10000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr.toString());
    assert.equal(result.stdout.toString().trim(), entry.canonicalGitBlobOid, file);
  }
  for (const required of ['.gitattributes', 'checkout.feature', 'model.js', 'app.js', 'index.html', 'lesson.css',
    'model.test.cjs', 'browser.test.cjs', 'integrity.test.cjs', 'manifest.json', 'README.txt', path.join('evidence', 'csp-probe.js')]) {
    assert.equal(Object.hasOwn(recorded.files, required), true, required);
  }
});

test('existing deliberate browser captures remain truthful immutable local observations, never native or extra credit', () => {
  const directory = path.join(__dirname, 'evidence', 'raw');
  const captures = fs.readdirSync(directory).filter((name) => /^browser-observation-.*\.json$/.test(name));
  for (const name of captures) {
    const capture = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    assert.equal(capture.cardId, 'A-S134');
    assert.equal(capture.captureRequested, true);
    assert.equal(capture.nativeProof, false);
    assert.equal(capture.sourceParentComplete, false);
    assert.equal(capture.productionNode24Validated, false);
    assert.equal(capture.extraKanoCredits, 0);
    if (capture.passed) {
      assert.equal(capture.awaitedCleanupCompleted, true);
      assert.equal(capture.lessonAndExistingProofUnchanged, true);
      assert.equal(capture.checks.length, 8);
      assert.equal(capture.checks.every((check) => check.passed), true);
      assert.deepEqual(capture.failures, []);
      assert.deepEqual(capture.pageErrors, []);
      assert.deepEqual(capture.remoteRequests, []);
    }
  }
});
