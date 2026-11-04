'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldCapture, sha256 } = require(path.join(__dirname, 'capture.cjs'));

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const snapshot = (name) => read('evidence', 'raw', 'source', name);
const sourceHashes = {
  'README.git.snapshot': '38012b64a3544c2fc46ccae86fdba26fbb094181ab6df6f988e904072ebe3132',
  'README.raw.snapshot': '826c1e3b1f1f8866f05d45f3d6b9eca5c06e901a2b67737774ad18aa1607e4d1',
  'backlog-row.git.snapshot': '28978c00c16442f39a816a2d8b0afdb1cb0df01b4eb0fecfafeaf58be9d07608',
  'backlog-row.raw.snapshot': 'f5aaefab60ab4cd076787d2784b962a91e24599353ea44df2e756b4f66d45f5e',
  'inventory-selected.json.snapshot': 'a7ea667285e30353afd7b9f13433428b8120ac71969d79ccd69cc622d5d222f4',
  'kanban-rows.git.snapshot': '7454c86dd835cb5fdb69e715d296abf0f49ba530806589f31651bf50dd318dc8',
  'kanban-rows.raw.snapshot': 'bbc702c5232e25260231881082f8839ea84bb14ce08680f10ac7e74932d077a9',
  'portable-contract.git.snapshot': '3717d18177d7134e4b310cd6cbb4c9f1a49b784a669e50462743730791b6df54',
  'portable-contract.raw.snapshot': '085552da4e772b7770b85f29a0d1c1c3170459db36164b977b41deaae168a904',
};

test('independent raw CRLF and canonical Git source snapshots keep their pinned bytes', () => {
  const manifest = JSON.parse(read('evidence', 'source-integrity.json'));
  assert.equal(manifest.sourceId, 'S147');
  assert.equal(manifest.originalReadmeCommit, 'a1411c1fd7b081e7772db0ac96eb61d697452c86');
  assert.equal(manifest.frozenInventoryBaseline, '8e7fb3cbcc61d3aa85116204735f10687f608b1c');
  assert.equal(manifest.rawAndCanonicalCapturedIndependently, true);
  assert.deepEqual(manifest.files.map((item) => item.name).sort(), Object.keys(sourceHashes).sort());
  for (const entry of manifest.files) {
    const bytes = fs.readFileSync(path.join(root, 'evidence', 'raw', 'source', entry.name));
    assert.equal(sha256(bytes), sourceHashes[entry.name], entry.name);
    assert.equal(entry.sha256, sourceHashes[entry.name], entry.name);
    assert.equal(bytes.length, entry.bytes);
    assert.equal(bytes.includes(Buffer.from('\r\n')), entry.crlf);
  }
  for (const base of ['backlog-row', 'kanban-rows', 'portable-contract']) {
    assert.equal(snapshot(`${base}.raw.snapshot`).replaceAll('\r\n', '\n'), snapshot(`${base}.git.snapshot`));
  }
});

