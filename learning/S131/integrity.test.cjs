'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = __dirname;
const repo = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, ...relative.split('/')));
const json = (relative) => JSON.parse(read(relative).toString('utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function canonical(bytes, mode) {
  return mode === 'raw-preserved' ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
}
function blob(bytes) {
  return crypto.createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
}

test('sealed owned sources preserve raw bytes and their separate canonical Git representation', () => {
  const seal = json('evidence/source-hashes.json');
  assert.equal(seal.cardId, 'A-S131');
  assert.equal(seal.workerId, 'worker-A-S131');
  assert.ok(seal.files.length >= 25);
  for (const entry of seal.files) {
    assert.ok(!entry.path.startsWith('/') && !entry.path.includes('..'));
    const bytes = read(entry.path);
    const normalized = canonical(bytes, entry.normalization);
    assert.equal(sha(normalized), entry.canonicalSha256, `${entry.path} canonical bytes`);
    assert.equal(blob(normalized), entry.canonicalGitBlob, `${entry.path} canonical Git blob`);
    if (entry.normalization === 'utf8-lf') {
      const originalRaw = sha(bytes) === entry.rawSha256;
      const canonicalCheckout = sha(bytes) === entry.canonicalSha256;
      assert.ok(originalRaw || canonicalCheckout, `${entry.path} original raw bytes or exact canonical Git checkout`);
      assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, originalRaw ? entry.rawCrlfCount : 0);
      assert.equal(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, false, `${entry.path} no BOM`);
      assert.equal(normalized.toString('utf8').includes('\r'), false, `${entry.path} explicit LF canonical source`);
    } else {
      assert.equal(entry.normalization, 'raw-preserved');
      assert.equal(sha(bytes), entry.rawSha256, `${entry.path} raw evidence bytes`);
      assert.equal((bytes.toString('utf8').match(/\r\n/g) || []).length, entry.rawCrlfCount);
    }
  }
});

test('exact S131 source, portable card and SC-S131 packet stay bound without claiming parent completion', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.id, 'A-S131');
  assert.equal(manifest.sourceId, 'S131');
  assert.equal(manifest.parentId, 'D-S131');
  assert.equal(manifest.packet, 'SC-S131');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S131');
  assert.equal(manifest.accepted, false);
  assert.equal(manifest.nativeProofComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.objective, 'Load old/new page assets during cutover; successful HTML alone must not pass rendering.');
  const receipt = json('evidence/source-contract.json');
  assert.equal(receipt.readBeforeDesign, true);
  assert.equal(receipt.card.id, manifest.id);
  assert.equal(receipt.card.packet, manifest.packet);
  assert.equal(receipt.card.kano, 'S');
  assert.equal(receipt.nativeSibling.id, 'B-S131');
  assert.equal(receipt.exactLines.length, 4);
  const currentLines = ['README.md', '.docs\\wiki\\backlog.md', '.docs\\wiki\\kanban.md'].flatMap((file) =>
    fs.readFileSync(path.join(repo, file), 'utf8').split(/\r?\n/).filter((line) => /^\| (?:S131|D-S131|A-S131|B-S131) \|/.test(line)));
  assert.deepEqual(currentLines, receipt.exactLines);
  assert.deepEqual(manifest.sourceContract.sourcePrerequisites, ['D-S057']);
});

test('narrow early attributes retain raw evidence and explicitly canonicalize owned source text', () => {
  const attributes = read('.gitattributes').toString();
  assert.match(attributes, /^evidence\/\*\* -text whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol$/m);
  assert.match(attributes, /^evidence\/raw\/\*\.tap -whitespace$/m);
  const output = execFileSync('git', ['check-attr', '-z', 'text', 'eol', 'whitespace', '--',
    'learning\\S131\\app.js', 'learning\\S131\\evidence\\source-contract.json', 'learning\\S131\\evidence\\raw\\red.stdout.tap'], { cwd: repo, encoding: 'utf8' });
  const fields = output.split('\0');
  const records = [];
  for (let index = 0; index + 2 < fields.length; index += 3) records.push(fields.slice(index, index + 3));
  const value = (file, attribute) => records.find((entry) => entry[0].endsWith(file) && entry[1] === attribute)?.[2];
  assert.equal(value('app.js', 'text'), 'set');
  assert.equal(value('app.js', 'eol'), 'lf');
  assert.equal(value('source-contract.json', 'text'), 'unset');
  assert.equal(value('source-contract.json', 'whitespace'), 'blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol');
  assert.equal(value('red.stdout.tap', 'text'), 'unset');
  assert.equal(value('red.stdout.tap', 'whitespace'), 'unset');
});

