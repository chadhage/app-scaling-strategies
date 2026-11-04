'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = __dirname;
const read = (...parts) => fs.readFileSync(path.join(root, ...parts));
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (...parts) => JSON.parse(read(...parts));
const source = json('evidence', 'source.json');

test('exact S148 README, D-S148 backlog, original portable card and native remainder are pinned', () => {
  assert.equal(source.cardId, 'A-S148');
  assert.equal(source.workerId, 'worker-A-S148');
  assert.equal(source.sourceReadsCompletedBeforeDesign, true);
  assert.equal(source.liveFlowStateCopied, false);
  assert.equal(source.sourceMutex, 'Local\\AppScalingStrategies_KanbanState_v1');
  assert.equal(source.rawAndCanonicalIndependent, true);
  assert.equal(source.exactSourceAcceptance, 'Successful migration requires observed intended version movement; users remaining entirely on v1 do not inflate migration success.');
  assert.deepEqual(source.originalCard, {
    technicalEntryGate: 'SOURCE', kano: 'S', priority: 'P0', kanoUnit: 'A-S148',
    deliver: 'Read tier/version traces; unchanged users must not count as successful migration.',
    packet: 'LP-EXPORT', id: 'A-S148', parents: ['D-S148'],
  });
  const a = json('evidence', 'raw', 'source', 'inventory.A-S148.raw.json.txt');
  const b = json('evidence', 'raw', 'source', 'inventory.B-S148.raw.json.txt');
  assert.deepEqual(a, source.originalCard);
  assert.equal(b.technicalEntryGate, 'CORE, DATA, HOST');
  assert.equal(b.deliver, 'Conduct one actual-versus-false transition comparison; verify version evidence controls migration attribution.');
  assert.equal(b.packet, 'LP-EXPORT');
  assert.equal(b.kano, 'S');
  assert.equal(b.priority, 'P0');
  assert.match(read('evidence', 'raw', 'source', 'README.S148.git.txt').toString(), /Trace deployment\/version identity across tiers to prove users moved rather than remaining entirely on blue/);
  assert.match(read('evidence', 'raw', 'source', 'backlog.D-S148.git.txt').toString(), /Successful migration requires observed intended version movement; users remaining entirely on v1 do not inflate migration success/);
});

test('all archived raw source hashes and independently preserved canonical Git rows verify', () => {
  for (const file of source.files) {
    const bytes = read('evidence', 'raw', 'source', file.file);
    assert.equal(bytes.length, file.bytes, file.file);
    assert.equal(sha(bytes), file.sha256, file.file);
  }
  for (const [name, gitFile, prefix] of [
    ['README.S148', 'README.md', '| S148 |'],
    ['backlog.D-S148', '.docs/wiki/backlog.md', '| D-S148 |'],
    ['kanban.A-S148', '.docs/wiki/kanban.md', '| A-S148 |'],
    ['kanban.B-S148', '.docs/wiki/kanban.md', '| B-S148 |'],
    ['kanban.LP-EXPORT', '.docs/wiki/kanban.md', '| LP-EXPORT |'],
  ]) {
    const working = read('evidence', 'raw', 'source', `${name}.working.txt`);
    const canonical = read('evidence', 'raw', 'source', `${name}.git.txt`);
    assert.equal(working.subarray(-2).toString(), '\r\n', name);
    assert.equal(canonical.subarray(-1).toString(), '\n', name);
    assert.equal(canonical.includes(Buffer.from('\r\n')), false, name);
    assert.notEqual(sha(working), sha(canonical), name);
    assert.equal(working.toString().replace(/\r\n/g, '\n'), canonical.toString(), name);
    const git = spawnSync('git', ['show', `${source.inspectedGitHead}:${gitFile}`]);
    assert.equal(git.status, 0, git.stderr.toString());
    const start = git.stdout.indexOf(Buffer.from(prefix));
    const end = git.stdout.indexOf(10, start);
    assert.ok(start >= 0);
    assert.deepEqual(git.stdout.subarray(start, end + 1), canonical);
  }
});

test('narrow raw-byte attributes preserve source CRLF and RED independently of Git filtering', () => {
  assert.equal(read('.gitattributes').toString().trim(), 'evidence/raw/** -text -diff');
  const selected = [
    path.join('learning', 'S148', 'evidence', 'raw', 'source', 'README.S148.working.txt'),
    path.join('learning', 'S148', 'evidence', 'raw', 'red-01', 'stdout.raw.tap'),
  ];
  const result = spawnSync('git', ['check-attr', 'text', 'diff', '--', ...selected]);
  assert.equal(result.status, 0);
  assert.equal((result.stdout.toString().match(/text: unset/g) || []).length, 2);
  assert.equal((result.stdout.toString().match(/diff: unset/g) || []).length, 2);
  for (const file of selected) {
    const bytes = fs.readFileSync(file);
    const gitVirtualPath = file.split(path.sep).join('/');
    const filtered = spawnSync('git', ['hash-object', '--path', gitVirtualPath, '--stdin'], { input: bytes });
    const raw = spawnSync('git', ['hash-object', '--no-filters', '--stdin'], { input: bytes });
    assert.equal(filtered.status, 0);
    assert.equal(raw.status, 0);
    assert.deepEqual(filtered.stdout, raw.stdout);
  }
});

