'use strict';

// Original loadable stub of the gate. It is the naive gate that U009 exists to prevent: it finds the scripts of a root,
// runs the L-0004 command once per script with the inherited environment and trusts Node's exit code alone.
// It never counts what no test loaded, keeps no percentages, does not classify anything and never checks that tests ran.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repository = path.resolve(__dirname, '..', '..', '..', '..');

function scripts(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests') scripts(full, found);
    } else if (/\.(?:js|cjs|mjs)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

function main(argv) {
  const options = { root: '.', tests: [], min: 85, json: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--root') options.root = argv[++index];
    else if (argv[index] === '--min') options.min = Number(argv[++index]);
    else if (argv[index] === '--json') options.json = argv[++index];
    else if (argv[index] === '--tests') {
      while (index + 1 < argv.length && !argv[index + 1].startsWith('--')) options.tests.push(argv[++index]);
    }
  }
  const root = path.resolve(options.root);
  const testDir = path.join(root, 'tests');
  const tests = options.tests.length ? options.tests
    : (fs.existsSync(testDir) ? fs.readdirSync(testDir).filter((name) => /\.test\.cjs$/.test(name)).map((name) => path.join(testDir, name)) : []);
  const files = scripts(root).map((file) => {
    if (tests.length === 0) return { file: path.relative(root, file), ok: true };
    const run = spawnSync(process.execPath, ['--test', '--experimental-test-coverage',
      `--test-coverage-include=${path.relative(repository, file).replace(/\\/g, '/')}`,
      `--test-coverage-lines=${options.min}`, `--test-coverage-branches=${options.min}`, `--test-coverage-functions=${options.min}`,
      ...tests], { cwd: repository, env: process.env, encoding: 'utf8', windowsHide: true });
    return { file: path.relative(root, file).replace(/\\/g, '/'), ok: run.status === 0 };
  });
  const report = { files, pass: files.every((entry) => entry.ok) };
  if (options.json) fs.writeFileSync(options.json, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report.pass ? 0 : 1;
}

process.exitCode = main(process.argv.slice(2));
