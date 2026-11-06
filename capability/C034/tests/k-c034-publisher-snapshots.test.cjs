'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hash, pins } = require('..\\pins.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const fixtures = path.join(__dirname, 'fixtures');
const guard = path.join(fixtures, 'no-live-publisher.cjs');
const snapshot = (name) => fs.readFileSync(path.join(fixtures, name));
const APPROVED = 'publish-f6df80bdafc0.ps1.txt';
const K_TIME = 'publish-2caba63847b9.ps1.txt';

function node(args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8', timeout: 150000, windowsHide: true });
}

test('the archived approved publisher snapshot is exactly the raw digest the C034 pins record', () => {
  const bytes = snapshot(APPROVED);
  assert.equal(hash(bytes), pins.publisherRawSha256);
  assert.equal(bytes.length, 5531);
  assert.ok(APPROVED.includes(pins.publisherRawSha256.slice(0, 12)));
});

test('the copy of the publisher that was live when K-C034 ran is archived under its own digest', () => {
  const bytes = snapshot(K_TIME);
  assert.ok(K_TIME.includes(hash(bytes).slice(0, 12)));
  assert.notEqual(hash(bytes), pins.publisherRawSha256);
});

test('each archived publisher admits C034 as S and keeps the closed-path, Admin and remote-before-stage guards the card relied on', () => {
  for (const name of [APPROVED, K_TIME]) {
    const source = snapshot(name).toString('utf8');
    const closedMap = /\$localCapabilityClasses=@\{([^}]*)\}/.exec(source);
    assert.ok(closedMap, name);
    const classes = Object.fromEntries([...closedMap[1].matchAll(/([A-Z0-9-]+)='([A-Z])'/g)].map((match) => [match[1], match[2]]));
    assert.equal(classes.C034, 'S', name);
    assert.ok(Object.values(classes).every((value) => ['D', 'S', 'L'].includes(value)), name);
    assert.match(source, /Not an owned card path/, name);
    assert.match(source, /Not a controller-owned path/, name);
    assert.match(source, /Publication requires checked-out main/, name);
    assert.match(source, /Main must already equal remote before staging/, name);
    assert.match(source, /core\.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol/, name);
    assert.ok(source.indexOf('$head -ne $remoteBeforeCommit') < source.indexOf("Run-Git (@('add'"), name);
    assert.ok(source.indexOf('$mutex.WaitOne') < source.indexOf("Run-Git @('rev-parse','HEAD')"), name);
    assert.ok(source.includes('$Message.StartsWith("[$CardId][$kanoClass]")'), name);
    assert.match(source, /'commit',\s*'--only'/, name);
    assert.match(source, /push','--atomic'/, name);
    assert.match(source, /Co-authored-by: Copilot/, name);
    assert.doesNotMatch(source, /'(?:reset|--force|--amend|--no-verify|-A|--all)'|'add'\s*,\s*'\.'|Remove-Item/, name);
  }
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').trim(), '* -text');
});

test('the guard fails every kind of access to the live publisher and still allows archived snapshots', () => {
  const live = path.join(repository, '.git', 'kanban-orchestrator', 'publish.ps1');
  const probe = [
    "const fs = require('node:fs');",
    'const [live, archived] = process.argv.slice(1);',
    'const outcomes = [];',
    "for (const call of [() => fs.readFileSync(live), () => fs.existsSync(live), () => fs.statSync(live), () => fs.lstatSync(live), () => fs.openSync(live, 'r'), () => fs.accessSync(live), () => fs.createReadStream(live)]) {",
    "  try { call(); outcomes.push('allowed'); } catch (error) { outcomes.push(error.code); }",
    '}',
    "fs.promises.readFile(live).then(() => outcomes.push('allowed'), (error) => outcomes.push(error.code))",
    "  .then(() => outcomes.push(fs.readFileSync(archived).length > 0 ? 'archived-readable' : 'archived-empty'))",
    '  .then(() => console.log(JSON.stringify(outcomes)));'
  ].join('\n');
  const result = node(['--require', guard, '-e', probe, live, path.join(fixtures, APPROVED)]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [...Array(8).fill('LIVE_PUBLISHER_ACCESS'), 'archived-readable']);
});

test('the formerly failing publisher check passes in a fresh Node process while any live publisher access would fail it', () => {
  const name = 'exact approved publisher still retains C034 S, closed paths/Admin and remote-before-stage CRLF-aware guards';
  const pattern = `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
  const result = node(['--require', guard, '--test-reporter=tap', `--test-name-pattern=${pattern}`, path.join(__dirname, 'surface.test.cjs')]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(result.stdout.split(/\r?\n/).includes(`ok 1 - ${name}`), result.stdout);
  assert.doesNotMatch(result.stdout, /^not ok/m);
  assert.doesNotMatch(result.stdout + result.stderr, /LIVE_PUBLISHER_ACCESS/);
});
