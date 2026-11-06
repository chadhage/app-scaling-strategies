'use strict';

// U021: the dependency provenance check hashes exactly the accepted dependency files that the append-only addendum pins.
// The module under test always runs from a private fixture root under capability\C019\test-scratch\<uuid>, removed afterwards.
// Set C019_PROVENANCE_UNDER_TEST to an absolute path to replay the RED against archived pre-change bytes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const live = require('./provenance.cjs');
const manifest = require('..\\manifest.json');
const { root, repo, sha } = live;

const underTest = path.resolve(process.env.C019_PROVENANCE_UNDER_TEST || path.join(__dirname, 'provenance.cjs'));
const scratch = path.join(root, 'test-scratch');
const made = [];
const lf = (bytes) => sha(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const sealedList = () => JSON.parse(fs.readFileSync(path.join(root, manifest.historicalF6AuthorizationSnapshot), 'utf8')).preservation.dependencies;

function fixtureRoot() {
  const directory = path.join(scratch, randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  made.push(directory);
  return directory;
}
function write(fixture, relative, text) {
  const target = path.join(fixture, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}
test.after(() => {
  for (const directory of made) fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3 });
  try { fs.rmdirSync(scratch); } catch { /* another run still uses the folder */ }
});

const synthetic = Object.freeze({
  'capability\\C001\\a.txt': 'alpha\n',
  'capability\\C002\\nested\\b.txt': 'bravo\n',
  'capability\\C015\\tests\\c.txt': 'charlie\n',
  'testing\\browser\\isolated.cjs': 'delta\n',
});
const digests = (files) => Object.fromEntries(Object.entries(files).map(([file, text]) => [file, sha(Buffer.from(text))]));
function addendum(sequence, previousName, previousBytes, scope, overrides = {}) {
  return `${JSON.stringify({
    schema: 'C019-evidence-index-addendum/1', cardId: 'C019', sequence,
    previousIndex: { path: previousName, rawSha256: lf(previousBytes) },
    dependencyScope: { count: Object.keys(scope).length, files: scope }, ...overrides,
  }, null, 2)}\n`;
}
// A synthetic repository: four accepted files, a CRLF sealed index and a valid addendum 1 that pins them.
function syntheticFixture({ scope = digests(synthetic), sealed = 'sealed index\r\nsecond line\r\n', addendumOverrides = {} } = {}) {
  const fixture = fixtureRoot();
  for (const [file, text] of Object.entries(synthetic)) write(fixture, file, text);
  write(fixture, 'capability\\C019\\evidence-index.json', sealed);
  write(fixture, 'capability\\C019\\evidence-index-addendum-1.json', addendum(1, 'evidence-index.json', Buffer.from(sealed), scope, addendumOverrides));
  const target = path.join(fixture, 'capability', 'C019', 'tests', 'provenance.cjs');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(underTest, target);
  return { fixture, provenance: require(target), directory: path.join(fixture, 'capability', 'C019') };
}
function requireChain(provenance) {
  assert.equal(typeof provenance.acceptedDependencies, 'function', 'The pinned accepted list is exposed by tests\\provenance.cjs.');
  return provenance.acceptedDependencies;
}
const without = (value, key) => Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));

test('the dependency digests cover exactly the pinned files; any new file under the accepted roots is ignored', () => {
  const { fixture, provenance } = syntheticFixture();
  const before = provenance.dependencies();
  assert.deepEqual(Object.keys(before), Object.keys(synthetic));
  assert.deepEqual(before, digests(synthetic));
  write(fixture, 'capability\\C015\\tests\\new.txt', 'new');
  write(fixture, 'capability\\C001\\deep\\er\\new.txt', 'new');
  write(fixture, 'capability\\C002\\new.txt', 'new');
  write(fixture, 'capability\\C015\\test-scratch\\run\\leftover.txt', 'new');
  assert.deepEqual(Object.keys(provenance.dependencies()), Object.keys(synthetic), 'Only the listed files are hashed.');
  assert.deepEqual(provenance.dependencies(), before);
});

