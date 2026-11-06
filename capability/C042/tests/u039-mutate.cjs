'use strict';

// Test tooling, not production code (U039): mutation run for the guards added to server.cjs. Every mutant of
// tests\u039-mutants.cjs is written to a scratch file and used as the SUBJECT (U039_SUBJECT=file:...) of the named tests. A mutant
// is KILLED BY A NAMED TEST when every test listed in `fails` fails and every test listed in `passes` still passes; an
// equivalent mutant must survive (exit 0). A control run on the unmutated server must pass all named tests.
// Usage (repository root): node capability\C042\tests\u039-mutate.cjs [--only M01,M02] [--dir <scratch directory>]
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { mutants } = require('./u039-mutants.cjs');
const lib = require('./u039-lib.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const flag = (name) => { const at = process.argv.indexOf(name); return at < 0 ? null : process.argv[at + 1]; };
const only = flag('--only')?.split(',') ?? null;
const dir = path.resolve(flag('--dir') ?? path.join(__dirname, 'scratch', 'u039-mutants'));
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const source = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');

function run(subject, files, names) {
  const args = ['--test', '--test-concurrency=1', ...names.map((name) => `--test-name-pattern=${escape(name)}`), ...files.map((file) => path.join('capability', 'C042', 'tests', file))];
  const env = lib.childEnv({ U039_SUBJECT: subject, U039_CLOSE_MS: '2000' });
  const result = spawnSync(process.execPath, args, { cwd: repository, env, encoding: 'utf8', timeout: 900000, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  const out = result.stdout ?? '';
  return {
    exit: result.status, failed: [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
    passed: [...out.matchAll(/^ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
  };
}

const has = (list, pattern) => list.some((name) => name.includes(pattern));

fs.mkdirSync(dir, { recursive: true });
const report = [];
try {
  const chosen = mutants.filter((mutant) => only === null || only.includes(mutant.id.split('-')[0]));
  const files = [...new Set(chosen.flatMap((mutant) => mutant.files))];
  const names = [...new Set(chosen.flatMap((mutant) => [...mutant.fails, ...mutant.passes]))];
  const control = run('real', files, names);
  const controlFailures = names.filter((name) => !has(control.passed, name) || has(control.failed, name));
  report.push({ id: 'control', exit: control.exit, namedTests: names.length, notPassing: controlFailures });
  for (const mutant of chosen) {
    const count = source.split(mutant.find).length - 1;
    if (count !== 1) { report.push({ id: mutant.id, error: `the text to replace occurs ${count} times` }); continue; }
    const file = path.join(dir, `${mutant.id}.cjs`);
    fs.writeFileSync(file, source.replace(mutant.find, () => mutant.replace), { flag: 'w' });
    const got = run(`file:${file}`, mutant.files, [...mutant.fails, ...mutant.passes]);
    const namedKilled = mutant.fails.length > 0 && mutant.fails.every((name) => has(got.failed, name));
    const controlsKept = mutant.passes.every((name) => has(got.passed, name) && !has(got.failed, name));
    const survived = got.exit === 0;
    report.push({
      id: mutant.id, exit: got.exit, killed: !survived, namedKilled, controlsKept, equivalent: Boolean(mutant.equivalent),
      failed: got.failed.slice(0, 8), verdict: mutant.equivalent ? (survived ? 'equivalent, survived as claimed' : 'CLAIMED EQUIVALENT BUT KILLED') : (namedKilled && controlsKept ? 'killed by the named tests' : 'NOT KILLED BY THE NAMED TESTS'),
    });
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
const bad = report.filter((item) => item.error || item.verdict?.startsWith('NOT') || item.verdict?.startsWith('CLAIMED') || (item.id === 'control' && item.notPassing.length > 0));
const killed = report.filter((item) => item.verdict === 'killed by the named tests').length;
const equivalent = report.filter((item) => item.verdict === 'equivalent, survived as claimed').length;
for (const item of report) console.log(JSON.stringify(item));
console.log(JSON.stringify({ summary: true, mutants: report.length - 1, killedByNamedTests: killed, equivalentSurvived: equivalent, problems: bad.length }));
process.exitCode = bad.length === 0 ? 0 : 1;
