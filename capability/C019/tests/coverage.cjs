'use strict';

// Per-file coverage proof for the enumerated C019 production files.
// Node prints no row, and exits 0, for a file that no test loads; such a file counts as 0 percent here.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const threshold = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const production = Object.freeze(['app.js', 'errors.js', 'inspect.cjs', 'recovery.js']);
const tests = Object.freeze(['red.test.cjs', 'core.test.cjs', 'fixture.test.cjs', 'surface.test.cjs', 'app.test.cjs']);
// The 13-case process-fault proof takes minutes and runs in the focused verifier. Skipping it can only lower coverage.
const skipped = 'actual C015 public API/process errors';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const enumerated = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.c?js$/.test(entry.name)).map((entry) => entry.name).sort();
assert.deepEqual(enumerated, [...production].sort(),
  'Every production JavaScript file must be listed so that no file can hide by never being loaded.');

function measuredRow(report, file) {
  const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const number = '(\\d+(?:\\.\\d+)?)';
  const match = new RegExp(`^(?:#|\u2139)?\\s*${escaped}\\s*\\|\\s*${number}\\s*\\|\\s*${number}\\s*\\|\\s*${number}\\s*\\|(.*)$`, 'm').exec(report);
  return match ? { lines: Number(match[1]), branches: Number(match[2]), functions: Number(match[3]), uncovered: match[4].trim() } : null;
}

const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C019_CAPTURE_DIRECTORY']) delete env[name];
const files = [];
for (const file of enumerated) {
  const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage',
    `--test-coverage-include=capability/C019/${file}`,
    `--test-coverage-lines=${threshold.lines}`, `--test-coverage-branches=${threshold.branches}`,
    `--test-coverage-functions=${threshold.functions}`, `--test-skip-pattern=${skipped}`,
    ...tests.map((name) => `capability/C019/tests/${name}`)];
  const run = spawnSync(process.execPath, args, { cwd: repo, env, encoding: 'utf8', windowsHide: true,
    timeout: 900000, maxBuffer: 32 * 1024 * 1024 });
  assert.ifError(run.error);
  const report = `${run.stdout}\n${run.stderr}`;
  process.stdout.write(`=== C019 coverage of ${file} (exit ${run.status}) ===\n${run.stdout}${run.stderr}\n`);
  const row = measuredRow(report, file);
  const measured = row || { lines: 0, branches: 0, functions: 0, uncovered: 'unloaded: no test loaded this file, counted as 0 percent' };
  files.push({
    file, tests, skipPattern: skipped, command: `node ${args.join(' ')}`, exitCode: run.status, signal: run.signal || null,
    loaded: row !== null, ...measured, rawStdoutSha256: sha(Buffer.from(run.stdout)),
    passed: run.status === 0 && row !== null && measured.lines >= threshold.lines &&
      measured.branches >= threshold.branches && measured.functions >= threshold.functions,
  });
}
const record = { schemaVersion: 1, cardId: 'C019', node: process.version, thresholds: threshold,
  enumerated, files, passed: files.every((item) => item.passed), originalUnitCredits: 0 };
process.stdout.write(`C019_COVERAGE_RECORD=${JSON.stringify(record)}\n`);
process.exitCode = record.passed ? 0 : 1;
