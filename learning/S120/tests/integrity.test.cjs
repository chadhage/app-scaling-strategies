'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const E = require('../scripts/evidence.cjs');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file).toString());
const manifest = json('evidence\\acceptance.json');
const git = (args, input) => {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr.toString());
  return result.stdout;
};

test('integrity: exact frozen source acceptance, Kano unit and packet are preserved', () => {
  assert.match(manifest.sourceCommit, /^[0-9a-f]{40}$/);
  for (const [file, sourceRow] of Object.entries(manifest.sourceRows)) {
    const lines = git(['show', `${manifest.sourceCommit}:${file}`]).toString().split(/\r?\n/);
    assert.ok(lines.includes(sourceRow), `missing exact source row in ${file}`);
  }
  assert.equal(manifest.cardId, 'A-S120');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S120');
  assert.equal(manifest.packet, 'SC-S120');
  assert.deepEqual(manifest.parents, ['D-S120']);
  assert.equal(manifest.objective, 'Remove all viable destinations; recognize unavoidable interruption rather than inventing zero-downtime success.');
  assert.equal(manifest.nativeRemainder.readiness, false);
  assert.equal(manifest.limits.sourceParentComplete, false);
});

test('integrity: fixture limits are exact data, not native capacities or thresholds', () => {
  const M = require('../model.js');
  const state = M.create();
  assert.equal(manifest.fixtureId, M.VERSION);
  assert.equal(manifest.preconditions.maxAcceptedActionsPerRun, M.LIMITS.actions);
  assert.equal(manifest.preconditions.maxArchivedRuns, M.LIMITS.archives);
  assert.equal(manifest.preconditions.budgetMs, M.LIMITS.budgetMs);
  assert.deepEqual(state.destinations.map((item) => item.id), manifest.preconditions.ownedFictionalDestinations);
  assert.deepEqual(state.destinations.map((item) => item.region), manifest.preconditions.fictionalRegions);
  assert.ok(state.destinations.every((item) => item.capacityUnits === 2 && item.stateRevision === 7 && item.writerEpoch === 3));
  for (const key of ['actualResourceProcessNetworkChangesByLesson', 'actualCloudCalls', 'credentials', 'nativeAzureProof', 'productionNode24Validated', 'fiveNinesQualified', 'sourceParentComplete']) {
    assert.equal(manifest.limits[key], false, key);
  }
});

test('integrity: all final JavaScript is syntax-valid and frozen RED is outside discovery', () => {
  for (const file of E.sources().filter((item) => /\.(?:js|cjs)$/.test(item.path))) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file.path)], { cwd: repo, encoding: null, timeout: 10000 });
    assert.equal(result.status, 0, `${file.path}: ${result.stderr.toString()}`);
  }
  assert.doesNotThrow(() => new vm.Script(read('evidence\\red\\model.stub').toString()));
  assert.ok(fs.readdirSync(path.join(root, 'evidence', 'red')).every((name) => !/\.(?:js|cjs|mjs)$/.test(name)));
});

test('integrity: exact banner, accessible controls and disabled load-failure fallback', () => {
  const html = read('index.html').toString();
  assert.ok(html.includes(manifest.banner));
  assert.match(html, /role="alert"/);
  assert.match(html, /class="skip"/);
  assert.match(html, /id="observe"[^>]*disabled/);
  assert.match(html, /id="start-over"[^>]*disabled/);
  assert.match(html, /no result is verified/);
  for (const id of ['destination', 'confirm-remove', 'claim', 'recover-destination', 'reconcile']) {
    assert.ok(html.includes(`for="${id}"`) || html.includes(`class="check"><input id="${id}"`), id);
  }
  assert.doesNotMatch(html, /(?:id|name)=["']reset["']/i);
  assert.match(read('app.js').toString(), /form\.reset\(\)/);
  assert.doesNotMatch(read('app.js').toString(), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
});

test('integrity: CSP denies external execution, connections and native form submissions', () => {
  const html = read('index.html').toString();
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(policy.includes(directive), directive);
  }
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file).toString(), /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|https?:|localStorage|sessionStorage/);
  }
});

