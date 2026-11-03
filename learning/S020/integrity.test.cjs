'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const helperSha = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('manifest preserves the exact source, original single S unit, packet and honest lesson contract', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S020');
  assert.equal(manifest.kanoUnit, 'A-S020');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.parent, 'D-S020');
  assert.equal(manifest.packet, 'SC-S020');
  assert.equal(manifest.authorization, 'local-synthetic-only');
  assert.equal(manifest.mode, 'synthetic-only');
  assert.equal(manifest.entryPoint, 'learning\\S020\\index.html');
  for (const key of ['objective', 'preconditions', 'actions', 'syntheticInputTrace', 'expectedAssertions', 'limits']) {
    assert.ok(manifest[key] && (typeof manifest[key] !== 'object' || Object.keys(manifest[key]).length));
  }
  assert.deepEqual([manifest.nativeProof, manifest.productionNode24Validated, manifest.parentComplete], [false, false, false]);
  assert.equal(manifest.testTooling.helperSha256, helperSha);
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'README.md'), 'utf8');
  const row = source.split(/\r?\n/).find((line) => line.startsWith('| S020 |'));
  assert.ok(row.includes(manifest.sourceText), 'Trace the exact source behavior, not a guessed title');
  const proof = json('evidence.json');
  assert.equal(proof.additionalKanoCredits, 0);
  assert.equal(proof.acceptedAtUtc, null);
});