test('one changed byte alters only that digest and a removed or replaced listed file fails by name', () => {
  const { fixture, provenance } = syntheticFixture();
  const before = provenance.dependencies();
  const target = 'capability\\C002\\nested\\b.txt';
  write(fixture, target, 'bravo!\n');
  const changed = provenance.dependencies();
  assert.notEqual(changed[target], before[target]);
  assert.deepEqual(without(changed, target), without(before, target));
  write(fixture, target, 'bravo\n');
  fs.rmSync(path.join(fixture, 'capability', 'C001', 'a.txt'));
  assert.throws(() => provenance.dependencies(), /Accepted dependency file is missing: capability\\C001\\a\.txt/);
  fs.mkdirSync(path.join(fixture, 'capability', 'C001', 'a.txt'));
  assert.throws(() => provenance.dependencies(), /Accepted dependency is not a regular file: capability\\C001\\a\.txt/);
});

test('the sealed index is hashed LF-canonical and a later addendum may add a listed file', () => {
  const { directory, fixture, provenance } = syntheticFixture();
  const accepted = requireChain(provenance);
  assert.deepEqual(accepted(directory).files, digests(synthetic));
  assert.deepEqual(accepted(directory).addenda, ['evidence-index-addendum-1.json']);
  write(fixture, 'capability\\C015\\tests\\later.txt', 'echo\n');
  const first = fs.readFileSync(path.join(directory, 'evidence-index-addendum-1.json'));
  write(fixture, 'capability\\C019\\evidence-index-addendum-2.json',
    addendum(2, 'evidence-index-addendum-1.json', Buffer.from(first.toString('utf8').replace(/\n/g, '\r\n')),
      { 'capability\\C015\\tests\\later.txt': sha(Buffer.from('echo\n')) }));
  const extended = accepted(directory);
  assert.deepEqual(Object.keys(extended.files), [...Object.keys(synthetic), 'capability\\C015\\tests\\later.txt']);
  assert.deepEqual(Object.keys(provenance.dependencies()), Object.keys(extended.files));
});

test('a broken or tampered chain fails closed', () => {
  const sealed = Buffer.from('sealed index\r\nsecond line\r\n');
  const cases = [
    ['no addendum at all', (directory) => fs.rmSync(path.join(directory, 'evidence-index-addendum-1.json')), /pinned in evidence-index-addendum-1\.json/],
    ['a gap in the numbering', (directory) => fs.renameSync(path.join(directory, 'evidence-index-addendum-1.json'), path.join(directory, 'evidence-index-addendum-2.json')), /Consecutive addendum numbers/],
    ['a changed sealed index', (directory) => fs.writeFileSync(path.join(directory, 'evidence-index.json'), 'rewritten\n'), /predecessor changed/],
    ['a wrong predecessor name', (directory, fixture) => write(fixture, 'capability\\C019\\evidence-index-addendum-1.json',
      addendum(1, 'other.json', sealed, digests(synthetic))), /names its predecessor/],
    ['a wrong sequence field', (directory, fixture) => write(fixture, 'capability\\C019\\evidence-index-addendum-1.json',
      addendum(1, 'evidence-index.json', sealed, digests(synthetic), { sequence: 2 })), /sequence/],
    ['a wrong schema', (directory, fixture) => write(fixture, 'capability\\C019\\evidence-index-addendum-1.json',
      addendum(1, 'evidence-index.json', sealed, digests(synthetic), { schema: 'other/1' })), /schema/],
    ['a wrong count', (directory, fixture) => write(fixture, 'capability\\C019\\evidence-index-addendum-1.json',
      addendum(1, 'evidence-index.json', sealed, digests(synthetic), { dependencyScope: { count: 9, files: digests(synthetic) } })), /count/],
  ];
  for (const [label, damage, pattern] of cases) {
    const { directory, fixture, provenance } = syntheticFixture();
    const accepted = requireChain(provenance);
    assert.doesNotThrow(() => accepted(directory), `${label}: the undamaged chain is valid`);
    damage(directory, fixture);
    assert.throws(() => accepted(directory), pattern, label);
  }
});

