'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UsageError } = require('../errors.cjs');
const {
  MANIFEST_NAME, MANIFEST_SCHEMA, parseManifest, loadManifest, walkTree, ruleFor, classifyFile, enumerate, enumerateRoot,
  defaultTests, expandGlob, resolveTests
} = require('../enumerate.cjs');
const { fixtureRoot, makeScratch, dispose, writeTree } = require('./support.cjs');

const empty = parseManifest('{}');
const usage = (pattern) => (error) => error instanceof UsageError && pattern.test(error.message);

test('every path is classified as production, excluded by a named rule, or unclassified', () => {
  const production = ['cli.cjs', 'lib/core.mjs', 'page.js', 'pins.cjs', 'latest.cjs', 'testing.js', 'contest.cjs', 'verified.cjs', 'src/a/b/c.js'];
  for (const file of production) assert.deepEqual(classifyFile(file, empty), { status: 'production', by: 'rule' }, file);
  const excluded = {
    'tests/a.cjs': 'tests', 'test/a.cjs': 'tests', '__tests__/x.js': 'tests', 'Tests/Upper.js': 'tests', 'a.test.cjs': 'tests', 'b.spec.mjs': 'tests',
    'my-test.cjs': 'tests', 'my_test.js': 'tests', 'test-utils.js': 'tests', 'test.js': 'tests', 'deep/tests/x/y.js': 'tests',
    'evidence/red/x.cjs': 'evidence', 'Evidence/x.cjs': 'evidence', 'fixtures/x.js': 'fixtures', 'a/fixtures/b.cjs': 'fixtures',
    'node_modules/p/i.js': 'dependencies', '.hidden/x.js': 'hidden', 'a/.b/c.js': 'hidden',
    'compatibility.stub.snapshot.js': 'generated', 'x.pins.cjs': 'generated', 'x.pin.js': 'generated', 'x.generated.mjs': 'generated',
    'validator.d.ts': 'declarations', 'sub/types.d.mts': 'declarations', 'y.D.CTS': 'declarations',
    'tests/helper.ps1': 'tests'
  };
  for (const [file, rule] of Object.entries(excluded)) {
    const verdict = classifyFile(file, empty);
    assert.equal(verdict.status, 'excluded', file);
    assert.equal(verdict.by, 'rule', file);
    assert.equal(verdict.rule, rule, file);
    assert.equal(typeof verdict.reason, 'string');
  }
  for (const file of ['verify.cjs', 'verify-all.mjs', 'verify.helper.js', 'capture.cjs', 'seal.js', 'evidence-tool.cjs', 'browser.check.cjs', 'tools/capture.cjs']) {
    const verdict = classifyFile(file, empty);
    assert.equal(verdict.status, 'unclassified', file);
    assert.match(verdict.reason, /verification tooling/);
  }
  for (const file of ['read-gates.ps1', 'x.ts', 'y.sh', 'z.jsx', 'm.psm1', 'w.cmd']) {
    const verdict = classifyFile(file, empty);
    assert.equal(verdict.status, 'unclassified', file);
    assert.match(verdict.reason, /cannot be measured by Node coverage/);
  }
});

test('ruleFor reports no rule for an ordinary production path', () => {
  assert.equal(ruleFor('lib/server.cjs'), null);
  assert.equal(ruleFor('tests/a.cjs').rule, 'tests');
});

test('the manifest classifies explicitly and wins over the built-in rules', () => {
  const manifest = parseManifest(JSON.stringify({
    schema: MANIFEST_SCHEMA,
    production: ['verify.cjs', 'tests/support/runtime.cjs', 'tools.ps1'],
    exclude: [{ file: 'generated/**', reason: ' emitted by the build ' }, { file: 'fixtures/**', reason: 'fixtures' }]
  }));
  assert.deepEqual(classifyFile('verify.cjs', manifest), { status: 'production', by: 'manifest' });
  assert.deepEqual(classifyFile('tests/support/runtime.cjs', manifest), { status: 'production', by: 'manifest' });
  assert.deepEqual(classifyFile('generated/a.cjs', manifest), { status: 'excluded', by: 'manifest', reason: 'emitted by the build' });
  assert.deepEqual(classifyFile('fixtures/b.cjs', manifest), { status: 'excluded', by: 'manifest', reason: 'fixtures' });
  const unmeasurable = classifyFile('tools.ps1', manifest);
  assert.equal(unmeasurable.status, 'unclassified', 'A PowerShell file cannot be declared production: nothing here can measure it.');
});

