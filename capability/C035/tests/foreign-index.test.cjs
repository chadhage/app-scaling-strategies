'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const foreignIndex = require('..\\foreign-index.cjs');
const { withFixture, hermeticEnvironment, foreignPath, otherForeignPath } = require('.\\foreign-fixture.cjs');
const namespace = path.resolve(__dirname, '..');
const cli = path.join(namespace, 'foreign-index.cjs');
const blank = { schema: 'C035-foreign-index/1', paths: [], nameStatus: '', entries: '', flags: '', debug: '' };

test('foreign index: no foreign staged entries is an explicit empty baseline and own staged entries are never foreign', () => withFixture((fixture) => {
  assert.deepEqual(foreignIndex.snapshot(fixture.directory), blank);
  fixture.changeOwn();
  fixture.git('add', '--', 'capability/C035');
  assert.match(fixture.git('diff', '--cached', '--name-only'), /^capability\/C035\/new\.txt\n/m);
  assert.deepEqual(foreignIndex.snapshot(fixture.directory), blank);
  const verified = foreignIndex.verify(blank, fixture.directory);
  assert.equal(verified.preserved, true);
  assert.deepEqual(verified.changed, []);
}));
test('foreign index: staged modify, add and delete entries all survive the standard own-path commit exactly', () => withFixture((fixture) => {
  fixture.write('capability/C051/old.txt', 'to delete\n');
  fixture.git('add', '--', 'capability/C051/old.txt');
  fixture.git('commit', '-q', '-m', 'second foreign file');
  const modified = fixture.stageForeign('foreign modified\n');
  const added = fixture.stageForeign('foreign added\n', otherForeignPath);
  fixture.git('rm', '-q', '--cached', '--', 'capability/C051/old.txt');
  fixture.changeOwn();
  const before = foreignIndex.snapshot(fixture.directory);
  assert.deepEqual(before.paths, [foreignPath, otherForeignPath, 'capability/C051/old.txt']);
  assert.equal(before.nameStatus, `M\t${foreignPath}\nA\t${otherForeignPath}\nD\tcapability/C051/old.txt\n`);
  assert.equal(before.entries, `100644 ${modified} 0\t${foreignPath}\n100644 ${added} 0\t${otherForeignPath}\n`);
  assert.equal(before.flags, `H ${foreignPath}\nH ${otherForeignPath}\n`);
  fixture.publishOwn();
  assert.deepEqual(foreignIndex.snapshot(fixture.directory), before);
  assert.equal(foreignIndex.verify(before, fixture.directory).preserved, true);
  assert.equal(fixture.git('status', '--porcelain', '--untracked-files=no'), `M  ${foreignPath}\nA  ${otherForeignPath}\nD  capability/C051/old.txt\n`);
  assert.equal(fixture.git('show', `HEAD:${foreignPath}`), 'foreign base\n');
  assert.equal(fixture.git('show', 'HEAD:capability/C035/own.txt'), 'own changed\n');
}));
for (const [name, mutate, changedField] of [
  ['restaging other content', (fixture) => fixture.stageForeign('foreign other\n'), 'entries'],
  ['unstaging the entry', (fixture) => fixture.git('reset', '-q', '--', foreignPath), 'paths'],
  ['staging its deletion', (fixture) => fixture.git('rm', '-q', '--cached', '--', foreignPath), 'nameStatus'],
  ['an assume-unchanged flag', (fixture) => fixture.git('update-index', '--assume-unchanged', '--', foreignPath), 'flags'],
  ['another newly staged foreign path', (fixture) => fixture.stageForeign('another\n', otherForeignPath), 'paths'],
  ['an over-broad commit that also commits the foreign entry', (fixture) => { fixture.changeOwn(); fixture.git('commit', '-q', '-a', '-m', 'not --only'); }, 'paths']
]) {
  test(`foreign index: ${name} is detected as a changed foreign entry`, () => withFixture((fixture) => {
    fixture.stageForeign();
    const before = foreignIndex.snapshot(fixture.directory);
    assert.deepEqual(before.paths, [foreignPath]);
    mutate(fixture);
    const verified = foreignIndex.verify(before, fixture.directory);
    assert.equal(verified.preserved, false);
    assert.ok(verified.changed.includes(changedField), `${changedField} in ${verified.changed}`);
    assert.deepEqual(verified.before, before);
    assert.equal(foreignIndex.compare(before, verified.after).preserved, false);
  }));
}
test('foreign index: inherited Git repository location variables cannot redirect the read to another index', () => withFixture((fixture) => withFixture((other) => {
  const blob = fixture.stageForeign('foreign staged\n');
  const names = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE'];
  const saved = names.map((name) => [name, process.env[name]]);
  process.env.GIT_DIR = path.join(other.directory, '.git');
  process.env.GIT_WORK_TREE = other.directory;
  process.env.GIT_INDEX_FILE = path.join(other.directory, '.git', 'index');
  let observed;
  try { observed = foreignIndex.snapshot(fixture.directory); }
  finally { for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; } }
  assert.deepEqual(observed.paths, [foreignPath]);
  assert.equal(observed.entries, `100644 ${blob} 0\t${foreignPath}\n`);
})));
test('foreign index: glob characters, spaces and non-ASCII names are matched literally', () => withFixture((fixture) => {
  const odd = 'capability/C052/a[1] b{2} caf\u00e9.txt';
  fixture.write('capability/C052/a1.txt', 'tracked decoy\n');
  fixture.git('add', '--', 'capability/C052/a1.txt');
  fixture.git('commit', '-q', '-m', 'decoy');
  const blob = fixture.stageForeign('odd name\n', odd);
  const snapshot = foreignIndex.snapshot(fixture.directory);
  assert.deepEqual(snapshot.paths, [odd]);
  assert.equal(snapshot.entries.split('\n').filter(Boolean).length, 1);
  assert.ok(snapshot.entries.startsWith(`100644 ${blob} 0\t`));
  assert.equal(snapshot.nameStatus.startsWith('A\t'), true);
  assert.equal(foreignIndex.verify(snapshot, fixture.directory).preserved, true);
}));
test('foreign index: malformed snapshots and unreadable repositories reject visibly instead of passing', () => withFixture((fixture) => {
  const good = foreignIndex.snapshot(fixture.directory);
  for (const bad of [null, [], {}, { ...good, schema: 'other' }, { ...good, paths: 'p' }, { ...good, paths: [1] },
    { ...good, debug: 1 }, { ...good, extra: true }, { ...good, nameStatus: undefined }]) {
    assert.throws(() => foreignIndex.verify(bad, fixture.directory), { code: 'FOREIGN_INDEX_SNAPSHOT_SHAPE' });
    assert.throws(() => foreignIndex.compare(bad, good), { code: 'FOREIGN_INDEX_SNAPSHOT_SHAPE' });
    assert.throws(() => foreignIndex.compare(good, bad), { code: 'FOREIGN_INDEX_SNAPSHOT_SHAPE' });
  }
  for (const repository of [42, '', 'relative\\path', `${fixture.directory}\0`]) {
    assert.throws(() => foreignIndex.snapshot(repository), { code: 'FOREIGN_INDEX_REPOSITORY_REQUIRED' });
  }
  assert.throws(() => foreignIndex.snapshot(path.join(fixture.directory, 'missing')), { code: 'FOREIGN_INDEX_GIT_READ_FAILED' });
}));
test('foreign index: closed snapshot and verify commands report exit codes 0, 1 and 3 and reject every other shape', () => withFixture((fixture) => {
  fixture.stageForeign();
  const first = foreignIndex.run(['snapshot', fixture.directory], '');
  assert.equal(first.exitCode, 0);
  assert.deepEqual(JSON.parse(first.output).paths, [foreignPath]);
  const same = foreignIndex.run(['verify', fixture.directory], first.output);
  assert.equal(same.exitCode, 0);
  assert.equal(JSON.parse(same.output).preserved, true);
  fixture.stageForeign('foreign other\n');
  const changed = foreignIndex.run(['verify', fixture.directory], first.output);
  assert.equal(changed.exitCode, 1);
  assert.equal(JSON.parse(changed.output).preserved, false);
  assert.ok(JSON.parse(changed.output).changed.includes('entries'));
  for (const [args, input] of [[[], ''], [['snapshot'], ''], [['snapshot', fixture.directory, 'extra'], ''],
    [['unknown', fixture.directory], ''], [['verify', fixture.directory], 'not json'],
    [['verify', fixture.directory], '{"schema":"bad"}'], [['verify', fixture.directory], 'x'.repeat(70000)],
    [['snapshot', 'relative\\path'], ''], [['snapshot', path.join(fixture.directory, 'missing')], '']]) {
    const rejected = foreignIndex.run(args, input);
    assert.equal(rejected.exitCode, 3, JSON.stringify(args));
    const report = JSON.parse(rejected.output);
    assert.equal(report.valid, false);
    assert.equal(report.stagingPerformed, false);
    assert.match(report.code, /^(?:CLOSED_FOREIGN_INDEX_ARGUMENTS_REQUIRED|FOREIGN_INDEX_[A-Z_]+)$/);
  }
  const unreadable = foreignIndex.run(['verify', fixture.directory], () => { throw new Error('stdin unavailable'); });
  assert.equal(unreadable.exitCode, 3);
  assert.equal(JSON.parse(unreadable.output).code, 'FOREIGN_INDEX_UNAVAILABLE');
  assert.equal(foreignIndex.run(['verify', fixture.directory], () => first.output).exitCode, 1);
}));
test('foreign index: real process reads the named repository and exits 0, 1 and 3 through stdin/stdout only', () => withFixture((fixture) => {
  fixture.stageForeign();
  const spawn = (args, input) => spawnSync(process.execPath, [cli, ...args], {
    cwd: namespace, env: hermeticEnvironment(), input, encoding: 'utf8', timeout: 60000, maxBuffer: 1048576, windowsHide: true
  });
  const first = spawn(['snapshot', fixture.directory], undefined);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.startsWith('{'), 'The snapshot command must print one JSON object.');
  assert.deepEqual(JSON.parse(first.stdout).paths, [foreignPath]);
  const same = spawn(['verify', fixture.directory], first.stdout);
  assert.equal(same.status, 0, same.stderr);
  fixture.git('reset', '-q', '--', foreignPath);
  const changed = spawn(['verify', fixture.directory], first.stdout);
  assert.equal(changed.status, 1);
  assert.equal(JSON.parse(changed.stdout).preserved, false);
  const rejected = spawn(['verify'], '');
  assert.equal(rejected.status, 3);
  assert.equal(JSON.parse(rejected.stdout).code, 'CLOSED_FOREIGN_INDEX_ARGUMENTS_REQUIRED');
}));
test('foreign index: PowerShell guard accepts a preserving operation and throws when the operation clobbers the foreign entry', () => withFixture((fixture) => {
  fixture.stageForeign();
  fixture.changeOwn();
  const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(__dirname, 'foreign-guard-selftest.ps1'), '-Repository', fixture.directory], {
    cwd: namespace, env: hermeticEnvironment(), encoding: 'utf8', timeout: 120000, maxBuffer: 1048576, windowsHide: true
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const marker = 'C035_FOREIGN_GUARD_SELFTEST_JSON=';
  const line = run.stdout.split(/\r?\n/).find((value) => value.startsWith(marker));
  const summary = JSON.parse(line.slice(marker.length));
  assert.equal(summary.passed, true);
  assert.equal(summary.checks.length, 2);
  assert.equal(fixture.git('status', '--porcelain', '--', foreignPath), ` M ${foreignPath}\n`);
}));
test('foreign index: publication wrapper wraps the standard publisher in the guard and no longer pins live C048 index state', () => {
  const wrapper = fs.readFileSync(path.join(namespace, 'publish.ps1'), 'utf8');
  assert.match(wrapper, /\. \(Join-Path \$PSScriptRoot 'foreign-guard\.ps1'\)/);
  const guardAt = wrapper.indexOf('Invoke-C035ForeignPreserved $root');
  const publisherAt = wrapper.indexOf('& $publisher -CardId C035');
  assert.ok(guardAt > 0 && publisherAt > guardAt, 'The publisher call must sit inside the guard.');
  assert.equal(wrapper.match(/& \$publisher /g).length, 1);
  assert.equal(/replay\.cjs\.txt|foreign-index-initial\.json|Read-C035Foreign/.test(wrapper), false);
  assert.equal(/\bgit(?:\.exe)?['"]?\s+(?:--no-pager\s+)?(?:add|reset|restore|checkout|stash|clean|rm|commit)\b/.test(wrapper), false);
});
