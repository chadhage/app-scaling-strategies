'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const blobOid = (bytes) => digest(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1');
const manifest = JSON.parse(read('manifest.json'));
const model = require('./model.js');

test('exact S133 source, D-S133 acceptance, portable card and SC-S133 packet preserve one original frozen S unit', () => {
  assert.equal(manifest.id, 'A-S133');
  assert.equal(manifest.sourceId, 'S133');
  assert.equal(manifest.parentId, 'D-S133');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S133');
  assert.equal(manifest.packet, 'SC-S133');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.equal(manifest.mode, 'portable-synthetic');
  assert.equal(manifest.objective, 'Continue an old multi-step form; detect lost answers, invalid prior tokens, or duplicate submission.');
  assert.equal(manifest.sourceContract.acceptance, 'Answers, validation, permissions, and one final submission survive the transition.');
  assert.deepEqual(manifest.sourceContract.dependencies, ['D-S036', 'D-S037']);
  for (const [name, rows] of [
    ['README.md', [manifest.sourceContract.readmeRow]],
    [path.join('.docs', 'wiki', 'backlog.md'), [manifest.sourceContract.backlogRow]],
    [path.join('.docs', 'wiki', 'kanban.md'), [manifest.sourceContract.portableRow, manifest.sourceContract.nativeSiblingRow]],
  ]) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    for (const row of rows) assert.equal(source.includes(row), true, `Exact source row: ${row}`);
  }
  for (const field of ['nativeProofComplete', 'sourceParentComplete', 'productionNode24Validated', 'accepted']) assert.equal(manifest[field], false);
  assert.equal(manifest.extraKanoCredits, 0);
});

test('closed fictional fixture, finite envelope, explicit source remainder and no bonus proof/repair credits', () => {
  assert.deepEqual(manifest.syntheticInputs.presets, Object.keys(model.PRESETS));
  assert.equal(manifest.syntheticInputs.maximumJourneys, model.MAX_RUNS);
  assert.equal(manifest.syntheticInputs.maximumAcceptedActions, model.MAX_HISTORY);
  assert.equal(manifest.syntheticInputs.maximumRetriesPerJourney, 1);
  assert.equal(manifest.syntheticInputs.maximumRejectedActions, 12);
  const documentation = read('README.txt');
  for (const phrase of [
    'DATA ONLY', 'SC-S133', 'UNKNOWN', 'Parent alone accepts A-S133 once', 'readiness=false',
    'original B-S133 Kano unit', 'D-S133 remains incomplete', 'Zero extra credits',
    'Normal verification is READ-ONLY', 'inactive recovery prototype is unqualified',
    'Node 24', 'Microsoft Open Source Disclaimer',
  ]) assert.equal(documentation.includes(phrase), true, phrase);
  assert.match(manifest.verification.iac, /^N\/A evaluated after genuine assertion RED and before implementation/);
});

