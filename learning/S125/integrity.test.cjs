'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
const read = (relative) => fs.readFileSync(path.join(__dirname, relative), 'utf8');
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const blobOid = (bytes) => digest(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1');
function verifyBytes(entry, bytes) {
  const rawDigest = digest(bytes);
  const canonicalLf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  assert.equal(digest(canonicalLf), entry.canonicalLfSha256, `Canonical LF: ${entry.path}`);
  if (entry.gitTextMode === 'raw') {
    assert.equal(rawDigest, entry.rawSha256, `Preserved raw bytes: ${entry.path}`);
  } else {
    assert.equal(rawDigest === entry.rawSha256 || rawDigest === entry.canonicalLfSha256, true,
      `Text must match the measured working-tree snapshot or its published LF bytes: ${entry.path}`);
  }
  assert.equal(blobOid(entry.gitTextMode === 'raw' ? bytes : canonicalLf), entry.canonicalGitBlobOid,
    `Canonical Git object: ${entry.path}`);
}

test('exact S125 source acceptance, portable unit and packet remain distinct from native proof', () => {
  assert.equal(manifest.id, 'A-S125');
  assert.equal(manifest.sourceId, 'S125');
  assert.equal(manifest.parentId, 'D-S125');
  assert.equal(manifest.packet, 'SC-S125');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S125');
  assert.equal(manifest.objective, 'Update a single ACA revision; the old revision remains until candidate readiness.');
  assert.equal(manifest.sourceContract.acceptance, 'Old revision routing persists until native readiness permits replacement; active-work/state outcomes are independently verified.');
  assert.equal(manifest.mode, 'portable-synthetic');
  for (const field of ['accepted', 'nativeProofComplete', 'sourceParentComplete']) assert.equal(manifest[field], false);
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.equal(source.includes('| S125 | **Container Apps, single revision:** Verify readiness-gated replacement and user continuity beyond the routing switch itself. |'), true);
  assert.equal(backlog.includes('| D-S125 | P0 | Add a Container Apps single-revision preset with failed/successful candidate readiness. | Old revision routing persists until native readiness permits replacement; active-work/state outcomes are independently verified. | P002 |'), true);
  assert.equal(kanban.includes('| A-S125 | D-S125 | S | Update a single ACA revision; the old revision remains until candidate readiness. | SOURCE |'), true);
  assert.equal(kanban.includes('| B-S125 | D-S125 | S | Conduct one single-revision update; verify actual readiness gating and active-work outcomes. | CORE, DATA, ACA, C069 |'), true);
  assert.equal(manifest.sourceContract.nativeEntryGate, 'CORE, DATA, ACA, C069');
});

test('documented constraints and lesson boundaries are explicit rather than invented platform observations', () => {
  assert.equal(manifest.documentedConstraints.reference, 'https://learn.microsoft.com/en-us/azure/container-apps/revisions');
  assert.equal(manifest.documentedConstraints.readiness.length, 3);
  assert.match(manifest.documentedConstraints.singleRevision, /100% until then/);
  assert.match(manifest.documentedConstraints.qualification, /not compute-capacity scaling/);
  const documentation = read('README.txt');
  for (const claim of [
    'DATA ONLY', 'ALL replicas', 'Nominal', 'Native ACA', 'Node',
    'Parent alone accepts A-S125 once', 'zero extra', 'C005-C008',
    'known context/page/cleanup lifecycle limitations', 'N/A',
  ]) assert.equal(documentation.toLowerCase().includes(claim.toLowerCase()), true, claim);
  assert.match(manifest.verification.iac, /^N\/A/);
  assert.equal(manifest.limits.some((limit) => limit.includes('inactive recovery prototype remains unqualified')), true);
});

test('standalone HTML and runtime scripts have narrow CSP and no live network/storage/control behavior', () => {
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
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|\beval\s*\(|innerHTML|\bsetTimeout\s*\(|Math\.random|Date\.now/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(html, /role="alert"/);
  assert.match(html, /role="status"/);
  assert.equal(html.includes('evidence/csp-probe.js'), false);
});

test('RED is an actual assertion with preserved loadable bytes outside autodiscovery', () => {
  const raw = read(path.join('evidence', 'raw', 'red.stdout.tap'));
  assert.match(raw, /not ok 1/);
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /awaiting-readiness/);
  assert.match(raw, /baseline/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|ENOENT/);
  const summary = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.errorCode, 'ERR_ASSERTION');
  assert.equal(summary.extraKanoCredits, 0);
  assert.match(summary.iac, /^N\/A evaluated after genuine RED/);
  const observed = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(observed.phaseAfterKeyboardUpdate, 'baseline');
  assert.equal(observed.awaitedCleanupCompleted, true);
  assert.equal(observed.browser, '156.0.4314.50');
  assert.equal(observed.node, 'v22.23.4');
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.execute(stub.createState(), { type: 'update', fixture: 'ready', version: 'v2' }).phase, 'baseline');
  assert.equal(read(path.join('evidence', 'red-stub', 'assertions.cjs')).includes("assert.equal(state.phase, 'awaiting-readiness')"), true);
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence', 'red-stub'))) {
    assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  }
  assert.equal(read('single-revision.feature').includes('Feature: A single-revision update'), true);
});