test('exact S147 README, D-S147 backlog, original A/native rows and portable contract are preserved', () => {
  const readmeRow = '| S147 | **Client-side correctness oracle:** Detect empty-success responses, silent logout, lost state, duplicate effects, and broken UI, not just HTTP status. |';
  for (const name of ['README.raw.snapshot', 'README.git.snapshot']) {
    assert.equal(snapshot(name).split(/\r?\n/).find((line) => line.startsWith('| S147 |')), readmeRow);
  }
  const backlog = '| D-S147 | P0 | Add intentionally misleading 200 responses, silent state loss, duplicate effects, and broken UI fixtures. | The client-side oracle flags every injected acceptance failure and does not rely solely on HTTP/health status. | none |';
  assert.equal(snapshot('backlog-row.raw.snapshot').trim(), backlog);
  const rows = snapshot('kanban-rows.raw.snapshot').trim().split(/\r?\n/);
  assert.deepEqual(rows, [
    '| A-S147 | D-S147 | S | Inspect misleading 200/state-loss/duplicate fixtures; choose the correct client-side failure verdicts. | SOURCE |',
    '| B-S147 | D-S147 | S | Conduct one oracle conformance experiment; verify injected acceptance failures cannot pass through health status. | CORE, DATA, HOST |',
  ]);
  const contract = snapshot('portable-contract.raw.snapshot');
  assert.match(contract, /standalone, browser-openable lesson bundle/);
  assert.match(contract, /source ID, objective, preconditions, actions, synthetic input\/trace, expected assertions, and limits/);
  assert.match(contract, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(contract, /source demo is not complete until both required slices and its original acceptance gates pass/);
});

test('claimed original S unit and inventory evidence do not fabricate native or later catalog completion', () => {
  const selection = JSON.parse(snapshot('inventory-selected.json.snapshot'));
  const card = selection.cards.find((item) => item.id === 'A-S147');
  assert.equal(card.kanoUnit, 'A-S147');
  assert.equal(card.kano, 'S');
  assert.equal(card.priority, 'P0');
  assert.equal(card.packet, 'SC-S147');
  assert.equal(card.technicalEntryGate, 'SOURCE');
  assert.deepEqual(card.parents, ['D-S147']);
  assert.equal(selection.claimedCard.owner, 'worker-A-S147');
  assert.equal(selection.claimedCard.state, 'In Progress');
  assert.equal(selection.stateReadMutex, 'Local\\AppScalingStrategies_KanbanState_v1');
  assert.equal(selection.readHandlesClosedBeforeRelease, true);
  assert.match(selection.sourceInventorySha256, /^[0-9a-f]{64}$/);
  const remainder = JSON.parse(read('evidence', 'native-remainder.json'));
  assert.deepEqual(remainder.nativeEntryGates, ['CORE', 'DATA', 'HOST']);
  assert.equal(remainder.nativeEvidencePresent, false);
  assert.equal(remainder.sourceParentComplete, false);
  assert.equal(remainder.refinementCredit, 0);
  assert.equal(remainder.repairOrTestCredit, 0);
  assert.equal(remainder.aCreditLimit, 1);
  assert.match(remainder.catalogOperation, /135 practices only/);
});

test('raw evidence attributes are narrowly local and prevent CRLF normalization', () => {
  const attributes = read('.gitattributes').replaceAll('\r\n', '\n');
  assert.equal(attributes, '* text eol=lf\nevidence/raw/** -text -diff\nevidence/browser/*.json -text -diff\n');
  const relative = path.join('learning', 'S147', 'evidence', 'raw', 'source', 'README.raw.snapshot');
  const output = cp.execFileSync('git', ['check-attr', 'text', '--', relative], { encoding: 'utf8' });
  assert.match(output, /text: unset/);
  const rawDiff = cp.execFileSync('git', ['check-attr', 'diff', '--', relative], { encoding: 'utf8' });
  assert.match(rawDiff, /diff: unset/);
  assert.match(read('.gitignore'), /^\/evidence\/local\/publication-report\.json$/m);
});

test('behavioral RED archives preserve actual assertion failures and loadable stubs outside autodiscovery', () => {
  const unit = path.join('evidence', 'raw', 'red', 'unit-8daa7ed8-af87-45f0-845e-cbe76a02bf3f');
  const browser = path.join('evidence', 'raw', 'red', 'browser-a6e7af44-e338-448e-b80d-3d25e90f0233');
  for (const dir of [unit, browser]) {
    assert.equal(JSON.parse(read(dir, 'execution.json')).exitCode, 1);
    assert.match(read(dir, 'stdout.tap'), /ERR_ASSERTION/);
    assert.match(read(dir, 'stdout.tap'), /# pass 0/);
    assert.ok(fs.readdirSync(path.join(root, dir)).every((name) => !/\.test\.(?:js|cjs|mjs)$/.test(name)));
  }
  assert.match(read(unit, 'model.js.snapshot'), /clientVerdict: 'CLIENT-SIDE CORRECT'/);
  assert.match(read(browser, 'stdout.tap'), /'PASS' !== 'FAIL'/);
  const iac = JSON.parse(read('evidence', 'iac-na.json'));
  assert.equal(iac.iac, 'N/A');
  assert.equal(iac.templatesGenerated, false);
  assert.equal(iac.cloudValidationRun, false);
  assert.equal(iac.nativeAcceptance, false);
});

test('standalone assets have exact banner, local dependencies and a no-network/storage/cloud CSP envelope', () => {
  const html = read('index.html');
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((item) => item[1]), ['fixtures.js', 'model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((item) => item[1]), ['lesson.css']);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "worker-src 'none'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:/);
  assert.doesNotMatch(html, /<[^>]+\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  for (const name of ['fixtures.js', 'model.js', 'app.js']) {
    const source = read(name);
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|sendBeacon|serviceWorker|eval|Function)\s*(?:\(|\.|=)/);
    assert.doesNotMatch(source, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|document\.write)\b/);
  }
  assert.match(html, /original missing observation stays unknown/);
  assert.match(html, /not a measured benchmark/);
});

test('browser capture is opt-in only for the exact string 1, never normal verification or truthy coercion', () => {
  assert.equal(shouldCapture('1'), true);
  for (const value of [undefined, null, '', '0', 'true', 'yes', '01', ' 1', '1 ', true, 1]) {
    assert.equal(shouldCapture(value), false);
  }
  const source = read('tests', 'capture.cjs');
  assert.match(source, /if \(!shouldCapture\(process\.env\.CAPTURE_BROWSER_EVIDENCE\)\) return null/);
  assert.match(source, /flag: 'wx'/);
  const browser = read('tests', 'browser.test.cjs');
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /await session\.close\(\)/);
  const helper = fs.readFileSync(path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha256(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});

const qualifiedCapture = 'browser-49516998-d524-40d1-82fb-69b2199702b3.json';

test('qualified actual-browser receipt preserves served bytes and distinguishes offline local proof from native qualification', () => {
  const receipt = JSON.parse(read('evidence', 'browser', qualifiedCapture));
  assert.equal(receipt.schema, 'S147/browser-evidence-v1');
  assert.equal(receipt.passed, true);
  assert.equal(receipt.cleanup, 'awaited-closed');
  assert.equal(receipt.checks.length, 8);
  assert.ok(receipt.checks.every((check) => check.verdict === 'PASS'));
  assert.equal(receipt.runtime, 'v22.23.4');
  assert.equal(receipt.playwrightVersion, '1.56.1');
  assert.equal(receipt.browserVersion, '156.0.4314.50');
  assert.equal(receipt.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.deepEqual(receipt.pageErrors, []);
  assert.deepEqual(receipt.deniedRequests, []);
  assert.ok(receipt.requests.length >= 5 && receipt.requests.every((item) => item.protocol === 'file:'));
  assert.ok(receipt.cspViolations.some((item) => item.directive.startsWith('script-src') && item.blockedURI === 'inline'));
  assert.ok(receipt.cspViolations.some((item) => item.directive.startsWith('style-src') && item.blockedURI === 'inline'));
  for (const name of ['index.html', 'lesson.css', 'fixtures.js', 'model.js', 'app.js']) {
    const entry = receipt.servedAssetSnapshots[name];
    assert.equal(path.isAbsolute(entry.path), false);
    assert.ok(entry.path.startsWith(`${path.join('evidence', 'raw', 'served-assets')}${path.sep}`));
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(sha256(bytes), entry.sha256);
    assert.equal(entry.sha256, receipt.assets[name]);
    assert.equal(bytes.toString('utf8').replaceAll('\r\n', '\n'), read(name).replaceAll('\r\n', '\n'));
  }
  const tooling = JSON.parse(read('evidence', 'raw', 'tooling', 'preflight.json'));
  assert.equal(tooling.edgeSignatureStatus, 'Valid');
  assert.match(tooling.edgeSigner, /Microsoft Corporation/);
  assert.equal(tooling.downloads, 0);
  assert.equal(tooling.installs, 0);
  assert.equal(tooling.unsafeFlagsUsed, false);
  assert.match(tooling.scope, /Not Node 24 production, native\/source-parent proof/);
});

test('actual DOM receipt keeps detection/conformance/learner PASS separate from original interruption and unknown', () => {
  const receipt = JSON.parse(read('evidence', 'browser', qualifiedCapture));
  assert.equal(receipt.snapshots.length, 10);
  const empty = receipt.snapshots.find((item) => item.label.startsWith('empty-success:'));
  assert.equal(empty.learnerCheck.verifierVerdict, 'PASS');
  assert.equal(empty.conformance.expectedNegativeConformance.verdict, 'PASS');
  assert.equal(empty.originalImpact.interrupted, 1);
  assert.equal(empty.originalImpact.completed, 0);
  const unknown = receipt.snapshots.find((item) => item.label.startsWith('missing-observation:'));
  assert.equal(unknown.learnerCheck.expectedVerdict, 'UNKNOWN');
  assert.equal(unknown.originalImpact.unknown, 1);
  assert.ok(unknown.assertions.every((item) => item.verdict === 'UNKNOWN'));
  const recovery = receipt.snapshots.find((item) => item.label.startsWith('later-recovery:'));
  assert.deepEqual(recovery.originalImpact, {
    denominator: 2, completed: 0, interrupted: 1, unknown: 1, laterRecoveryObserved: 2,
  });
  assert.deepEqual(recovery.journeys.map((journey) => journey.originalOutcome), ['interrupted', 'unknown']);
  const keyboard = receipt.snapshots.find((item) => item.label.startsWith('keyboard:'));
  assert.match(keyboard.retainedHistory, /Check 1: learner FAIL/);
  assert.match(keyboard.retainedHistory, /Check 2: learner PASS/);
  assert.equal(keyboard.originalImpact.interrupted, 1);
});
