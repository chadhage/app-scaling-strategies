'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));
function latestRaw(stage) {
  const name = fs.readdirSync(path.join(root, 'evidence', 'raw')).filter((file) => new RegExp(`^${stage}-\\d{3}\\.json$`).test(file)).sort().at(-1);
  assert.ok(name, `missing ${stage} run proof`);
  return json(`evidence\\raw\\${name}`);
}
function successfulBrowser() {
  const names = fs.readdirSync(path.join(root, 'evidence', 'browser')).filter((file) => /^capture-\d{3}\.json$/.test(file)).sort();
  const record = names.map((file) => json(`evidence\\browser\\${file}`)).filter((item) => item.verifierPassed).at(-1);
  assert.ok(record, 'a genuine successful browser capture is required');
  return record;
}

test('exact source/card/packet acceptance is separated from the uncompleted native parent', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S122');
  assert.equal(manifest.parentId, 'D-S122');
  assert.equal(manifest.packet, 'SC-S122');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S122');
  assert.equal(manifest.originalUnits, 1);
  assert.equal(manifest.extraCredits, 0);
  assert.equal(manifest.objective, 'Choose a supported Linux promotion path; reject unsupported native auto-swap.');
  assert.equal(manifest.sourceContract.backlogAcceptance, 'Unsupported native auto-swap is unavailable with explanation; supported native effects and continuity are measured.');
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.ok(readme.includes('| S122 | **App Service, Linux code:** Use a controlled deployment/swap pipeline; do not depend on unsupported native auto-swap. |'));
  assert.ok(backlog.includes('| D-S122 | P1 | Add a Linux code App Service preset with controlled manual/pipeline swap. | Unsupported native auto-swap is unavailable with explanation; supported native effects and continuity are measured. | P001, D-S002 |'));
  assert.ok(kanban.includes('| A-S122 | D-S122 | S | Choose a supported Linux promotion path; reject unsupported native auto-swap. | SOURCE |'));
  assert.ok(kanban.includes('| B-S122 | D-S122 | S | Conduct one Linux controlled swap preset; verify native observations without auto-swap claims. | CORE, DATA, C062, C064 |'));
  for (const claim of ['nativeAzureValidated', 'productionNode24Validated', 'sourceParentComplete', 'nativeSiblingComplete', 'controllerAccepted']) {
    assert.equal(manifest.claims[claim], false);
  }
  assert.equal(manifest.refinement.readiness, false);
  assert.equal(manifest.refinement.extraCredits, 0);
});

