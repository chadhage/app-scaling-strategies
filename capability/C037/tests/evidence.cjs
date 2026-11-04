'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { hash } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
function scan() {
  const raw = path.join(root, 'evidence', 'raw');
  const runs = [];
  const emptyUnqualifiedDirectories = [];
  for (const entry of fs.readdirSync(raw, { withFileTypes: true })) {
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink());
    assert.match(entry.name, /^[a-z]+-[0-9a-f-]{36}$/);
    const directory = path.join(raw, entry.name);
    const file = path.join(directory, 'run.json');
    if (!fs.existsSync(file)) {
      assert.deepEqual(fs.readdirSync(directory), [], 'Incomplete nonempty captures cannot be silently ignored.');
      emptyUnqualifiedDirectories.push(path.relative(root, directory));
      continue;
    }
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(run.cardId, 'C037');
    assert.equal(run.workerId, 'worker-C037');
    assert.equal(run.directory, path.relative(repository, directory));
    assert.ok(run.sourceHashes.every((source) => source.path.startsWith('capability\\C037\\')));
    const stdout = gunzipSync(fs.readFileSync(path.join(directory, 'stdout.raw.gz')));
    const stderr = gunzipSync(fs.readFileSync(path.join(directory, 'stderr.raw.gz')));
    assert.equal(hash(stdout), run.stdoutSha256);
    assert.equal(hash(stderr), run.stderrSha256);
    runs.push({ ...run, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), absoluteDirectory: directory });
  }
  runs.sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc));
  return { runs, emptyUnqualifiedDirectories };
}
function latestGreen(runs, stage) {
  const value = runs.filter((run) => run.stage === stage && run.exitCode === 0).at(-1);
  assert.ok(value, `Actual recorded GREEN is required for ${stage}.`);
  return value;
}
function evidenceFiles() {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      assert.equal(entry.isSymbolicLink(), false);
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else files.push({ path: path.relative(root, file), rawSha256: hash(fs.readFileSync(file)), size: fs.statSync(file).size });
    }
  }
  walk(path.join(root, 'evidence'));
  return files.sort((a, b) => a.path.localeCompare(b.path));
}
module.exports = Object.freeze({ scan, latestGreen, evidenceFiles });