test('published helper and capture contract are pinned; normal verification cannot rewrite proof', () => {
  const helperBytes = fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(digest(helperBytes), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browserTest = read('browser.test.cjs');
  assert.match(browserTest, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browserTest, /flag: 'wx'/);
  assert.match(browserTest, /finally \{\s+await session\.close\(\)/);
  assert.match(browserTest, /assert\.deepEqual\(after, before/);
  assert.equal(manifest.verification.command, 'node --test learning\\S125\\model.test.cjs learning\\S125\\integrity.test.cjs learning\\S125\\browser.test.cjs');
});

test('raw byte, canonical LF and canonical Git identities stay separate and verification is read-only', () => {
  const attributes = read('.gitattributes');
  assert.equal(attributes.replace(/\r\n/g, '\n'), '* text eol=lf\nevidence/raw/** -text -diff\nevidence/red-stub/** -text -diff\n');
  const ledger = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(ledger.schemaVersion, 1);
  assert.equal(ledger.scope, 'learning\\S125');
  assert.equal(ledger.objectFormat, 'sha1');
  assert.equal(ledger.files.length > 20, true);
  const seen = new Set();
  for (const entry of ledger.files) {
    assert.equal(typeof entry.path, 'string');
    assert.equal(path.isAbsolute(entry.path), false);
    assert.equal(entry.path.split(path.sep).includes('..'), false);
    assert.equal(seen.has(entry.path), false);
    seen.add(entry.path);
    const bytes = fs.readFileSync(path.join(__dirname, entry.path));
    const raw = entry.path.startsWith(`evidence${path.sep}raw${path.sep}`)
      || entry.path.startsWith(`evidence${path.sep}red-stub${path.sep}`);
    assert.equal(entry.gitTextMode, raw ? 'raw' : 'lf');
    verifyBytes(entry, bytes);
  }
  for (const file of [
    '.gitattributes', 'index.html', 'model.js', 'app.js', 'lesson.css', 'manifest.json',
    'README.txt', 'single-revision.feature', 'model.test.cjs', 'integrity.test.cjs', 'browser.test.cjs',
    path.join('evidence', 'csp-probe.js'), path.join('evidence', 'missing-model.html'),
    path.join('evidence', 'red-stub', 'assertions.cjs'), path.join('evidence', 'raw', 'red.stdout.tap'),
  ]) assert.equal(seen.has(file), true, `Missing integrity entry: ${file}`);
});

test('published LF text remains portable while preserved raw CRLF proof is byte-exact', () => {
  const ledger = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  for (const entry of ledger.files) {
    const bytes = fs.readFileSync(path.join(__dirname, entry.path));
    const lf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    if (entry.gitTextMode === 'lf') {
      verifyBytes(entry, lf);
      assert.throws(() => verifyBytes(entry, Buffer.concat([lf, Buffer.from('changed')])), assert.AssertionError);
    } else if (digest(bytes) !== digest(lf)) {
      assert.throws(() => verifyBytes(entry, lf), assert.AssertionError);
    }
  }
});
