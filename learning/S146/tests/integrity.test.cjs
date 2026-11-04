'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fixtures = require('..\\fixtures.js');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; worker-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";

function guardRawHtml(html) {
  const csp = [...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/g)];
  assert.equal(csp.length, 1);
  assert.equal(csp[0][1], CSP);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.deepEqual(scripts.map((match) => match[1]), [
    ' src="fixtures.js" defer', ' src="lesson.js" defer', ' src="app.js" defer',
  ]);
  assert.ok(scripts.every((match) => match[2] === ''));
  const links = [...html.matchAll(/<link\b([^>]*)>/gi)];
  assert.deepEqual(links.map((match) => match[1]), [' rel="stylesheet" href="style.css"']);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|<(?:img|iframe|base|object|embed|a)\b/i);
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
}

test('raw-byte attributes are narrowed before browser normalization; only exact local assets and CSP are accepted', () => {
  const html = read('index.html').toString('utf8');
  guardRawHtml(html);
  for (const src of [
    ' fixtures.js', 'fixtures.js ', 'fixtures.js\r', 'fixtures.js\n',
    'fixtures&#46;js', 'fixtures%2Ejs', 'https://example.invalid/fixtures.js',
    'data:text/javascript,synthetic', '..\\fixtures.js',
  ]) {
    assert.throws(() => guardRawHtml(html.replace('src="fixtures.js"', `src="${src}"`)), assert.AssertionError, src);
  }
  assert.throws(() => guardRawHtml(html.replace('src="fixtures.js"', 'src=fixtures.js')), assert.AssertionError);
  assert.throws(() => guardRawHtml(html.replace('src="fixtures.js"', 'src="fixtures.js" src="app.js"')), assert.AssertionError);
  assert.throws(() => guardRawHtml(html.replace("connect-src 'none'", "connect-src 'self'")), assert.AssertionError);
  assert.throws(() => guardRawHtml(html.replace('<body>', '<body onload="synthetic">')), assert.AssertionError);
});