test('standalone CSP precedes resources, controls are labeled and production code performs no network/auth/storage operation', () => {
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
  assert.doesNotMatch(html, /<iframe|csp-probe\.js|missing-model\.html|<input|<textarea|\bhttps?:/i);
  assert.match(html, /<label for="preset">Fixed form trace preset<\/label>/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible.*3px/);
  for (const name of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(name), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|document\.cookie|\beval\s*\(|innerHTML|Math\.random|Date\.now|\bsetTimeout\s*\(|\brequire\s*\(/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
});

test('actual loadable stub and genuine assertion RED are byte-preserved outside autodiscovery; IaC N/A follows RED', () => {
  const red = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  const stdout = fs.readFileSync(path.join(__dirname, 'evidence', 'raw', 'red.stdout.tap'));
  const stderr = fs.readFileSync(path.join(__dirname, 'evidence', 'raw', 'red.stderr.txt'));
  assert.equal(red.childExitCode, 1);
  assert.equal(red.errorCode, 'ERR_ASSERTION');
  assert.equal(red.genuineAssertionRed, true);
  assert.equal(digest(stdout), red.stdoutSha256);
  assert.equal(digest(stderr), red.stderrSha256);
  assert.match(stdout.toString('utf8'), /not ok 1/);
  assert.match(stdout.toString('utf8'), /ERR_ASSERTION/);
  assert.match(stdout.toString('utf8'), /idle/);
  assert.match(stdout.toString('utf8'), /old-step/);
  assert.doesNotMatch(stdout.toString('utf8'), /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
  for (const [name, hash] of Object.entries(red.archivedStubSha256)) {
    assert.equal(name.endsWith('.txt'), true);
    assert.equal(digest(fs.readFileSync(path.join(__dirname, 'evidence', 'red-stub', name))), hash);
    assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  }
  const stub = require('./evidence/red-stub/model.js.txt');
  assert.equal(stub.execute(stub.createState(), { type: 'start', presetId: 'preserved' }).phase, 'idle');
  const observed = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(observed.phaseBefore, 'idle');
  assert.equal(observed.phaseAfterKeyboardStart, 'idle');
  assert.equal(observed.actionCount, '0');
  assert.equal(observed.browserVersion, '156.0.4314.50');
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.deepEqual(observed.pageErrors, []);
  const iac = JSON.parse(read(path.join('evidence', 'iac-na.json')));
  assert.match(iac.iac, /^N\/A evaluated after genuine assertion RED and before implementation/);
  assert.equal(iac.redStdoutSha256, red.stdoutSha256);
  for (const field of ['cloudResources', 'authorizedCloudSpend', 'networkOperations', 'storageOperations', 'authenticationOperations', 'extraKanoCredits']) assert.equal(iac[field], 0);
});

test('published helper stays pinned and only exact capture authorization adds unique proof with awaited finally cleanup', () => {
  assert.equal(manifest.verification.publishedHelperCommit, '53c0c0d');
  assert.equal(digest(fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read('browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /finally \{\s+try \{\s+await session\.close\(\)/);
  assert.match(browser, /Normal verification must remain READ-ONLY/);
  assert.doesNotMatch(browser, /openIsolatedLoopback|chromium\.launch|--no-sandbox|bypassCSP:\s*true|ignoreHTTPSErrors:\s*true/);
  assert.match(read(path.join('evidence', 'raw', 'capture-green.cjs.txt')), /process\.env\.CAPTURE_BROWSER_EVIDENCE !== '1'/);
});

test('raw byte attributes were narrow and early; canonical Git text is not conflated with raw CRLF proof', () => {
  assert.equal(read('.gitattributes').replace(/\r\n/g, '\n'), '* text=auto eol=lf\nevidence/raw/** -text -diff\nevidence/red-stub/** -text -diff\n');
  const rawPath = path.join('learning', 'S133', 'evidence', 'raw', 'red.stdout.tap');
  const raw = fs.readFileSync(path.join(root, rawPath));
  const attributes = execFileSync('git', ['--no-pager', 'check-attr', 'text', 'diff', '--', rawPath], { cwd: root, encoding: 'utf8' });
  assert.match(attributes, /text: unset/);
  assert.match(attributes, /diff: unset/);
  const rawGit = execFileSync('git', ['--no-pager', 'hash-object', '--path', rawPath, rawPath], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(rawGit, blobOid(raw));
  for (const name of ['model.js', 'app.js', 'index.html', 'lesson.css', 'manifest.json', 'README.txt']) {
    const absolute = path.join(__dirname, name);
    const bytes = fs.readFileSync(absolute);
    const canonical = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    const gitCanonical = execFileSync('git', ['--no-pager', 'hash-object', '--path', path.relative(root, absolute), absolute], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(gitCanonical, blobOid(canonical), `${name}: canonical identity, not an assertion of identical raw line endings`);
  }
});

test('actual successful browser record matches current canonical source and retains positive/negative/unknown DOM and CSP observations', () => {
  const names = fs.readdirSync(path.join(__dirname, 'evidence', 'raw')).filter((name) => /^browser-.*\.json$/.test(name));
  assert.equal(names.length > 0, true, 'Actual deliberate browser observation is required.');
  const records = names.map((name) => JSON.parse(read(path.join('evidence', 'raw', name))));
  const current = records.filter((record) => record.success && Object.entries(record.sourceProvenance).every(([name, proof]) => {
    return digest(Buffer.from(read(name).replace(/\r\n/g, '\n'))) === proof.canonicalSha256;
  }));
  assert.equal(current.length > 0, true, 'A historical observation cannot substitute for current-source browser proof.');
  for (const record of current) {
    assert.equal(record.cardId, 'A-S133');
    assert.equal(record.mode, 'portable-synthetic');
    assert.equal(record.helperSha256, manifest.verification.publishedHelperSha256);
    assert.equal(record.node, 'v22.23.4');
    assert.equal(record.playwright, '1.56.1');
    assert.equal(record.browserVersion, '156.0.4314.50');
    assert.equal(record.lessonAndExistingProofUnchanged, true);
    assert.equal(record.awaitedCleanupCompleted, true);
    assert.equal(record.nativeProof, false);
    assert.equal(record.sourceParentComplete, false);
    assert.equal(record.extraKanoCredits, 0);
    assert.deepEqual(record.pageErrors, []);
    assert.deepEqual(record.remoteRequests, []);
    assert.deepEqual(record.failures, []);
    assert.equal(record.checks.every((entry) => entry.passed), true);
    for (const field of ['inlineScriptBlocked', 'inlineEventBlocked', 'evalBlocked', 'inlineStyleBlocked', 'connectBlocked', 'imageBlocked', 'frameBlocked', 'formNavigationBlocked']) assert.equal(record.csp[field], true);
    const retained = record.observations.find((entry) => entry.name === 'retained-failures-unknown-success-native-reset-and-run-bound');
    assert.equal(retained.retainedRuns.length, 10);
    assert.equal(retained.retainedRuns.filter((entry) => entry.includes('interrupted')).length, 7);
    assert.equal(retained.retainedRuns.filter((entry) => entry.includes('effects=UNKNOWN')).length, 1);
    assert.equal(retained.formResetWasShadowed, true);
    assert.match(retained.fields.error, /ERR_LIMIT/);
    for (const [relative, hash] of Object.entries(record.rawLessonHashesBefore)) {
      if (relative.startsWith(`evidence${path.sep}raw${path.sep}`) || relative.startsWith(`evidence${path.sep}red-stub${path.sep}`)) {
        assert.equal(digest(fs.readFileSync(path.join(__dirname, relative))), hash, `Raw proof unchanged: ${relative}`);
      }
    }
  }
});

test('all deliberately captured runner records preserve actual stdout/stderr without claiming failed checks as green', () => {
  const rawDirectory = path.join(__dirname, 'evidence', 'raw');
  const names = fs.readdirSync(rawDirectory).filter((name) => /^green-.*\.summary\.json$/.test(name));
  assert.equal(names.some((name) => name.includes('-browser.summary.json')), true);
  for (const name of names) {
    const record = JSON.parse(read(path.join('evidence', 'raw', name)));
    assert.equal(record.cardId, 'A-S133');
    assert.equal(record.workerId, 'worker-A-S133');
    assert.equal(record.expectedPass, record.exitCode === 0 && record.signal === null);
    assert.equal(digest(fs.readFileSync(path.join(rawDirectory, record.stdoutFile))), record.stdoutSha256);
    assert.equal(digest(fs.readFileSync(path.join(rawDirectory, record.stderrFile))), record.stderrSha256);
    assert.equal(record.extraKanoCredits, 0);
  }
});