test('BDD then loadable stub genuine assertion RED and raw failures remain outside autodiscovery', () => {
  const red = json('evidence', 'red.json');
  assert.equal(red.stubLoadExit, 0);
  assert.equal(red.testExit, 1);
  assert.equal(red.assertionFailures, 2);
  const tap = read('evidence', 'raw', 'red-01', 'stdout.raw.tap').toString();
  assert.equal((tap.match(/code: 'ERR_ASSERTION'/g) || []).length, 2);
  assert.match(tap, /expected: 'observed'/);
  assert.match(tap, /expected: 'unchanged'/);
  assert.match(read('evidence', 'raw', 'red-01', 'model.js.snapshot.txt').toString(), /movement: 'unknown'/);
  assert.match(read('evidence', 'raw', 'red-01', 'actual-migration.feature.snapshot.txt').toString(), /Keep unchanged successful users out of migration success/);
  for (const file of red.files) assert.equal(sha(read('evidence', 'raw', 'red-01', file.file)), file.sha256);
  assert.equal(fs.readdirSync(path.join(root, 'evidence', 'raw', 'red-01')).some((file) => /\.test\.(?:cjs|js)$/.test(file)), false);
});

test('file-only lesson has external local assets, explicit CSP, accessible errors and nonshadowing reset', () => {
  const html = read('index.html').toString();
  const app = read('app.js').toString();
  const model = read('model.js').toString();
  const fixture = read('fixtures.js').toString();
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result\./);
  assert.match(html, /lang="en"/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(directive), directive);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['fixtures.js', 'model.js', 'app.js']);
  assert.equal(/<script(?:\s[^>]*)?>\s*[^<\s]/i.test(html), false);
  assert.equal(/\son\w+\s*=/i.test(html), false);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="notice" role="status" aria-live="polite"/);
  assert.equal(/(?:id|name)="reset"/.test(html), false);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.equal(/innerHTML|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage/.test(app + model + fixture), false);
  assert.equal(/Date\.now|performance\.now|Math\.random|setInterval|setTimeout/.test(app + model + fixture), false);
  assert.equal(/https?:\/\/|wss?:\/\//.test(html + app + model + fixture + read('style.css').toString()), false);
  for (const file of ['package.json', 'azure.yaml', 'main.bicep', 'server.js']) assert.equal(fs.existsSync(path.join(root, file)), false);
});

test('browser verification uses only exact deliberate capture and the published awaited-finally helper', () => {
  const browser = read('browser.test.cjs').toString();
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /browser-\$\{randomUUID\(\)\}/);
  assert.match(browser, /openIsolatedLesson\('learning\\\\S148\\\\index\.html'\)/);
  assert.match(browser, /finally \{[\s\S]*await session\.close\(\)/);
  assert.match(browser, /if \(rawDirectory\) \{[\s\S]*fs\.writeFileSync/);
  assert.match(browser, /if \(!capture\) assert\.deepEqual\(tree\(__dirname\), before/);
  assert.equal(/openIsolatedLoopback|chromium\.launch|bypassCSP:\s*true|--no-sandbox|ignoreHTTPSErrors/.test(browser), false);
  const helper = fs.readFileSync(path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha(helper), '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});

test('IaC N/A and honest native CORE DATA HOST remainder do not claim another original unit', () => {
  const scope = json('evidence', 'resource-scope.json');
  assert.equal(scope.authorization, 'local-synthetic-only');
  assert.equal(scope.iac.status, 'not-applicable');
  assert.equal(scope.iac.generated, false);
  assert.equal(scope.iac.deployed, false);
  assert.equal(scope.cloudOperations, 0);
  assert.equal(scope.networkTelemetry, false);
  assert.equal(scope.credentials, false);
  assert.equal(scope.originalUnitsAcceptedByWorker, 0);
  assert.equal(scope.nativeRemainder.cardId, 'B-S148');
  assert.equal(scope.nativeRemainder.technicalEntryGate, 'CORE, DATA, HOST');
  assert.equal(scope.nativeRemainder.state, 'blocked-not-delivered');
  assert.equal(scope.nativeRemainder.sourceParentComplete, false);
  assert.equal(scope.nativeRemainder.refinementCredit, 0);
  assert.match(read('README.txt').toString(), /Parent alone accepts this original[\s\S]*once/);
});
