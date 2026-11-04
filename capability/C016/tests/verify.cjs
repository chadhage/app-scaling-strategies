'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { root, inventory, dependencies } = require('./provenance.cjs');

const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !['focused', 'browser', 'syntax'].includes(mode)) throw new Error('Use focused, browser or syntax only.');
const before = inventory(root, ['publication.json']);
const acceptedBefore = dependencies();
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
let exitCode = 0;
if (mode === 'syntax') {
  const files = Object.keys(before).filter((file) => /\.(cjs|js)$/.test(file));
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], {
      env, timeout: 30000, encoding: 'utf8', windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
  console.log(JSON.stringify({ syntaxFiles: files.length, passed: true }));
} else {
  const files = mode === 'browser' ? ['browser.acceptance.cjs'] :
    ['conditional.test.cjs', 'concurrency.test.cjs', 'errors.test.cjs', 'journal.test.cjs', 'integrity.test.cjs'];
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map((file) => path.join(__dirname, file))], {
    env, timeout: 900000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
  });
  assert.ifError(result.error);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  exitCode = result.status === 0 ? 0 : 1;
}
assert.deepEqual(inventory(root, ['publication.json']), before, 'Normal verification must not alter C016 source/evidence.');
assert.deepEqual(dependencies(), acceptedBefore, 'Accepted C001 C002 C015 source/evidence/retained demo are read-only; sibling scratch is excluded, never cleaned.');
console.log(JSON.stringify({
  mode, ownedFilesUnchanged: Object.keys(before).length, acceptedDependencyRootsUnchanged: 3,
  captureByNormalVerifier: false, fixtureCleanup: 'exact invocation-owned C015 UUID files and empty child directories only', exitCode,
}));
process.exitCode = exitCode;
