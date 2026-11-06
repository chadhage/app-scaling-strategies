'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const fixtures = path.join(__dirname, 'fixtures');
const guard = path.join(fixtures, 'no-live-publisher.cjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const boundary = JSON.parse(fs.readFileSync(path.join(root, 'publisher-boundary.json'), 'utf8'));
const archived = (name) => fs.readFileSync(path.join(root, 'evidence', name));
const K_TIME = 'publish-2caba63847b9.ps1.txt';

function childEnvironment() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return env;
}
function node(args) {
  return spawnSync(process.execPath, args, { cwd: repo, env: childEnvironment(), encoding: 'utf8', timeout: 150000, windowsHide: true });
}

test('every archived approved publisher snapshot has exactly the digest the boundary records', () => {
  assert.equal(boundary.approvedVersionHistory.length, 2);
  for (const entry of boundary.approvedVersionHistory) assert.equal(sha(archived(entry.sourceSnapshot)), entry.sha256, entry.sourceSnapshot);
  const approved = boundary.approvedVersionHistory.at(-1);
  assert.equal(approved.sourceSnapshot, boundary.approvedSourceSnapshot);
  assert.equal(approved.sha256, boundary.parentApprovedSha256);
  assert.equal(boundary.approvedVersionHistory[0].sha256, boundary.supersededParentApprovedSha256);
  assert.notEqual(approved.sha256, boundary.supersededParentApprovedSha256);
});

test('the copy of the publisher that was live when K-C015 ran is archived under its own digest', () => {
  const bytes = fs.readFileSync(path.join(fixtures, K_TIME));
  assert.ok(K_TIME.includes(sha(bytes).slice(0, 12)));
  assert.notEqual(sha(bytes), boundary.parentApprovedSha256);
});

test('the approved snapshot and the K-time copy admit C015 as D and keep the publication guarantees the card relied on', () => {
  const versions = [
    [boundary.approvedSourceSnapshot, archived(boundary.approvedSourceSnapshot)],
    [K_TIME, fs.readFileSync(path.join(fixtures, K_TIME))]
  ];
  for (const [name, bytes] of versions) {
    const text = bytes.toString('utf8');
    const closedMap = /\$localCapabilityClasses=@\{([^}]*)\}/.exec(text);
    assert.ok(closedMap, name);
    const classes = Object.fromEntries([...closedMap[1].matchAll(/([A-Z0-9-]+)='([A-Z])'/g)].map((match) => [match[1], match[2]]));
    assert.equal(classes.C015, 'D', name);
    assert.ok(Object.values(classes).every((value) => ['D', 'S', 'L'].includes(value)), name);
    assert.match(text, /Local\\AppScalingStrategies_KanbanPublisher_v1/, name);
    assert.ok(text.indexOf('$mutex.WaitOne') < text.indexOf("Run-Git @('rev-parse','HEAD')"), name);
    assert.ok(text.indexOf('if($head -ne $remoteBeforeCommit)') < text.indexOf("Run-Git (@('add'"), name);
    assert.ok(text.includes('$Message.StartsWith("[$CardId][$kanoClass]")'), name);
    assert.match(text, /'commit',\s*'--only'/, name);
    assert.match(text, /Co-authored-by: Copilot <223556219\+Copilot@users\.noreply\.github\.com>/, name);
    assert.match(text, /'tag',\s*'-a'/, name);
    assert.ok(text.includes('kanban/$CardId/$short'), name);
    assert.match(text, /'push',\s*'--atomic'/, name);
    assert.match(text, /'merge-base',\s*'--is-ancestor'/, name);
    assert.ok(text.includes(`'core.whitespace=${boundary.commandLocalWhitespacePolicy}'`), name);
    assert.doesNotMatch(text, /'(?:reset|--force|--amend|--no-verify|-A|--all)'|'add'\s*,\s*'\.'|Remove-Item/, name);
  }
});

test('only the superseded snapshot lacks the command-local cr-at-eol whitespace policy the parent later approved', () => {
  const [superseded, approved] = boundary.approvedVersionHistory.map((entry) => archived(entry.sourceSnapshot).toString('utf8'));
  assert.ok(!superseded.includes('cr-at-eol'));
  assert.ok(approved.includes('cr-at-eol'));
  assert.ok(fs.readFileSync(path.join(fixtures, K_TIME), 'utf8').includes('cr-at-eol'));
});

test('the guard fails every kind of access to the live publisher and still allows archived snapshots', () => {
  const live = path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1');
  const probe = [
    "const fs = require('node:fs');",
    'const [live, archivedFile] = process.argv.slice(1);',
    'const outcomes = [];',
    "for (const call of [() => fs.readFileSync(live), () => fs.existsSync(live), () => fs.statSync(live), () => fs.lstatSync(live), () => fs.openSync(live, 'r'), () => fs.accessSync(live), () => fs.createReadStream(live)]) {",
    "  try { call(); outcomes.push('allowed'); } catch (error) { outcomes.push(error.code); }",
    '}',
    "fs.promises.readFile(live).then(() => outcomes.push('allowed'), (error) => outcomes.push(error.code))",
    "  .then(() => outcomes.push(fs.readFileSync(archivedFile).length > 0 ? 'archived-readable' : 'archived-empty'))",
    '  .then(() => console.log(JSON.stringify(outcomes)));'
  ].join('\n');
  const result = node(['--require', guard, '-e', probe, live, path.join(root, 'evidence', boundary.approvedSourceSnapshot)]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [...Array(8).fill('LIVE_PUBLISHER_ACCESS'), 'archived-readable']);
});

test('the formerly failing publisher check passes in a fresh Node process while any live publisher access would fail it', () => {
  const name = 'the exact parent-approved standard publisher preserves the mutex, remote HEAD gate, scoped D commit, annotation and atomic push';
  const pattern = `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
  const result = node(['--require', guard, '--test-reporter=tap', `--test-name-pattern=${pattern}`, path.join(__dirname, 'surface.test.cjs')]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.ok(result.stdout.split(/\r?\n/).includes(`ok 1 - ${name}`), result.stdout);
  assert.doesNotMatch(result.stdout, /^not ok/m);
  assert.doesNotMatch(result.stdout + result.stderr, /LIVE_PUBLISHER_ACCESS/);
});
