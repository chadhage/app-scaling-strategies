'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { files, lesson, sha256 } = require('.\\proof.cjs');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const approvedHelperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';

test('manifest preserves the exact single-card scope, banner, operating envelope and limits', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.id, 'A-S034');
  assert.equal(manifest.sourceId, 'S034');
  assert.equal(manifest.parentId, 'D-S034');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S034');
  assert.equal(manifest.packet, 'SC-S034');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.iac, 'not-applicable');
  assert.deepEqual(manifest.bounds, { profiles: [1, 8], journeysPerProfile: 2, maxJourneysPerRun: 16, maxHistory: 8, missingObservations: 1, networkCalls: 0 });
  assert.ok(manifest.preconditions.length && manifest.actions.length && manifest.assertions.length && manifest.limits.length);
  assert.ok(read('index.html').includes(manifest.banner));
});

test('HTML uses external local assets, restrictive CSP, unique controls and accessible results', () => {
  const html = read('index.html');
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(policy);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(policy.includes(directive), directive);
  }
  assert.doesNotMatch(policy, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+=["']|<script(?![^>]*\bsrc=)[^>]*>|style=/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['rotation.js', 'app.js']);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /id="summary" role="status"/);
  for (const control of ['credential', 'rotation', 'profiles', 'observation']) assert.ok(html.includes(`for="${control}"`));
  for (const asset of ['rotation.js', 'app.js', 'styles.css']) assert.ok(fs.existsSync(path.join(lesson, asset)));
  const runtime = `${read('rotation.js')}\n${read('app.js')}`;
  assert.doesNotMatch(runtime, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|eval)\s*[.(]|document\.cookie|innerHTML|new Function|form\.reset\s*\(/);
  assert.match(read('app.js'), /textContent/);
});

test('historical RED is assertion-based, loadable and non-auto-discovered; IaC N/A follows it', () => {
  const source = json('evidence\\source-contract-001.json');
  assert.match(source.source, /^\| S034 \| \*\*Authentication-key continuity:/);
  assert.match(source.backlog, /^\| D-S034 \| P0 \| Add compatible\/incompatible cookie\/token-key rotation across v1\/v2/);
  assert.match(source.atomicCard, /authentication failures cannot be reclassified as migration success/);
  assert.match(source.portableContract, /standalone, browser-openable lesson bundle/);
  assert.equal(source.card.packet, 'SC-S034');
  assert.equal(source.claim.owner, 'worker-A-S034');
  const red = json('evidence\\red-001.json');
  assert.equal(red.exitCode, 1);
  const stdout = read(`evidence\\${red.stdout}`);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /compatible key overlap must preserve authentication across v1\/v2/);
  assert.match(stdout, /actual: 'unknown'/);
  assert.match(stdout, /expected: 'success'/);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError/);
  for (const sourceFile of red.sources) {
    const snapshot = `evidence\\red-${sourceFile.path.replaceAll('\\', '-')}.snapshot.txt`;
    assert.equal(sha256(fs.readFileSync(path.join(lesson, snapshot))), sourceFile.sha256, snapshot);
  }
  assert.ok(files(path.join(lesson, 'evidence')).filter((file) => file.includes('snapshot')).every((file) => file.endsWith('.snapshot.txt')));
  const iac = json('evidence\\iac-n-a-001.json');
  assert.equal(iac.applicable, false);
  assert.equal(iac.outcome, 'not-applicable');
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(red.startedAtUtc) >= Date.parse(source.capturedAtUtc));
});

