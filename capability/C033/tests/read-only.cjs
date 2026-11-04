'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const imported = [
  path.join(root, '..', 'C020', 'profiles.cjs'), path.join(root, '..', 'C020', 'contract.js'),
  path.join(root, '..', 'C001', 'contract-guard.js'), path.join(root, '..', 'C001', 'approved-contract.js'),
  path.join(repository, 'testing', 'browser', 'isolated.cjs')
];
function listing(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    const relative = path.relative(repository, file);
    return entry.isDirectory() ? [{ path: relative, directory: true }, ...listing(file)] : [{ path: relative, rawSha256: hash(fs.readFileSync(file)) }];
  });
}
const snapshot = () => [...listing(root), ...imported.map((file) => ({ path: path.relative(repository, file), rawSha256: hash(fs.readFileSync(file)) }))];
const before = snapshot();
const own = (file) => path.join('capability', 'C033', 'tests', file);
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C033_CAPTURE_DIR;
let failure;
try {
  for (const args of [
    ['--test', own('journey.test.cjs'), own('server.test.cjs'), own('surface.test.cjs'), own('integrity.test.cjs')],
    [own('syntax.cjs')], [own('browser.cjs')]
  ]) {
    const run = spawnSync(process.execPath, args, { cwd: repository, env, windowsHide: true, timeout: 80000, maxBuffer: 8 * 1024 * 1024 });
    process.stdout.write(run.stdout || Buffer.alloc(0));
    process.stderr.write(run.stderr || Buffer.alloc(0));
    assert.equal(run.status, 0, `Normal read-only command failed: node ${args.join(' ')}; ${run.error?.message || ''}`);
  }
} catch (error) { failure = error; }
finally {
  assert.deepEqual(snapshot(), before, 'Normal focused, syntax and actual isolated browser checks must not change any own persistent bytes/listing or imported source bytes.');
}
if (failure) throw failure;
console.log(JSON.stringify({ cardId: 'C033', normalChecks: 'passed', persistentOwnFilesAndListingUnchanged: true, importedC020C001HelperBytesUnchanged: true, captureBrowserEvidence: false }));
