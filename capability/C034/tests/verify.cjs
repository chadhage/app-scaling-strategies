'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { hash, pins, checkImports } = require('..\\pins.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
function snapshot(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (file === path.join(root, 'publication.json')) return [];
    if (entry.isSymbolicLink()) throw new Error('No linked verification paths.');
    if (entry.isDirectory()) return [{ path: path.relative(repository, file), kind: 'directory' }, ...snapshot(file)];
    const stat = fs.lstatSync(file);
    assert.equal(stat.isFile(), true);
    assert.equal(stat.nlink, 1);
    return [{ path: path.relative(repository, file), kind: 'file', rawSha256: hash(fs.readFileSync(file)) }];
  });
}
const ownBefore = snapshot(root);
const demoRoot = path.join(root, '..', 'C015', 'fixtures', 'synthetic-restart-v1');
const demoBefore = snapshot(demoRoot);
const importsBefore = checkImports();
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C034_CAPTURE_DIR;
const commands = [
  ['--test', '--test-concurrency=1', path.join(__dirname, 'trace.test.cjs'), path.join(__dirname, 'guards.test.cjs'), path.join(__dirname, 'surface.test.cjs')],
  [path.join(__dirname, 'syntax.cjs')],
  [path.join(__dirname, 'browser.cjs')]
];
if (fs.existsSync(path.join(root, 'evidence-index.json'))) commands.push(['--test', path.join(__dirname, 'integrity.test.cjs')]);
const failures = [];
for (const args of commands) {
  const run = spawnSync(process.execPath, args, {
    cwd: repository, env, encoding: null, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 * 1024
  });
  process.stdout.write(run.stdout || Buffer.alloc(0));
  process.stderr.write(run.stderr || Buffer.alloc(0));
  if (run.status !== 0 || run.signal || run.error) failures.push({ command: ['node', ...args], exit: run.status, signal: run.signal, error: run.error?.message || null });
}
assert.deepEqual(snapshot(root), ownBefore, 'Normal checks must not alter owned source, evidence or listings.');
assert.deepEqual(snapshot(demoRoot), demoBefore, 'Known retained C015 files and epoch history remain immutable; no test setup writes.');
assert.deepEqual(checkImports(), importsBefore, 'No imported provider, guard, historical trace or contract changes.');
assert.equal(hash(fs.readFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'))), pins.browserHelperRawSha256);
assert.deepEqual(failures, [], 'All focused/syntax/browser/integrity commands must actually succeed.');
console.log(JSON.stringify({
  cardId: 'C034', outcome: 'read-only-green', checksSourceAndEvidenceUnchanged: true,
  ownEntries: ownBefore.length, retainedC015Entries: demoBefore.length, unchangedImportPins: importsBefore.length,
  C015FixtureWrites: 0, scratchFixturesCreated: 0, arbitraryCleanupPerformed: false,
  actualBrowserWasRerun: true, integrityFinalized: fs.existsSync(path.join(root, 'evidence-index.json'))
}));