for (const kind of ['model', 'browser']) {
  test(`preserved ${kind} RED is a genuine assertion on a loadable stub, with raw bytes`, () => {
    const record = json(`evidence\\raw\\${kind}-red-001.json`);
    assert.equal(record.exitCode, 1);
    assert.equal(record.signal, null);
    assert.equal(record.error, null);
    const stdout = read(record.stdout.path);
    const stderr = read(record.stderr.path);
    assert.equal(stdout.length, record.stdout.bytes);
    assert.equal(sha(stdout), record.stdout.sha256);
    assert.equal(stderr.length, record.stderr.bytes);
    assert.equal(sha(stderr), record.stderr.sha256);
    assert.match(stdout.toString('utf8'), /ERR_ASSERTION/);
    assert.match(stdout.toString('utf8'), /'idle' !== 'ready'/);
    assert.match(stdout.toString('utf8'), /# tests 1[\s\S]*# pass 0[\s\S]*# fail 1/);
    assert.doesNotMatch(stdout.toString('utf8'), /Cannot find module|SyntaxError|ERR_MODULE_NOT_FOUND/);
    for (const snapshot of record.snapshots) {
      const bytes = read(snapshot.path);
      assert.equal(bytes.length, snapshot.bytes);
      assert.equal(sha(bytes), snapshot.sha256);
      assert.ok(snapshot.path.endsWith('.source'));
    }
    const stub = record.snapshots.find((snapshot) => snapshot.source === 'model.js');
    const context = { module: { exports: {} } };
    vm.runInNewContext(read(stub.path).toString('utf8'), context);
    const api = context.module.exports;
    const result = api.apply(api.initialState(), { type: 'assess', input: { path: 'manual', fixture: 'healthy', budgetMs: 250 } });
    assert.equal(result.phase, 'idle');
    assert.throws(() => assert.equal(result.phase, 'ready'), { code: 'ERR_ASSERTION' });
  });
}

test('IaC N/A actually follows both assertion REDs and precedes successful implementation checks', () => {
  const iac = json('evidence\\iac-na.json');
  assert.equal(iac.applicable, false);
  assert.equal(iac.nativeProof, false);
  assert.equal(iac.extraKanoCredits, 0);
  for (const predecessor of [iac.precedingModelRed, iac.precedingBrowserRed]) {
    assert.equal(sha(read(predecessor.path)), predecessor.sha256);
    assert.equal(predecessor.exitCode, 1);
    assert.ok(Date.parse(predecessor.completedAtUtc) < Date.parse(iac.recordedAtUtc));
  }
  const focused = latestRaw('focused');
  assert.equal(focused.exitCode, 0);
  assert.ok(Date.parse(focused.startedAtUtc) > Date.parse(iac.recordedAtUtc));
  assert.equal(focused.testSummary.fail, 0);
  assert.equal(focused.testSummary.skipped, 0);
  assert.equal(focused.testSummary.tests, focused.testSummary.pass);
});

test('successful actual browser proof covers keyboard, errors, reset, failure, unknowns and enforced CSP', () => {
  const record = successfulBrowser();
  assert.equal(record.mode, 'local-synthetic');
  assert.equal(record.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(record.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(record.helperPublication, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(record.playwrightVersion, '1.56.1');
  assert.match(record.nodeVersion, /^v22\./);
  assert.match(record.browserVersion, /^156\./);
  assert.equal(record.checksPassed, 16);
  assert.equal(record.observations.length, 16);
  assert.ok(record.observations.every((observation) => observation.passed && observation.dom));
  assert.equal(record.bytePreservation, true);
  assert.match(record.cleanup, /awaited session.close\(\) in finally completed/);
  assert.deepEqual(record.pageErrors, []);
  assert.deepEqual(record.networkRequests, []);
  const evidence = (prefix) => record.observations.find((item) => item.check.startsWith(prefix));
  assert.equal(evidence('keyboard').details.path, 'pipeline');
  assert.equal(evidence('former-worker').details.interruptions, 1);
  assert.equal(evidence('missing receipt').details.unknowns, 2);
  assert.equal(evidence('positive, negative').details.attempts, 9);
  assert.equal(evidence('raw numeric').details.rejectedRawValues.length, 12);
  assert.equal(evidence('DOM tampering').details.exposure, false);
  assert.equal(evidence('premature').details.keyboardResetClearedAlert, true);
  assert.equal(evidence('reset archives').details.unknowns, 3);
  assert.equal(evidence('six archived').details.seventhRejected, true);
  const csp = evidence('actual Chromium CSP').details;
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.inlineStyleApplied, '');
  assert.equal(csp.connectionRejected, true);
  assert.ok(csp.violations.some((event) => event.effectiveDirective === 'connect-src' && event.disposition === 'enforce'));
  assert.equal(record.nativeAzureValidated, false);
  assert.equal(record.productionNode24Validated, false);
  assert.equal(record.sourceParentComplete, false);
  assert.equal(record.extraCredits, 0);
});

test('actual browser raw source archive matches exact execution bytes without normalization', () => {
  const record = successfulBrowser();
  const bytes = read(record.sourceArchive.path);
  assert.equal(bytes.length, record.sourceArchive.bytes);
  assert.equal(sha(bytes), record.sourceArchive.sha256);
  const archive = JSON.parse(zlib.gunzipSync(bytes));
  assert.match(archive.format, /exact raw bytes/);
  assert.equal(archive.files.length, record.rawSources.length);
  for (const file of archive.files) {
    const raw = Buffer.from(file.base64, 'base64');
    assert.equal(raw.length, file.bytes);
    assert.equal(sha(raw), file.sha256);
    const metadata = record.rawSources.find((item) => item.path === file.path);
    assert.deepEqual(metadata, { path: file.path, bytes: file.bytes, sha256: file.sha256 });
    assert.equal(sha(read(file.path)), file.sha256, `${file.path} changed after the qualified browser observation`);
  }
});

test('all recorded successful commands and syntax checks retain actual raw output identities', () => {
  for (const stage of ['focused', 'syntax', 'browser']) {
    const record = latestRaw(stage);
    assert.equal(record.exitCode, 0);
    assert.equal(record.error, null);
    assert.equal(record.signal, null);
    for (const stream of [record.stdout, record.stderr]) {
      assert.equal(read(stream.path).length, stream.bytes);
      assert.equal(sha(read(stream.path)), stream.sha256);
    }
    assert.ok(record.commands.every((command) => command.exitCode === 0 && !command.error && !command.signal));
    if (stage === 'syntax') {
      assert.equal(record.commands.length, 8);
      assert.ok(record.commands.every((command) => command.argv[1] === '--check'));
    }
  }
});

test('nonexact capture values deny recording with no byte changes or browser launch', () => {
  const pointer = read('evidence\\integrity.json');
  const rawNames = fs.readdirSync(path.join(root, 'evidence', 'raw'));
  const browserNames = fs.readdirSync(path.join(root, 'evidence', 'browser'));
  for (const value of [undefined, '', 'true', '01', ' 1', '1 ', '0']) {
    const environment = { ...process.env };
    if (value === undefined) delete environment.CAPTURE_BROWSER_EVIDENCE;
    else environment.CAPTURE_BROWSER_EVIDENCE = value;
    for (const [script, argument] of [['capture.cjs', 'browser'], ['seal.cjs', null]]) {
      const command = [path.join(root, 'scripts', script), ...(argument ? [argument] : [])];
      const run = spawnSync(process.execPath, command, { cwd: repo, env: environment, timeout: 15000 });
      assert.equal(run.status, 2);
      assert.match(run.stderr.toString('utf8'), /READ_ONLY/);
      assert.equal(run.stdout.length, 0);
    }
  }
  assert.deepEqual(read('evidence\\integrity.json'), pointer);
  assert.deepEqual(fs.readdirSync(path.join(root, 'evidence', 'raw')), rawNames);
  assert.deepEqual(fs.readdirSync(path.join(root, 'evidence', 'browser')), browserNames);
});

test('local assets, exact banner, CSP and reset naming preserve the standalone boundary', () => {
  const html = read('index.html').toString('utf8');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'/);
  assert.match(html, /object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'/);
  assert.doesNotMatch(html, /\b(?:id|name)=["']reset["']/);
  assert.doesNotMatch(html, /<style\b/i);
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) assert.equal(script[1].trim(), '');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['model.js', 'app.js']);
  for (const file of ['app.js', 'model.js']) {
    const code = read(file).toString('utf8');
    assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/);
    assert.doesNotMatch(code, /\b(?:Date|Math\.random)\b/);
  }
});
