'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const banner = 'Training rehearsal - synthetic data - not a live Azure result';
const html = read('index.html');
const manifest = json('manifest.json');
const sourceFiles = ['rehearsal.js', 'app.js'];

test('manifest preserves exact identity, ownership, Kano, source lineage and synthetic scope', () => {
  assert.equal(manifest.cardId, 'A-S010');
  assert.equal(manifest.parentId, 'D-S010');
  assert.equal(manifest.kanoUnit, 'A-S010');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'LP-LEARN');
  assert.equal(manifest.owner, 'worker-A-S010');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.banner, banner);
  assert.equal(manifest.nativeEvidence, false);
  assert.equal(manifest.managementCalls, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.deepEqual(read('.gitattributes').trim().split(/\r?\n/), [
    '* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol',
    'evidence/*.log whitespace=-blank-at-eol,-blank-at-eof,space-before-tab,cr-at-eol',
  ]);
  assert.equal(read('.gitignore').trim(), 'result.json');
  for (const source of manifest.sources) {
    const text = fs.readFileSync(path.resolve(lesson, source.path), 'utf8');
    assert.ok(text.includes(`| ${source.id} |`), source.id);
  }
});

test('bundle is standalone with only existing owned local scripts/styles and no inline execution', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<p class="training-banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (match[1].startsWith('#')) continue;
    assert.ok(!/^(?:[a-z]+:|[\\/])/i.test(match[1]), match[1]);
    const file = path.resolve(lesson, match[1]);
    assert.ok(file.startsWith(`${lesson}${path.sep}`), match[1]);
    assert.ok(fs.statSync(file).isFile(), match[1]);
  }
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.equal((html.match(/<script src="[^"]+" defer><\/script>/g) || []).length, 2);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|javascript:|<style\b|\bstyle\s*=/i);
});

test('CSP restricts scripts, styles, connections, objects, base and form action without unsafe allowances', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(policy.includes(directive), directive);
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(read('styles.css'), /@import|url\(/i);
});

test('form reset is not shadowed and accessibility structure is explicit', () => {
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /type="reset" id="reset-run" name="resetRun"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1"/);
  assert.match(html, /id="verdict" role="status" aria-live="polite"/);
  for (const match of html.matchAll(/<(?:select|textarea)\b[^>]*id="([^"]+)"/g)) {
    assert.ok(html.includes(`for="${match[1]}"`), match[1]);
  }
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(html, /No deployment migration is claimed/);
  assert.match(html, /Microsoft Open Source Disclaimer/);
});

