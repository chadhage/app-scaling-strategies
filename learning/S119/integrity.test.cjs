'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const model = require('./model.js');

const read = (...parts) => fs.readFileSync(path.join(__dirname, ...parts));
const json = (...parts) => JSON.parse(read(...parts));
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('exact source acceptance, frozen unit, DATA-only boundaries and IaC N/A are declared', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.id, 'A-S119');
  assert.equal(manifest.parentId, 'D-S119');
  assert.equal(manifest.packet, 'SC-S119');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S119');
  assert.equal(manifest.objective, 'Restore a region and fail back; reject return before synchronization/ownership checks.');
  assert.equal(manifest.sourceContract.acceptance, 'Data/ownership gates precede gradual return; users and committed effects survive failback.');
  assert.equal(manifest.banner, model.BANNER);
  assert.equal(manifest.nativeProofComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.accepted, false);
  const iac = json('evidence', 'iac-na.json');
  assert.equal(iac.iac, 'N/A');
  assert.deepEqual(iac.operationsPerformed, []);
  assert.equal(iac.additionalCredits, 0);
  const tooling = json('evidence', 'raw', 'tooling-preflight.json');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /CN=Microsoft Corporation/);
  assert.equal(tooling.nodeVersion, 'v22.23.4');
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.equal(tooling.edgeVersion, '156.0.4314.50');
  assert.equal(tooling.browserHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(tooling.packagesInstalled, false);
  assert.equal(tooling.browserDownloaded, false);
  assert.equal(tooling.unsafeFlagsUsed, false);
  assert.equal(tooling.inactivePrototypeUsed, false);
  const html = read('index.html').toString();
  assert.equal(html.includes(model.BANNER), true);
  assert.match(html, /DATA ONLY/);
  assert.match(html, /fixed fictional teaching observations/);
  assert.match(html, /B-S119 native proof/);
});

test('historical raw RED hashes are exact, loadable and outside automatic test discovery', () => {
  const red = json('evidence', 'raw', 'red-proof.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.stdoutSha256, digest(read('evidence', 'raw', 'red-stdout.txt')));
  assert.equal(red.stderrSha256, digest(read('evidence', 'raw', 'red-stderr.txt')));
  const feature = read('evidence', 'red-stub', 'failback.feature');
  assert.equal(red.featureSha256, digest(feature));
  assert.equal(digest(Buffer.from(feature.toString().replace(/\r\n/g, '\n'))),
    digest(Buffer.from(read('failback.feature').toString().replace(/\r\n/g, '\n'))));
  for (const [file, hash] of Object.entries(red.snapshots)) {
    assert.equal(hash, digest(read('evidence', 'red-stub', file)), `Raw historical ${file} hash`);
    assert.doesNotMatch(file, /(?:^test[.-]|[.-]test[.-]|[.-]spec[.-])/);
  }
  assert.match(read('evidence', 'raw', 'red-stdout.txt').toString(), /AssertionError/);
  assert.match(read('evidence', 'raw', 'red-stdout.txt').toString(), /actual: 'awaiting-restore'/);
  assert.equal(require('./evidence/red-stub/model.js').transition(
    require('./evidence/red-stub/model.js').initialState(), { type: 'restore', fixture: 'aligned' },
  ).phase, 'awaiting-restore');
  const load = json('evidence', 'raw', 'stub-load.json');
  assert.equal(load.observed.afterRestoreClick, 'awaiting-restore');
  assert.equal(load.observed.browserVersion, '156.0.4314.50');
  assert.match(load.cleanup, /completed/);
});

test('canonical source hashes are separate from raw evidence and checked without rewriting', () => {
  const proof = json('evidence', 'source-hashes.json');
  assert.equal(proof.cardId, 'A-S119');
  assert.equal(proof.normalVerification, 'READ-ONLY');
  assert.equal(proof.canonicalPolicy, 'Ordinary source canonical Git LF; working-tree CRLF checked as raw bytes; archived raw proof preserved with -text -eol.');
  for (const [file, expected] of Object.entries(proof.files)) {
    const bytes = read(file);
    const canonical = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
    assert.equal([expected.workingTreeSha256, expected.canonicalGitSha256].includes(digest(bytes)), true,
      `Captured working-tree or canonical checkout source bytes: ${file}`);
    assert.equal(digest(canonical), expected.canonicalGitSha256, `Canonical Git source bytes: ${file}`);
    assert.equal(canonical.includes(13), false, `Canonical Git LF source: ${file}`);
  }
  const attributes = read('.gitattributes').toString();
  assert.match(attributes, /evidence\/raw\/\*\.json -text -eol/);
  assert.match(attributes, /evidence\/red-stub\/\*\.cjs -text -eol/);
  assert.doesNotMatch(attributes, /^\* -text/m);
});

test('production lesson has no live interfaces, unsafe code or evidence capture side effects', () => {
  const production = `${read('model.js')}\n${read('app.js')}`;
  assert.doesNotMatch(production, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|new\s+Function\b/);
  assert.doesNotMatch(production, /\b(?:localStorage|sessionStorage|indexedDB|sendBeacon)\b|innerHTML|document\.write/);
  const html = read('index.html').toString();
  assert.match(html, /default-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\/|<script[^>]*>[^<\s]/);
  assert.doesNotMatch(html, /csp-probe\.js/);
  assert.match(read('app.js').toString(), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  const browser = read('browser.test.cjs').toString();
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /finally \{\s*await session\.close\(\)/);
  assert.doesNotMatch(browser, /bypassCSP|--no-sandbox|ignoreHTTPSErrors|openIsolatedLoopback/);
});
