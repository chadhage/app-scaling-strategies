'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('the immutable published source bytes and raw evidence match their separate seals', () => {
  const seal = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(seal.schemaVersion, 1);
  assert.equal(seal.cardId, 'A-S123');
  assert.ok(Object.keys(seal.files).length >= 12);
  const inventory = [];
  function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const name = path.join(prefix, entry.name);
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target, name);
      else if (name !== path.join('evidence', 'source-hashes.json')) {
        assert.equal(entry.isFile(), true);
        inventory.push(name);
      }
    }
  }
  walk(__dirname);
  assert.deepEqual(Object.keys(seal.files).sort(), inventory.sort(), 'Every owned file except the self-referential seal is inventoried');
  for (const [name, expected] of Object.entries(seal.files)) {
    const file = path.resolve(__dirname, name);
    const relative = path.relative(__dirname, file);
    assert.equal(path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`), false);
    const bytes = fs.readFileSync(file);
    assert.equal(sha(bytes), expected.rawSha256, `${name}: raw bytes`);
    const rawEvidence = name.startsWith(`evidence${path.sep}raw${path.sep}`)
      || name.startsWith(`evidence${path.sep}red-stub${path.sep}`);
    assert.equal(expected.gitText, !rawEvidence);
    const canonical = rawEvidence ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(sha(canonical), expected.canonicalGitSha256, `${name}: canonical Git bytes`);
    if (!rawEvidence) {
      assert.equal(bytes.includes(Buffer.from('\r\n')), false, `${name}: published source must already be canonical LF`);
      assert.equal(expected.rawSha256, expected.canonicalGitSha256, `${name}: captured source equals canonical Git bytes`);
      assert.equal(expected.rawGitBlobSha1, expected.canonicalGitBlobSha1, `${name}: no checkout-only source identity`);
    }
    const repoPath = path.join('learning', 'S123', name);
    assert.equal(execFileSync('git', ['hash-object', '--no-filters', repoPath], { cwd: root, encoding: 'utf8' }).trim(),
      expected.rawGitBlobSha1, `${name}: unfiltered Git object`);
    assert.equal(execFileSync('git', ['hash-object', `--path=${repoPath}`, repoPath], { cwd: root, encoding: 'utf8' }).trim(),
      expected.canonicalGitBlobSha1, `${name}: attribute-filtered Git object`);
  }
});

test('exact source, backlog and portable packet acceptance are preserved without native completion', () => {
  const source = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(root, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(root, '.docs', 'wiki', 'kanban.md'), 'utf8');
  const readmeRow = source.split(/\r?\n/).find((line) => line.startsWith('| S123 |'));
  const backlogRow = backlog.split(/\r?\n/).find((line) => line.startsWith('| D-S123 |'));
  const cardRow = kanban.split(/\r?\n/).find((line) => line.startsWith('| A-S123 |'));
  const siblingRow = kanban.split(/\r?\n/).find((line) => line.startsWith('| B-S123 |'));
  assert.equal(readmeRow, `| S123 | ${manifest.sourceContract.readme} |`);
  assert.equal(backlogRow, `| D-S123 | P1 | ${manifest.sourceContract.backlogDeliver} | ${manifest.sourceContract.backlogAcceptance} | P001, D-S026 |`);
  assert.equal(cardRow, `| A-S123 | D-S123 | S | ${manifest.sourceContract.portableCard} | SOURCE |`);
  assert.equal(siblingRow, `| B-S123 | D-S123 | S | ${manifest.sourceContract.nativeSibling} | CORE, DATA, C063, C064 |`);
  assert.equal(manifest.id, 'A-S123');
  assert.equal(manifest.kanoUnit, 'A-S123');
  assert.equal(manifest.packet, 'SC-S123');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.mode, 'portable-synthetic');
  assert.equal(manifest.nativeProofComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.accepted, false);
  assert.match(source, /Adding a slot does not add compute capacity/);
  assert.match(source, /Native App Service swaps recycle former production workers/);
  assert.match(source, /empty transition sample produces no evidence/);
});

test('standalone CSP, safe text rendering, byte attributes and genuine archived RED remain explicit', () => {
  const html = read('index.html');
  assert.ok(html.includes(manifest.banner));
  assert.match(html, /script-src 'self'/);
  for (const directive of ['default-src', 'connect-src', 'img-src', 'object-src', 'frame-src', 'worker-src', 'base-uri', 'form-action']) {
    assert.ok(html.includes(`${directive} 'none'`), directive);
  }
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.equal(/\son[a-z]+\s*=/i.test(html), false);
  assert.equal(/(?:id|name)="reset"/i.test(html), false);
  const app = read('app.js');
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.equal(/innerHTML|outerHTML|insertAdjacentHTML/.test(app), false);
  for (const file of ['model.js', 'app.js']) {
    assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie/.test(read(file)), false);
  }
  const attributes = read('.gitattributes');
  assert.match(attributes, /\* text eol=lf/);
  assert.match(attributes, /evidence\/raw\/\*\* -text/);
  assert.match(attributes, /evidence\/red-stub\/\*\* -text/);
  const raw = read(path.join('evidence', 'raw', 'red.tap'));
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /'new' !== 'prepared'/);
  assert.equal(/MODULE_NOT_FOUND|SyntaxError/.test(raw), false);
  assert.ok(raw.includes('\r\n'), 'Raw Windows assertion evidence retains CRLF');
  assert.match(read(path.join('evidence', 'red-stub', 'model.js')), /function stub\(\)/);
  assert.match(read(path.join('evidence', 'red-stub', 'assertions.cjs')), /require\('\.\/model\.js'\)/);
  assert.match(read(path.join('evidence', 'iac-na.txt')), /IaC step: N\/A/);
  assert.match(read('USAGE.txt'), /Normal verification is READ-ONLY/);
});

test('the browser test consumes only the published isolated interface with exact deliberate capture', () => {
  const helper = fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha(helper), manifest.verification.publishedHelperSha256);
  assert.equal(sha(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read('browser.test.cjs');
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /ownedHashes\(\), before/);
  assert.equal(/chromium\.launch|bypassCSP:\s*true|--no-sandbox|--disable-web-security|openIsolatedLoopback/.test(browser), false);
});
