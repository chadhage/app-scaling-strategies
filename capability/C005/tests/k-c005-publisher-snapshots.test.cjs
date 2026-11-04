'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..');
const fixtures = path.join(__dirname, 'fixtures');
const guard = path.join(fixtures, 'no-live-publisher.cjs');
const evidence = path.join(__dirname, '..', 'evidence', 'op-catalog-snapshot-refresh-165-c8b3139f07aa');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshot = (name) => fs.readFileSync(path.join(fixtures, name));
const version = JSON.parse(fs.readFileSync(path.join(evidence, 'readonly-boundary-version-change-04.json'), 'utf8'));
const APPROVED = 'publish-f6df80bdafc0.ps1.txt';
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

test('the archived parent-approved publisher snapshot is exactly the version the sealed evidence binds', () => {
  const bytes = snapshot(APPROVED);
  assert.equal(sha(bytes), version.currentPublisher.sha256);
  assert.equal(bytes.length, version.currentPublisher.bytes);
  assert.ok(APPROVED.includes(version.currentPublisher.sha256.slice(0, 12)));
  for (const earlier of [version.originalPublisher, version.previousPublisher]) {
    assert.notEqual(sha(bytes), earlier.sha256);
    assert.equal(earlier.path, version.currentPublisher.path);
  }
});

test('the copy of the publisher that was live when K-C005 ran is archived under its own digest', () => {
  const bytes = snapshot(K_TIME);
  assert.ok(K_TIME.includes(sha(bytes).slice(0, 12)));
  assert.notEqual(sha(bytes), version.currentPublisher.sha256);
});

test('each archived publisher admits C005 as S and keeps the publication guarantees the card relied on', () => {
  for (const name of [APPROVED, K_TIME]) {
    const text = snapshot(name).toString('utf8');
    const closedMap = /\$localCapabilityClasses=@\{([^}]*)\}/.exec(text);
    assert.ok(closedMap, name);
    const classes = Object.fromEntries([...closedMap[1].matchAll(/([A-Z0-9-]+)='([A-Z])'/g)].map((match) => [match[1], match[2]]));
    assert.equal(classes.C005, 'S', name);
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
    assert.ok(text.includes("'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol'"), name);
    assert.doesNotMatch(text, /'(?:reset|--force|--amend|--no-verify|-A|--all)'|'add'\s*,\s*'\.'|Remove-Item/, name);
  }
});

test('the guard fails every kind of access to the live publisher and still allows archived snapshots', () => {
  const live = path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1');
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

test('the two formerly failing checks pass in fresh Node processes while any live publisher access would fail them', () => {
  const checks = [
    ['publication-recovery-150.test.cjs', 'publication recovery preserves all historical working bytes and both complete failed-attempt file sets'],
    ['snapshot-refresh.test.cjs', 'helper and Admin stay unchanged while the exact parent-approved publisher version is separately bound']
  ];
  for (const [file, name] of checks) {
    const pattern = `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
    const result = node(['--require', guard, '--test-reporter=tap', `--test-name-pattern=${pattern}`, path.join(__dirname, file)]);
    assert.equal(result.status, 0, `${file}\n${result.stdout}\n${result.stderr}`);
    assert.ok(result.stdout.split(/\r?\n/).includes(`ok 1 - ${name}`), `${file}\n${result.stdout}`);
    assert.doesNotMatch(result.stdout, /^not ok/m, file);
    assert.doesNotMatch(result.stdout + result.stderr, /LIVE_PUBLISHER_ACCESS/, file);
  }
});
