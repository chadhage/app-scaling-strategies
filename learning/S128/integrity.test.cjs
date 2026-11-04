'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..', '..');
const raw = path.join(__dirname, 'evidence', 'raw');
const read = (file) => fs.readFileSync(path.join(__dirname, file));
const json = (file) => JSON.parse(read(file));
const sha = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const source = json(path.join('evidence', 'raw', 'source-inputs.json'));
const manifest = json('manifest.json');
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: root });

test('exact original S128 README, D-S128 acceptance, portable card and packet are preserved', () => {
  assert.equal(manifest.id, 'A-S128');
  assert.equal(manifest.sourceId, 'S128');
  assert.equal(manifest.parentId, 'D-S128');
  assert.equal(manifest.packet, 'SC-S128');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S128');
  assert.equal(manifest.originalUnits, 1);
  assert.equal(manifest.sourceContract.readme, source.sourceContract.readme);
  assert.equal(manifest.sourceContract.backlog, source.sourceContract.backlog);
  assert.equal(manifest.sourceContract.portableCard, source.sourceContract.card);
  assert.equal(manifest.sourceContract.nativeSibling, source.sourceContract.sibling);
  assert.equal(manifest.sourceContract.acceptance,
    'Separate Deployments/Services and gateway routes preserve cohorts; no accidental selector mixes GA and preview; user outcomes are verified.');
  for (const kind of ['workingArchive', 'canonicalArchive']) {
    const texts = source.sources.map((record) => zlib.gunzipSync(fs.readFileSync(path.join(raw, record[kind]))).toString());
    assert.ok(texts[0].includes(source.sourceContract.readme));
    assert.ok(texts[1].includes(source.sourceContract.backlog));
    assert.ok(texts[2].includes(source.sourceContract.card));
    assert.ok(texts[2].includes(source.sourceContract.sibling));
    assert.ok(texts[2].includes('### Portable A-card lesson contract'));
    assert.ok(texts[2].includes('Every listed row is one card'));
  }
  assert.equal(manifest.nativeProofComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.productionNode24Validated, false);
  assert.equal(manifest.accepted, false);
});

test('working raw CRLF and canonical Git bytes/blob identities are independently exact', () => {
  for (const record of source.sources) {
    const working = zlib.gunzipSync(fs.readFileSync(path.join(raw, record.workingArchive)));
    const canonical = zlib.gunzipSync(fs.readFileSync(path.join(raw, record.canonicalArchive)));
    assert.equal(working.length, record.workingBytes);
    assert.equal(sha(working), record.workingSha256);
    assert.equal(canonical.length, record.canonicalBytes);
    assert.equal(sha(canonical), record.canonicalSha256);
    assert.equal(sha(Buffer.concat([Buffer.from(`blob ${canonical.length}\0`), canonical]), 'sha1'), record.canonicalGitBlob);
    assert.deepEqual(git('cat-file', 'blob', `${source.baseline}:${record.gitPath}`), canonical);
  }
  assert.equal(source.sources[3].workingSha256, manifest.verification.helperSha256);
  const helper = fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});

test('genuine archived no-op RED remains loadable, behavioral and outside discovery', () => {
  const archived = path.join(__dirname, 'evidence', 'red-stub', 'assertions.cjs');
  const env = { ...process.env };
  // A nested runner must not inherit Node's internal child-v8 test transport.
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', archived], { encoding: 'utf8', env });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ERR_ASSERTION/);
  assert.match(result.stdout, /expected: 'passed'/);
  assert.match(result.stdout, /actual: 'unknown'/);
  assert.doesNotMatch(result.stdout + result.stderr, /MODULE_NOT_FOUND|SyntaxError/);
  const original = read(path.join('evidence', 'raw', 'red.stdout.tap')).toString();
  assert.match(original, /ERR_ASSERTION/);
  assert.match(original, /actual: 'unknown'/);
  assert.equal(json(path.join('evidence', 'raw', 'red-summary.json')).exitCode, 1);
  assert.equal(json(path.join('evidence', 'raw', 'stub-browser.json')).awaitedCleanupCompleted, true);
  assert.ok(Date.parse(json(path.join('evidence', 'raw', 'iac-na.json')).recordedAtUtc)
    >= Date.parse(json(path.join('evidence', 'raw', 'red-summary.json')).recordedAtUtc));
  assert.equal(json(path.join('evidence', 'raw', 'iac-na.json')).iac, 'N/A');
  const names = fs.readdirSync(path.dirname(archived));
  assert.ok(names.every((name) => !/\.test\.|^test[.-]|^test$/.test(name)));
});