test('integrity: raw evidence has narrow -text attributes established before RED', () => {
  const attributes = git(['check-attr', 'text', '--',
    'learning/S120/evidence/red/model.stub', 'learning/S120/evidence/red/focused-stdout.raw',
    'learning/S120/evidence/red/browser.json', 'learning/S120/evidence/browser-proof.sources.raw.gz']).toString();
  assert.equal((attributes.match(/text: unset/g) || []).length, 4);
  const source = git(['check-attr', 'text', 'eol', '--', 'learning/S120/model.js']).toString();
  assert.match(source, /text: set/);
  assert.match(source, /eol: lf/);
  const firstBrowser = json(`evidence\\${json('evidence\\red\\browser.json').captured.record}`);
  const initialArchive = JSON.parse(gunzipSync(read(`evidence\\${firstBrowser.rawSourceArchive.file}`)).toString());
  const initialAttributes = Buffer.from(initialArchive.sources.find((item) => item.path === '.gitattributes').base64, 'base64');
  assert.equal(firstBrowser.rawSources.find((item) => item.path === '.gitattributes').sha256, E.sha256(initialAttributes));
  for (const rule of initialAttributes.toString().split(/\r?\n/).filter((line) => line.startsWith('evidence/'))) {
    assert.ok(read('.gitattributes').toString().includes(rule), 'initial -text rules must remain without rewriting the old raw archive');
  }
  const whitespace = git(['check-attr', 'whitespace', '--', 'learning/S120/evidence/red/model.stub', 'learning/S120/model.js']).toString();
  assert.match(whitespace, /model\.stub: whitespace: cr-at-eol/);
  assert.match(whitespace, /model\.js: whitespace: unspecified/);
  const literalData = git(['check-attr', 'diff', '--', 'learning/S120/evidence/red/focused-stdout.raw', 'learning/S120/model.js']).toString();
  assert.match(literalData, /focused-stdout\.raw: diff: unset/);
  assert.match(literalData, /model\.js: diff: unspecified/);
});

