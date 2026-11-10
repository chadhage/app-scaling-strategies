'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { sha, lfOf, repository, workRoot } = require('./imports-check.cjs');
const root = path.resolve(__dirname, '..');
const original = JSON.parse(fs.readFileSync(path.join(root, 'imports.json')));
const current = JSON.parse(fs.readFileSync(path.join(root, 'dependency-context.json')));
const env = { ...process.env };
for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[name];
const blob = (source) => execFileSync('git', ['-C', repository, '--no-pager', 'show',
  source.commit + ':' + source.path.replaceAll('\\', '/')], { env, windowsHide: true });

test('all six original imports remain exact and also match the actual current accepted producers', () => {
  const importBytes = fs.readFileSync(path.join(root, 'imports.json'));
  assert.ok(sha(importBytes) === current.originalImportsSha256 || sha(lfOf(importBytes)) === current.originalImportsLfSha256);
  assert.equal(current.sources.filter((source) => source.imported).length, 6);
  for (const source of current.sources.filter((entry) => entry.imported)) {
    const pinned = original.dependencies.find((entry) => entry.path === source.path);
    assert.ok(pinned);
    const actual = blob(source);
    assert.equal(sha(actual), source.gitBlobSha256);
    assert.equal(sha(actual), pinned.git, 'a historical producer snapshot is not silently described as current');
    assert.equal(sha(lfOf(fs.readFileSync(path.join(workRoot, source.path)))), source.gitBlobSha256);
  }
});

test('the current accepted ownership contract is inspected without importing or repinning it: idle 10000, header 5000, check 1000', () => {
  const source = current.sources.find((entry) => entry.card === 'C010' && path.basename(entry.path) === 'contract.js');
  assert.equal(source.imported, false);
  const bytes = blob(source);
  assert.equal(sha(bytes), source.gitBlobSha256);
  const module = { exports: {} };
  new vm.Script(bytes.toString('utf8'), { filename: 'accepted-ownership-contract.js' }).runInNewContext({
    module, exports: module.exports,
    require: (name) => {
      assert.equal(name, '../C009/contract.js');
      return require('../../C009/contract.js');
    }
  });
  const limits = module.exports.limits;
  assert.deepEqual([limits.idleMs, limits.headerMs, limits.checkMs], [10000, 5000, 1000]);
  assert.ok(limits.idleMs > limits.headerMs + limits.checkMs);
});

test('the current accepted cancellation-audit behavior is acknowledged separately from the unchanged audit import', () => {
  const source = current.sources.find((entry) => entry.card === 'C010' && path.basename(entry.path) === 'server.cjs');
  assert.equal(source.imported, false);
  const bytes = blob(source);
  assert.equal(sha(bytes), source.gitBlobSha256);
  assert.match(bytes.toString('utf8'), /if \(error instanceof AuthError\) return refuseAuth\(error\); else if \(cancelled\(\)\) return undefined;\r?\n\s+return refuse\('INTERNAL_ERROR'\)/);
  assert.equal(original.dependencies.some((entry) => entry.path === source.path), false);
});
