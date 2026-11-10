'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { gunzipSync } = require('node:zlib');
const { test } = require('node:test');
const authority = require('./u053-authority.cjs');
const { checkTranscripts } = require('./evidence-check.cjs');
const suite = require('./u053-suite.cjs');
const { childEnvironment, noRepository, withBareRoot } = require('./u053-environment.cjs');
const { citationProblems } = require('./u053-predicate.test.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const chain = authority.readCurrentAuthority(root);
const addenda = authority.listAddenda(root);
const cache = new Map();
const read = (file) => {
  if (!cache.has(file)) cache.set(file, authority.readOwn(repository, file));
  return cache.get(file);
};

test('accepted f95 ancestry, all indexed current bytes, eleven frozen production files and all 39 test files are explicit', () => {
  assert.equal(chain.catalog.files.length, 427);
  assert.equal(chain.catalog.production.length, 11);
  assert.equal(chain.catalog.files.filter((entry) => /^capability\\C009\\tests\\[^\\]+\.test\.cjs$/.test(entry.path)).length, 32);
  assert.ok(authority.checkCurrent({ chain, read }) >= 427);
  assert.equal(authority.checkSubjects({ chain, read }), 179);
  for (const entry of chain.catalog.production) assert.equal(authority.sha(authority.lf(read(entry.path))), entry.gitCanonicalSha256);
  assert.equal(suite.TESTS.length, 39);
  assert.deepEqual(fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs')).sort(), [...suite.TESTS].sort());
  assert.deepEqual(fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort(), [...authority.PRODUCTION].sort());
  assert.equal(fs.readdirSync(root).some((name) => /^evidence-addendum-\d+\.json$/.test(name)), false, 'no rejected draft addenda');
  assert.equal(fs.existsSync(path.join(root, 'evidence', 'u053')), false, 'no rejected draft evidence or wrong probe');
});

test('every accepted historical capture keeps its raw transcript bytes, with named tamper controls per retained kind', () => {
  const kinds = new Set();
  let captures = 0;
  for (const entry of chain.catalog.files.filter((entry) => entry.path.startsWith('capability\\C009\\evidence\\') && entry.path.endsWith('.json'))) {
    assert.equal(authority.sha(read(entry.path)), entry.rawSha256, 'accepted manifest itself remains exact');
    const manifest = JSON.parse(read(entry.path));
    if (manifest.transcripts) {
      assert.deepEqual(checkTranscripts({ directory: path.dirname(entry.path), manifest, read }), []);
      const stream = path.join(path.dirname(entry.path), manifest.transcripts.stdout.path);
      const changed = Buffer.from(read(stream));
      changed[Math.floor(changed.length / 2)] ^= 0xff;
      assert.match(checkTranscripts({ directory: path.dirname(entry.path), manifest, read: (file) => file === stream ? changed : read(file) }).join('\n'), /stdout/);
      for (const kind of ['red', 'suite', 'coverage', 'mutant', 'browser', 'replay', 'loop']) if (entry.path.includes(kind)) kinds.add(kind);
      captures += 1;
    } else if (manifest.stdoutSha256 && manifest.stderrSha256) {
      for (const stream of ['stdout', 'stderr']) assert.equal(authority.sha(gunzipSync(read(path.join(path.dirname(entry.path), `${stream}.gz`)))), manifest[`${stream}Sha256`]);
      captures += 1;
    }
  }
  assert.ok(captures >= 80, 'all accepted generations, not just the newest suite');
  assert.deepEqual([...kinds].sort(), ['browser', 'coverage', 'loop', 'mutant', 'red', 'replay', 'suite']);
});

function rejects(name, change, pattern) {
  test(`fresh authority rejects ${name}`, () => {
    const altered = addenda.map((entry) => ({ ...entry, bytes: Buffer.from(entry.bytes) }));
    const value = JSON.parse(altered[0].bytes);
    const files = new Map();
    change({ value, altered, files });
    if (altered[0]?.name === addenda[0].name) altered[0].bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    const reader = (file) => {
      if (files.has(file)) {
        if (files.get(file) === null) throw new Error('seeded missing exact bytes');
        return files.get(file);
      }
      return read(file);
    };
    assert.throws(() => {
      const resolved = authority.resolveChain({ addenda: altered, read: reader, expectedTip: chain.tip });
      authority.checkCurrent({ chain: resolved, read: reader });
    }, pattern);
  });
}
rejects('missing first layer', ({ altered }) => altered.shift(), /ADDENDUM_(MISSING|SEQUENCE)/);
rejects('missing externally pinned tail', ({ altered }) => altered.pop(), /ADDENDUM_(MISSING|APPROVED_TIP|SEQUENCE)/);
rejects('forged predecessor', ({ value }) => { value.previous = { path: 'capability\\C009\\u053-cleanbase-addendum-9.json', rawSha256: '0'.repeat(64), crlfToLfSha256: '0'.repeat(64) }; }, /ADDENDUM_CHAIN/);
rejects('unknown schema key', ({ value }) => { value.extra = true; }, /ADDENDUM_SHAPE/);
rejects('different card', ({ value }) => { value.cardId = 'C010'; }, /ADDENDUM_SCHEMA/);
rejects('modified accepted seal', ({ files }) => files.set(authority.BASE.path, Buffer.concat([read(authority.BASE.path), Buffer.from(' ')])), /ADDENDUM_BASE_BYTES/);
rejects('changed accepted production', ({ files }) => files.set('capability\\C009\\server.cjs', Buffer.from('changed\n')), /CURRENT_BYTES_CHANGED/);
rejects('missing pristine subject', ({ value, files }) => files.set(value.subjects[0].inputs[0].pristinePath, null), /seeded missing/);
rejects('changed pristine subject', ({ value, files }) => files.set(value.subjects[0].inputs[0].pristinePath, Buffer.from('changed\n')), /SUBJECT_BYTES_CHANGED|CURRENT_BYTES_CHANGED/);
rejects('duplicate subject', ({ value }) => value.subjects.push(value.subjects[0]), /SUBJECT_DUPLICATE/);
rejects('unlisted README change', ({ files }) => files.set('capability\\C009\\README.md', Buffer.from('unlisted change\n')), /CURRENT_BYTES_CHANGED/);
rejects('foreign evidence addition', ({ value }) => { value.additions[0].path = 'capability\\C010\\foreign.json'; }, /AUTHORITY_PATH/);

test('positive next-layer resolution and independent maps do not hide coherent tail removal', () => {
  const first = authority.resolveChain({ addenda, read });
  const second = authority.resolveChain({ addenda, read });
  first.current.clear();
  first.subjects.clear();
  assert.equal(second.subjects.size, 5);
  assert.ok(second.current.has('capability\\C009\\server.cjs'));
  const file = 'capability\\C009\\evidence\\u053-cleanbase\\synthetic-control.txt';
  const bytes = Buffer.from('controlled extra data\n');
  const next = { schema: 'C009-cleanbase-evidence-addendum/1', cardId: 'C009', sequence: chain.count + 1, item: 'U053',
    reason: 'In-memory positive append control', base: authority.BASE, previous: chain.tip, catalog: chain.catalogPin,
    amendments: [], additions: [{ path: file, bytes: bytes.length, rawSha256: authority.sha(bytes), crlfToLfSha256: authority.sha(bytes) }], subjects: [] };
  const reader = (name) => name === file ? bytes : read(name);
  const extended = authority.resolveChain({ addenda: [...addenda, { name: `u053-cleanbase-addendum-${next.sequence}.json`, bytes: Buffer.from(`${JSON.stringify(next, null, 2)}\n`) }], read: reader });
  assert.equal(authority.checkCurrent({ chain: extended, read: reader }), chain.current.size + 1);
  assert.throws(() => authority.resolveChain({ addenda, read, expectedTip: extended.tip }), /ADDENDUM_APPROVED_TIP/);
});

test('path vocabulary refuses absolute, traversing, aliased, case-variant and Windows device paths', () => {
  assert.equal(authority.owned('capability\\C009\\evidence\\u053-cleanbase\\safe.txt'), 'capability\\C009\\evidence\\u053-cleanbase\\safe.txt');
  for (const file of ['C:\\outside.txt', 'capability/C009/a.txt', 'capability\\c009\\a.txt', 'capability\\C009\\..\\a.txt',
    'capability\\C009\\CON.txt', 'capability\\C009\\nul', 'capability\\C009\\trailing.', 'capability\\C009\\trailing ']) assert.throws(() => authority.owned(file), /AUTHORITY_PATH/);
});

test('every coverage row is independent, an unloaded row is zero and an added production or test file is not silently excluded', () => {
  assert.equal(suite.argumentsFor('suite').filter((argument) => argument.endsWith('.test.cjs')).length, 39);
  assert.equal(suite.argumentsFor('coverage-all').filter((argument) => argument.startsWith('--test-coverage-include=')).length, 11);
  assert.equal(suite.argumentsFor('coverage-all').some((argument) => argument.startsWith('--test-coverage-exclude=')), false);
  assert.deepEqual(suite.coverageObservation('', 'server.cjs'), { file: 'server.cjs', loaded: false, lines: 0, branches: 0, functions: 0, passed: false });
  assert.equal(suite.coverageObservation('# server.cjs | 100 | 84.99 | 100 |', 'server.cjs').passed, false);
  assert.equal(suite.coverageObservation('# server.cjs | 85 | 85 | 85 |', 'server.cjs').passed, true);
});

test('Git and Node contexts are cleared without mutating the caller, including Node automatic coverage inheritance', () => {
  const inherited = { PATH: process.env.PATH, GIT_DIR: 'foreign', GIT_COMMON_DIR: 'foreign', GIT_WORK_TREE: 'foreign',
    GIT_INDEX_FILE: 'foreign', GIT_OBJECT_DIRECTORY: 'foreign', GIT_CONFIG_COUNT: '1', GIT_CEILING_DIRECTORIES: 'foreign',
    NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'foreign' };
  const env = childEnvironment(inherited);
  assert.deepEqual(env, { PATH: inherited.PATH, NODE_V8_COVERAGE: '' });
  assert.equal(inherited.GIT_DIR, 'foreign');
  assert.equal(Object.hasOwn(env, 'NODE_TEST_CONTEXT'), false);
});

test('real filesystem missing and existing-but-unpinned citations fail by name and an existing pinned path passes', () => {
  const base = process.env.U053_SCRATCH_ROOT || path.join(root, 'tests', '.u053-scratch');
  const fixture = path.join(base, `citations-${randomUUID()}`);
  const relative = 'evidence\\green-fix2\\suite.json';
  fs.mkdirSync(path.dirname(path.join(fixture, relative)), { recursive: true });
  try {
    fs.writeFileSync(path.join(fixture, relative), read(authority.BASE.path), { flag: 'wx' });
    fs.writeFileSync(path.join(fixture, 'evidence', 'existing-unpinned.txt'), 'actual unpinned bytes\n', { flag: 'wx' });
    const pinned = new Set([...chain.current.keys()].map((file) => file.replace(/^capability\\C009\\/, '')));
    const exists = (file) => fs.existsSync(path.join(fixture, file));
    assert.deepEqual(citationProblems(`\`${relative}\``, exists, pinned), []);
    assert.match(citationProblems('`evidence\\missing-path.txt`', exists, pinned).join('\n'), /missing-path\.txt: missing evidence/);
    assert.match(citationProblems('`evidence\\existing-unpinned.txt`', exists, pinned).join('\n'), /existing-unpinned\.txt: evidence exists but no manifest pins it/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    if (!process.env.U053_SCRATCH_ROOT && fs.existsSync(base) && !fs.readdirSync(base).length) fs.rmdirSync(base);
  }
});

const rootGitPresent = fs.existsSync(path.join(repository, '.git'));
if (!rootGitPresent) {
  const env = childEnvironment(process.env);
  if (process.env.GIT_CEILING_DIRECTORIES) env.GIT_CEILING_DIRECTORIES = process.env.GIT_CEILING_DIRECTORIES;
  noRepository(repository, env);
}
test('real repository: accepted f95 blobs match, a differing C001 pin fails, correct pins and hostile inherited Git context pass',
  { skip: !rootGitPresent ? 'no git repository at the proven bare archive root; exact accepted-object and changed-pin controls require repository history' : false }, () => {
    const env = childEnvironment();
    for (const entry of chain.catalog.production) {
      const blob = execFileSync('git', ['--no-pager', 'show', `f95cc52a29cf:${entry.path.replaceAll('\\', '/')}`],
        { cwd: repository, env, windowsHide: true, timeout: 20000 });
      assert.equal(authority.sha(blob), entry.gitCanonicalSha256);
    }
    const base = process.env.U053_SCRATCH_ROOT || path.join(root, 'tests', '.u053-scratch');
    const directory = path.join(base, `pin-${randomUUID()}`);
    fs.mkdirSync(directory, { recursive: true });
    try {
      const pins = JSON.parse(fs.readFileSync(path.join(root, 'imports.json'), 'utf8'));
      const changed = structuredClone(pins);
      const name = Object.keys(changed.c001CanonicalSha256)[0];
      changed.c001CanonicalSha256[name] = '0'.repeat(64);
      const pinFile = path.join(directory, 'wrong-pins.json');
      fs.writeFileSync(pinFile, `${JSON.stringify(changed)}\n`, { flag: 'wx' });
      const args = ['--test', '--test-concurrency=1', 'capability\\C009\\tests\\imports.test.cjs'];
      const wrong = spawnSync(process.execPath, args, { cwd: repository, env: childEnvironment(process.env, { C009_IMPORTS_PIN_FILE: pinFile }), windowsHide: true, encoding: 'utf8', timeout: 120000 });
      assert.equal(wrong.error, undefined);
      assert.equal(wrong.status, 1);
      assert.match(wrong.stdout, /ERR_ASSERTION/);
      assert.match(wrong.stdout, /accepted blob/);
      assert.match(wrong.stdout, /^# skipped 0$/m);
      const correct = spawnSync(process.execPath, args, { cwd: repository, env, windowsHide: true, encoding: 'utf8', timeout: 120000 });
      assert.equal(correct.error, undefined);
      assert.equal(correct.status, 0);
      assert.match(correct.stdout, /^# pass 3$/m);
      assert.match(correct.stdout, /^# skipped 0$/m);
      const hostile = { ...env, GIT_DIR: directory, GIT_COMMON_DIR: directory, GIT_WORK_TREE: directory, GIT_INDEX_FILE: path.join(directory, 'missing-index') };
      const isolated = spawnSync(process.execPath, args, { cwd: repository, env: hostile, windowsHide: true, encoding: 'utf8', timeout: 120000 });
      assert.equal(isolated.error, undefined);
      assert.equal(isolated.status, 0);
      assert.match(isolated.stdout, /^# pass 3$/m);
      assert.match(isolated.stdout, /^# skipped 0$/m);
      console.log(`U053 PIN CONTROL RAW ${JSON.stringify({ wrong: { exitCode: wrong.status, stdout: wrong.stdout, stderr: wrong.stderr },
        correct: { exitCode: correct.status, stdout: correct.stdout, stderr: correct.stderr },
        hostileInheritedGit: { exitCode: isolated.status, stdout: isolated.stdout, stderr: isolated.stderr } })}`);
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
      if (!process.env.U053_SCRATCH_ROOT && fs.existsSync(base) && !fs.readdirSync(base).length) fs.rmdirSync(base);
    }
  });

test('two nested bare scopes clean an injected failure without disturbing the live outer scope', () => {
  const base = process.env.U053_SCRATCH_ROOT || path.join(root, 'tests', '.u053-scratch');
  const physical = [];
  const result = withBareRoot(base, (outer) => {
    physical.push(outer.physical);
    assert.throws(() => withBareRoot(base, (inner) => {
      physical.push(inner.physical);
      noRepository(outer.root, outer.env);
      noRepository(inner.root, inner.env);
      assert.fail('named injected bare-scope failure');
    }), /named injected/);
    assert.equal(fs.existsSync(physical[1]), false);
    noRepository(outer.root, outer.env);
    return { outerStillLiveAfterInnerFailure: true };
  });
  assert.equal(result.bareCleanup.aliasRemoved, true);
  assert.ok(physical.every((file) => !fs.existsSync(file)));
  if (!process.env.U053_SCRATCH_ROOT && fs.existsSync(base) && !fs.readdirSync(base).length) fs.rmdirSync(base);
});
