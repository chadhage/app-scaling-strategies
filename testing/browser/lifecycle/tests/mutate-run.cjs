'use strict';

// Test tooling (not production code): runs the systematic mutants of mutate-lex.cjs against a hermetic suite. For every mutant it writes ONE mutated
// source file into a private work copy (LF bytes, the production files are never touched), runs the suite against that copy with a hard timeout
// and records the named failing tests. A mutant that survives must be listed in the equivalents file with a one-line proof, else the run fails.
//   node tests\mutate-run.cjs --target u005|u006 --work <new empty directory> [--jobs 3] [--timeout-ms 240000] [--equivalents <json>] [--only <text>] [--list]
// Exit 0 only when the unmutated control passes and no mutant survives without a listed equivalence proof.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { mutantsOf } = require('./mutate-lex.cjs');

const lifecycle = path.resolve(__dirname, '..');
const repo = path.resolve(lifecycle, '..', '..', '..');
const tests = (names) => names.map((name) => path.join(lifecycle, 'tests', `${name}.test.cjs`));
const BASE = ['tree.cjs', 'windows.cjs', 'owned.cjs', 'startup.cjs'];
const TARGETS = {
  u005: {
    mutate: ['owned.cjs', 'startup.cjs'], files: BASE, env: 'U005_IMPL_DIR',
    suite: tests(['u005-owned', 'u005-owned-more', 'u005-startup-expiry', 'u005-startup-flow', 'u005-startup-more', 'u005-fix-ownership', 'u005-fix-abort', 'u005-fix-report', 'u005-fix-strength', 'u005-fix-startup-strength']),
  },
  u006: {
    mutate: ['close.cjs', 'session.cjs'], files: [...BASE, 'close.cjs', 'session.cjs'], env: 'U006_IMPL_DIR',
    suite: tests(['u006-close', 'u006-session', 'u006-fix-session', 'u006-fix-close', 'u006-fix-strength']),
  },
};

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const target = TARGETS[option('--target')];
if (!target) throw new Error('--target u005|u006 is required');
const timeoutMs = Number(option('--timeout-ms', '240000'));
const jobs = Number(option('--jobs', '3'));
const only = option('--only');
const idsFile = option('--ids');
const wanted = idsFile ? new Set(JSON.parse(fs.readFileSync(path.resolve(idsFile), 'utf8')).mutants.filter((m) => m.status === 'SURVIVED').map((m) => m.id)) : null;
const equivalents = option('--equivalents') ? JSON.parse(fs.readFileSync(path.resolve(option('--equivalents')), 'utf8')) : {};
const sources = Object.fromEntries(target.files.map((name) => [name, fs.readFileSync(path.join(lifecycle, name), 'utf8').replace(/\r\n/g, '\n')]));
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
const suite = target.suite.filter((file) => fs.existsSync(file));

const all = [];
for (const file of target.mutate) {
  for (const m of mutantsOf(sources[file])) all.push({ ...m, file, id: `${file}:${m.line}:${m.col}:${m.op}:${m.replacement.slice(0, 24)}` });
}
const chosen = all.filter((m) => (!only || m.id.includes(only)) && (!wanted || wanted.has(m.id)));
if (args.includes('--list')) {
  console.log(JSON.stringify({ target: option('--target'), mutants: chosen.length, byFile: Object.fromEntries(target.mutate.map((f) => [f, chosen.filter((m) => m.file === f).length])) }));
  process.exit(0);
}
const work = option('--work');
if (!work) throw new Error('--work <directory> is required');
if (fs.existsSync(work) && fs.readdirSync(work).length > 0) throw new Error('--work must be an empty or new directory');

const dirs = Array.from({ length: jobs }, (_, k) => {
  const dir = path.join(work, `j${k}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const name of target.files) fs.writeFileSync(path.join(dir, name), sources[name]);
  return dir;
});
// startup.cjs loads the sealed helper as ../isolated.cjs: a shim in the work directory resolves it to the real, unedited file
fs.writeFileSync(path.join(work, 'isolated.cjs'), `module.exports = require(${JSON.stringify(path.join(repo, 'testing', 'browser', 'isolated.cjs'))});\n`);

function runSuite(dir) {
  const env = { ...process.env, [target.env]: dir };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'U005_RED_IMPL', 'U005_FIRST_PUBLICATION']) delete env[name];
  return new Promise((resolve) => {
    const started = Date.now();
    // One process for the whole suite (isolation none); a mutant is killed (and the process ended) at the FIRST failing test.
    const child = spawn(process.execPath, ['--test', '--experimental-test-isolation=none', '--test-timeout=20000', ...suite], { cwd: repo, env, windowsHide: true, timeout: timeoutMs, killSignal: 'SIGKILL' });
    let text = '';
    let early = false;
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (!early && /^not ok \d+ - /m.test(text)) {
        early = true;
        child.kill('SIGKILL');
      }
    });
    child.stderr.on('data', () => {});
    child.on('close', (code, signal) => resolve({
      exit: early ? 1 : code, timedOut: signal === 'SIGKILL' && !early, elapsedMs: Date.now() - started,
      failing: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
      tests: Number((text.match(/^# tests (\d+)$/m) || [])[1] || 0),
    }));
  });
}

async function main() {
  const control = await runSuite(dirs[0]);
  const report = { target: option('--target'), generator: 'mutate-lex.cjs', control: { ...control, ok: control.exit === 0 && control.failing.length === 0 && control.tests > 0 }, mutants: [] };
  if (report.control.ok) {
    const queue = [...chosen];
    let done = 0;
    await Promise.all(dirs.map(async (dir) => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        const file = path.join(dir, m.file);
        fs.writeFileSync(file, m.mutated);
        const run = await runSuite(dir);
        fs.writeFileSync(file, sources[m.file]);
        done += 1;
        if (done % 20 === 0) console.error(`${new Date().toISOString()} ${done}/${chosen.length} mutants done, ${report.mutants.filter((item) => item.status === 'SURVIVED').length} survivors so far`);
        const killed = run.exit !== 0;
        const status = killed ? (run.failing.length > 0 ? 'killed' : 'killed-by-crash') : equivalents[m.id] ? 'equivalent' : 'SURVIVED';
        report.mutants.push({ id: m.id, file: m.file, line: m.line, operator: m.op, original: m.original.slice(0, 80), replacement: m.replacement.slice(0, 40), mutatedSha256: sha(m.mutated), status, timedOut: run.timedOut, failing: run.failing.slice(0, 6), proof: equivalents[m.id] });
      }
    }));
    report.mutants.sort((a, b) => (a.file === b.file ? a.line - b.line || a.id.localeCompare(b.id) : a.file.localeCompare(b.file)));
  }
  const count = (status) => report.mutants.filter((item) => item.status === status).length;
  report.summary = { total: report.mutants.length, killed: count('killed') + count('killed-by-crash'), killedByCrash: count('killed-by-crash'), equivalent: count('equivalent'), survived: count('SURVIVED'), unexplained: report.mutants.filter((item) => item.status === 'SURVIVED').map((item) => item.id) };
  fs.rmSync(work, { recursive: true, force: true });
  console.log(JSON.stringify(report, null, 1));
  process.exitCode = report.control.ok && report.summary.survived === 0 ? 0 : 1;
}

main();
