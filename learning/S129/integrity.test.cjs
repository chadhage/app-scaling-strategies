'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const repo = path.resolve(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const gitBlob = (bytes) => digest(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]), 'sha1');
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

test('exact S129 source acceptance, portable card, native gate and packet remain separate', () => {
  const readme = fs.readFileSync(path.join(repo, 'README.md'), 'utf8');
  const backlog = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'backlog.md'), 'utf8');
  const kanban = fs.readFileSync(path.join(repo, '.docs', 'wiki', 'kanban.md'), 'utf8');
  assert.equal(readme.includes('| S129 | **Functions, supported-plan slots:** Test interrupted execution and replay; slot swaps alone do not guarantee zero downtime. |'), true);
  assert.equal(backlog.includes('| D-S129 | P1 | Add supporting-plan Functions slot swaps during active executions and replay. | Native execution termination and bounded recovery are measured; duplicate effects are prevented; slot swaps alone cannot certify zero downtime. | P004, D-S049, D-S077 |'), true);
  assert.equal(kanban.includes('| A-S129 | D-S129 | S | Swap active Functions executions; distinguish termination/replay from guaranteed zero downtime. | SOURCE |'), true);
  assert.equal(kanban.includes('| B-S129 | D-S129 | S | Conduct one supported Functions swap; verify native execution outcomes and one intended business effect. | CORE, DATA, FN, C080 |'), true);
  assert.equal(manifest.id, 'A-S129');
  assert.equal(manifest.parentId, 'D-S129');
  assert.equal(manifest.packet, 'SC-S129');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S129');
  assert.equal(manifest.sourceContract.nativeEntryGate, 'CORE, DATA, FN, C080');
  assert.deepEqual(manifest.sourceContract.sourcePrerequisites, ['P004', 'D-S049', 'D-S077']);
  assert.equal(manifest.sourceContract.acceptance, 'Native execution termination and bounded recovery are measured; duplicate effects are prevented; slot swaps alone cannot certify zero downtime.');
  assert.equal(manifest.objective, 'Swap active Functions executions; distinguish termination/replay from guaranteed zero downtime.');
  for (const field of ['accepted', 'nativeProofComplete', 'sourceParentComplete']) assert.equal(manifest[field], false);
});

test('documented Functions constraints and original acceptance limits are explicitly qualified', () => {
  assert.equal(manifest.documentedConstraints.reference, 'https://learn.microsoft.com/en-us/azure/azure-functions/functions-deployment-slots');
  assert.match(manifest.documentedConstraints.support, /Flex Consumption has no deployment slots/);
  assert.match(manifest.documentedConstraints.support, /Container Apps uses revisions/);
  assert.match(manifest.documentedConstraints.termination, /currently executing functions can be terminated/);
  assert.match(manifest.documentedConstraints.termination, /do not guarantee zero downtime/);
  const documentation = read('README.txt');
  for (const clause of ['DATA ONLY', 'reviewed before design', 'original unknown HTTP', 'fresh latency budget', 'known', 'lifecycle limitations', 'unqualified', 'Node.js 24', 'Parent alone accepts A-S129 once', 'zero extra credits', 'C005-C008/local-harness', 'B-S129 remains To Do/not ready']) {
    assert.equal(documentation.includes(clause), true, clause);
  }
  assert.match(manifest.verification.iac, /^N\/A evaluated after genuine RED/);
  const iac = JSON.parse(read(path.join('evidence', 'raw', 'iac-na.json')));
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.generatedIaC, false);
  assert.equal(iac.cloudOperations, false);
  assert.match(iac.stage, /after.*ERR_ASSERTION RED/);
});

test('standalone core is local fixed data with narrow CSP before assets and no hidden live mechanisms', () => {
  const html = read('index.html');
  assert.equal(html.includes(manifest.banner), true);
  assert.equal(html.indexOf('Content-Security-Policy') < html.indexOf('<link'), true);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "img-src 'none'", "font-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.equal(html.includes(directive), true, directive);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|\s(?:id|name)="reset"/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1]), ['lesson.css']);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|\beval\s*\(|innerHTML|setTimeout|setInterval|Math\.random|Date\.now|require\s*\(/);
  }
  assert.doesNotMatch(read('lesson.css'), /@import|\burl\s*\(/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /role="status"/);
  assert.equal(html.includes('csp-probe.js'), false);
});