test('strict CSP and owned local assets need no external URLs or framework', () => {
  const html = read('index.html').toString();
  const app = read('app.js').toString();
  const model = read('model.js').toString();
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|on(?:click|load|error)\s*=|<style\b|style\s*=/i);
  assert.doesNotMatch(html + app + model, /https?:\/\/|XMLHttpRequest|WebSocket|serviceWorker|localStorage|sessionStorage|innerHTML/);
  assert.doesNotMatch(app + model, /\bfetch\s*\(|\beval\s*\(|\bFunction\s*\(/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.doesNotMatch(html, /(?:name|id)=["']reset["']/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
  for (const entry of ['fixtures/v1.css', 'fixtures/v2.css', 'fixtures/v1.js', 'fixtures/v2.js', 'fixtures/v2-broken.js', 'fixtures/v1.svg', 'fixtures/v2.svg']) {
    assert.ok(read(entry).length > 0);
  }
  assert.equal(fs.existsSync(path.join(root, 'fixtures', 'unavailable-v1.js')), false);
  assert.equal(fs.existsSync(path.join(root, 'fixtures', 'unavailable-v2.svg')), false);
});

test('loadable browser stub and genuine assertion RED precede IaC applicability and implementation', () => {
  const stub = json('evidence/raw/stub-browser.json');
  const red = json('evidence/raw/red-summary.json');
  assert.equal(stub.loaded, true);
  assert.equal(stub.closeAwaited, true);
  assert.equal(stub.pageClosed, true);
  assert.equal(stub.browserDisconnected, true);
  assert.ok(Date.parse(stub.capturedAt) < Date.parse(red.startedAt));
  assert.equal(red.processExitCode, 1);
  assert.equal(red.passingBaseline, 1);
  assert.equal(red.behavioralAssertionFailures, 2);
  assert.equal(red.outsideAutomaticTestDiscovery, true);
  const raw = read('evidence/raw/red.stdout.tap').toString();
  assert.match(raw, /# pass 1/);
  assert.match(raw, /# fail 2/);
  assert.match(raw, /ERR_ASSERTION/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(sha(read('evidence/red-stub/model.js')), red.stubModelSha256);
  assert.match(read('evidence/iac-na.txt').toString(), /N\/A, assessed after the retained genuine behavioral RED/);
  assert.match(read('browsing-cutover.feature').toString(), /successful|success|HTML success/i);
  assert.equal(path.basename('evidence/red-stub/assertions.cjs').includes('.test.'), false);
});

test('normal verification has an exact deliberate append-only capture gate and the published helper', () => {
  const source = read('browser.test.cjs').toString();
  const observer = read('evidence/red-stub/observe.cjs').toString();
  for (const code of [source, observer]) {
    assert.match(code, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
    assert.match(code, /flag: 'wx'/);
    assert.match(code, /openIsolatedLesson/);
    assert.match(code, /finally[\s\S]*await session\.close\(\)/);
    assert.doesNotMatch(code, /unlinkSync|rmSync|rm\s*\(|mkdirSync|prototype|skip\s*\(/);
  }
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.match(source, /crypto\.randomUUID\(\)/);
});

test('historical raw proofs retain their exact bytes, including CRLF when present', () => {
  const seal = json('evidence/raw-evidence-hashes.json');
  assert.equal(seal.cardId, 'A-S131');
  assert.ok(seal.files.some((entry) => entry.path === 'evidence/raw/red.stdout.tap'));
  for (const entry of seal.files) {
    assert.ok(entry.path.startsWith('evidence/raw/') && !entry.path.includes('..'));
    assert.equal(sha(read(entry.path)), entry.rawSha256, entry.path);
  }
});

test('remainder remains honestly blocked with zero extra credits and no native/source-parent claims', () => {
  const refinement = json('evidence/refinement.json');
  assert.equal(refinement.extraCredits, 0);
  assert.equal(refinement.originalKanoUnit, 'A-S131');
  assert.equal(refinement.frozenKano, 'S');
  assert.equal(refinement.remainder.find((entry) => entry.id === 'B-S131').readiness, false);
  assert.equal(refinement.sourceParentComplete, false);
  assert.equal(refinement.nativeProofComplete, false);
  assert.match(read('README.txt').toString(), /Parent|parent/);
});
