'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => hash(fs.readFileSync(path.join(__dirname, file)));

test('one original frozen satisfier, exact source rows and original P001 lineage', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S014');
  assert.equal(manifest.workerId, 'worker-A-S014');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S014');
  assert.equal(manifest.packet, 'SC-S014');
  assert.equal(manifest.parent, 'D-S014');
  assert.deepEqual(manifest.originalPrerequisites, ['P001']);
  assert.equal(manifest.mode, 'synthetic-only');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.deepEqual(manifest.dependencies, []);
  for (const flag of ['productionNode24Validated', 'nativeProof', 'parentComplete']) {
    assert.equal(manifest[flag], false);
  }
  const sources = json('evidence\\source-contract.json');
  for (const source of sources.rows) {
    const text = fs.readFileSync(path.join(root, source.path), 'utf8');
    assert.ok(text.split(/\r?\n/).includes(source.text), `exact source row remains present: ${source.id}`);
    assert.equal(hash(source.text), source.sha256);
  }
  assert.deepEqual(sources.rows.map((row) => row.id), ['S014', 'D-S014', 'A-S014', 'B-S014', 'P001', 'C066', 'portable-banner']);
});

test('BDD, loadable stub, actual assertion RED and IaC N/A have preserved provenance and order', () => {
  const stub = json('evidence\\stub-load.json');
  const red = json('evidence\\behavioral-red.json');
  const iac = json('evidence\\iac-na.json');
  const green = json('evidence\\model-initial-green.json');
  assert.equal(stub.exitCode, 0);
  assert.equal(red.exitCode, 1);
  assert.equal(red.spawnError, null);
  assert.equal(iac.exitCode, 0);
  assert.equal(green.exitCode, 0);
  assert.ok(Date.parse(stub.completedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) <= Date.parse(iac.startedAtUtc));
  assert.ok(Date.parse(iac.completedAtUtc) <= Date.parse(green.startedAtUtc));
  assert.equal(red.inputs['schedule.js'], fileHash('evidence\\red-model.source.txt'));
  assert.equal(red.inputs['schedule.test.cjs'], fileHash('evidence\\red-tests.source.txt'));
  assert.equal(red.inputs['scheduled-scaling.feature'], fileHash('evidence\\red-bdd.source.txt'));
  assert.equal(fileHash('scheduled-scaling.feature'), fileHash('evidence\\red-bdd.source.txt'));
  assert.equal(iac.inputs['schedule.js'], red.inputs['schedule.js'], 'IaC N/A was recorded while model was still the stub');
  assert.notEqual(green.inputs['schedule.js'], red.inputs['schedule.js']);
  const raw = read('evidence\\behavioral-red.tap.txt');
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /accepted calendar must create one synthetic attempt/);
  assert.match(raw, /# tests 1/);
  assert.match(raw, /# fail 1/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError|ReferenceError|TypeError|ERR_MODULE_NOT_FOUND/);
  assert.match(read('evidence\\iac-na.tap.txt'), /resource-free standalone synthetic lesson/);
  for (const record of [stub, red, iac, green]) {
    assert.equal(record.stdoutSha256, fileHash(`evidence\\${record.stage}.tap.txt`));
    assert.equal(record.stderrSha256, fileHash(`evidence\\${record.stage}.stderr.txt`));
  }
  const saved = require('./evidence/red-model.source.txt');
  for (const name of ['createState', 'schedule', 'advance', 'assess']) assert.equal(typeof saved[name], 'function');
});

test('the non-auto-discovered original test still produces the genuine one-assertion RED against its saved stub', () => {
  const childEnv = {
    ...process.env, S014_MODEL_UNDER_TEST: path.join(__dirname, 'evidence', 'red-model.source.txt'),
  };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['-e',
    'require(process.argv[1])', path.join(__dirname, 'evidence', 'red-tests.source.txt')],
  {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 10000,
    env: childEnv,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /ERR_ASSERTION/);
  assert.match(result.stdout, /accepted calendar must create one synthetic attempt/);
  assert.match(result.stdout, /# fail 1/);
  assert.doesNotMatch(result.stdout + result.stderr, /MODULE_NOT_FOUND|SyntaxError|TypeError|ReferenceError/);
  const snapshots = fs.readdirSync(path.join(__dirname, 'evidence')).filter((name) => name.includes('.source.'));
  assert.equal(snapshots.filter((name) => name.startsWith('red-')).length, 3);
  assert.ok(snapshots.every((name) => name.endsWith('.source.txt')));
});

test('initial failed verification attempts and their exact sources remain preserved', () => {
  const failed = json('evidence\\browser-attempt-01.json');
  const observed = json('evidence\\browser-observations-attempt-01.json');
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.inputs['browser.test.cjs'], fileHash('evidence\\browser-attempt-01.source.txt'));
  assert.match(read('evidence\\browser-attempt-01.tap.txt'), /Get-AuthenticodeSignature/);
  assert.equal(observed.observations.length, 0);
  assert.equal(observed.cleanup, 'no browser session acquired');
  const focused = json('evidence\\focused-green.json');
  assert.equal(focused.exitCode, 1);
  assert.equal(focused.inputs['integrity.test.cjs'], fileHash('evidence\\focused-attempt-01.source.txt'));
  const raw = read('evidence\\focused-green.tap.txt');
  assert.match(raw, /# tests 49/);
  assert.match(raw, /# pass 48/);
  assert.match(raw, /# fail 1/);
  assert.match(raw, /regular expression \/# fail 1\//);
});

test('standalone runtime uses local scripts/styles, restrictive CSP, safe text and non-shadowing native controls', () => {
  const html = read('index.html');
  const js = read('lesson.js') + read('schedule.js');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(policy.includes(directive));
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|data:/);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|\b(?:id|name)="reset"/i);
  assert.doesNotMatch(js, /innerHTML|outerHTML|document\.write|eval\s*\(|new Function|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/);
  assert.match(read('lesson.js'), /form\.reset\(\)/);
  const assets = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(assets.sort(), ['lesson.css', 'lesson.js', 'schedule.js']);
  for (const asset of assets) assert.ok(fs.statSync(path.join(__dirname, asset)).isFile());
  for (const id of ['demand-at', 'lead-seconds', 'provision-seconds', 'warm-seconds',
    'target-units', 'demand-rate', 'observation-fixture']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
});

test('the actual browser proof used the published offline pair, clean close and real passing scenarios', () => {
  const evidence = json('evidence.json');
  const observed = json(evidence.browser.observations);
  const raw = read(evidence.browser.rawLog);
  assert.equal(observed.helper.commit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(observed.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(observed.playwright, '1.56.1');
  assert.match(observed.browserVersion, /^156\./);
  assert.equal(observed.edgeSignature.status, 'Valid');
  assert.match(observed.edgeSignature.subject, /Microsoft Corporation/);
  assert.equal(observed.cleanup, 'awaited close completed');
  assert.deepEqual(observed.errors, []);
  assert.deepEqual(observed.completedNetwork, []);
  assert.equal(observed.observations.length, 16);
  assert.ok(observed.observations.every((scenario) => scenario.result === 'pass'));
  assert.match(raw, /# fail 0/);
  assert.match(raw, /# skipped 0/);
  const csp = observed.observations.find((scenario) => scenario.name.startsWith('CSP')).observed;
  assert.equal(csp.fetchRejected, true);
  assert.equal(csp.inlineExecuted, false);
  assert.equal(csp.handlerExecuted, false);
  assert.ok(csp.violations.includes('connect-src'));
  const actualRun = json('evidence\\browser-attempt-02.json');
  for (const name of ['schedule.js', 'lesson.js', 'index.html', 'lesson.css', 'browser.test.cjs']) {
    assert.equal(actualRun.inputs[name], fileHash(name), `published runtime matches actual browser proof: ${name}`);
  }
  const ordinary = json(evidence.validation.ordinaryBrowserRecord);
  const immutability = json(evidence.validation.ordinaryImmutability);
  assert.equal(ordinary.exitCode, 0);
  assert.equal(immutability.captureEnvironmentUnset, true);
  assert.equal(immutability.allExistingFilesUnchanged, true);
  assert.equal(immutability.beforeDigest, immutability.afterDigest);
  assert.deepEqual(immutability.addedFiles, []);
  assert.deepEqual(immutability.deletedFiles, []);
  assert.deepEqual(immutability.changedFiles, []);
  assert.ok(immutability.filesChecked >= 58);
  const browserSource = read('browser.test.cjs');
  assert.match(browserSource, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.match(browserSource, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browserSource, /if \(capture\) fs\.writeFileSync/);
  assert.match(browserSource, /flag: 'wx'/);
  assert.doesNotMatch(browserSource, /launch\s*\(|--no-sandbox|ignoreHTTPSErrors|bypassCSP|lifecycle\.cjs/);
});

test('all indexed current sources retain their hashes and evidence snapshots preserve raw bytes', () => {
  const evidence = json('evidence.json');
  for (const [file, expected] of Object.entries(evidence.currentSourceSha256)) {
    assert.equal(fileHash(file), expected, file);
  }
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/m);
  assert.match(attributes, /evidence\/\*\* -text/);
  assert.match(attributes, /evidence\/\*\.tap\.txt -whitespace/);
  assert.equal(json('evidence\\publication-encoding-attempt.json').exitCode, 1);
  assert.match(read('evidence\\publication-encoding-attempt.txt'), /source must already match LF checkout bytes/);
  assert.match(read('evidence\\publication-attributes-before.source.txt'), /\* text eol=lf/);
  assert.equal(evidence.nativeProof, false);
  assert.equal(evidence.parentComplete, false);
  assert.equal(evidence.kanoUnit, 'A-S014');
  assert.equal(evidence.workerCanAccept, false);
});

test('every existing captured stage retains its exact original stdout and stderr bytes', () => {
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence'))) {
    if (!name.endsWith('.json')) continue;
    const record = json(`evidence\\${name}`);
    if (typeof record.stage !== 'string') continue;
    assert.equal(record.stdoutSha256, fileHash(`evidence\\${record.stage}.tap.txt`), `${record.stage} stdout`);
    assert.equal(record.stderrSha256, fileHash(`evidence\\${record.stage}.stderr.txt`), `${record.stage} stderr`);
  }
});