test('integrity: genuine RED retains original stub, tests, raw exit code and assertions', () => {
  const red = json('evidence\\red\\focused.json');
  assert.equal(red.phase, 'red');
  assert.equal(red.exitCode, 1);
  assert.equal(red.syntaxExitCode, 0);
  assert.equal(red.behavioralAssertionObserved, true);
  assert.equal(red.stdoutSha256, E.sha256(read('evidence\\red\\focused-stdout.raw')));
  assert.equal(red.stderrSha256, E.sha256(read('evidence\\red\\focused-stderr.raw')));
  assert.match(read('evidence\\red\\focused-stdout.raw').toString(), /ERR_ASSERTION/);
  assert.doesNotMatch(read('evidence\\red\\focused-stdout.raw').toString(), /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(red.sources['model.js'].sha256, E.sha256(read('evidence\\red\\model.stub')));
  assert.notEqual(red.sources['model.js'].sha256, E.sha256(read('model.js')));
  const frozenTests = read('evidence\\red\\model-test-cjs.source');
  assert.equal(red.sources['tests\\model.test.cjs'].sha256, E.sha256(frozenTests));
  const canonicalArguments = ['hash-object', '--path=learning/S120/tests/model.test.cjs', '--stdin'];
  assert.deepEqual(git(canonicalArguments, frozenTests), git(canonicalArguments, read('tests\\model.test.cjs')));
  assert.deepEqual(git(canonicalArguments, frozenTests), git(canonicalArguments, Buffer.from(frozenTests.toString().replaceAll('\r\n', '\n'))),
    'canonical Git identity must survive an LF checkout without changing the frozen raw proof');
  const iac = json('evidence\\iac-na.json');
  assert.equal(iac.applicability, 'not applicable');
  assert.equal(iac.resourcesGenerated, false);
  assert.equal(iac.nativeSibling.readiness, false);
});

test('integrity: real browser RED is an assertion, not a missing tooling or module failure', () => {
  const proof = json('evidence\\red\\browser.json');
  assert.equal(proof.exitCode, 1);
  assert.equal(proof.assertionObserved, true);
  assert.equal(proof.cleanupAwaited, true);
  assert.equal(proof.stdoutSha256, E.sha256(read('evidence\\red\\browser-stdout.raw')));
  assert.equal(proof.stderrSha256, E.sha256(read('evidence\\red\\browser-stderr.raw')));
  const report = json(`evidence\\${proof.captured.record}`);
  assert.equal(report.success, false);
  assert.equal(report.failure.code, 'ERR_ASSERTION');
  assert.equal(report.failure.stage, 'supported positive control is not a migration');
  assert.match(report.failure.message, /0 attempted.*2 attempted/s);
  assert.equal(report.groups[0].passed, true, 'the stub page genuinely loaded');
  assert.equal(report.tooling.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});

test('integrity: archived RED raw bytes are verified without LF normalization', () => {
  const proof = json('evidence\\red\\browser.json');
  const report = json(`evidence\\${proof.captured.record}`);
  const bytes = read(`evidence\\${report.rawSourceArchive.file}`);
  assert.equal(bytes.length, report.rawSourceArchive.bytes);
  assert.equal(E.sha256(bytes), report.rawSourceArchive.sha256);
  const archive = JSON.parse(gunzipSync(bytes).toString());
  assert.equal(archive.format, 'S120-raw-source-v1');
  assert.equal(archive.sources.length, report.rawSources.length);
  for (const source of archive.sources) {
    const raw = Buffer.from(source.base64, 'base64');
    assert.equal(raw.length, source.bytes);
    assert.equal(E.sha256(raw), source.sha256);
    assert.deepEqual(report.rawSources.find((item) => item.path === source.path), { path: source.path, bytes: source.bytes, sha256: source.sha256 });
  }
  assert.notEqual(E.sha256(Buffer.from('fixed\r\n')), E.sha256(Buffer.from('fixed\n')), 'raw CRLF and LF are distinct, not repaired by test code');
});

test('integrity: normal capture checks are read-only and only the exact string 1 authorizes capture', () => {
  const hashes = () => fs.readdirSync(path.join(root, 'evidence')).filter((name) => fs.statSync(path.join(root, 'evidence', name)).isFile())
    .sort().map((name) => [name, E.sha256(read(`evidence\\${name}`))]);
  const before = hashes();
  for (const value of [undefined, null, false, true, 1, 0, 'true', '01', ' 1', '1 ', '0', '']) {
    assert.equal(E.shouldCapture(value), false);
    if (value !== undefined) assert.equal(E.capture({ mustNotBeSaved: true }, value), null);
  }
  assert.equal(E.shouldCapture('1'), true);
  assert.deepEqual(hashes(), before);
});

test('integrity: the deliberate proof recorder refuses to overwrite historical RED or GREEN', () => {
  function snapshot(directory = path.join(root, 'evidence')) {
    return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? snapshot(file) : [[path.relative(root, file), E.sha256(fs.readFileSync(file))]];
    });
  }
  const before = snapshot();
  for (const phase of ['red', 'green']) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'proof.cjs'), phase], { cwd: repo, encoding: null, timeout: 10000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr.toString(), /Historical proof already exists; refusing to overwrite/);
  }
  assert.deepEqual(snapshot(), before);
});

test('integrity: runner binds only the published isolated helper and awaited cleanup', () => {
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(E.sha256(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const runner = read('scripts\\browser.cjs').toString();
  assert.match(runner, /openIsolatedLesson\(path\.join\('learning', 'S120', 'index\.html'\)\)/);
  assert.match(runner, /finally[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(runner, /openIsolatedLoopback|bypassCSP|--no-sandbox|ignoreHTTPSErrors|foreground|prototype\.cjs/);
});