test('a manifest that lists one file as production and as excluded is a usage error', () => {
  const manifest = parseManifest(JSON.stringify({ production: ['a.cjs'], exclude: [{ file: 'a.*', reason: 'because' }] }));
  assert.throws(() => classifyFile('a.cjs', manifest), usage(/both|as production .* and as excluded/));
});

test('manifest validation refuses everything that is not explicit', () => {
  const bad = (value, pattern) => assert.throws(() => parseManifest(typeof value === 'string' ? value : JSON.stringify(value)), usage(pattern), JSON.stringify(value));
  bad('{not json', /not valid JSON/);
  bad('[]', /must be a JSON object/);
  bad('null', /must be a JSON object/);
  bad({ colour: 'red' }, /unknown key "colour"/);
  bad({ schema: 'other/1' }, /schema must be/);
  bad({ production: 'a.cjs' }, /"production" must be an array/);
  bad({ exclude: {} }, /"exclude" must be an array/);
  bad({ production: [''] }, /production\[0\] must be a non-empty string/);
  bad({ production: [7] }, /production\[0\] must be a non-empty string/);
  bad({ production: ['/abs/a.cjs'] }, /relative path below the root/);
  bad({ production: ['C:\\x\\a.cjs'] }, /relative path below the root/);
  bad({ production: ['../a.cjs'] }, /relative path below the root/);
  bad({ exclude: ['a.cjs'] }, /exclude\[0\] must be an object/);
  bad({ exclude: [null] }, /exclude\[0\] must be an object/);
  bad({ exclude: [[]] }, /exclude\[0\] must be an object/);
  bad({ exclude: [{ file: 'a.cjs' }] }, /needs a reason/);
  bad({ exclude: [{ file: 'a.cjs', reason: '   ' }] }, /needs a reason/);
  bad({ exclude: [{ file: 'a.cjs', reason: 'x', why: 'y' }] }, /unknown key "why"/);
  bad({ exclude: [{ reason: 'no file' }] }, /exclude\[0\]\.file must be a non-empty string/);
  bad({ exclude: [{ file: 'a[1].cjs', reason: 'brackets' }] }, /Unsupported glob syntax/);
});

test('a manifest with a byte order mark and no keys is valid and empty', () => {
  assert.deepEqual(parseManifest('\uFEFF{}'), { schema: MANIFEST_SCHEMA, production: [], exclude: [] });
});

test('loadManifest returns an empty manifest when the root has none and reads the fixture manifest otherwise', () => {
  const missing = loadManifest(fixtureRoot('pass'));
  assert.deepEqual(missing, { schema: MANIFEST_SCHEMA, production: [], exclude: [] });
  const present = loadManifest(fixtureRoot('manifested'));
  assert.equal(present.exclude.length, 1);
  assert.equal(present.exclude[0].pattern, 'verify.cjs');
  assert.match(present.exclude[0].reason, /not production code/);
  const explicit = loadManifest(fixtureRoot('pass'), fs, path.join(fixtureRoot('manifested'), MANIFEST_NAME));
  assert.deepEqual(explicit.exclude.map((entry) => entry.pattern), ['verify.cjs'], 'an explicit manifest file replaces the one in the root');
});

test('an unreadable manifest is a usage error', () => {
  const scratch = makeScratch('manifest');
  try {
    fs.mkdirSync(path.join(scratch, MANIFEST_NAME));
    assert.throws(() => loadManifest(scratch), usage(/Cannot read coverage\.manifest\.json/));
  } finally {
    dispose(scratch);
  }
});

test('walkTree lists regular files in order, reports skipped directories and never enters them', () => {
  const scratch = makeScratch('walk');
  try {
    writeTree(scratch, {
      'b.cjs': '', 'a.js': '', 'lib/z.mjs': '', 'lib/deep/y.cjs': '', 'notes.md': '',
      'node_modules/pkg/index.js': '', '.hidden/secret.js': '', 'lib/.cache/c.js': ''
    });
    const listing = walkTree(scratch);
    assert.deepEqual(listing.files, ['a.js', 'b.cjs', 'lib/deep/y.cjs', 'lib/z.mjs', 'notes.md']);
    assert.deepEqual(listing.links, []);
    assert.deepEqual(listing.skipped, [
      { directory: '.hidden', rule: 'hidden' }, { directory: 'lib/.cache', rule: 'hidden' }, { directory: 'node_modules', rule: 'dependencies' }
    ]);
  } finally {
    dispose(scratch);
  }
});

