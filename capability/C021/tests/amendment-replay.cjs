'use strict';

// U032 replay: builds a scratch repository that holds the accepted C020 tree (commit 2dc471da, read through a shared clone of this
// repository, which is never written) and runs C021 integrity test 1 inside it.
//   red       retained sealed v1 test: the control passes, a COMMITTED addition fails (exit 1 = the RED).
//   controls  retained sealed v1 test: modification, deletion and rename fail (exit 0 when all of them fail, as before U032).
//   green     amended test and helper: control and untracked, staged and committed additions pass; modification, deletion and rename
//             fail in the working tree, in the index and in a commit (exit 0 when every case is as expected).
// Usage: node capability\C021\tests\amendment-replay.cjs <red|controls|green> <fresh-dir>   (fresh-dir must not exist and be short)
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..');
const root = path.join(repo, 'capability', 'C021');
const accepted = '2dc471daab3ffa202d83aba2df443e280cad3656';
const retained = path.join(root, 'evidence', 'u032-integrity-amendment', 'integrity.test.v1.cjs.txt');
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[name];
const identity = ['-c', 'user.name=u032-replay', '-c', 'user.email=u032-replay@example.invalid', '-c', 'commit.gpgsign=false'];

function run(command, args, cwd, timeout = 180000) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, windowsHide: true, killSignal: 'SIGKILL' });
  if (result.error) throw result.error;
  return result;
}
function git(dir, ...args) {
  const result = run('git', args[0] === 'commit' ? [...identity, ...args] : args, dir);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}
function build(dir, variant) {
  if (fs.existsSync(dir)) throw new Error(`${dir} must not exist`);
  git(repo, 'clone', '--shared', '--no-checkout', '--quiet', repo, dir);
  git(dir, 'symbolic-ref', 'HEAD', 'refs/heads/u032-scratch');
  git(dir, 'checkout', accepted, '--', 'capability/C020');
  const tests = path.join(dir, 'capability', 'C021', 'tests');
  fs.mkdirSync(tests, { recursive: true });
  fs.mkdirSync(path.join(dir, 'capability', 'C021', 'evidence'), { recursive: true });
  fs.copyFileSync(path.join(root, 'evidence', 'behavioral-red.json'), path.join(dir, 'capability', 'C021', 'evidence', 'behavioral-red.json'));
  fs.copyFileSync(variant === 'v1' ? retained : path.join(root, 'tests', 'integrity.test.cjs'), path.join(tests, 'integrity.test.cjs'));
  if (variant !== 'v1') fs.copyFileSync(path.join(root, 'tests', 'amendments.cjs'), path.join(tests, 'amendments.cjs'));
}
function test1(dir) {
  const result = run(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=accepted C020 is byte-unchanged',
    'capability/C021/tests/integrity.test.cjs'], dir);
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}
const C020 = 'capability/C020';
const edit = (file) => (dir) => fs.appendFileSync(path.join(dir, C020, file), '\nU032 replay edit\n');
const drop = (file) => (dir) => fs.rmSync(path.join(dir, C020, file));
const stage = (...paths) => (dir) => git(dir, 'add', '--', ...paths);
const commit = (dir) => git(dir, 'commit', '--quiet', '-m', 'u032 scratch');
const create = (dir) => fs.writeFileSync(path.join(dir, C020, 'u032-added.txt'), 'U032 replay addition\n');
const move = (dir) => git(dir, 'mv', `${C020}/README.md`, `${C020}/README-renamed.md`);
const moveOut = (dir) => { fs.mkdirSync(path.join(dir, 'moved')); git(dir, 'mv', `${C020}/README.md`, 'moved/README.md'); };
const then = (...steps) => (dir) => steps.forEach((step) => step(dir));
const added = `${C020}/u032-added.txt`;
const cases = {
  control: { pass: true, steps: [] },
  'addition untracked': { pass: true, steps: [create] },
  'addition staged': { pass: true, steps: [create, stage(added)] },
  'addition committed': { pass: true, steps: [create, stage(added), commit] },
  'modification in the working tree': { pass: false, steps: [edit('README.md')] },
  'modification staged': { pass: false, steps: [edit('README.md'), stage(`${C020}/README.md`)] },
  'modification committed': { pass: false, steps: [edit('README.md'), stage(`${C020}/README.md`), commit] },
  'deletion in the working tree': { pass: false, steps: [drop('README.md')] },
  'deletion staged': { pass: false, steps: [drop('README.md'), stage(`${C020}/README.md`)] },
  'deletion committed': { pass: false, steps: [drop('README.md'), stage(`${C020}/README.md`), commit] },
  'rename staged': { pass: false, steps: [move] },
  'rename committed': { pass: false, steps: [move, commit] },
  'rename out of C020 committed': { pass: false, steps: [moveOut, commit] },
  'addition plus modification committed': { pass: false, steps: [create, edit('README.md'), stage(added, `${C020}/README.md`), commit] }
};
const plans = {
  red: { variant: 'v1', names: ['control', 'addition committed'] },
  controls: { variant: 'v1', names: Object.keys(cases).filter((name) => !cases[name].pass) },
  green: { variant: 'v2', names: Object.keys(cases) }
};

const [mode, base] = process.argv.slice(2);
const plan = plans[mode];
if (!plan || !base || path.resolve(base).length > 150) {
  console.error('usage: node amendment-replay.cjs <red|controls|green> <fresh-dir of at most 150 characters>');
  process.exit(64);
}
const results = [];
let index = 0;
for (const name of plan.names) {
  const dir = path.resolve(base, String(index += 1));
  build(dir, plan.variant);
  cases[name].steps.forEach((step) => step(dir));
  const outcome = test1(dir);
  const passed = outcome.status === 0;
  const drift = git(dir, 'diff', '--name-status', '--no-renames', accepted, '--', C020).split('\n').filter(Boolean);
  results.push({ name, expected: cases[name].pass ? 'pass' : 'fail', actual: passed ? 'pass' : 'fail', status: outcome.status, drift, ok: passed === cases[name].pass });
  if (!passed) console.log(`--- ${name}: integrity test 1 output\n${outcome.output}`);
}
console.log(JSON.stringify({ mode, variant: plan.variant, acceptedCommit: accepted, node: process.version, cases: results }, null, 2));
const asExpected = results.every((entry) => entry.ok);
if (mode === 'red') process.exitCode = results[0].ok && results[1].status !== 0 ? 1 : 2;
else process.exitCode = asExpected ? 0 : 1;
