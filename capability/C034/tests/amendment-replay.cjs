'use strict';

// U020 replay in a scratch copy of the namespace outside the repository tree:
//   node capability\C034\tests\amendment-replay.cjs <red|stub|green> <new-scratch-directory> [--archive]
// red: the retained sealed v1 integrity test rejects the one-line K-C034 edit (no amendment path). stub: the specification tests fail by
// assertion against the retained loadable stub helper. green: the current integrity test, helper and addendum accept the same edit.
// The scratch directory must not exist yet; it is removed afterwards.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { gzipSync } = require('node:zlib');
const amendments = require('.\\amendments.cjs');
const { hash } = amendments;

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence', 'u020-amendment-path');
const retained = (name) => fs.readFileSync(path.join(evidence, name));
const [mode, target, flag, ...rest] = process.argv.slice(2);
if (!['red', 'stub', 'green'].includes(mode) || !target || (flag !== undefined && flag !== '--archive') || rest.length) {
  throw new Error('Usage: amendment-replay.cjs <red|stub|green> <new-scratch-directory> [--archive]');
}
const scratch = path.resolve(target);
const relative = path.relative(repository, scratch);
if (!(relative.startsWith('..') || path.isAbsolute(relative)) || fs.existsSync(scratch)) {
  throw new Error('A fresh scratch directory outside the repository is required.');
}
const inScratch = (name) => path.join(scratch, 'capability', 'C034', name);
const v1Surface = retained('surface.test.v1.cjs.txt');
const edited = amendments.applySurfaceEdit(v1Surface);

function run(label, args) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  delete env.CAPTURE_BROWSER_EVIDENCE;
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: scratch, env, encoding: null, windowsHide: true, timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
  return { label, command: ['node', ...args.map((arg) => (arg.startsWith(scratch) ? path.relative(scratch, arg) : arg))], startedAtUtc,
    completedAtUtc: new Date().toISOString(), exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}
function archive(stage, runs, inputs) {
  const raw = path.join(evidence, 'raw');
  const stored = runs.map((item) => {
    const streams = {};
    for (const stream of ['stdout', 'stderr']) {
      const file = path.join(raw, `${stage}.${item.label}.${stream}.raw.gz`);
      fs.writeFileSync(file, gzipSync(item[stream]), { flag: 'wx' });
      streams[stream] = { file: path.relative(repository, file), rawSha256: hash(item[stream]), bytes: item[stream].length };
    }
    return { label: item.label, command: item.command, startedAtUtc: item.startedAtUtc, completedAtUtc: item.completedAtUtc, exitCode: item.exitCode, ...streams };
  });
  const record = { schemaVersion: 1, itemId: 'U020', serves: 'C034', stage, workerId: 'worker-U020', node: process.version, replay: `node capability\\C034\\tests\\amendment-replay.cjs ${mode} <new-scratch-directory>`,
    inputs: inputs.map(([name, bytes]) => ({ name, rawSha256: hash(bytes), bytes: bytes.length })), runs: stored };
  fs.writeFileSync(path.join(evidence, `${stage}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
}

let ok = false;
try {
  for (const name of ['C020', 'C033', 'C034']) {
    fs.cpSync(path.join(repository, 'capability', name), path.join(scratch, 'capability', name), { recursive: true });
  }
  if (mode === 'red') {
    fs.writeFileSync(inScratch('tests\\integrity.test.cjs'), retained('integrity.test.v1.cjs.txt'));
    const sealedCheck = () => run('', ['--test', '--test-reporter=tap', '--test-name-pattern=one original C034 S', inScratch('tests\\integrity.test.cjs')]);
    fs.writeFileSync(inScratch('tests\\surface.test.cjs'), v1Surface);
    const control = { ...sealedCheck(), label: 'control-unedited' };
    fs.writeFileSync(inScratch('tests\\surface.test.cjs'), edited);
    const edit = { ...sealedCheck(), label: 'edited' };
    const text = edit.stdout.toString('utf8');
    ok = control.exitCode === 0 && edit.exitCode === 1 && text.includes('capability\\C034\\tests\\surface.test.cjs') &&
      text.includes(hash(v1Surface)) && text.includes(hash(edited));
    process.stdout.write(edit.stdout);
    process.stderr.write(edit.stderr);
    console.log(JSON.stringify({ mode, control: control.exitCode, edited: edit.exitCode, redReproduced: ok }));
    if (ok && flag) archive('red-01-edit-without-amendment', [control, edit], [['tests/integrity.test.v1', retained('integrity.test.v1.cjs.txt')],
      ['tests/surface.test.v1', v1Surface], ['tests/surface.test.k-c034-edit', edited]]);
  } else if (mode === 'green') {
    fs.mkdirSync(inScratch('tests\\fixtures'), { recursive: true });
    const snapshot = fs.readFileSync(path.join(repository, 'capability', 'C005', 'tests', 'fixtures', 'publish-f6df80bdafc0.ps1.txt'));
    fs.writeFileSync(inScratch('tests\\fixtures\\publish-f6df80bdafc0.ps1.txt'), snapshot);
    fs.writeFileSync(inScratch('tests\\surface.test.cjs'), edited);
    const init = spawnSync('git', ['init', '--quiet'], { cwd: scratch, windowsHide: true });
    if (init.status !== 0) throw new Error('Scratch git init failed.');
    const files = ['integrity', 'amendments', 'surface'].map((name) => inScratch(`tests\\${name}.test.cjs`));
    const simulated = { ...run('simulated-k-c034-edit', ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files]) };
    ok = simulated.exitCode === 0;
    process.stdout.write(simulated.stdout);
    process.stderr.write(simulated.stderr);
    console.log(JSON.stringify({ mode, exitCode: simulated.exitCode, greenReproduced: ok }));
    if (ok && flag) archive('green-02-simulated-k-c034-edit', [simulated], [['tests/surface.test.k-c034-edit', edited],
      ['tests/fixtures/publish-f6df80bdafc0.ps1.txt', snapshot], ['tests/integrity.test.cjs', fs.readFileSync(path.join(root, 'tests', 'integrity.test.cjs'))]]);
  } else {
    const stub = retained('amendments.stub-2.cjs.txt');
    fs.writeFileSync(inScratch('tests\\amendments.cjs'), stub);
    const failing = run('final-spec-against-stub', ['--test', '--test-reporter=tap', inScratch('tests\\amendments.test.cjs')]);
    const output = `${failing.stdout}${failing.stderr}`;
    ok = failing.exitCode === 1 && /^# fail [1-9]/m.test(output) && !/Cannot find module|SyntaxError/.test(output);
    process.stdout.write(failing.stdout);
    process.stderr.write(failing.stderr);
    console.log(JSON.stringify({ mode, exitCode: failing.exitCode, redReproduced: ok }));
    if (ok && flag) archive('red-03-final-spec-against-stub', [failing], [['tests/amendments.stub-2', stub],
      ['tests/amendments.test.cjs', fs.readFileSync(path.join(root, 'tests', 'amendments.test.cjs'))]]);
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
process.exitCode = ok ? 0 : 1;