test('a real directory junction or symbolic link is reported as a link and never entered', (t) => {
  const scratch = makeScratch('link');
  try {
    writeTree(scratch, { 'outside/secret.cjs': '', 'root/own.cjs': '' });
    try {
      fs.symlinkSync(path.join(scratch, 'outside'), path.join(scratch, 'root', 'jump'), 'junction');
    } catch (error) {
      t.skip(`this platform or account cannot create links: ${error.code}`);
      return;
    }
    const listing = walkTree(path.join(scratch, 'root'));
    assert.deepEqual(listing.files, ['own.cjs']);
    assert.deepEqual(listing.links, ['jump']);
  } finally {
    dispose(scratch);
  }
});

test('walkTree reports links without following them', () => {
  const entry = (name, kind) => ({ name, isSymbolicLink: () => kind === 'link', isDirectory: () => kind === 'dir', isFile: () => kind === 'file' });
  const tree = new Map([
    [path.join('r'), [entry('real.cjs', 'file'), entry('jump', 'link'), entry('sub', 'dir'), entry('socket', 'other')]],
    [path.join('r', 'sub'), [entry('inner.js', 'file'), entry('alias.js', 'link')]]
  ]);
  const listing = walkTree('r', { readdirSync: (directory) => tree.get(directory) });
  assert.deepEqual(listing.files, ['real.cjs', 'sub/inner.js']);
  assert.deepEqual(listing.links, ['jump', 'sub/alias.js']);
});

test('enumerate separates production, excluded and unclassified candidates and lists the evidence for each', () => {
  const listing = {
    files: ['cli.cjs', 'page.js', 'verify.cjs', 'tools/build.ps1', 'tests/a.test.cjs', 'evidence/red/x.cjs', 'README.md', 'data.json', 'lib/server.mjs'],
    links: ['alias.js'],
    skipped: [{ directory: 'node_modules', rule: 'dependencies' }]
  };
  const result = enumerate(listing, empty);
  assert.deepEqual(result.production.map((entry) => entry.file), ['cli.cjs', 'lib/server.mjs', 'page.js']);
  assert.deepEqual(result.excluded.map((entry) => [entry.file, entry.by]), [['evidence/red/x.cjs', 'rule'], ['tests/a.test.cjs', 'rule']]);
  assert.deepEqual(result.unclassified.map((entry) => entry.file), ['alias.js', 'tools/build.ps1', 'verify.cjs']);
  assert.match(result.unclassified[0].reason, /link/);
  assert.deepEqual(result.skippedDirectories, [{ directory: 'node_modules', rule: 'dependencies' }]);
  assert.deepEqual(result.warnings, []);
});

test('command-line filters are recorded, --exclude classifies and --include narrows the production list', () => {
  const listing = { files: ['a.cjs', 'b.cjs', 'sub/c.cjs', 'verify.cjs', 'tests/t.cjs'], links: ['alias.js'], skipped: [] };
  const excluded = enumerate(listing, empty, { exclude: ['verify.cjs', 'sub/**', 'alias.js'] });
  assert.deepEqual(excluded.production.map((entry) => entry.file), ['a.cjs', 'b.cjs']);
  assert.deepEqual(excluded.unclassified, []);
  assert.deepEqual(excluded.excluded.map((entry) => [entry.file, entry.by]),
    [['alias.js', 'cli'], ['sub/c.cjs', 'cli'], ['tests/t.cjs', 'rule'], ['verify.cjs', 'cli']]);
  const included = enumerate(listing, empty, { include: ['a.cjs', 'sub/*.cjs'] });
  assert.deepEqual(included.production.map((entry) => entry.file), ['a.cjs', 'sub/c.cjs']);
  const dropped = included.excluded.find((entry) => entry.file === 'b.cjs');
  assert.equal(dropped.by, 'cli');
  assert.match(dropped.reason, /not matched by --include a\.cjs sub\/\*\.cjs/);
  assert.deepEqual(included.unclassified.map((entry) => entry.file), ['alias.js', 'verify.cjs'], '--include never hides an unclassified candidate.');
});

test('manifest entries that match nothing are reported as warnings, never silently ignored', () => {
  const manifest = parseManifest(JSON.stringify({ production: ['gone.cjs', 'a.cjs'], exclude: [{ file: 'old/**', reason: 'removed folder' }] }));
  const result = enumerate({ files: ['a.cjs'], links: [], skipped: [] }, manifest);
  assert.deepEqual(result.warnings, [
    'coverage.manifest.json: production entry gone.cjs matches no script file',
    'coverage.manifest.json: exclude entry old/** matches no script file'
  ]);
});