test('production assets have no management, network, storage, dynamic-code or HTML injection APIs', () => {
  for (const file of sourceFiles) {
    assert.doesNotMatch(read(file),
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|localStorage|sessionStorage|require)\s*[.(]|\bnew\s+Function\b|innerHTML|outerHTML|document\.write|https?:\/\//);
  }
  assert.match(read('app.js'), /textContent/);
  assert.equal(manifest.syntheticInput.maximumEvents, 60);
  assert.equal(manifest.syntheticInput.maximumJsonCharacters, 2000);
});

test('BDD and unchanged logic tests are the actual pre-implementation red inputs', () => {
  const red = json('evidence\\red.json');
  assert.equal(hash(path.join(lesson, 'specification.feature')),
    red.sourceHashes['learning\\S010\\specification.feature']);
  assert.equal(hash(path.join(lesson, 'tests\\logic.test.cjs')),
    red.sourceHashes['learning\\S010\\tests\\logic.test.cjs']);
  const stub = path.join(lesson, 'evidence\\red.stub.cjs');
  assert.equal(hash(stub), red.behavioralRed.snapshotSha256);
  assert.equal(hash(stub), red.sourceHashes['learning\\S010\\rehearsal.js']);
  assert.notEqual(hash(stub), hash(path.join(lesson, 'rehearsal.js')));
  const api = require(stub);
  assert.equal(typeof api.applyEvent, 'function');
  assert.equal(typeof api.snapshot, 'function');
  assert.equal(typeof api.evaluate, 'function');
  assert.deepEqual(api.createRun(), { schemaVersion: 1, events: [] });
  assert.equal(red.behavioralRed.loadableStubSyntaxExitCode, 0);
  assert.equal(red.behavioralRed.actualTestExitCode, 1);
  const raw = read('evidence\\red.log');
  assert.equal((raw.match(/code: 'ERR_ASSERTION'/g) || []).length, 63);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|TypeError/);
  assert.match(raw, /# tests 65\r?\n/);
  assert.match(raw, /# pass 2\r?\n/);
  assert.match(raw, /# fail 63\r?\n/);
});

test('actual chronology is BDD/stub red, resource-free IaC N/A, then implementation green', () => {
  const red = json('evidence\\red.json');
  const iac = json('evidence\\iac-na.json');
  const green = json('evidence\\green.json');
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.generatedIaC, false);
  assert.equal(iac.resourcesCreated, 0);
  assert.ok(Date.parse(iac.recordedAtUtc) > Date.parse(red.finishedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) > Date.parse(iac.recordedAtUtc));
  assert.equal(hash(path.join(lesson, 'evidence\\iac-na.json')),
    green.sourceHashes['learning\\S010\\evidence\\iac-na.json']);
  assert.equal(hash(path.join(lesson, 'rehearsal.js')), green.sourceHashes['learning\\S010\\rehearsal.js']);
  assert.equal(green.commands[0].counts.tests, 65);
  assert.equal(green.commands[0].counts.pass, 65);
  assert.equal(green.commands[0].counts.fail, 0);
});

for (const stage of ['red', 'green', 'browser', 'syntax']) {
  test(`${stage} raw logs have matching hashes, command provenance and genuine exit statuses`, () => {
    const record = json(`evidence\\${stage}.json`);
    assert.equal(record.cardId, 'A-S010');
    assert.equal(record.workerId, 'worker-A-S010');
    assert.equal(record.stageExpectationMet, true);
    assert.equal(record.nodeVersion, process.version);
    assert.equal(record.productionNode24Validated, false);
    assert.match(record.baselineCommit, /^[0-9a-f]{40}$/);
    for (const command of record.commands) {
      assert.equal(hash(path.join(repo, command.rawLog)), command.rawLogSha256);
      assert.equal(command.executable, process.execPath);
      assert.ok(Date.parse(command.finishedAtUtc) >= Date.parse(command.startedAtUtc));
      assert.equal(command.exitCode, stage === 'red' && command.args.includes('--test') ? 1 : 0);
    }
  });
}

test('browser evidence is actual Edge/Playwright DOM, keyboard, guard, reset, CSP and cleanup evidence', () => {
  const browser = json('evidence\\browser-observations.json');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.match(browser.userAgent, /HeadlessChrome|Edg/);
  assert.match(browser.entry, /^file:/);
  assert.equal(browser.cleanup, 'closed in awaited finally');
  assert.equal(browser.leafChecksPassed, 14);
  assert.equal(browser.checks.length, 14);
  assert.ok(browser.checks.every((item) => item.passed));
  assert.equal(browser.finalEvidence.verdict.status, 'PASS');
  assert.equal(browser.finalEvidence.verdict.counts.successful, 12);
  assert.ok(browser.checks.some((item) => item.verdict.status === 'FAIL' && item.verdict.counts.interrupted === 2));
  assert.ok(browser.checks.some((item) => item.verdict.status === 'GUARDED'));
  assert.ok(browser.cspViolations.some((item) => item.directive === 'connect-src'));
  assert.ok(browser.cspViolations.some((item) => /^script-src/.test(item.directive)));
  assert.deepEqual(browser.pageErrors, []);
  assert.ok(browser.requestsAfterLoad.every((url) => !/^https?:/.test(url)));
  assert.equal(hash(path.join(repo, browser.helper)), browser.helperSha256);
  assert.equal(hash(path.join(lesson, 'evidence\\browser.png')), browser.screenshotSha256);
  assert.equal(hash(path.join(lesson, 'evidence\\browser-dom.txt')), browser.domTextSha256);
  assert.equal(fs.readFileSync(path.join(lesson, 'evidence\\browser.png')).subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a');
  assert.ok(read('evidence\\browser-dom.txt').includes(banner));
  assert.match(read('evidence\\browser-dom.txt'), /PASS — Baseline/);
  const record = json('evidence\\browser.json');
  assert.equal(record.commands[0].counts.tests, 15);
  assert.equal(record.commands[0].counts.pass, 15);
  assert.equal(record.sourceHashes['learning\\S010\\tests\\browser.test.cjs'],
    hash(path.join(lesson, 'tests\\browser.test.cjs')));
});

test('syntax evidence covers every executable production/test file with current input hashes', () => {
  const syntax = json('evidence\\syntax.json');
  assert.ok(syntax.commands.length >= 6);
  for (const command of syntax.commands) {
    assert.equal(command.args[0], '--check');
    assert.equal(command.exitCode, 0);
    const file = command.args[1];
    assert.equal(syntax.sourceHashes[file], hash(path.join(repo, file)));
  }
});

test('refinement documents readiness/lineage without admitting extra credit or claiming parent completion', () => {
  const readme = read('README.md');
  assert.match(readme, /B-S010 remains gated by CORE, DATA, HOST/);
  assert.match(readme, /D-S059 is separate/);
  assert.match(readme, /No follow-on card is admitted/);
  assert.match(readme, /Node\.js 24 production support is \*\*unvalidated\*\*/);
});
