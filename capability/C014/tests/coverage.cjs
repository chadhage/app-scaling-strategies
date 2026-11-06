'use strict';

// Test tooling, not production code: the per-file coverage gate (L-0004, L-0100). It ENUMERATES every first-party production file of this namespace (the root
// .cjs and .js files; an unlisted root script fails the gate, an unloaded file is 0%) and runs ONE `node --test --experimental-test-coverage` command per
// file with --test-coverage-include=<that file> and 85/85/85 thresholds, over the in-process suites (the files that spawn processes add nothing a
// coverage run can see). It prints one JSON report and exits 1 below any threshold, on a missing row, or on an unenumerated file.
// Usage (repository root; take a heavy slot first): node capability\C014\tests\coverage.cjs [--only=<file>] [--parallel=4]
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const PRODUCTION = ['canon.cjs', 'redact.cjs', 'vault.cjs', 'evidence.cjs', 'service.cjs', 'server.cjs', 'page.js'];
const SUITES = ['canon', 'scanner', 'redact', 'vault', 'evidence', 'service', 'server', 'refusal', 'sweep', 'property', 'page', 'health'].map((name) => `capability/C014/tests/${name}.test.cjs`);
const THRESHOLD = 85;
const ROW = /^# +(\S+\.(?:js|cjs|mjs)) +\| +([\d.]+) +\| +([\d.]+) +\| +([\d.]+) +\|/;
// --focused: each file is measured over the suites that exercise it (a focused per-file run, not a whole-namespace run); the default measures every file over all in-process suites.
const FOCUSED = {
  'canon.cjs': ['canon', 'redact'], 'redact.cjs': ['redact', 'canon', 'evidence', 'service'], 'vault.cjs': ['vault', 'service'], 'evidence.cjs': ['evidence', 'service', 'server'],
  'service.cjs': ['service', 'server'], 'server.cjs': ['server', 'health', 'refusal'], 'page.js': ['page']
};

function command(file, focused = false) {
  const suites = focused ? FOCUSED[file].map((name) => `capability/C014/tests/${name}.test.cjs`) : SUITES;
  return ['--test', '--test-concurrency=1', '--test-timeout=300000', '--experimental-test-coverage', `--test-coverage-include=capability/C014/${file}`,
    `--test-coverage-lines=${THRESHOLD}`, `--test-coverage-branches=${THRESHOLD}`, `--test-coverage-functions=${THRESHOLD}`, ...suites];
}

function runOne(file, focused) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const child = spawn(process.execPath, command(file, focused), { cwd: REPOSITORY, env, windowsHide: true });
    const out = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => out.push(chunk));
    const timer = setTimeout(() => child.kill(), 900000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n');
      const row = text.split('\n').map((line) => ROW.exec(line)).find((match) => match && match[1] === path.basename(file));
      const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) => [key, Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text) || [])[1])]));
      resolve({
        file, exit: code, row: row ? { lines: Number(row[2]), branches: Number(row[3]), functions: Number(row[4]) } : null, ...counts,
        ok: code === 0 && Boolean(row) && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.tests > 0 && [row[2], row[3], row[4]].every((value) => Number(value) >= THRESHOLD)
      });
    });
  });
}

async function main() {
  const enumerated = fs.readdirSync(ROOT).filter((name) => /\.(?:cjs|js)$/.test(name)).sort();
  const unlisted = enumerated.filter((name) => !PRODUCTION.includes(name));
  const missing = PRODUCTION.filter((name) => !enumerated.includes(name));
  const only = (process.argv.find((argument) => argument.startsWith('--only=')) || '').slice(7);
  const parallel = Number((process.argv.find((argument) => argument.startsWith('--parallel=')) || '--parallel=4').slice(11));
  const files = only ? PRODUCTION.filter((name) => name === only) : PRODUCTION;
  const focused = process.argv.includes('--focused');
  const results = [];
  for (let at = 0; at < files.length; at += parallel) results.push(...await Promise.all(files.slice(at, at + parallel).map((file) => runOne(file, focused))));
  const report = { threshold: THRESHOLD, mode: focused ? 'focused per-file suites' : 'all in-process suites per file', enumerated, unlisted, missing, results };
  console.log(JSON.stringify(report, null, 2));
  if (unlisted.length || missing.length || results.some((result) => !result.ok)) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = Object.freeze({ PRODUCTION, SUITES, FOCUSED, THRESHOLD, command, ROW });
