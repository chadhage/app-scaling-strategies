'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = require('..\\source.cjs');
const evidence = require('./evidence.cjs');
if (process.argv.length !== 2) throw new Error('No verification scope, source or history overrides.');
function snapshot() {
  return evidence.files().map((file) => ({ path: file, sha256: source.hash(evidence.read(file)) }));
}
const before = snapshot();
const dependencies = source.checkImports();
const toolsPath = path.join(evidence.root, 'browser-tools.json');
const tools = JSON.parse(fs.readFileSync(toolsPath, 'utf8'));
const toolBytes = tools.dependencies.map((pin) => ({ path: pin.path, sha256: source.hash(source.readRegular(pin.path)) }));
const focused = ['initial-red', 'classifier', 'input', 'session', 'source', 'surface', 'authority', 'transport', 'foreign-index', 'source-guards', 'cli', 'page'];
const commands = [
  ['--test', '--test-concurrency=1', ...focused.map((name) => path.join(__dirname, `${name}.test.cjs`))],
  [path.join(__dirname, 'syntax.cjs')], [path.join(__dirname, 'browser.cjs')],
  ['--test', path.join(__dirname, 'integrity.test.cjs')]
];
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
const outcomes = [];
const failures = [];
for (const args of commands) {
  const run = spawnSync(process.execPath, args, {
    cwd: source.repository, env, encoding: 'utf8', timeout: 240000,
    maxBuffer: 8 * 1024 * 1024, windowsHide: true
  });
  const totals = (run.stdout || '').split(/\r?\n/).filter((line) => /^# (tests|pass|fail) /.test(line));
  let browser;
  for (const line of (run.stdout || '').split(/\r?\n/)) {
    if (line.startsWith('{"schema":"C035-actual-Edge-DOM/1"')) {
      const record = JSON.parse(line);
      browser = { outcome: record.outcome, actualDomChecksPassed: record.actualDomChecksPassed, cleanup: record.cleanup };
    }
  }
  outcomes.push({ command: args, exitCode: run.status, actualTapTotals: totals, browser: browser || null });
  if (run.status !== 0 || run.error || run.signal) {
    process.stdout.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    failures.push(new Error(run.error?.message || `Verification command failed (${run.status}).`));
  }
}
assert.deepEqual(snapshot(), before, 'Normal verification changed an owned source/evidence byte or listing.');
assert.deepEqual(source.checkImports(), dependencies);
assert.deepEqual(tools.dependencies.map((pin) => ({
  path: pin.path, sha256: source.hash(source.readRegular(pin.path))
})), toolBytes);
console.log(JSON.stringify({
  schema: 'C035-read-only-verification/1', ownFilesUnchanged: before.length,
  directDependenciesUnchanged: dependencies.direct.length,
  underlyingC029PinsUnchanged: dependencies.unchangedC029Underlying.length,
  acceptedBrowserToolsUnchanged: toolBytes.length, helperUnchanged: true,
  sourceEvidenceAndDependencyWrites: 0, outcomes, extraCredits: 0
}));
if (failures.length) throw new AggregateError(failures, 'Read-only C035 verification failed; no success or cancellation inferred.');
