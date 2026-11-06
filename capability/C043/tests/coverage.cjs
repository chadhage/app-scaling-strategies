'use strict';

// Test tooling, not production code: runs the L-0004 command ONCE PER enumerated C043 production file (a single
// command with several includes would hide a weak file behind the aggregate row) and enforces 85 lines, 85 branches
// and 85 functions per file. An unloaded file counts as 0%. Output is JSON-friendly; the exit code is 1 below any floor.
// Each production file is measured by the suites listed in TESTS (the mutation suite only spawns children and is never part of it).
const path = require('node:path');
const { spawn } = require('node:child_process');
const gate = require('./coverage-gate.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const names = gate.listNamespaceFiles(root);
const files = gate.enumerate(names);
const t = (name) => path.join('capability', 'C043', 'tests', `${name}.test.cjs`);
const red = (name) => path.join('capability', 'C043', 'evidence', 'red', `${name}.snapshot.cjs`);
// The suites that load each file. Fewer suites can only LOWER a file's coverage, so this list never inflates a figure.
const INITIAL = [red('initial-a'), red('initial-b')];
const TESTS = {
  'contract.js': [t('units'), t('page'), t('server'), ...INITIAL], 'validate.js': [t('units'), t('page'), t('server'), ...INITIAL],
  'envelope.js': [t('units'), t('page'), t('server'), ...INITIAL], 'verify.js': [t('units'), t('page'), t('server'), ...INITIAL],
  'preset.cjs': [t('journal'), t('units'), t('server'), ...INITIAL], 'runlog.cjs': [t('journal'), t('runner'), t('server'), ...INITIAL],
  'result.cjs': [t('runner'), t('journal'), t('units'), t('server'), ...INITIAL], 'runner.cjs': [t('runner'), t('same-steps'), t('property'), t('journal'), ...INITIAL],
  'server.cjs': [t('server'), t('resources'), t('page'), t('units'), ...INITIAL], 'transcript.cjs': [t('units'), t('page'), t('server')], 'page.js': [t('page')],
};
const PARALLEL = Number(process.env.C043_COVERAGE_PARALLEL ?? 3);
const only = process.env.C043_COVERAGE_ONLY ? process.env.C043_COVERAGE_ONLY.split(',') : null;

function measure(file) {
  const tests = TESTS[file] ?? [...gate.testFiles(__dirname).map((name) => path.join('capability', 'C043', 'tests', name)), ...INITIAL];
  const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage', `--test-coverage-include=capability/C043/${file}`,
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: gate.nestedEnvironment(process.env), windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 1500000);
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
  const selected = only ? files.filter((file) => only.includes(file)) : files;
  const queue = [...selected];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) results.push(await measure(queue.shift()));
  }));
  results.sort((a, b) => a.file.localeCompare(b.file));
  process.stdout.write(gate.format(results, gate.unmeasured(names)));
  process.stdout.write(`${JSON.stringify(results.map(({ file, lines, branches, functions, exitCode, tail, command }) => ({ file, lines, branches, functions, exitCode, tail, command })), null, 2)}\n`);
  if (results.some((item) => item.failures.length)) {
    console.error(`C043 coverage RED: ${results.filter((item) => item.failures.length).length} of ${selected.length} production files below 85/85/85 (unloaded counts as 0%).`);
    process.exitCode = 1;
  } else {
    console.log(`C043 coverage GREEN: ${selected.length}/${selected.length} enumerated production files at or above 85 lines, 85 branches and 85 functions each: ${selected.join(', ')}.`);
  }
}

main();
