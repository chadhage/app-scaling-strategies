'use strict';

// Verifies that the newest recorded GREEN, coverage and browser evidence is complete, passing and still describes the
// current files. Run it last: node --test capability\C031\tests\evidence.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sha = (file) => createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const production = ['cli.cjs', 'evaluator.js', 'page.js', 'saved.js', 'source.cjs'];
const latest = (kind, pattern) => {
  const directory = path.join(root, 'evidence', kind);
  const names = fs.existsSync(directory) ? fs.readdirSync(directory).filter((name) => pattern.test(name)) : [];
  assert.ok(names.length > 0, `no recorded ${kind} evidence: record one before verifying`);
  names.sort((left, right) => Number(left.replace(/\D+/g, '')) - Number(right.replace(/\D+/g, '')) || left.localeCompare(right));
  return path.join(directory, names.at(-1));
};
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const currentSources = () => Object.fromEntries([...fs.readdirSync(root).filter((file) => /\.(?:js|cjs)$/.test(file)).sort(), 'index.html', 'style.css', 'imports.json']
  .map((file) => [file, sha(file)]));
const currentTests = () => Object.fromEntries([...fs.readdirSync(__dirname).filter((file) => /\.test\.cjs$/.test(file) && file !== 'evidence.test.cjs').sort(),
  'coverage.cjs', 'fixtures.cjs'].map((file) => [`tests\\${file}`, sha(path.join('tests', file))]));

for (const kind of ['green', 'coverage']) {
  test(`the newest recorded ${kind} run passed and describes exactly the current sources and tests`, () => {
    const directory = latest(kind, /^run-\d+$/);
    const manifest = json(path.join(directory, 'manifest.json'));
    assert.equal(manifest.schema, 'C031-run/1');
    assert.equal(manifest.kind, kind);
    assert.equal(manifest.exitCode, 0);
    assert.equal(fs.readFileSync(path.join(directory, 'exit-code.txt'), 'utf8'), '0\n');
    const rawStdout = zlib.gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz')));
    const rawStderr = zlib.gunzipSync(fs.readFileSync(path.join(directory, 'stderr.raw.gz')));
    assert.equal(createHash('sha256').update(rawStdout).digest('hex'), manifest.rawSha256.stdout);
    assert.equal(createHash('sha256').update(rawStderr).digest('hex'), manifest.rawSha256.stderr);
    assert.equal(rawStderr.length, 0);
    assert.deepEqual(manifest.sources, currentSources(), 'a source changed after this run was recorded: record a new run');
    assert.deepEqual(manifest.tests, currentTests(), 'a test changed after this run was recorded: record a new run');
    const stdout = rawStdout.toString('utf8');
    if (kind === 'green') {
      assert.equal(manifest.parsed.fail, 0);
      assert.ok(manifest.parsed.tests >= 180 && manifest.parsed.pass === manifest.parsed.tests);
      assert.match(stdout, new RegExp(`^# pass ${manifest.parsed.pass}$`, 'm'));
    } else {
      assert.equal(manifest.parsed.passed, true);
      assert.deepEqual(manifest.parsed.productionFiles, production);
      assert.equal(manifest.parsed.threshold, 85);
      for (const entry of manifest.parsed.coverage) {
        assert.equal(entry.loaded, true, entry.file);
        for (const key of ['lines', 'branches', 'functions']) assert.ok(entry[key] >= 85, `${entry.file} ${key} ${entry[key]}`);
        assert.equal(entry.failedTests, 0);
        assert.equal(entry.command.split('--test-coverage-include=').length, 2, `${entry.file}: exactly one included file per command`);
        assert.ok(entry.command.includes(`--test-coverage-include=capability/C031/${entry.file} --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85 `), entry.file);
        assert.match(entry.row, new RegExp(`^#\\s+${entry.file.replace('.', '\\.')}\\s*\\|`), entry.file);
      }
      assert.deepEqual(manifest.parsed.coverage.map((entry) => entry.file), production);
    }
  });
}

test('the newest recorded real-Edge observation passed, was signed Edge 156, cleaned up and describes the current page files', () => {
  const directory = latest('browser', /^browser-[0-9a-f-]{36}$/);
  const record = json(path.join(directory, 'summary.json'));
  assert.deepEqual([record.schema, record.cardId, record.outcome], ['C031-browser-proof/1', 'C031', 'passed']);
  assert.ok(record.checks.length >= 11 && record.checks.every((check) => check.passed === true));
  assert.match(record.browserVersion, /^156\./);
  assert.equal(record.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.equal(record.actualSignedEdge.fileVersion, record.browserVersion);
  assert.match(record.playwrightVersion, /^1\.56\.1$/);
  assert.deepEqual(record.cleanup, { browserClosed: true, exactHelperSessionRemoved: true, exactOwnedProfileRemoved: true, exactOwnedEdgeGone: true });
  assert.deepEqual([record.pageErrors, record.liveAzureResult, record.productionNode24Validated, record.helperPatched, record.unsafeFlagsUsed],
    [[], false, false, false, false]);
  assert.deepEqual(record.sourceSha256, Object.fromEntries(['index.html', 'page.js', 'evaluator.js', 'saved.js', 'style.css'].map((file) => [file, sha(file)])),
    'a page file changed after the browser run was recorded: record a new run');
  assert.ok(record.requestCount > 0);
});
