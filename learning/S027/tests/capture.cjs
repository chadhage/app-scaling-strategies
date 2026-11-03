'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Deliberate capture requires CAPTURE_BROWSER_EVIDENCE=1; normal tests are read-only.');
}
const [stage, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]*$/.test(stage || '') || args.length === 0) {
  throw new Error('Expected stage and explicit Node arguments.');
}
const root = path.resolve(__dirname, '..', '..', '..');
const lesson = path.resolve(__dirname, '..');
const evidence = path.join(lesson, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
let index = 1;
while (fs.existsSync(path.join(evidence, `${stage}-${String(index).padStart(3, '0')}.json`))) index++;
const name = `${stage}-${String(index).padStart(3, '0')}`;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence')
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? sources(absolute) : [absolute];
    });
}
const inputs = sources(lesson).sort().map((absolute) => {
  const bytes = fs.readFileSync(absolute);
  return { path: path.relative(root, absolute), bytes: bytes.length, sha256: sha256(bytes) };
});
const snapshots = [];
if (stage === 'red') {
  for (const relative of ['false-readiness.feature', 'probe.js', 'tests\\probe.test.cjs']) {
    const bytes = fs.readFileSync(path.join(lesson, relative));
    const destination = `${name}-${path.basename(relative)}.snapshot.txt`;
    fs.writeFileSync(path.join(evidence, destination), bytes, { flag: 'wx' });
    snapshots.push({ file: destination, source: relative, sha256: sha256(bytes) });
  }
}
const git = spawnSync('git', ['--no-pager', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const startedAtUtc = new Date().toISOString();
const child = spawnSync(process.execPath, args, {
  cwd: root,
  env: process.env,
  encoding: null,
  maxBuffer: 8 * 1024 * 1024,
});
const completedAtUtc = new Date().toISOString();
const stdout = child.stdout || Buffer.alloc(0);
const stderr = child.stderr || Buffer.alloc(0);
const helper = fs.readFileSync(path.join(root, 'testing', 'browser', 'isolated.cjs'));
const record = {
  schemaVersion: 1,
  cardId: 'A-S027',
  workerId: 'worker-A-S027',
  packet: 'SC-S027',
  mode: 'synthetic',
  stage,
  startedAtUtc,
  completedAtUtc,
  command: { executable: process.execPath, argv: args, cwd: root },
  runtime: process.version,
  gitHeadBefore: git.status === 0 ? git.stdout.trim() : null,
  exitCode: child.status,
  signal: child.signal,
  launchError: child.error ? String(child.error) : null,
  helperSha256: sha256(helper),
  inputs,
  snapshots,
  stdout: { utf8: stdout.toString('utf8'), base64: stdout.toString('base64'), sha256: sha256(stdout) },
  stderr: { utf8: stderr.toString('utf8'), base64: stderr.toString('base64'), sha256: sha256(stderr) },
};
fs.writeFileSync(path.join(evidence, `${name}.stdout.txt`), stdout, { flag: 'wx' });
fs.writeFileSync(path.join(evidence, `${name}.stderr.txt`), stderr, { flag: 'wx' });
fs.writeFileSync(path.join(evidence, `${name}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Provenance: learning\\S027\\evidence\\${name}.json`);
process.exitCode = child.status === null ? 1 : child.status;
