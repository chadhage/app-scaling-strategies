'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const directory = __dirname;
const repo = path.resolve(directory, '..', '..');
const evidence = path.join(directory, 'evidence');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(repo, file);
const stage = process.argv[2];
const label = process.argv[3] || stage;
if (!['red', 'green', 'browser', 'syntax'].includes(stage) || !/^[a-z0-9-]+$/.test(label)) {
  throw new Error('Explicit capture stage red|green|browser|syntax and a unique safe label required.');
}
if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Browser evidence capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
}
const files = stage === 'red' ? ['model.test.cjs', 'guards.test.cjs']
  : stage === 'green' ? ['model.test.cjs', 'guards.test.cjs', 'integrity.test.cjs']
    : stage === 'browser' ? ['browser.test.cjs'] : ['model.js', 'lesson.js', 'capture.cjs', 'browser.test.cjs'];
const targets = files.map((name) => path.join(directory, name));
const args = stage === 'syntax' ? null : ['--test', '--test-reporter=tap', ...targets];
const log = path.join(evidence, stage === 'syntax' ? `syntax-${label}.txt` : `${label}.tap.txt`);
const proofPath = path.join(evidence, `${label}.json`);
if (fs.existsSync(log) || fs.existsSync(proofPath)) throw new Error('Historical captures are append-only; choose a fresh label.');
const snapshots = [];
if (stage === 'red') {
  for (const name of ['model.js', 'model.test.cjs', 'guards.test.cjs', 'consumer-scale-in.feature', 'capture.cjs']) {
    const destination = path.join(evidence, `${label}-${name.replaceAll('.', '-')}.source.txt`);
    const bytes = fs.readFileSync(path.join(directory, name));
    fs.writeFileSync(destination, bytes, { flag: 'wx' });
    snapshots.push({ original: relative(path.join(directory, name)), path: relative(destination), sha256: hash(bytes) });
  }
}
const startedAtUtc = new Date().toISOString();
let stdout;
let stderr;
let exitCode;
if (stage === 'syntax') {
  const outputs = targets.map((target) => {
    const result = spawnSync(process.execPath, ['--check', target], { cwd: repo, encoding: null });
    if (result.error) throw result.error;
    return { target: relative(target), ...result };
  });
  stdout = Buffer.concat(outputs.flatMap((item) => [Buffer.from(`node --check ${item.target}\r\nexit=${item.status}\r\n`), item.stdout]));
  stderr = Buffer.concat(outputs.map((item) => item.stderr));
  exitCode = outputs.some((item) => item.status !== 0) ? 1 : 0;
} else {
  const result = spawnSync(process.execPath, args, {
    cwd: repo, encoding: null, maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, S076_BROWSER_EVIDENCE_LABEL: label }
  });
  if (result.error) throw result.error;
  stdout = result.stdout;
  stderr = result.stderr;
  exitCode = result.status;
}
fs.writeFileSync(log, stdout, { flag: 'wx' });
const stderrPath = path.join(evidence, `${label}-stderr.tap.txt`);
fs.writeFileSync(stderrPath, stderr, { flag: 'wx' });
const text = stdout.toString('utf8');
const number = (name) => Number(text.match(new RegExp(`^# ${name} (\\d+)$`, 'm'))?.[1] || 0);
const proof = {
  cardId: 'A-S076', workerId: 'worker-A-S076', stage, label, runtime: process.version,
  startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: stage === 'syntax' ? targets.map((file) => ['node', '--check', relative(file)]) : ['node', ...args.map((item) => path.isAbsolute(item) ? relative(item) : item)],
  exitCode, summary: { tests: number('tests'), pass: number('pass'), fail: number('fail'), skipped: number('skipped') },
  assertionFailures: [...text.matchAll(/code: 'ERR_ASSERTION'/g)].length,
  failedSubtestGroups: [...text.matchAll(/failureType: 'subtestsFailed'/g)].length,
  log: { path: relative(log), sha256: hash(stdout), bytes: stdout.length },
  stderr: { path: relative(stderrPath), sha256: hash(stderr), bytes: stderr.length },
  sourceHashes: Object.fromEntries(files.map((file) => [file, hash(fs.readFileSync(path.join(directory, file)))])),
  snapshots, nativeProof: false, parentComplete: false, extraKanoCredit: false
};
fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(proof, null, 2));
if (stage === 'red') {
  if (exitCode !== 1 || proof.assertionFailures < 20
      || proof.summary.fail !== proof.assertionFailures + proof.failedSubtestGroups
      || /MODULE_NOT_FOUND|Cannot find module|name: '(?:TypeError|ReferenceError)'/.test(text)) {
    throw new Error('RED is not qualified: actual behavioral assertions against a loadable stub are required.');
  }
} else if (exitCode !== 0) {
  process.exitCode = 1;
}
