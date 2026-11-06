'use strict';

// Mutation harness (test tooling, not production code). It applies ONE textual mutant at a time to a PRIVATE COPY of the
// namespace under --scratch (a SHORT folder, never %TEMP%), runs the hermetic test files cheap to expensive with
// --test-concurrency=1 and stops at the first failing file. A mutant that no test notices SURVIVED.
// usage: node testing\browser\qualify\tests\mutation\mutate.cjs --scratch <dir> --out <result.json> [--workers 3] [id-prefix ...]
// The raw result (every mutant, its pattern, its killer test) is written with flag wx; the mutants are in mutants.cjs.
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { MUTANTS } = require('./mutants.cjs');

const NAMESPACE = path.resolve(__dirname, '..', '..');
const BROWSER_DIR = path.dirname(NAMESPACE);
const ORDER = ['version', 'subject', 'subject-lookalike', 'adapters', 'qualify', 'qualify-recheck', 'fail-closed', 'cli-line', 'cli-target', 'cli-write', 'cli',
  'shell', 'requalify-counts', 'requalify-verdict', 'requalify-flow', 'requalify', 'requalify-tree',
  'survivors', 'survivors-r3', 'addendum-anomalies', 'addendum', 'addendum-cli', 'qualify-addendum', 'timeouts', 'cli-catch', 'outer-timeout', 'n4-guards'];
// The test files that name the mutated source run first, so a killed mutant costs seconds; a survivor runs them all.
// outer-timeout runs first for qualify.cjs so that a missing outer bound (mutant M10) fails an assertion that names the adapter
// instead of hanging a file until the external timeout.
const PRIORITY = {
  'qualify.cjs': ['outer-timeout', 'survivors', 'qualify-recheck', 'fail-closed', 'qualify', 'subject-lookalike', 'timeouts', 'qualify-addendum', 'n4-guards'],
  'subject.cjs': ['subject-lookalike', 'subject'],
  'version.cjs': ['version'],
  'adapters.cjs': ['adapters', 'survivors', 'shell', 'qualify-addendum', 'addendum-anomalies'],
  'requalify.cjs': ['requalify-counts', 'survivors', 'requalify-verdict', 'requalify-flow', 'requalify', 'requalify-tree', 'n4-guards'],
  'cli.cjs': ['cli-line', 'survivors', 'cli-target', 'cli-write', 'cli', 'cli-catch', 'timeouts'],
  'addendum.cjs': ['addendum-anomalies', 'addendum', 'addendum-cli', 'qualify-addendum', 'survivors-r3'],
};
const orderFor = (file) => [...PRIORITY[file], ...ORDER.filter((name) => !PRIORITY[file].includes(name))];

function argument(name, fallback) {
  const at = process.argv.indexOf(name);
  return at < 0 ? fallback : process.argv[at + 1];
}

function runFile(copy, file, timeoutMs) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const args = ['--test', '--test-concurrency=1', '--test-reporter=tap', path.join('tests', `${file}.test.cjs`)];
    const child = spawn(process.execPath, args, { cwd: copy, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let timedOut = false;
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => {
      timedOut = true;
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, timedOut, out }); });
  });
}

async function runMutant(copy, mutant) {
  const pristine = fs.readFileSync(path.join(NAMESPACE, mutant.file), 'utf8');
  const parts = pristine.split(mutant.find);
  if (parts.length !== 2) return { id: mutant.id, file: mutant.file, result: 'PATTERN-NOT-UNIQUE', occurrences: parts.length - 1 };
  fs.writeFileSync(path.join(copy, mutant.file), parts.join(mutant.replace));
  const started = Date.now();
  let killedBy = null;
  let killer = '';
  for (const file of orderFor(mutant.file)) {
    const run = await runFile(copy, file, (mutant.timeoutSeconds || 240) * 1000);
    if (run.code !== 0) {
      killedBy = file;
      killer = run.timedOut ? 'HANG (external timeout)' : [...run.out.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]).slice(0, 2).join(' || ');
      break;
    }
  }
  fs.copyFileSync(path.join(NAMESPACE, mutant.file), path.join(copy, mutant.file));
  return { id: mutant.id, file: mutant.file, find: mutant.find, replace: mutant.replace, result: killedBy ? 'KILLED' : 'SURVIVED', killedBy, killer, seconds: Math.round((Date.now() - started) / 1000) };
}

async function worker(scratch, index, queue, results) {
  const root = path.join(scratch, `w${index}`);
  const copy = path.join(root, 'qualify');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  fs.cpSync(NAMESPACE, copy, { recursive: true, filter: (source) => !/[\\/]evidence([\\/]|$)/.test(source) && !/[\\/]scratch-/.test(source) });
  for (const name of ['isolated.test.cjs', 'loopback.test.cjs']) fs.copyFileSync(path.join(BROWSER_DIR, name), path.join(root, name));
  while (queue.length > 0) {
    const mutant = queue.shift();
    const row = await runMutant(copy, mutant);
    results.push(row);
    console.log(`${row.id} | ${row.result}${row.killedBy ? ` by ${row.killedBy}` : ''} | ${row.seconds ?? 0} s | ${row.killer || ''}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
}

(async () => {
  const scratch = argument('--scratch');
  const outFile = argument('--out');
  if (!scratch || !outFile) throw new Error('--scratch <dir> and --out <result.json> are required');
  const workers = Number(argument('--workers', '3'));
  const flagged = new Set(['--scratch', '--out', '--workers']);
  const prefixes = process.argv.slice(2).filter((value, i, all) => !value.startsWith('--') && !flagged.has(all[i - 1]));
  const queue = MUTANTS.filter((mutant) => prefixes.length === 0 || prefixes.some((prefix) => mutant.id.startsWith(prefix)));
  const total = queue.length;
  const results = [];
  await Promise.all(Array.from({ length: Math.min(workers, total) }, (_, index) => worker(scratch, index, queue, results)));
  const survived = results.filter((row) => row.result !== 'KILLED');
  const summary = { tool: 'tests/mutation/mutate.cjs', mutants: total, killed: total - survived.length, notKilled: survived.map((row) => `${row.id}:${row.result}`), order: ORDER, results };
  fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  console.log(`# mutants ${total}; killed ${total - survived.length}; not killed ${JSON.stringify(summary.notKilled)}`);
})().catch((error) => { console.error('MUTATION ERROR', error); process.exitCode = 1; });
