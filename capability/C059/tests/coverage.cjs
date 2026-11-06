'use strict';

// Test tooling, not production code: runs the L-0004 command ONCE PER enumerated C059 production file (a single command with
// several includes would hide a weak file behind the aggregate row) and enforces 85 lines, 85 branches and 85 functions per
// file. An unloaded file counts as 0%. Each file is measured with the suites that exercise it (a superset can only add
// coverage); `index.html` and `styles.css` are not measurable by Node and are disclosed. Usage: node tests\coverage.cjs [file...]
const path = require('node:path');
const { spawn } = require('node:child_process');
const gate = require('./coverage-gate.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const names = gate.listNamespaceFiles(root);
const SUITES = Object.freeze({
  'a11y-check.js': ['checker', 'page', 'flow', 'tamper', 'keyboard', 'property'],
  'journey.js': ['journey', 'page', 'flow', 'tamper', 'transcript'],
  'page.js': ['page', 'flow', 'tamper', 'keyboard', 'property'],
  'server.cjs': ['server', 'resources', 'transcript'],
  'transcript.cjs': ['transcript', 'server'],
});
const requested = process.argv.slice(2);
const files = gate.enumerate(names).filter((name) => requested.length === 0 || requested.includes(name));
const PARALLEL = Number(process.env.C059_COVERAGE_PARALLEL ?? 2);

function measure(file) {
  const tests = (SUITES[file] ?? []).map((suite) => path.join('capability', 'C059', 'tests', `${suite}.test.cjs`));
  const args = ['--test', '--test-concurrency=1', '--test-timeout=280000', '--experimental-test-coverage', `--test-coverage-include=capability/C059/${file}`,
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: gate.nestedEnvironment(process.env), windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 900000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      const evaluated = gate.evaluate(file, gate.parse(output));
      if (code !== 0) evaluated.failures.push(`NESTED_EXIT ${code}`);
      resolve({ ...evaluated, command: `node ${args.join(' ')}`, exitCode: code, tail: output.split(/\r?\n/).filter((line) => /^# (tests|pass|fail)|^\s*not ok /.test(line)).join(' | ') });
    });
  });
}

async function main() {
  const results = [];
  const queue = [...files];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) results.push(await measure(queue.shift()));
  }));
  results.sort((a, b) => a.file.localeCompare(b.file));
  process.stdout.write(gate.format(results, gate.unmeasured(names)));
  process.stdout.write(`${JSON.stringify(results.map(({ file, lines, branches, functions, exitCode, command, tail }) => ({ file, lines, branches, functions, exitCode, command, tail })), null, 2)}\n`);
  if (results.some((item) => item.failures.length)) {
    console.error(`C059 coverage RED: ${results.filter((item) => item.failures.length).length} of ${files.length} production files below 85/85/85 (unloaded counts as 0%).`);
    process.exitCode = 1;
  } else {
    console.log(`C059 coverage GREEN: ${files.length}/${files.length} enumerated production files at or above 85 lines, 85 branches and 85 functions each: ${files.join(', ')}.`);
  }
}

main();
