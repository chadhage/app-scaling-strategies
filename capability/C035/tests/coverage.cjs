'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const own = (...names) => names.map((name) => path.join('capability', 'C035', 'tests', `${name}.test.cjs`));
const plan = {
  'classifier.js': own('initial-red', 'classifier', 'input', 'session'),
  'cli.cjs': own('cli', 'surface'),
  'current.cjs': own('source'),
  'foreign-index.cjs': own('foreign-index'),
  'page.js': own('page'),
  'publisher-authority.cjs': own('authority'),
  'source.cjs': own('source-guards', 'source')
};
const powerShell = ['foreign-guard.ps1', 'git-transport.ps1', 'publish.ps1', 'read-gates.ps1'];
if (process.argv.length !== 2) throw new Error('No coverage scope, file or threshold overrides.');
const enumerated = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort();
assert.deepEqual(Object.keys(plan).sort(), enumerated, 'Every production JavaScript file must be enumerated with its tests; an unloaded file is 0%.');
assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith('.ps1')).sort(), powerShell);
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const rows = [];
for (const [file, tests] of Object.entries(plan)) {
  const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage',
    `--test-coverage-include=capability/C035/${file}`, '--test-coverage-lines=85',
    '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
  const startedAtUtc = new Date().toISOString();
  const run = spawnSync(process.execPath, args, {
    cwd: repository, env, encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  const lines = (run.stdout || '').split(/\r?\n/);
  const totals = lines.filter((line) => /^# (tests|pass|fail) /.test(line));
  const match = lines.map((line) => new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|`).exec(line)).find(Boolean);
  const row = {
    file, command: ['node', ...args].join(' '), exitCode: run.status, startedAtUtc, completedAtUtc: new Date().toISOString(),
    tap: totals, lines: match ? Number(match[1]) : 0, branches: match ? Number(match[2]) : 0,
    functions: match ? Number(match[3]) : 0, loaded: Boolean(match)
  };
  row.met = row.exitCode === 0 && row.loaded && row.lines >= 85 && row.branches >= 85 && row.functions >= 85;
  rows.push(row);
  console.log(`== ${file}`);
  console.log(`command: ${row.command}`);
  console.log(`exit: ${row.exitCode}; ${totals.join('; ')}`);
  console.log(lines.filter((line) => line.startsWith('# start of coverage report') || line.startsWith('# end of coverage report') ||
    line.includes('| line %') || new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|`).test(line) || /^# all files/.test(line)).join('\n'));
  console.log(`result: line ${row.lines} branch ${row.branches} funcs ${row.functions}; ${row.met ? '85/85/85 met' : 'BELOW THE BAR'}`);
  if (run.status !== 0) { console.log((run.stdout || '').slice(-4000)); console.log((run.stderr || '').slice(-2000)); }
}
const passed = rows.every((row) => row.met);
console.log(JSON.stringify({
  schema: 'C035-per-file-coverage/1', thresholdPercent: 85, enumeratedProductionFiles: enumerated,
  unloadedCountsAsZero: true, files: rows.map(({ file, lines, branches, functions, exitCode, tap, met }) =>
    ({ file, lines, branches, functions, exitCode, tap, met })),
  powerShellNotMeasurableByNodeCoverage: powerShell,
  powerShellExercisedBy: ['tests/transport.test.cjs', 'tests/foreign-index.test.cjs', 'tests/syntax.cjs'],
  passed, extraCredits: 0
}));
process.exitCode = passed ? 0 : 1;