test('retained raw command reports have intact stdout/stderr hashes and honest exit codes', () => {
  assert.equal(read('.gitattributes').replaceAll('\r\n', '\n'),
    '* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol\nevidence/** -diff\n');
  const evidence = json('evidence.json');
  const failedAttempts = new Set(evidence.failedAttempts.map((attempt) => path.basename(attempt.record)));
  const reports = files(path.join(lesson, 'evidence')).filter((file) => file.endsWith('.json'))
    .map((file) => ({ file, report: JSON.parse(fs.readFileSync(file, 'utf8')) }))
    .filter(({ report }) => Object.hasOwn(report, 'stdoutSha256'));
  assert.ok(reports.length >= 1);
  for (const { file, report } of reports) {
    assert.equal(report.cardId, 'A-S034');
    assert.equal(report.workerId, 'worker-A-S034');
    assert.equal(report.stdoutSha256, sha256(Buffer.from(read(`evidence\\${report.stdout}`))));
    assert.equal(report.stderrSha256, sha256(Buffer.from(read(`evidence\\${report.stderr}`))));
    assert.ok(Array.isArray(report.command) && report.command.length > 1);
    assert.ok(report.sources.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)));
    assert.equal(report.exitCode, report.stage === 'red' || failedAttempts.has(path.basename(file)) ? 1 : 0, path.basename(file));
  }
  assert.equal(evidence.acceptance, 'pending-parent-review');
  for (const file of evidence.records) assert.ok(fs.existsSync(path.join(lesson, file)), file);
  for (const attempt of evidence.failedAttempts) {
    const report = json(attempt.record);
    assert.equal(report.exitCode, 1);
    assert.ok(attempt.reason.length > 10);
    const source = report.sources.find((entry) => entry.path === 'tests\\browser.test.cjs');
    assert.equal(sha256(fs.readFileSync(path.join(lesson, attempt.snapshot))), source.sha256);
  }
});

test('only the authorized published browser helper and approved offline package are selected', () => {
  const helper = path.resolve(lesson, '..', '..', 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha256(fs.readFileSync(helper)), approvedHelperHash);
  const testSource = read('tests\\browser.test.cjs');
  assert.match(testSource, /openIsolatedLesson\('learning\\\\S034\\\\index\.html'\)/);
  assert.match(testSource, /finally\s*\{\s*await session\.close\(\)/);
  assert.doesNotMatch(testSource, /chromium\.launch|browserType\.launch|launchPersistentContext|--no-sandbox|ignoreHTTPSErrors|bypassCSP:\s*true|prototype|openIsolatedLoopback/);
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(lesson, '..', '..', 'testing', 'browser', 'package.json'), 'utf8'));
  assert.equal(packageJson.devDependencies.playwright, '1.56.1');
});

test('selected actual browser proof is complete, signed-tooling attributed and not a native certification', () => {
  const { verifiedBrowser } = json('evidence.json');
  const command = json(verifiedBrowser.commandReport);
  const observation = json(verifiedBrowser.observation);
  const environment = json(verifiedBrowser.environment);
  assert.equal(command.stage, 'browser');
  assert.equal(command.exitCode, 0);
  assert.equal(command.browserEvidenceCapture, true);
  assert.equal(command.observation, path.basename(verifiedBrowser.observation));
  assert.equal(observation.result, 'pass');
  assert.equal(observation.mode, 'actual-browser-synthetic-lesson');
  assert.equal(observation.checks.length, 8);
  assert.deepEqual(observation.pageErrors, []);
  assert.deepEqual(observation.networkAttempts, []);
  assert.equal(observation.helperSha256, approvedHelperHash);
  assert.equal(observation.playwrightVersion, '1.56.1');
  assert.equal(observation.node, 'v22.23.4');
  assert.match(observation.browserVersion, /^156\./);
  assert.equal(environment.signatureStatus, 'Valid');
  assert.match(environment.signerSubject, /Microsoft Corporation/);
  assert.equal(environment.productVersion, observation.browserVersion);
  assert.equal(environment.helperSha256, approvedHelperHash);
  assert.equal(environment.helperCommit, verifiedBrowser.helperCommit);
  assert.match(observation.cleanup, /awaited session\.close\(\) in finally completed/);
  for (const directive of ['script-src-elem', 'connect-src', 'object-src']) {
    assert.ok(observation.observed.cspViolations.some((entry) => entry.directive === directive), directive);
  }
  assert.match(observation.limits, /No native Azure, real authentication, production Node.js 24 or source-parent certification/);
});
