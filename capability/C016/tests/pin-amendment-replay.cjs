'use strict';

// U019 replay in a scratch copy outside the repository tree:
//   node capability\C016\tests\pin-amendment-replay.cjs <red|stub|green> <new-scratch-directory> [--archive]
// red: the retained v1 integrity test rejects the one-line K-C015 edit of C015 tests\surface.test.cjs (no amendment path).
// stub: the specification tests fail by assertion against the retained loadable stub helper.
// green: the current integrity test, helper and addendum accept the same edit; the edited C015 surface test passes too.
// The scratch directory must not exist yet and is removed afterwards. Git history is read through GIT_DIR (objects only); nothing is written
// to the repository except the archive files that --archive adds under evidence\u019-pin-amendment.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const edit = require('./surface-edit.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence', 'u019-pin-amendment');
const retained = (name) => fs.readFileSync(path.join(evidence, name));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lfHash = (bytes) => hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const [mode, target, flag, ...rest] = process.argv.slice(2);
if (!['red', 'stub', 'green'].includes(mode) || !target || (flag !== undefined && flag !== '--archive') || rest.length) {
  throw new Error('Usage: pin-amendment-replay.cjs <red|stub|green> <new-scratch-directory> [--archive]');
}
const scratch = path.resolve(target);
const outside = path.relative(repository, scratch);
if (!(outside.startsWith('..') || path.isAbsolute(outside)) || fs.existsSync(scratch)) {
  throw new Error('A fresh scratch directory outside the repository is required.');
}
const pins = JSON.parse(fs.readFileSync(path.join(root, 'dependency-pins.json'), 'utf8'));
// Windows git stats <cwd>\<rev>:<path> while it resolves a name, so the scratch path must leave room for the longest pinned object name within MAX_PATH.
const longest = Math.max(...pins.records.map((entry) => `${pins.observedHead}:${entry.file.split('\\').join('/')}`.length));
if (scratch.length + 1 + longest > 259) throw new Error(`The scratch directory path is too long (${scratch.length}; at most ${258 - longest} characters).`);
const inScratch = (...parts) => path.join(scratch, ...parts);
const surface = inScratch('capability', 'C015', 'tests', 'surface.test.cjs');
const integrity = inScratch('capability', 'C016', 'tests', 'integrity.test.cjs');
const REMOVED = ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE'];

