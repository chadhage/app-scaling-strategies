'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const lesson = __dirname;
const root = path.resolve(lesson, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const tasks = {
  'stub-load': {
    expected: 0,
    args: ['-e', "const a=require('.\\\\learning\\\\S042\\\\long-work.js');if(typeof a.rehearse!=='function')process.exit(2);console.log(JSON.stringify(a.rehearse(a.DEFAULT_INPUT)));"],
  },
  red: {
    expected: 1,
    args: ['--test', '--test-reporter=tap', '.\\learning\\S042\\tests\\core.test.cjs'],
  },
  'red-replay': {
    expected: 1,
    args: ['.\\learning\\S042\\tests\\replay-red.cjs'],
  },
  'model-green': {
    expected: 0,
    args: ['--test', '--test-reporter=tap', '.\\learning\\S042\\tests\\core.test.cjs', '.\\learning\\S042\\tests\\model.test.cjs'],
  },
  'syntax-green': {
    expected: 0,
    args: ['--test', '--test-reporter=tap', '.\\learning\\S042\\tests\\syntax.test.cjs'],
  },
  'browser-capture': {
    expected: 0,
    args: ['--test', '--test-reporter=tap', '.\\learning\\S042\\tests\\browser.test.cjs'],
    browserCapture: true,
  },
  'focused-green': {
    expected: 0,
    args: ['.\\learning\\S042\\verify.cjs'],
  },
};

const name = process.argv[2];
if (name === 'bind') {
  const hashes = (directory, skipEvidence) => {
    const result = {};
    function walk(current) {
      for (const item of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (skipEvidence && item.name === 'evidence') continue;
        const target = path.join(current, item.name);
        if (item.isDirectory()) walk(target);
        else result[path.relative(lesson, target)] = sha(fs.readFileSync(target));
      }
    }
    walk(directory);
    return result;
  };
  for (const file of ['source-hashes.json', 'integrity.json']) {
    if (fs.existsSync(path.join(lesson, 'evidence', file))) throw new Error('Hash bindings already exist; do not silently refresh proof.');
  }
  const write = (file, value) => fs.writeFileSync(path.join(lesson, 'evidence', file),
    `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  write('source-hashes.json', {
    schemaVersion: 1, cardId: 'A-S042', algorithm: 'SHA-256',
    bytes: 'Exact stored bytes; scoped -text attributes preserve original CRLF/LF without normalization.',
    capturedAtUtc: new Date().toISOString(), files: hashes(lesson, true),
  });
  write('integrity.json', {
    schemaVersion: 1, cardId: 'A-S042', algorithm: 'SHA-256',
    capturedAtUtc: new Date().toISOString(), files: hashes(path.join(lesson, 'evidence'), false),
    exclusions: [
      'This integrity map cannot hash itself.',
      'focused-green.raw.json is created only after the outermost verification finishes; its raw streams carry their own byte hashes.',
    ],
  });
  console.log('Bound exact S042 source bytes and retained proof; normal verification never refreshes these maps.');
  process.exit(0);
}
if (!Object.hasOwn(tasks, name)) throw new Error('Choose a declared S042 evidence capture.');
const task = tasks[name];
const destination = path.join(lesson, 'evidence', `${name}.raw.json`);
if (fs.existsSync(destination)) throw new Error(`Evidence already exists: ${name}; do not overwrite proof.`);
if (task.browserCapture && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Deliberate browser capture requires CAPTURE_BROWSER_EVIDENCE=1.');
}
const startedAtUtc = new Date().toISOString();
const child = spawnSync(process.execPath, task.args, {
  cwd: root,
  env: { ...process.env, CAPTURE_BROWSER_EVIDENCE: task.browserCapture ? '1' : '' },
  timeout: 180000,
  maxBuffer: 8 * 1024 * 1024,
  windowsHide: true,
});
const stdout = child.stdout || Buffer.alloc(0);
const stderr = child.stderr || Buffer.alloc(0);
const record = {
  schemaVersion: 1,
  cardId: 'A-S042',
  stage: name,
  command: [process.execPath, ...task.args],
  cwd: root,
  nodeVersion: process.version,
  startedAtUtc,
  finishedAtUtc: new Date().toISOString(),
  expectedExitCode: task.expected,
  exitCode: child.status,
  signal: child.signal,
  processError: child.error ? { code: child.error.code, message: child.error.message } : null,
  sourceSha256: sha(fs.readFileSync(path.join(lesson, 'long-work.js'))),
  testSha256: fs.existsSync(path.join(lesson, 'tests', 'core.test.cjs'))
    ? sha(fs.readFileSync(path.join(lesson, 'tests', 'core.test.cjs'))) : null,
  streams: {
    stdout: { utf8: stdout.toString('utf8'), base64: stdout.toString('base64'), sha256: sha(stdout) },
    stderr: { utf8: stderr.toString('utf8'), base64: stderr.toString('base64'), sha256: sha(stderr) },
  },
};
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Captured ${name}: actual exit ${child.status}, expected ${task.expected}.`);
if (child.error || child.signal || child.status !== task.expected) process.exitCode = 1;