test('enumerateRoot reads the fixtures: an unclassified tool without a manifest, a classified one with it', () => {
  const without = enumerateRoot(fixtureRoot('unclassified'));
  assert.deepEqual(without.production.map((entry) => entry.file), ['lib.cjs']);
  assert.deepEqual(without.unclassified.map((entry) => entry.file), ['verify.cjs']);
  const classified = enumerateRoot(fixtureRoot('manifested'));
  assert.deepEqual(classified.unclassified, []);
  assert.deepEqual(classified.excluded.map((entry) => [entry.file, entry.by]), [['tests/lib.test.cjs', 'rule'], ['verify.cjs', 'manifest']]);
});

test('default tests are the non-browser test files directly inside tests/, test/ and the root', () => {
  const scratch = makeScratch('default');
  try {
    writeTree(scratch, {
      'tests/a.test.cjs': '', 'tests/browser.test.cjs': '', 'tests/Browser-current.test.cjs': '', 'tests/b.test.mjs': '', 'tests/helper.cjs': '',
      'tests/nested/d.test.cjs': '', 'test/c.test.js': '', 'tests/dir.test.cjs/inner.txt': '', 'root.test.cjs': '', 'browser.test.cjs': '', 'notes.test.txt': ''
    });
    const rel = (list) => list.map((file) => path.relative(scratch, file).replace(/\\/g, '/'));
    assert.deepEqual(rel(defaultTests(scratch)), ['root.test.cjs', 'test/c.test.js', 'tests/a.test.cjs', 'tests/b.test.mjs']);
    assert.deepEqual(defaultTests(path.join(scratch, 'nowhere')), []);
  } finally {
    dispose(scratch);
  }
});

test('expandGlob expands a glob below its static prefix and finds nothing below a missing folder', () => {
  const scratch = makeScratch('expand');
  try {
    writeTree(scratch, { 'tests/a.test.cjs': '', 'tests/b.test.cjs': '', 'tests/c.txt': '', 'tests/deep/d.test.cjs': '', 'other/e.test.cjs': '' });
    const rel = (list) => list.map((file) => path.relative(scratch, file).replace(/\\/g, '/'));
    assert.deepEqual(rel(expandGlob('tests/*.test.cjs', scratch)), ['tests/a.test.cjs', 'tests/b.test.cjs']);
    assert.deepEqual(rel(expandGlob('tests\\**\\*.test.cjs', scratch)), ['tests/a.test.cjs', 'tests/b.test.cjs', 'tests/deep/d.test.cjs']);
    assert.deepEqual(rel(expandGlob('**/e.test.cjs', scratch)), ['other/e.test.cjs']);
    assert.deepEqual(expandGlob('missing/*.cjs', scratch), []);
  } finally {
    dispose(scratch);
  }
});

test('resolveTests resolves explicit files and globs relative to the cwd and names every problem', () => {
  const scratch = makeScratch('resolve');
  try {
    writeTree(scratch, { 'tests/a.test.cjs': '', 'tests/b.test.cjs': '', 'tests/dir.cjs/x': '' });
    const rel = (list) => list.map((file) => path.relative(scratch, file).replace(/\\/g, '/'));
    const good = resolveTests({ patterns: ['tests/a.test.cjs', 'tests/*.test.cjs'], cwd: scratch, root: scratch });
    assert.deepEqual(rel(good.tests), ['tests/a.test.cjs', 'tests/b.test.cjs'], 'duplicates collapse');
    assert.deepEqual(good.problems, []);
    const bad = resolveTests({ patterns: ['tests/ghost.test.cjs', 'tests/zzz*.test.cjs', 'tests/dir.cjs', 'tests/b.test.cjs'], cwd: scratch, root: scratch });
    assert.deepEqual(rel(bad.tests), ['tests/b.test.cjs']);
    assert.deepEqual(bad.problems, [
      'test file not found: tests/ghost.test.cjs',
      'no tests found: no file matches tests/zzz*.test.cjs',
      'test file not found: tests/dir.cjs'
    ]);
    const defaults = resolveTests({ patterns: [], cwd: scratch, root: scratch });
    assert.deepEqual(rel(defaults.tests), ['tests/a.test.cjs', 'tests/b.test.cjs']);
    const none = resolveTests({ patterns: [], cwd: scratch, root: path.join(scratch, 'empty') });
    assert.deepEqual(none.tests, []);
    assert.match(none.problems[0], /no tests found: the root holds no non-browser \*\.test\.cjs file/);
  } finally {
    dispose(scratch);
  }
});
