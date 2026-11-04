'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = require('..\\source.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
function snapshot(directory) {
  const records = [];
  function visit(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) {
        records.push({ path: path.relative(repository, file), directory: true });
        visit(file);
      } else records.push({ path: path.relative(repository, file), sha256: source.hash(fs.readFileSync(file)) });
    }
  }
  visit(directory);
  return records;
}
const before = snapshot(root);
const dependencies = source.checkHistorical();
const helper = path.join(repository, 'testing', 'browser', 'isolated.cjs');
const helperBefore = source.hash(fs.readFileSync(helper));
const own = (...parts) => path.join('capability', 'C029', ...parts);
const commands = [
  ['--test', '--test-concurrency=1', own('tests', 'evaluator.test.cjs'), own('tests', 'guards.test.cjs'),
    own('tests', 'source.test.cjs'), own('tests', 'surface.test.cjs')],
  [own('tests', 'syntax.cjs')], [own('tests', 'browser.cjs')]
];
if (fs.existsSync(path.join(root, 'evidence-index.json'))) commands.push(['--test', own('tests', 'integrity.test.cjs')]);
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C029_CAPTURE_DIR;
const failures = [];
for (const args of commands) {
  const run = spawnSync(process.execPath, args, {
    cwd: repository, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024, windowsHide: true
  });
  console.log(`READONLY ${args.join(' ')}: exit=${run.status}`);
  if (run.status !== 0) {
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    failures.push(new Error(run.error?.message || `Verification exit ${run.status}`));
  }
}
assert.deepEqual(snapshot(root), before, 'Normal verification must not change any owned source/evidence byte or listing.');
assert.deepEqual(source.checkHistorical(), dependencies, 'Unchanged historical dependencies must not drift.');
assert.equal(source.hash(fs.readFileSync(helper)), helperBefore);
assert.equal(helperBefore, source.pins.browserHelperRawSha256);
console.log(`READONLY PASS: ${before.length} own files/directories, ${dependencies.imports.length} pinned sources and approved helper unchanged.`);
if (failures.length) throw new AggregateError(failures, 'Read-only C029 verification did not pass.');
