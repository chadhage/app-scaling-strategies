'use strict';

// U032 tree replay: a scratch copy of the whole repository tree (a shared clone of this repository, which is never written) in which the live
// C021 namespace replaces the cloned one and files are ADDED under capability/C020 and committed. The C021 non-browser suite (and, with
// --consumers, the C038 and C048 suites) must stay green, and a modification of an accepted C020 file must make integrity test 1 fail again.
// Usage: node capability\C021\tests\tree-replay.cjs <fresh-dir of at most 120 characters> [pack-dir mirroring capability\C020] [--consumers]
// Without a pack directory one synthetic file is added.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const repo = path.resolve(__dirname, '..', '..', '..');
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[name];
const identity = ['-c', 'user.name=u032-replay', '-c', 'user.email=u032-replay@example.invalid', '-c', 'commit.gpgsign=false'];

function run(command, args, cwd, timeout = 900000) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, windowsHide: true, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return result;
}
function git(cwd, ...args) {
  const result = run('git', args[0] === 'commit' ? [...identity, ...args] : args, cwd);
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed (${result.status}): ${result.stderr}`);
  return result.stdout;
}
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => (entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]));
const summary = (stdout) => Object.fromEntries(['tests', 'pass', 'fail'].map((key) => [key, Number((stdout.match(new RegExp(`^# ${key} (\\d+)$`, 'm')) || [])[1])]));

const args = process.argv.slice(2);
const consumers = args.includes('--consumers');
const [base, pack] = args.filter((arg) => !arg.startsWith('--'));
if (!base || path.resolve(base).length > 120 || (pack && !fs.statSync(pack).isDirectory())) {
  console.error('usage: node tree-replay.cjs <fresh-dir of at most 120 characters> [pack-dir mirroring capability\\C020] [--consumers]');
  process.exit(64);
}
const dir = path.resolve(base);
if (fs.existsSync(dir)) throw new Error(`${dir} must not exist`);
git(repo, 'clone', '--shared', '--quiet', '-c', 'core.longpaths=true', repo, dir);
fs.cpSync(path.join(repo, 'capability', 'C021'), path.join(dir, 'capability', 'C021'), { recursive: true, force: true });
const c020 = path.join(dir, 'capability', 'C020');
const added = [];
const sources = pack ? walk(path.resolve(pack)).map((file) => [file, path.relative(path.resolve(pack), file)])
  : [[null, 'u032-added.txt']];
for (const [source, relative] of sources) {
  const target = path.join(c020, relative);
  if (fs.existsSync(target)) throw new Error(`${relative} already exists under capability/C020: only ADDED files are allowed`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (source) fs.copyFileSync(source, target); else fs.writeFileSync(target, 'U032 tree replay addition\n');
  added.push({ path: relative.split(path.sep).join('/'), sha256: createHash('sha256').update(fs.readFileSync(target)).digest('hex') });
}
git(dir, 'add', '--', 'capability/C020');
git(dir, 'commit', '--quiet', '-m', 'u032 scratch: files added under capability/C020');

const results = [];
function step(name, argv, pass) {
  const result = run(process.execPath, argv, dir);
  const passed = result.status === 0;
  results.push({ name, expected: pass ? 'pass' : 'fail', actual: passed ? 'pass' : 'fail', status: result.status, ok: passed === pass, ...summary(result.stdout) });
  if (passed !== pass) console.log(`--- ${name}\n${result.stdout}${result.stderr}`);
}
const tap = ['--test', '--test-concurrency=1', '--test-reporter=tap'];
const tests = ['compatibility', 'guards', 'integrity', 'amendments'].map((name) => `capability/C021/tests/${name}.test.cjs`);
step('C021 non-browser suite with files added under C020', [...tap, ...tests], true);
step('C021 syntax check', ['capability/C021/tests/syntax.cjs'], true);
if (consumers) {
  for (const namespace of ['C048', 'C038']) {
    const files = fs.readdirSync(path.join(dir, 'capability', namespace, 'tests')).filter((name) => name.endsWith('.test.cjs')).map((name) => `capability/${namespace}/tests/${name}`);
    step(`${namespace} non-browser suite with files added under C020`, [...tap, ...files], true);
  }
}
fs.appendFileSync(path.join(c020, 'README.md'), '\nU032 tree replay edit\n');
step('control: a modified accepted C020 file fails integrity test 1', ['--test', '--test-reporter=tap', '--test-name-pattern=accepted C020 is byte-unchanged',
  'capability/C021/tests/integrity.test.cjs'], false);
fs.copyFileSync(path.join(repo, 'capability', 'C020', 'README.md'), path.join(c020, 'README.md'));

// Negative controls on the real files of the scratch tree: every one must fail the whole integrity test; each file is restored from the live tree.
const addendum = 'capability/C021/evidence-addendum-1.json';
const negatives = [
  ['a different change to tests/integrity.test.cjs', 'capability/C021/tests/integrity.test.cjs', (file) => fs.appendFileSync(file, '\n// edited\n')],
  ['a change to another sealed file (compatibility.js)', 'capability/C021/compatibility.js', (file) => fs.appendFileSync(file, '\n')],
  ['a modified helper tests/amendments.cjs', 'capability/C021/tests/amendments.cjs', (file) => fs.appendFileSync(file, '\n// edited\n')],
  ['a modified addendum (base hash)', addendum, (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"rawSha256": "ff227fde', '"rawSha256": "00227fde'))],
  ['a modified addendum (replacing hash)', addendum, (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('"rawSha256": "b8b2c133', '"rawSha256": "00b2c133'))],
  ['a modified addendum (prose only, pinned by the next addendum)', addendum, (file) => fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Owned amendment path', 'owned amendment path'))],
  ['a missing addendum 1', addendum, (file) => fs.rmSync(file)]
];
for (const [name, relative, mutate] of negatives) {
  mutate(path.join(dir, relative));
  step(`negative: ${name}`, ['--test', '--test-reporter=tap', 'capability/C021/tests/integrity.test.cjs'], false);
  fs.copyFileSync(path.join(repo, relative), path.join(dir, relative));
}
console.log(JSON.stringify({ added, consumers, node: process.version, results }, null, 2));
process.exitCode = results.every((entry) => entry.ok) ? 0 : 1;