test('phase/preset controls exactly match the bounded fixed-data inventory and never shadow form.reset', () => {
  const html = read('index.html').toString('utf8');
  const values = (id) => [...html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1].matchAll(/<option value="([^"]*)">/g)].map((match) => match[1]);
  assert.deepEqual(values('phase'), fixtures.PHASES);
  assert.deepEqual(values('preset'), fixtures.PRESETS.map(({ id }) => id));
  const app = read('app.js').toString('utf8');
  assert.doesNotMatch(app, /\.reset\s*\(|innerHTML|outerHTML|insertAdjacentHTML/);
  for (const file of ['fixtures.js', 'lesson.js', 'app.js']) {
    assert.doesNotMatch(read(file).toString('utf8'), /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|new Date\s*\(|setInterval\s*\(|localStorage|sessionStorage|document\.cookie/);
  }
  assert.match(read('runtime-missing.html').toString('utf8'), /intentionally does not load fixtures\.js or lesson\.js/);
});

test('exact original source rows retain raw CRLF independently from immutable canonical Git LF bytes', () => {
  const snapshot = json(path.join('evidence', 'source', 'snapshot.json'));
  const manifest = json('manifest.json');
  assert.equal(snapshot.sourceRevision, manifest.sourceBaseline);
  assert.equal(snapshot.handlesClosedBeforeMutexRelease, true);
  const expected = {
    readme: '| S146 | **Fault injection at every phase:** Test provisioning, warming, promotion, serving, draining, rollback, and cleanup separately. |',
    backlog: '| D-S146 | P1 | Add a lifecycle-phase/fault matrix over the handoff workflow. | Observable phases have explicit fault results; unobservable native timing is disclosed; no untested phase is reported covered. | D-S081, D-S001 |',
    kanban: '| A-S146 | D-S146 | S | Inject a trace fault at a lifecycle phase; unobserved timing must stay uncovered. | SOURCE |',
  };
  for (const source of snapshot.files) {
    const raw = read(path.join('evidence', 'source', source.rawSnapshot));
    const canonicalRow = read(path.join('evidence', 'source', source.canonicalSnapshot));
    assert.equal(sha(raw), source.rawRowSha256);
    assert.equal(sha(canonicalRow), source.canonicalRowSha256);
    assert.equal(raw.toString('utf8'), `${expected[source.label]}\r\n`);
    assert.equal(canonicalRow.toString('utf8'), `${expected[source.label]}\n`);
    assert.equal(source.rawLineEnding, 'CRLF');
    assert.equal(source.canonicalLineEnding, 'LF');
    const gitFile = execFileSync('git', ['show', `${snapshot.sourceRevision}:${source.gitPath}`], { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(sha(gitFile), source.originalCanonicalSha256);
    assert.equal(gitFile.length, source.originalCanonicalBytes);
    const prefix = { readme: '\\| S146 \\|', backlog: '\\| D-S146 \\|', kanban: '\\| A-S146 \\|' }[source.label];
    const independentlyReadRow = Buffer.from(gitFile.toString('utf8').match(new RegExp(`^${prefix}[^\\r\\n]*(?:\\r?\\n|$)`, 'm'))[0]);
    assert.deepEqual(independentlyReadRow, canonicalRow);
    assert.equal(execFileSync('git', ['rev-parse', `${snapshot.sourceRevision}:${source.gitPath}`], { cwd: repo, encoding: 'utf8' }).trim(), source.gitBlob);
  }
  const liveReadme = fs.readFileSync(path.join(repo, 'README.md'));
  const currentRow = liveReadme.toString('utf8').match(/^\| S146 \|[^\r\n]*(?:\r?\n|$)/m)[0];
  assert.equal(currentRow, `${expected.readme}\r\n`);
  // No test opens a live ledger: backlog/card checks above use immutable Git and owned snapshots.
});

test('frozen original S/P1/SC-S146/SOURCE identity and the blocked native remainder match source inventory', () => {
  const snapshot = json(path.join('evidence', 'source', 'snapshot.json'));
  const selectedBytes = read(path.join('evidence', 'source', 'selected-inventory.json.txt'));
  assert.equal(sha(selectedBytes), snapshot.selectedInventorySha256);
  const selected = JSON.parse(selectedBytes);
  const original = selected.find((card) => card.id === 'A-S146');
  assert.deepEqual(original, {
    technicalEntryGate: 'SOURCE', kano: 'S', priority: 'P1', kanoUnit: 'A-S146',
    deliver: 'Inject a trace fault at a lifecycle phase; unobserved timing must stay uncovered.',
    packet: 'SC-S146', id: 'A-S146', parents: ['D-S146'],
  });
  const manifest = json('manifest.json');
  for (const [key, value] of Object.entries({
    cardId: 'A-S146', workerId: 'worker-A-S146', sourceId: 'S146', parentId: 'D-S146',
    kanoUnit: 'A-S146', kano: 'S', priority: 'P1', packet: 'SC-S146', technicalEntryGate: 'SOURCE',
    iac: 'N/A', nativeSibling: 'B-S146', nativeProof: false, originalSourceParentCompleted: false,
  })) assert.equal(manifest[key], value);
  assert.equal(manifest.objective, original.deliver);
  assert.equal(manifest.sourceAcceptance.backlog, 'Observable phases have explicit fault results; unobservable native timing is disclosed; no untested phase is reported covered.');
  const native = selected.find((card) => card.id === 'B-S146');
  assert.equal(native.technicalEntryGate, 'CORE, DATA, HOST, C090');
  assert.match(read('USAGE.txt').toString('utf8'), /B-S146 remains blocked on CORE, DATA, HOST, C090/);
});

test('archived loadable-stub behavioral RED and subsequent resource-free IaC N/A remain discoverable but not executable tests', () => {
  const red = json(path.join('evidence', 'red.json'));
  const stdout = read(path.join(red.redDirectory, 'stdout.txt')).toString('utf8');
  const stderr = read(path.join(red.redDirectory, 'stderr.txt')).toString('utf8');
  assert.equal(red.exitCode, 1);
  assert.equal(red.errorCode, 'ERR_ASSERTION');
  assert.equal(red.actual, 'COVERED');
  assert.equal(red.expected, 'UNCOVERED');
  assert.equal(red.retainedOutsideAutodiscovery, true);
  assert.match(stdout, /ERR_ASSERTION/);
  assert.match(stdout, /actual: 'COVERED'/);
  assert.match(stdout, /expected: 'UNCOVERED'/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|SyntaxError/);
  assert.match(read(path.join(red.redDirectory, 'lesson.js.txt')).toString('utf8'), /coverage: 'COVERED'/);
  const stub = json(path.join(red.stubBrowserDirectory, 'observation.json'));
  assert.equal(stub.behavioralAcceptance, false);
  assert.equal(stub.kind, 'actual-loadable-stub-only');
  assert.equal(stub.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.match(stub.browserVersion, /^156\./);
  assert.equal(json(path.join('evidence', 'iac.json')).result, 'N/A');
  const attributes = read('.gitattributes').toString('utf8');
  assert.match(attributes, /\/evidence\/raw\/\*\* -text -whitespace/);
  assert.match(attributes, /\/evidence\/source\/\*\* -text whitespace=cr-at-eol/);
  assert.ok(fs.readdirSync(path.join(root, red.redDirectory)).every((file) => !file.endsWith('.test.cjs')));
});

test('published helper and browser capture contract stay exact, offline and read-only by default', () => {
  const manifest = json('manifest.json');
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha(fs.readFileSync(helper)), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(manifest.browserHelper.sha256, sha(fs.readFileSync(helper)));
  const browserTest = read(path.join('tests', 'browser.test.cjs')).toString('utf8');
  assert.match(browserTest, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browserTest, /await session\.close\(\)/);
  assert.match(browserTest, /openIsolatedLesson/);
  assert.match(browserTest, /randomUUID/);
  assert.doesNotMatch(browserTest, /chromium\.launch|bypassCSP:\s*true|--no-sandbox|disable-web-security|route\s*\(/);
});

test('release raw Git blobs and filtered canonical objects are independently verified with Git virtual paths', () => {
  const manifest = json(path.join('evidence', 'integrity-manifest.json'));
  assert.equal(manifest.cardId, 'A-S146');
  assert.equal(manifest.fileCount, manifest.files.length);
  assert.equal(new Set(manifest.files.map((file) => file.relativePath)).size, manifest.files.length);
  for (const file of manifest.files) {
    const fullPath = path.resolve(root, file.relativePath);
    assert.ok(fullPath.startsWith(`${root}${path.sep}`));
    const bytes = fs.readFileSync(fullPath);
    const rawRequired = ['raw', 'source'].some((folder) => file.relativePath.startsWith(path.join('evidence', folder) + path.sep));
    assert.equal(file.rawBytesMustMatch, rawRequired);
    if (rawRequired) {
      assert.equal(bytes.length, file.rawBytes, file.relativePath);
      assert.equal(sha(bytes), file.rawSha256, file.relativePath);
      const independentRawBlob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      assert.equal(independentRawBlob, file.canonicalGitBlob, file.relativePath);
    }
    const virtualGitPath = ['learning', 'S146', ...file.relativePath.split(path.sep)].join('/');
    const canonical = execFileSync('git', ['hash-object', `--path=${virtualGitPath}`, fullPath], { cwd: repo, encoding: 'utf8' }).trim();
    assert.equal(canonical, file.canonicalGitBlob, file.relativePath);
  }
});