test('versioned owned source/raw seals detect byte changes without rewriting proof', () => {
  const pointer = json(path.join('evidence', 'source-hashes.json'));
  assert.match(pointer.seal, /^evidence\\raw\\source-seal-[\w.-]+\.json$/);
  const bytes = read(pointer.seal);
  assert.equal(sha(bytes), pointer.sealSha256);
  const seal = JSON.parse(bytes);
  assert.equal(seal.cardId, 'A-S128');
  assert.equal(seal.artifacts.length, pointer.sealedFiles);
  assert.equal(seal.rawBytesPreserved, true);
  for (const artifact of seal.artifacts) {
    assert.equal(path.isAbsolute(artifact.path), false);
    assert.ok(!artifact.path.split(path.sep).includes('..'));
    const current = read(artifact.path);
    assert.equal(current.length, artifact.bytes, artifact.path);
    assert.equal(sha(current), artifact.sha256, artifact.path);
  }
  assert.match(read('.gitattributes').toString(), /evidence\/raw\/\*\* -text -diff/);
  assert.match(read('.gitattributes').toString(), /evidence\/red-stub\/\*\* -text -diff/);
});

test('production lesson is local fixed DATA; CSP fixtures use the identical strict policy', () => {
  const html = read('index.html').toString();
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const clause of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "frame-src 'none'", "child-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(policy.includes(clause), clause);
  }
  assert.ok(!policy.includes('unsafe-'));
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  for (const name of ['csp-probe.html', 'missing-model.html']) {
    assert.equal(read(path.join('evidence', name)).toString()
      .match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1], policy);
  }
  const app = read('app.js').toString();
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(app, /form\.reset\(/);
  for (const filename of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(filename).toString(),
      /\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage|eval)\b|https?:|kubectl|apiVersion|kind:\s*(?:Service|Deployment)|spec:\s*\{/);
  }
  assert.ok(manifest.preconditions[0].includes('fixed fictional teaching DATA ONLY'));
  const probe = read(path.join('evidence', 'csp-probe.js')).toString();
  assert.match(probe, /data:application\/json/);
  assert.doesNotMatch(probe, /fetch\(['"]https?:/);
  assert.match(read('browser.test.cjs').toString(), /nativeKeyboardExternalScriptDispatch: true/);
});

test('all lesson JavaScript has valid Node syntax and manifest/BDD document explicit limits', () => {
  for (const name of ['model.js', 'app.js', 'model.test.cjs', 'browser.test.cjs', 'integrity.test.cjs',
    'verify.cjs', 'capture-source.cjs', 'seal-evidence.cjs', path.join('evidence', 'csp-probe.js')]) {
    const result = spawnSync(process.execPath, ['--check', path.join(__dirname, name)], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${name}: ${result.stderr}`);
  }
  assert.match(read('cohort-routing.feature').toString(), /genuinely fails with ERR_ASSERTION before implementation/);
  assert.match(read('README.txt').toString(), /Normal verification is READ-ONLY/);
  assert.match(manifest.verification.deliberateCapture, /Only exact CAPTURE_BROWSER_EVIDENCE=1/);
  assert.match(manifest.verification.iac, /N\/A/);
});