test('an entry outside the accepted roots, a traversal, an absolute path or a malformed digest fails closed', () => {
  const good = sha(Buffer.from('x'));
  const bad = [
    ['an unpinned namespace', { 'capability\\C016\\x.txt': good }, /accepted dependency roots/],
    ['a traversal segment', { 'capability\\C015\\..\\..\\x.txt': good }, /accepted dependency roots/],
    ['an absolute path', { 'C:\\Windows\\win.ini': good }, /accepted dependency roots/],
    ['a forward slash', { 'capability/C015/x.txt': good }, /accepted dependency roots/],
    ['an empty segment', { 'capability\\C015\\\\x.txt': good }, /accepted dependency roots/],
    ['another testing file', { 'testing\\browser\\other.cjs': good }, /accepted dependency roots/],
    ['a short digest', { 'capability\\C015\\x.txt': 'abc' }, /SHA-256/],
    ['an upper-case digest', { 'capability\\C015\\x.txt': good.toUpperCase() }, /SHA-256/],
  ];
  for (const [label, scope, pattern] of bad) {
    const { directory, provenance } = syntheticFixture({ scope });
    assert.throws(() => requireChain(provenance)(directory), pattern, label);
  }
});

test('a later addendum may add listed files but never re-pin or remove one', () => {
  const { directory, fixture, provenance } = syntheticFixture();
  const accepted = requireChain(provenance);
  const first = fs.readFileSync(path.join(directory, 'evidence-index-addendum-1.json'));
  write(fixture, 'capability\\C019\\evidence-index-addendum-2.json',
    addendum(2, 'evidence-index-addendum-1.json', first, { 'capability\\C001\\a.txt': sha(Buffer.from('other')) }));
  assert.throws(() => accepted(directory), /already pinned/);
  write(fixture, 'capability\\C019\\evidence-index-addendum-2.json',
    addendum(2, 'evidence-index-addendum-1.json', first, {}, { dependencyScope: undefined }));
  assert.deepEqual(accepted(directory).files, digests(synthetic), 'An addendum without a scope removes nothing.');
});

test('a test-scratch folder at the namespace root is not part of the own-source inventory', () => {
  const { directory, provenance } = syntheticFixture();
  write(directory, 'tests\\kept.txt', 'kept');
  const before = provenance.inventory();
  assert.equal(Object.hasOwn(before, 'tests\\kept.txt'), true);
  write(directory, 'test-scratch\\nested\\leftover.txt', 'scratch');
  assert.deepEqual(provenance.inventory(), before, 'Concurrent verifier runs and tests cannot trip each other on private scratch.');
});

test('addendum 1 pins exactly the 161 sealed dependency records and chains to the unchanged sealed index', () => {
  requireChain(live);
  const addendumFile = path.join(root, 'evidence-index-addendum-1.json');
  assert.equal(fs.existsSync(addendumFile), true, 'The accepted list is pinned in evidence-index-addendum-1.json.');
  const value = JSON.parse(fs.readFileSync(addendumFile, 'utf8'));
  const sealed = sealedList();
  const accepted = live.acceptedDependencies();
  assert.equal(Object.keys(accepted.files).length, 161);
  assert.deepEqual(accepted.files, sealed, 'The pinned list equals preservation.dependencies of the sealed F6 snapshot.');
  assert.equal(value.sequence, 1);
  assert.equal(value.previousIndex.path, 'evidence-index.json');
  assert.equal(value.previousIndex.rawSha256, lf(fs.readFileSync(path.join(root, 'evidence-index.json'))));
  assert.equal(value.dependencyScope.source, manifest.historicalF6AuthorizationSnapshot);
  assert.equal(value.dependencyScope.sourceRawSha256, sha(fs.readFileSync(path.join(root, manifest.historicalF6AuthorizationSnapshot))));
  assert.equal(value.dependencyScope.count, 161);
  assert.equal(value.extraCredits, 0);
  assert.deepEqual(Object.keys(live.dependencies()), Object.keys(sealed), 'The live check names exactly the pinned files.');
  for (const file of Object.keys(sealed)) assert.equal(fs.lstatSync(path.join(repo, file)).isFile(), true, file);
});

