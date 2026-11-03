'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');

const lesson = path.resolve(__dirname, '..');
const root = path.resolve(lesson, '..', '..');
const evidence = path.join(lesson, 'evidence');
const read = (relative) => fs.readFileSync(path.join(lesson, relative), 'utf8');
const json = (relative) => JSON.parse(read(relative));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const manifest = json('evidence.json');
const captureRecords = () => fs.readdirSync(evidence)
  .filter((name) => /^[a-z][a-z0-9-]*-\d{3}\.json$/.test(name))
  .map((name) => ({ name, record: json(path.join('evidence', name)) }))
  .filter(({ record }) => typeof record.stage === 'string');
const successful = (stage) => captureRecords()
  .filter(({ record }) => record.stage === stage && record.exitCode === 0)
  .sort((a, b) => a.name.localeCompare(b.name)).at(-1);

test('portable surface preserves the precise source contract, limits and local-only CSP', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.equal(manifest.cardId, 'A-S027');
  assert.deepEqual(manifest.parents, ['D-S027']);
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S027');
  assert.equal(manifest.packet, 'SC-S027');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['probe.js', 'app.js']);
  assert.doesNotMatch(html, /\bon\w+\s*=|\b(?:id|name)="reset"/i);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "object-src 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.match(html, /original status 200 AND a matching business payload/);
  assert.match(html, /profileId: "training-profile"/);
  assert.match(html, /UNMEASURED, zero attempts/);
  assert.match(html, /Microsoft Open Source Disclaimer/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(app, /innerHTML|fetch\(|XMLHttpRequest|localStorage|sessionStorage/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.deepEqual(require('../probe.js').LIMITS, { runs: 8, revisions: 32 });
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.equal(manifest.parentComplete, false);
  assert.deepEqual(manifest.refinement.remainingLocalToDo, []);
});

test('preserved behavioral RED is an importable stub with twenty real assertion failures', () => {
  const red = json('evidence\\red-001.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.runtime, 'v22.23.4');
  assert.equal(red.launchError, null);
  assert.equal((red.stdout.utf8.match(/code: 'ERR_ASSERTION'/g) || []).length, 20);
  assert.match(red.stdout.utf8, /# tests 20/);
  assert.match(red.stdout.utf8, /# pass 0/);
  assert.match(red.stdout.utf8, /# fail 20/);
  assert.doesNotMatch(red.stdout.utf8 + red.stderr.utf8, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
  assert.equal(red.snapshots.length, 3);
  for (const snapshot of red.snapshots) {
    assert.ok(snapshot.file.endsWith('.snapshot.txt'));
    const bytes = fs.readFileSync(path.join(evidence, snapshot.file));
    assert.equal(digest(bytes), snapshot.sha256);
    const original = red.inputs.find((input) => input.path === path.join('learning', 'S027', snapshot.source));
    assert.equal(original.sha256, snapshot.sha256);
  }
  const stub = red.snapshots.find((snapshot) => snapshot.source === 'probe.js');
  const context = { module: { exports: {} } };
  new vm.Script(fs.readFileSync(path.join(evidence, stub.file), 'utf8')).runInNewContext(context);
  assert.equal(typeof context.module.exports.conduct, 'function');
  assert.equal(context.module.exports.evaluate({ fixture: 'error-500', prediction: 'HOLD' }).decision, 'ADMIT');
  const iac = json('evidence\\iac-na.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.cloudCalls, 0);
  assert.match(iac.stage, /After preserved behavioral RED, before implementation/);
});

test('raw captures retain lossless runner bytes and explicit provenance', () => {
  const captures = captureRecords();
  assert.ok(captures.length >= 2);
  for (const { name, record } of captures) {
    assert.equal(record.cardId, 'A-S027', name);
    assert.equal(record.packet, 'SC-S027', name);
    assert.equal(record.mode, 'synthetic', name);
    assert.ok(Array.isArray(record.command.argv) && record.command.argv.length > 0, name);
    assert.match(record.gitHeadBefore, /^[a-f0-9]{40}$/);
    assert.ok(Date.parse(record.startedAtUtc) <= Date.parse(record.completedAtUtc), name);
    assert.equal(record.launchError, null, name);
    assert.ok(Number.isInteger(record.exitCode), name);
    for (const stream of ['stdout', 'stderr']) {
      const bytes = Buffer.from(record[stream].base64, 'base64');
      assert.equal(bytes.toString('utf8'), record[stream].utf8, name);
      assert.equal(digest(bytes), record[stream].sha256, name);
      const rawFile = name.replace(/\.json$/, `.${stream}.txt`);
      assert.deepEqual(fs.readFileSync(path.join(evidence, rawFile)), bytes, name);
    }
    assert.equal(record.helperSha256, manifest.browser.helperSha256, name);
    for (const input of record.inputs) {
      assert.ok(input.path.startsWith('learning\\S027\\'), name);
      assert.match(input.sha256, /^[a-f0-9]{64}$/);
    }
  }
  assert.match(read('tests\\capture.cjs'), /CAPTURE_BROWSER_EVIDENCE !== '1'/);
  assert.match(read('tests\\browser.test.cjs'), /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(read('tests\\capture.cjs'), /flag: 'wx'/);
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* -text whitespace=.*cr-at-eol/m);
  assert.match(attributes, /^evidence\/\*\.stdout\.txt -whitespace/m);
  assert.match(attributes, /^evidence\/\*\.stderr\.txt -whitespace/m);
});

test('qualified helper and signed offline tooling have exact captured provenance', () => {
  const helper = fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(digest(helper), manifest.browser.helperSha256);
  assert.equal(manifest.browser.helperPublishedCommit, '53c0c0d');
  const tooling = successful('tooling');
  assert.ok(tooling, 'Run the deliberate existing-tooling capture first.');
  const observed = JSON.parse(tooling.record.stdout.utf8);
  assert.equal(observed.node, 'v22.23.4');
  assert.equal(observed.playwrightVersion, '1.56.1');
  assert.equal(observed.edge.version, '156.0.4314.50');
  assert.equal(observed.edge.status, 'Valid');
  assert.match(observed.edge.signer, /CN=Microsoft Corporation/);
  assert.equal(observed.helperSha256, manifest.browser.helperSha256);
  assert.deepEqual(observed.packet.map((card) => card.id), ['A-S027', 'B-S027']);
  assert.equal(observed.source[0].exactRows.length, 1);
  assert.match(observed.source[0].exactRows[0], /False-positive health response/);
  assert.match(observed.source[1].exactRows[0], /Strict status and business assertions/);
  const browserTest = read('tests\\browser.test.cjs');
  assert.match(browserTest, /openIsolatedLesson\('learning\\\\S027\\\\index\.html'\)/);
  assert.match(browserTest, /finally \{[\s\S]*await session\.close\(\)/);
  assert.equal(observed.installedOrDownloaded, false);
});

test('captured browser proves actual DOM, keyboard, errors, reset and CSP cleanup', () => {
  const browser = json(manifest.browser.observations);
  assert.equal(browser.verifier, 'PASS');
  assert.equal(browser.helperSha256, manifest.browser.helperSha256);
  assert.equal(browser.browserVersion, '156.0.4314.50');
  assert.equal(browser.checks.length, 12);
  assert.ok(browser.checks.every((check) => check.verifier === 'PASS'));
  assert.equal(browser.cleanup, 'AWAITED_CLOSE_RESOLVED');
  assert.deepEqual(browser.pageErrors, []);
  assert.equal(browser.nonFileRequestsReachedGuard, 0);
  const csp = browser.checks.find((check) => check.name.startsWith('actual CSP')).observed;
  assert.equal(csp.inlineRan, false);
  assert.equal(csp.handlerRan, false);
  assert.equal(csp.connection, 'TypeError');
  assert.equal(csp.nonFileRequestsReachedGuard, 0);
  const captured = captureRecords().find(({ record }) => record.stage === 'browser' && record.exitCode === 0
    && Date.parse(record.startedAtUtc) <= Date.parse(browser.startedAtUtc)
    && Date.parse(browser.completedAtUtc) <= Date.parse(record.completedAtUtc));
  assert.ok(captured);
  for (const relative of ['app.js', 'probe.js', 'index.html', 'styles.css']) {
    const source = captured.record.inputs.find((input) => input.path === path.join('learning', 'S027', relative));
    assert.equal(digest(fs.readFileSync(path.join(lesson, relative))), source.sha256, relative);
  }
  assert.match(captured.record.stdout.utf8, /# tests 13/);
  assert.match(captured.record.stdout.utf8, /# fail 0/);
});

test('final source digests match deliberately captured qualification without modifying proof', () => {
  const qualified = successful('qualification');
  assert.ok(qualified, 'Capture final model/syntax qualification before complete integrity verification.');
  assert.ok(qualified.record.inputs.length >= 12);
  function sourceFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.name !== 'evidence')
      .flatMap((entry) => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? sourceFiles(absolute) : [path.relative(root, absolute)];
      });
  }
  assert.deepEqual(qualified.record.inputs.map((input) => input.path).sort(), sourceFiles(lesson).sort());
  for (const input of qualified.record.inputs) {
    const absolute = path.resolve(root, input.path);
    assert.ok(absolute.startsWith(`${lesson}${path.sep}`), input.path);
    const bytes = fs.readFileSync(absolute);
    assert.equal(bytes.length, input.bytes, input.path);
    assert.equal(digest(bytes), input.sha256, input.path);
  }
  assert.match(qualified.record.stdout.utf8, /# tests 28/);
  assert.match(qualified.record.stdout.utf8, /# fail 0/);
});
