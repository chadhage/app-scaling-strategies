'use strict';
// Mutation run (tooling, not production code): node testing\quality\mutate.cjs --scratch <empty folder outside the repository> [--only M01,W02]
// For each mutant it copies testing\quality (without evidence) into <scratch>\<id>, changes ONE guard there (the repository files are never touched), runs the
// listed fast test files with a hard timeout and prints KILLED (a test failed) or SURVIVED (all passed). Exit 0 only if every mutant was killed.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { MUTANTS } = require('./mutants.cjs');

const ROOT = __dirname;
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const scratch = opt('--scratch');
const only = opt('--only') ? new Set(opt('--only').split(',')) : null;
const TIMEOUT_MS = 240000;
const POOL = 2;

function cleanEnv() { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; delete env.NODE_V8_COVERAGE; return env; }

// Windows keeps a folder busy for a moment after the processes that used it end (EBUSY): retry a bounded number of times, then say so instead of ending the run.
const REMOVE = { recursive: true, force: true, maxRetries: 40, retryDelay: 250 };
function clean(dir) {
  try { fs.rmSync(dir, REMOVE); return ''; } catch (error) { return `the scratch folder could not be removed (${error.code || error.message})`; }
}

function prepare(m) {
  const dir = path.join(scratch, m.id);
  fs.rmSync(dir, REMOVE);
  fs.cpSync(ROOT, dir, { recursive: true, filter: (src) => !src.includes(`${path.sep}evidence`) });
  const file = path.join(dir, m.file);
  const text = fs.readFileSync(file, 'utf8');
  const first = text.indexOf(m.find);
  if (first < 0 || text.indexOf(m.find, first + 1) >= 0) throw new Error(`${m.id}: the text to mutate must occur exactly once in ${m.file}`);
  fs.writeFileSync(file, text.replace(m.find, () => m.replace));
  return dir;
}

function run(m) {
  return new Promise((resolve) => {
    let dir;
    try { dir = prepare(m); } catch (error) { resolve({ ...m, status: 'ERROR', note: error.message }); return; }
    const tests = m.tests.map((t) => path.join(dir, 'tests', t));
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...tests], { cwd: dir, env: cleanEnv(), windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', () => {});
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const failed = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((x) => x[1]).slice(0, 2);
      const note = clean(dir);
      resolve({ ...m, status: signal ? 'TIMEOUT' : code === 0 ? 'SURVIVED' : 'KILLED', failed, note });
    });
  });
}

async function main() {
  if (!scratch) { console.error('usage: node testing\\quality\\mutate.cjs --scratch <empty folder outside the repository> [--only M01,W02]'); return 2; }
  fs.mkdirSync(scratch, { recursive: true });
  const todo = MUTANTS.filter((m) => !only || only.has(m.id));
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: POOL }, async () => {
    while (next < todo.length) { const m = todo[next]; next += 1; const r = await run(m); results.push(r); console.log(`${r.id} ${r.status} ${r.file} | ${r.why}${r.failed && r.failed.length ? ` | failing: ${r.failed.join(' ; ')}` : ''}${r.note ? ` | ${r.note}` : ''}`); }
  }));
  const killed = results.filter((r) => r.status === 'KILLED').length;
  console.log(`mutants: ${results.length}, killed: ${killed}, survived or failed: ${results.length - killed}`);
  return killed === results.length ? 0 : 1;
}

main().then((code) => { process.exitCode = code; });