test('every byte the addendum says it supersedes or adds is the byte on disk', () => {
  assert.equal(fs.existsSync(path.join(root, 'evidence-index-addendum-1.json')), true, 'The accepted list is pinned in evidence-index-addendum-1.json.');
  const value = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index-addendum-1.json'), 'utf8'));
  assert.ok(value.supersedes.length > 0 && value.adds.length > 0);
  for (const entry of [...value.supersedes, ...value.adds]) {
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(lf(bytes), entry.lfSha256, entry.path);
    assert.equal(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')).length, entry.lfByteLength, entry.path);
  }
  for (const entry of value.supersedes) assert.notEqual(entry.previousLfSha256, entry.lfSha256, `${entry.path} really changed`);
});

// Process level: the real verify.cjs, in a private copy of C019 and of the accepted dependency files, while a worker changes the
// tree after the verifier took its before snapshot. tests\provenance-hook.cjs applies that one change after the first child process.
function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === 'test-scratch') continue;
    const from = path.join(source, entry.name);
    if (entry.isDirectory()) copyTree(from, path.join(target, entry.name));
    else fs.copyFileSync(from, path.join(target, entry.name));
  }
}
function realFixture() {
  const fixture = fixtureRoot();
  copyTree(root, path.join(fixture, 'capability', 'C019'));
  for (const file of Object.keys(sealedList())) {
    const target = path.join(fixture, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(repo, file), target);
  }
  write(fixture, '.git\\kanban-orchestrator\\publish.ps1', '# hermetic stand-in; the syntax mode only parses it\n');
  fs.copyFileSync(underTest, path.join(fixture, 'capability', 'C019', 'tests', 'provenance.cjs'));
  return fixture;
}
function verify(fixture, kind, target) {
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C019_CAPTURE_DIRECTORY', 'C019_PROVENANCE_UNDER_TEST']) delete env[name];
  const args = kind === 'none' ? [] : ['--require', path.join(__dirname, 'provenance-hook.cjs')];
  if (kind !== 'none') Object.assign(env, { C019_MUTATE_KIND: kind, C019_MUTATE_FILE: target });
  const run = spawnSync(process.execPath, [...args, path.join(fixture, 'capability', 'C019', 'tests', 'verify.cjs'), 'syntax'],
    { cwd: fixture, env, encoding: 'utf8', timeout: 240000, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  assert.ifError(run.error);
  const match = /^C019_VERIFY_RECORD=(.*)$/m.exec(run.stdout);
  return { status: run.status, stderr: run.stderr, record: match ? JSON.parse(match[1]) : null };
}

test('control: an unchanged tree passes the real verifier in the private copy', () => {
  const run = verify(realFixture(), 'none');
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.record.exitCode, 0);
  assert.equal(run.record.dependencyFilesUnchanged, 161);
});

test('a file added under C015 in the middle of a verifier run leaves verify.cjs green', () => {
  const fixture = realFixture();
  const added = path.join(fixture, 'capability', 'C015', 'u021-added-in-the-middle.txt');
  const run = verify(fixture, 'add', added);
  assert.equal(fs.existsSync(added), true, 'The change really happened during the run.');
  assert.equal(run.status, 0, `Adding a file must not fail the verifier:\n${run.stderr}`);
  assert.equal(run.record.dependencyFilesUnchanged, 161);
});

test('one changed byte of a listed file in the middle of a run still fails verify.cjs', () => {
  const fixture = realFixture();
  const target = path.join(fixture, 'capability', 'C001', 'C001.feature');
  const before = fs.readFileSync(target);
  const run = verify(fixture, 'modify', target);
  assert.notDeepEqual(fs.readFileSync(target), before, 'The change really happened during the run.');
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /must remain unchanged/);
});

test('a listed file removed in the middle of a run still fails verify.cjs', () => {
  const fixture = realFixture();
  const target = path.join(fixture, 'capability', 'C002', 'README.md');
  const run = verify(fixture, 'remove', target);
  assert.equal(fs.existsSync(target), false, 'The change really happened during the run.');
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /Accepted dependency file is missing|must remain unchanged/);
});
