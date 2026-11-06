'use strict';

// U006 mutation tool (test tooling, not production code). For every mutant it copies the six source files (tree, windows, owned, startup, close,
// session; line endings normalised to LF) into a work directory, applies ONE textual change, runs the hermetic U006 suite against that copy
// (U006_IMPL_DIR) with a hard timeout and records which named tests failed. The production files are never touched.
//   node testing\browser\lifecycle\tests\u006-mutate.cjs --work <empty work dir> [--only C01,Z02] [--timeout-ms 90000]
// Exit 0 only when the unmutated control passes and every mutant is killed by a failing test whose name contains `expect`.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..', '..');
const FILES = ['tree.cjs', 'windows.cjs', 'owned.cjs', 'startup.cjs', 'close.cjs', 'session.cjs'];
const SUITE = ['u006-close', 'u006-session'].map((name) => path.join(root, 'tests', `${name}.test.cjs`));
const MUTANTS = require('./u006-mutants.cjs');

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const work = option('--work');
const only = option('--only') ? new Set(option('--only').split(',')) : null;
const timeoutMs = Number(option('--timeout-ms', '90000'));
if (!work) throw new Error('--work <directory> is required');
if (fs.existsSync(work) && fs.readdirSync(work).length > 0) throw new Error('--work must be an empty or new directory');
const created = [];

const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const sources = Object.fromEntries(FILES.map((name) => [name, fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n')]));

function runSuite(dir) {
  const env = { ...process.env, U006_IMPL_DIR: dir };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'U006_RED_IMPL', 'U005_RED_IMPL', 'U005_IMPL_DIR']) delete env[name];
  const started = Date.now();
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=20000', ...SUITE], {
    cwd: repo, env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, windowsHide: true, timeout: timeoutMs, killSignal: 'SIGKILL',
  });
  const text = result.stdout || '';
  return {
    exit: result.status,
    timedOut: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    elapsedMs: Date.now() - started,
    failing: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
    tests: Number((text.match(/^# tests (\d+)$/m) || [])[1] || 0),
  };
}

function materialise(id, file, find, replace) {
  const dir = path.join(work, id);
  fs.mkdirSync(dir, { recursive: true });
  created.push(dir);
  for (const name of FILES) {
    let text = sources[name];
    if (name === file) {
      const count = text.split(find).length - 1;
      if (count !== 1) return { dir, error: `pattern occurs ${count} times` };
      text = text.replace(find, () => replace);
    }
    fs.writeFileSync(path.join(dir, name), text);
  }
  return { dir, mutatedSha256: file ? sha(fs.readFileSync(path.join(dir, file), 'utf8')) : null };
}

const control = materialise('control', null, '', '');
const controlRun = runSuite(control.dir);
const report = { control: { ...controlRun, ok: controlRun.exit === 0 && controlRun.failing.length === 0 }, mutants: [] };
if (report.control.ok) {
  for (const mutant of MUTANTS.filter((item) => !only || only.has(item.id))) {
    const built = materialise(mutant.id, mutant.file, mutant.find, mutant.replace);
    if (built.error) {
      report.mutants.push({ id: mutant.id, file: mutant.file, guard: mutant.guard, status: 'bad-pattern', detail: built.error });
      continue;
    }
    const run = runSuite(built.dir);
    const killed = run.exit !== 0;
    const named = run.failing.some((name) => name.includes(mutant.expect));
    report.mutants.push({
      id: mutant.id, file: mutant.file, guard: mutant.guard, mutatedSha256: built.mutatedSha256, expect: mutant.expect,
      status: killed && (named || run.timedOut) ? 'killed' : killed ? 'killed-by-other-test' : 'SURVIVED',
      timedOut: run.timedOut, failingCount: run.failing.length, failing: run.failing.slice(0, 12), elapsedMs: run.elapsedMs,
    });
  }
}
for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
try { fs.rmdirSync(work); } catch { /* the work directory is not empty or already gone */ }
const bad = report.mutants.filter((item) => item.status !== 'killed');
report.summary = { total: report.mutants.length, killed: report.mutants.length - bad.length, notKilled: bad.map((item) => `${item.id}:${item.status}`) };
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.control.ok && bad.length === 0 ? 0 : 1;