test('local asset/CSP/keyboard/reset surface has no inline behavior, external dependencies or unsafe reset names', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "frame-src 'none'",
    "img-src 'none'", "object-src 'none'", "worker-src 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|on(?:click|load|submit|error)\s*=|\b(?:id|name)="reset"/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['model.js', 'lesson.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.doesNotMatch(html, /(?:src|href)="(?:https?:|\/\/|data:)/i);
  for (const script of ['model.js', 'lesson.js']) {
    assert.doesNotMatch(read(script), /\b(?:fetch|XMLHttpRequest|WebSocket|eval|setInterval|setTimeout)\s*\(|innerHTML|localStorage|sessionStorage/);
  }
  assert.match(read('lesson.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible/);
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(read('.gitattributes'), /^\* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/m);
  assert.match(read('.gitattributes'), /^evidence\/\*\* binary/m);
});

test('original RED is a loadable stub with a numeric behavioral assertion failure and non-discovered snapshots', () => {
  const red = json(path.join('evidence', 'red.json'));
  const stub = read(path.join('evidence', red.stub));
  const spec = read(path.join('evidence', red.spec));
  const stdout = read(path.join('evidence', red.stdout));
  const stderr = read(path.join('evidence', red.stderr));
  assert.equal(red.exitCode, 1);
  assert.equal(red.stubLoadable, true);
  assert.equal(red.stubSyntaxExitCode, 0);
  assert.equal(red.errorCode, 'ERR_ASSERTION');
  assert.match(stdout, /2 !== 4/);
  assert.match(stdout, /Exhaustion must consume/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(sha(stub), red.stubSha256);
  assert.equal(sha(spec), red.specSha256);
  assert.equal(sha(stdout), red.stdoutSha256);
  assert.equal(sha(stderr), red.stderrSha256);
  assert.equal(sha(read('capacity-exhaustion.feature')), red.featureSha256);
  assert.ok(red.stub.endsWith('.txt') && red.spec.endsWith('.txt'));
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(stub, sandbox, { timeout: 1000 });
  const api = sandbox.module.exports;
  const exhausted = api.act(api.createRun({ allowance: 4, extraUnits: 1, budgetMs: 250 }), 'exhaust');
  assert.equal(exhausted.allocatedTotal, 2, 'The preserved pre-implementation behavior still reproduces RED');
  assert.throws(() => assert.equal(exhausted.allocatedTotal, 4), { code: 'ERR_ASSERTION' });
  const iac = json(path.join('evidence', 'iac-na.json'));
  assert.equal(iac.applicable, false);
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.equal(fs.readdirSync(path.join(__dirname, 'evidence')).filter((name) => /\.test\.cjs$/.test(name)).length, 0);
});

test('only the published helper and existing signed offline tooling qualify these browser observations', () => {
  const tooling = json(path.join('evidence', 'tooling.json'));
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.match(tooling.browserVersion, /^156\./);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.equal(tooling.helperSha256, helperSha);
  assert.equal(tooling.helperPublishedCommit, '53c0c0d');
  assert.deepEqual([tooling.downloads, tooling.unsafeFlags, tooling.foregroundLease], [false, false, false]);
  assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs'))), helperSha);
  const browserTest = read('browser.test.cjs');
  assert.match(browserTest, /openIsolatedLesson\('learning\\\\S020\\\\index\.html'\)/);
  assert.match(browserTest, /finally \{\s+await isolated\.close\(\)/);
  assert.doesNotMatch(browserTest, /openIsolatedLoopback|lifecycle|--no-sandbox|ignoreHTTPSErrors|bypassCSP/);
});

test('captured green, syntax and browser logs retain raw hashes, exact commands and current source provenance', () => {
  const records = fs.readdirSync(path.join(__dirname, 'evidence'))
    .filter((name) => /^(?:green|syntax|browser|integrity)-\d+\.json$/.test(name));
  for (const stage of ['green', 'syntax', 'browser']) assert.ok(records.includes(`${stage}-1.json`));
  const latest = {};
  for (const name of records) {
    const record = json(path.join('evidence', name));
    assert.equal(record.cardId, 'A-S020');
    assert.equal(record.node, 'v22.23.4');
    assert.equal(record.captureWasExplicit, true);
    assert.equal(sha(read(path.join('evidence', record.stdout))), record.stdoutSha256);
    assert.equal(sha(read(path.join('evidence', record.stderr))), record.stderrSha256);
    for (const command of record.commands) assert.ok(Array.isArray(command.command) && command.command.length >= 3);
    const number = Number(name.match(/-(\d+)\.json$/)[1]);
    if (!latest[record.stage] || number > latest[record.stage].number) latest[record.stage] = { record, number, name };
  }
  for (const stage of ['green', 'syntax', 'browser']) {
    const { record, name } = latest[stage];
    assert.equal(record.passed, true, `The newest ${stage} capture must pass; earlier captures remain historical`);
    assert.ok(record.commands.every((command) => command.exitCode === 0 && !command.error));
    for (const [source, hash] of Object.entries(record.sourceHashes)) {
      assert.equal(sha(fs.readFileSync(path.join(__dirname, source))), hash, `${name}: current ${source} matches captured source`);
    }
  }
});

test('recorded browser checks observed actual errors, keyboard/reset, failure/unknown history and CSP with awaited cleanup', () => {
  const latest = fs.readdirSync(path.join(__dirname, 'evidence'))
    .filter((name) => /^browser-\d+\.json$/.test(name))
    .sort((a, b) => Number(b.match(/-(\d+)\.json$/)[1]) - Number(a.match(/-(\d+)\.json$/)[1]))[0];
  const capture = json(path.join('evidence', latest));
  assert.equal(capture.passed, true);
  const proof = json(path.join('evidence', capture.observations));
  assert.equal(proof.playwright, '1.56.1');
  assert.equal(proof.helperSha256, helperSha);
  assert.equal(proof.observations.length, 4);
  assert.ok(proof.observations.every((record) => record.passed && record.cleanup === 'awaited isolated.close() completed'));
  const byName = Object.fromEntries(proof.observations.map((record) => [record.scenario, record]));
  assert.equal(byName['keyboard-safety-and-reset'].observedBeforeReset.verdict, 'PASS');
  assert.equal(byName['input-state-and-bounds'].invalidInputCases, 5);
  assert.equal(byName['failure-unknown-retention-and-pruning'].retainedRecovery.failedRun.verdict, 'FAIL');
  assert.equal(byName['failure-unknown-retention-and-pruning'].retainedRecovery.missingRun.verdict, 'UNKNOWN');
  const csp = byName['csp-runtime-enforcement'].csp;
  assert.deepEqual([csp.inlineRan, csp.evalRan, csp.imageLoaded], [false, false, false]);
  assert.equal(csp.navigationUnchanged, true);
  const directives = new Set(csp.violations.map((entry) => entry.directive));
  for (const directive of ['script-src-elem', 'script-src', 'connect-src', 'img-src', 'frame-src', 'base-uri', 'form-action']) {
    assert.ok(directives.has(directive), `${directive} was enforced by the actual browser`);
  }
});