function run(label, args) {
  const env = { ...process.env, GIT_DIR: path.join(repository, '.git') };
  for (const name of REMOVED) delete env[name];
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, { cwd: scratch, env, encoding: null, windowsHide: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
  return { label, command: ['node', ...args.map((arg) => (arg.startsWith(scratch) ? path.relative(scratch, arg) : arg))], startedAtUtc,
    completedAtUtc: new Date().toISOString(), exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

function archive(stage, runs, inputs) {
  const stored = runs.map((item) => {
    const streams = {};
    for (const stream of ['stdout', 'stderr']) {
      const file = path.join(evidence, 'raw', `${stage}.${item.label}.${stream}.raw.gz`);
      fs.writeFileSync(file, gzipSync(item[stream]), { flag: 'wx' });
      streams[stream] = { file: path.relative(repository, file), bytes: item[stream].length, rawSha256: hash(item[stream]) };
    }
    return { label: item.label, command: item.command, startedAtUtc: item.startedAtUtc, completedAtUtc: item.completedAtUtc, exitCode: item.exitCode, ...streams };
  });
  const record = { schemaVersion: 1, itemId: 'U019', serves: 'C016', workerId: 'worker-U019', stage, node: process.version,
    replay: `node capability\\C016\\tests\\pin-amendment-replay.cjs ${mode} <new-scratch-directory>`,
    environment: { removed: REMOVED, gitDir: 'the real repository .git, read for objects only' },
    inputs: inputs.map(([name, bytes]) => ({ name, bytes: bytes.length, rawSha256: hash(bytes), crlfToLfSha256: lfHash(bytes) })), runs: stored };
  fs.writeFileSync(path.join(evidence, `${stage}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
}

function copyTree(base, name) {
  fs.cpSync(path.join(base, name), path.join(scratch, name), { recursive: true, filter: (source) => !/(^|[\\/])(test-scratch|publication\.json)$/.test(source) });
}

let ok = false;
try {
  for (const name of ['capability\\C001', 'capability\\C002', 'capability\\C015', 'capability\\C016']) copyTree(repository, name);
  fs.mkdirSync(inScratch('testing', 'browser'), { recursive: true });
  fs.copyFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'), inScratch('testing', 'browser', 'isolated.cjs'));
  // The accepted bytes come from Git history at the pinned observedHead (LF blob converted to the working CRLF form), never from the live file,
  // so the replay still holds after K-C015 publishes the edit.
  const blob = execFileSync('git', ['--no-pager', 'show', `${pins.observedHead}:${edit.FILE.split('\\').join('/')}`], { cwd: repository, maxBuffer: 8 * 1024 * 1024 });
  const original = Buffer.from(blob.toString('utf8').replace(/\n/g, '\r\n'));
  if (hash(original) !== pins.records.find((entry) => entry.file === edit.FILE).rawSha256) throw new Error('The rebuilt accepted bytes differ from the sealed record.');
  const edited = edit.applySurfaceEdit(original);
  if (mode === 'red') {
    const v1 = retained('integrity.test.v1.cjs.txt');
    fs.writeFileSync(integrity, v1);
    fs.writeFileSync(surface, original);
    const pinned = () => run('', ['--test', '--test-reporter=tap', '--test-name-pattern=accepted C001 C002 C015 bytes', integrity]);
    const control = { ...pinned(), label: 'control-unedited' };
    fs.writeFileSync(surface, edited);
    const changed = { ...pinned(), label: 'edited' };
    const text = changed.stdout.toString('utf8');
    ok = control.exitCode === 0 && changed.exitCode === 1 && text.includes('surface.test.cjs') && /actual: 6036/.test(text) && /expected: 6034/.test(text);
    process.stdout.write(changed.stdout);
    process.stderr.write(changed.stderr);
    console.log(JSON.stringify({ mode, control: control.exitCode, edited: changed.exitCode, redReproduced: ok }));
    if (ok && flag) archive('red-01-edit-without-amendment', [control, changed], [['tests/integrity.test.v1.cjs', v1], ['C015/tests/surface.test.cjs (accepted)', original],
      ['C015/tests/surface.test.cjs (K-C015 edit)', edited]]);
  } else if (mode === 'stub') {
    const stub = retained('pin-authority.stub.cjs.txt');
    fs.writeFileSync(inScratch('capability', 'C016', 'tests', 'pin-authority.cjs'), stub);
    const spec = inScratch('capability', 'C016', 'tests', 'pin-amendment.test.cjs');
    const failing = run('spec-against-stub', ['--test', '--test-reporter=tap', spec]);
    const output = `${failing.stdout}${failing.stderr}`;
    ok = failing.exitCode === 1 && /^# fail [1-9]/m.test(output) && !/Cannot find module|SyntaxError/.test(output);
    process.stdout.write(failing.stdout);
    process.stderr.write(failing.stderr);
    console.log(JSON.stringify({ mode, exitCode: failing.exitCode, redReproduced: ok }));
    if (ok && flag) archive('red-02-spec-against-stub', [failing], [['tests/pin-authority.stub.cjs', stub], ['tests/pin-amendment.test.cjs', fs.readFileSync(spec)]]);
  } else {
    fs.writeFileSync(surface, edited);
    const files = [integrity, inScratch('capability', 'C016', 'tests', 'pin-amendment.test.cjs'), surface];
    const simulated = run('simulated-k-c015-edit', ['--test', '--test-concurrency=1', '--test-reporter=tap', ...files]);
    ok = simulated.exitCode === 0;
    process.stdout.write(simulated.stdout);
    process.stderr.write(simulated.stderr);
    console.log(JSON.stringify({ mode, exitCode: simulated.exitCode, greenReproduced: ok }));
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
process.exitCode = ok ? 0 : 1;
