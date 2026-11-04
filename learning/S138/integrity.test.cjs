'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const model = require('./model.js');
const captureEnabled = require('./capture-policy.cjs');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const bytes = name => fs.readFileSync(path.join(__dirname, name));
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(read('manifest.json'));

test('one source-aligned original unit has an objective, preconditions, actions, assertions and honest limits', () => {
  assert.equal(manifest.cardId, 'A-S138');
  assert.equal(manifest.kanoUnit, 'A-S138');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.packet, 'SC-S138');
  assert.equal(manifest.parentId, 'D-S138');
  assert.equal(manifest.sourceId, 'S138');
  assert.equal(manifest.banner, model.BANNER);
  assert.equal(manifest.objective, 'Reuse a pagination cursor after migration; identify unintended missing/duplicate results.');
  assert.deepEqual(manifest.fixtures, model.SCENARIOS.map(item => item.id));
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length >= 3);
  assert.equal(manifest.iac.applicability, 'N/A');
  assert.equal(manifest.iac.generated, false);
  assert.equal(manifest.nativeRemainder.cardId, 'B-S138');
  assert.equal(manifest.nativeRemainder.extraCredits, 0);
  assert.match(read('README.txt'), /parent alone may accept A-S138 once/);
});

test('exact pre-design source rows and portable/packet rules have retained raw and canonical hashes', () => {
  const source = JSON.parse(read(path.join('evidence', 'source.json')));
  assert.equal(source.sourceReadBeforeDesign, true);
  assert.equal(source.snapshots.length, 6);
  for (const snapshot of source.snapshots) {
    const content = bytes(path.join('evidence', 'raw', snapshot.snapshot));
    assert.equal(sha(content), snapshot.snapshotSha256);
    assert.equal(content.includes(Buffer.from('\r\n')), snapshot.crlf);
    assert.match(snapshot.sourceCommit, /^[a-f0-9]{40}$/);
  }
  for (const name of ['readme', 'backlog', 'card-packet']) {
    const raw = read(path.join('evidence', 'raw', `source-${name}.raw.snapshot`));
    const git = read(path.join('evidence', 'raw', `source-${name}.git.snapshot`));
    assert.equal(raw.replace(/\r\n/g, '\n'), git);
  }
  const readme = read(path.join('evidence', 'raw', 'source-readme.git.snapshot'));
  assert.match(readme, /\| S138 \| \*\*Pagination across migration:\*\* Keep cursors valid and avoid unintended missing or duplicate results\./);
  assert.match(readme, /Data freshness, ordering, or consistency outside the declared contract/);
  assert.match(readme, /Unverified or unsupported result/);
  assert.match(read(path.join('evidence', 'raw', 'source-backlog.git.snapshot')), /Cursor\/snapshot semantics avoid unintended missing or duplicate results under the declared contract/);
  const card = read(path.join('evidence', 'raw', 'source-card-packet.git.snapshot'));
  assert.match(card, /\| A-S138 \| D-S138 \| S \| Reuse a pagination cursor after migration/);
  assert.match(card, /### Portable A-card lesson contract/);
  assert.match(card, /every other A\/B card belongs to SC-Snnn/);
  assert.match(read('.gitattributes'), /\*\.snapshot -text/);
  assert.match(read('.gitattributes'), /\*\.log -text/);
  assert.match(read('.gitattributes'), /\*\.cjs\.txt -text/);
});

test('the immutable loadable stub still produces the genuine saved assertion RED', () => {
  const red = JSON.parse(read(path.join('evidence', 'red.json')));
  const stub = bytes(path.join('evidence', 'raw', 'red-stub.cjs.txt'));
  const suite = bytes(path.join('evidence', 'raw', 'red-suite.cjs.txt'));
  const log = bytes(path.join('evidence', 'raw', 'red.log'));
  assert.equal(sha(stub), red.stubSha256);
  assert.equal(sha(suite), red.suiteSha256);
  assert.equal(sha(log), red.rawLogSha256);
  assert.equal(red.exitCode, 1);
  assert.equal(red.loadableStub, true);
  assert.match(log.toString(), /ERR_ASSERTION/);
  assert.match(log.toString(), /actual: 'unknown'/);
  const context = { module: { exports: {} } };
  vm.runInNewContext(stub.toString(), context, { timeout: 1000 });
  let probes = 0;
  vm.runInNewContext(suite.toString(), {
    require(name) {
      if (name === './model.js') return context.module.exports;
      if (name === 'node:assert/strict') return assert;
      if (name === 'node:test') return (_title, callback) => {
        probes++;
        assert.throws(callback, error => error.code === 'ERR_ASSERTION' && error.actual === 'unknown' && error.expected === 'positive');
      };
      throw new Error(`Unexpected red-suite dependency ${name}`);
    },
  }, { timeout: 1000 });
  assert.equal(probes, 1);
  const sequence = JSON.parse(read(path.join('evidence', 'sequence.json')));
  assert.deepEqual(sequence.stages.slice(0, 3).map(stage => stage.stage), ['BDD', 'TDD RED', 'IaC applicability']);
  assert.ok(Date.parse(sequence.stages[2].recordedAtUtc) >= Date.parse(red.recordedAtUtc));
  assert.equal(sequence.stages[2].result, 'N/A');
});

test('the standalone HTML has exact banner, local assets, accessible steps and a restrictive CSP', () => {
  const html = read('index.html');
  assert.equal(html.split(model.BANNER).length - 1, 1);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /role="alert" aria-live="assertive"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /<fieldset id="steps" disabled>/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>|style\s*=/i);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'", "frame-src 'none'"]) {
    assert.ok(csp.includes(directive));
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|\*/);
  const assets = [...html.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(assets, ['lesson.css', 'model.js', 'app.js']);
  assets.forEach(asset => assert.ok(fs.statSync(path.join(__dirname, asset)).isFile()));
  for (const asset of ['.gitattributes', ...assets, 'capture-policy.cjs', 'browser.test.cjs']) {
    assert.equal(bytes(asset).includes(Buffer.from('\r\n')), false, 'active assets are canonical LF; raw proof is separate');
  }
  assert.equal([...html.matchAll(/<button\b/g)].length, [...html.matchAll(/<button type="button"/g)].length);
  assert.deepEqual([...html.matchAll(/<option value="([^"]+)"/g)].map(match => match[1]), manifest.fixtures);
  assert.match(read('lesson.css'), /:focus-visible/);
});

test('browser application code has no network, database, persistence, dynamic HTML or reset shadowing operations', () => {
  const code = read('model.js') + read('app.js');
  assert.doesNotMatch(code, /fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|document\.cookie|localStorage|sessionStorage|eval\s*\(|new\s+Function|\.innerHTML\b|\.reset\s*\(/);
  assert.doesNotMatch(code, /require\s*\(|import\s+|https?:/);
  assert.match(read('app.js'), /textContent/);
  assert.match(read('app.js'), /replaceChildren/);
  assert.match(read('pagination.feature'), /unknown completion/);
});

test('capture permission requires the exact string 1, never truthiness', () => {
  assert.equal(captureEnabled('1'), true);
  for (const value of [undefined, null, '', '0', 'true', '01', '1 ', ' 1', 1, true, false, ['1'], {}]) {
    assert.equal(captureEnabled(value), false);
  }
});

test('only the qualified published isolated browser helper is referenced', () => {
  const helper = path.join(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha(fs.readFileSync(helper)), manifest.evidence.isolatedHelperSha256);
  const browser = read('browser.test.cjs');
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /await session\.close\(\)/);
  assert.match(browser, /finally/);
  assert.match(browser, /captureEnabled\(process\.env\.CAPTURE_BROWSER_EVIDENCE\)/);
  assert.doesNotMatch(browser, /prototype|no-sandbox|bypassCSP:\s*true|chromium\.launch|loopback|browser-queue/);
});

test('preserved browser observations bind the actual assets, honest outcomes, CSP violations and awaited cleanup', () => {
  const report = JSON.parse(read(path.join('evidence', 'browser-acceptance.json')));
  assert.equal(report.cardId, 'A-S138');
  assert.equal(report.capturePermission, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.equal(report.helperSha256, manifest.evidence.isolatedHelperSha256);
  assert.equal(report.playwrightVersion, '1.56.1');
  assert.match(report.browserVersion, /^156\./);
  assert.match(report.nodeVersion, /^v22\./);
  assert.equal(report.observations.length, 13);
  assert.equal(new Set(report.observations.map(item => item.caseId)).size, 13);
  assert.deepEqual(report.pageErrors, []);
  assert.equal(report.networkRequests, 0);
  assert.equal(report.cleanup.awaitedFinallyClose, true);
  for (const [file, digest] of Object.entries(report.implementationHashes)) {
    assert.equal(sha(bytes(file)), digest);
  }
  const unknown = report.observations.find(item => item.caseId === 'unknown-completion');
  assert.match(unknown.outcome, /^UNKNOWN/);
  assert.equal(unknown.missingProfiles, 'Unknown — 2 not yet observed');
  assert.equal(unknown.completion, 'Unknown');
  for (const id of ['accepted-missing', 'accepted-duplicate', 'accepted-reorder', 'changed-schema', 'changed-snapshot', 'rejected-cursor']) {
    assert.match(report.observations.find(item => item.caseId === id).outcome, /^INTERRUPTED/);
  }
  const csp = report.observations.find(item => item.caseId === 'active-csp');
  assert.equal(csp.probe.inlineExecuted, null);
  assert.equal(csp.probe.dataConnection, 'TypeError');
  assert.ok(csp.probe.violations.some(item => item.directive === 'connect-src'));
  assert.match(report.observations.find(item => item.caseId === 'model-script-unavailable').error, /unavailable/);
});