test('RED is genuine behavioral ERR_ASSERTION after a real loadable browser stub', () => {
  const raw = read(path.join('evidence', 'raw', 'red.stdout.tap'));
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /not ok 2/);
  assert.match(raw, /not ok 3/);
  assert.match(raw, /# pass 1/);
  assert.match(raw, /# fail 2/);
  assert.doesNotMatch(raw, /MODULE_NOT_FOUND|ENOENT|SyntaxError/);
  const summary = JSON.parse(read(path.join('evidence', 'raw', 'red-summary.json')));
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 2);
  assert.equal(summary.extraKanoCredits, 0);
  const browser = JSON.parse(read(path.join('evidence', 'raw', 'stub-browser.json')));
  assert.equal(browser.phase, 'stub');
  assert.equal(browser.attempted, '0');
  assert.equal(browser.keyboardActivated, true);
  assert.equal(browser.awaitedCleanupCompleted, true);
  assert.equal(browser.browser, '156.0.4314.50');
  assert.deepEqual(browser.errors, []);
  const stub = require('./evidence/red-stub/model.js');
  assert.equal(stub.assess(stub.send(stub.createState(), { type: 'swap' })).counts.attempted, 0);
  assert.match(read(path.join('evidence', 'red-stub', 'assertions.cjs.txt')), /attempted: 3, uninterrupted: 1, interrupted: 1, unknown: 1/);
  for (const name of fs.readdirSync(path.join(__dirname, 'evidence', 'red-stub'))) {
    assert.doesNotMatch(name, /(?:^test[-.]|[.-]test\.[cm]?js$)/i);
  }
  assert.equal(read('functions-swap.feature').includes('one original frozen S unit'), true);
});

test('published browser helper is pinned and exact capture is deliberate append-only', () => {
  assert.equal(digest(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), manifest.verification.publishedHelperSha256);
  assert.equal(manifest.verification.publishedHelperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const browser = read('browser.test.cjs');
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /flag: 'wx'/);
  assert.match(browser, /await session\.close\(\)/);
  assert.match(browser, /Normal verification must be read-only/);
  assert.doesNotMatch(browser, /fs\.(?:rm|unlink|rename|truncate)|prototype.*recovery|chromium\.launch|bypassCSP\s*:\s*true/);
  assert.equal(manifest.limits.some((limit) => limit.includes('inactive recovery prototype remains unqualified')), true);
});

test('raw-byte attributes are narrow and separate from canonical text integrity', () => {
  const attributes = read('.gitattributes');
  assert.match(attributes, /^\* text eol=lf/m);
  assert.match(attributes, /^evidence\/raw\/\*\* -text -diff -merge/m);
  assert.match(attributes, /^evidence\/red-stub\/\*\* -text -diff -merge/m);
  const rawCrLf = Buffer.from('preserved\r\nproof\r\n');
  const canonical = lf(rawCrLf);
  assert.notEqual(digest(rawCrLf), digest(canonical));
  assert.notEqual(gitBlob(rawCrLf), gitBlob(canonical));
  assert.equal(canonical.toString(), 'preserved\nproof\n');
});

test('measured source hashes and preserved raw evidence match working or canonical Git bytes', () => {
  const inventory = JSON.parse(read(path.join('evidence', 'source-hashes.json')));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.cardId, 'A-S129');
  assert.equal(inventory.entries.length >= 18, true);
  assert.equal(new Set(inventory.entries.map((entry) => entry.path)).size, inventory.entries.length);
  for (const entry of inventory.entries) {
    const target = path.resolve(__dirname, entry.path);
    assert.equal(target.startsWith(`${__dirname}${path.sep}`), true);
    const bytes = fs.readFileSync(target);
    const canonical = entry.binary ? null : lf(bytes);
    if (entry.gitTextMode === 'raw') assert.equal(digest(bytes), entry.rawSha256, `Raw bytes: ${entry.path}`);
    else assert.equal([entry.rawSha256, entry.canonicalLfSha256].includes(digest(bytes)), true, `Text bytes: ${entry.path}`);
    assert.equal(canonical ? digest(canonical) : null, entry.canonicalLfSha256, `Canonical LF: ${entry.path}`);
    assert.equal(gitBlob(entry.gitTextMode === 'raw' ? bytes : canonical), entry.canonicalGitBlobOid, `Git blob: ${entry.path}`);
  }
});

test('test-only missing-data and CSP probes cannot become lesson dependencies or stronger proof', () => {
  const missing = read(path.join('evidence', 'missing-model.html'));
  assert.match(missing, /missing-required-model\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, 'evidence', 'missing-required-model.js')), false);
  const probe = read(path.join('evidence', 'csp-probe.js'));
  assert.match(probe, /securitypolicyviolation/);
  assert.match(probe, /fetch\('data:text\/plain,S129-policy-probe'\)/);
  assert.match(probe, /new Worker\(url\)/);
  assert.doesNotMatch(probe, /https?:\/\/|XMLHttpRequest|WebSocket/);
  assert.equal(manifest.nativeProofComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
});
