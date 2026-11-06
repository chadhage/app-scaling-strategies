'use strict';

// Test tooling, not production code: runs the named mutants of tests\mutant-list.cjs. Every mutant is one exact text replacement in a production
// file; the mutated copy is served to the tests through the overlay preload (the live file is never touched) and must be KILLED by a NAMED
// failing test. Usage (repository root):
//   node capability\C017\tests\mutants.cjs list
//   node capability\C017\tests\mutants.cjs run <id> [<id>...]
//   node capability\C017\tests\mutants.cjs run-all [--jobs 3] [--out mutants-04]      (--out writes evidence\<name>.json once, with the SHA-256 of every input; exit 1 when a mutant survives or is undecided)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { mutants } = require('./mutant-list.cjs');
const { inputPins } = require('./evidence-check.cjs');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const rel = (file) => path.relative(repo, file).replaceAll('\\', '/');

function prepare(mutant, dir) {
  const text = fs.readFileSync(path.join(root, mutant.file), 'utf8').replace(/\r\n/g, '\n');
  const at = text.indexOf(mutant.find);
  if (at < 0 || text.indexOf(mutant.find, at + 1) >= 0) throw new Error(`${mutant.id}: the text to mutate must occur exactly once in ${mutant.file}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, mutant.file);
  fs.writeFileSync(out, text.slice(0, at) + mutant.replace + text.slice(at + mutant.find.length));
  return out;
}

function run(mutant) {
  const dir = path.join(root, 'test-scratch', `mut-${mutant.id}`);
  const mutated = prepare(mutant, dir);
  const env = { ...process.env, C017_OVERLAY: JSON.stringify({ [`capability/C017/${mutant.file}`]: rel(mutated) }), NODE_OPTIONS: '--require=./capability/C017/tests/fixtures/overlay-preload.cjs', NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', '--test-timeout=900000', ...(mutant.pattern ? [`--test-name-pattern=${mutant.pattern}`] : []), ...mutant.tests];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (part) => { out += part; });
    child.stderr.on('data', () => {});
    const limit = setTimeout(() => child.kill(), 2400000);
    child.once('exit', (code) => {
      clearTimeout(limit);
      fs.rmSync(dir, { recursive: true, force: true });
      const failing = [...out.replace(/\r\n/g, '\n').matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim().slice(0, 140));
      // A run that was cut (code null) decided nothing: it is UNDECIDED, listed as such and never counted as killed (controller rule 13).
      resolve({ id: mutant.id, file: mutant.file, change: mutant.replace === '' ? 'line removed' : 'text replaced', killed: code !== null && code !== 0 && failing.some((name) => mutant.kills.test(name)), undecided: code === null, exit: code, failingTests: failing.slice(0, 6) });
    });
  });
}

async function pool(list, jobs) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < list.length) {
      const mutant = list[next]; next += 1;
      const result = await run(mutant);
      results.push(result);
      console.error(`${result.killed ? 'killed  ' : 'SURVIVED'} ${result.id}  ${result.failingTests[0] || '(no failing test)'}`);
    }
  }));
  return results.sort((a, b) => a.id.localeCompare(b.id));
}

(async () => {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === 'list') { console.log(mutants.map((m) => `${m.id}  ${m.file}`).join('\n')); return; }
  const option = (name, fallback) => { const at = rest.indexOf(name); return at >= 0 ? rest[at + 1] : fallback; };
  const chosen = mode === 'run-all' ? mutants : mutants.filter((m) => rest.includes(m.id));
  if (!chosen.length) { console.error('usage: mutants.cjs list | run <id>... | run-all [--jobs N] [--out name]'); process.exit(2); }
  const results = await pool(chosen, Number(option('--jobs', '3')));
  const summary = { schema: 'C017-mutants/2', node: process.version, inputs: inputPins(), mutants: results.length, killed: results.filter((r) => r.killed).length, undecided: results.filter((r) => r.undecided).map((r) => r.id), survived: results.filter((r) => !r.killed).map((r) => r.id), results };
  if (option('--out')) fs.writeFileSync(path.join(root, 'evidence', `${option('--out')}.json`), `${JSON.stringify(summary, null, 1)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ mutants: summary.mutants, killed: summary.killed, survived: summary.survived }, null, 1));
  process.exit(summary.survived.length ? 1 : 0);
})();
