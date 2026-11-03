'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const root = __dirname;
const repo = path.resolve(root, '..', '..');
const stage = process.argv[2];
if (!['red', 'focused', 'browser'].includes(stage)) {
  throw new Error('Explicit capture stage required: red, focused, or browser. Normal node --test is read-only.');
}
if (stage === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Browser evidence capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
}
const files = stage === 'red' ? ['tests\\model.test.cjs']
  : stage === 'focused' ? ['tests\\model.test.cjs', 'tests\\surface.test.cjs', 'tests\\integrity.test.cjs']
    : ['tests\\browser.test.cjs'];
const evidence = path.join(root, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
let number = 1;
while (fs.existsSync(path.join(evidence, `${stage}-run-${String(number).padStart(3, '0')}.json`))) number++;
const name = `${stage}-run-${String(number).padStart(3, '0')}`;
const prefix = path.join(evidence, name);
const digest = (data) => createHash('sha256').update(data).digest('hex');
const testedSourceHashes = Object.fromEntries([
  'model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json', 'retirement.feature',
  'capture.cjs', ...files,
].filter((file) => fs.existsSync(path.join(root, file))).map((file) =>
  [file, digest(Buffer.from(fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n')))]));
const snapshots = stage === 'red'
  ? ['model.js', 'tests\\model.test.cjs', 'retirement.feature']
  : stage === 'browser' ? ['tests\\browser.test.cjs'] : [];
const sourceHashes = {};
for (const relative of snapshots) {
  const data = fs.readFileSync(path.join(root, relative));
  const target = `${prefix}.${path.basename(relative)}.snapshot`;
  fs.writeFileSync(target, data, { flag: 'wx' });
  sourceHashes[relative] = { sha256: digest(data), snapshot: path.basename(target) };
}
const args = ['--test', ...files.map((file) => path.join(root, file))];
const startedAtUtc = new Date().toISOString();
const env = { ...process.env, S050_CAPTURE_NAME: name };
const run = spawnSync(process.execPath, args, {
  cwd: repo, env, encoding: null, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
const observationPath = `${prefix}.observations.json`;
const observationBytes = stage === 'browser' && fs.existsSync(observationPath) ? fs.readFileSync(observationPath) : null;
fs.writeFileSync(`${prefix}.stdout.raw.gz`, gzipSync(stdout), { flag: 'wx' });
fs.writeFileSync(`${prefix}.stderr.raw.gz`, gzipSync(stderr), { flag: 'wx' });
fs.writeFileSync(`${prefix}.tap`, stdout, { flag: 'wx' });
const metadata = {
  cardId: 'A-S050', workerId: 'worker-A-S050', packet: 'SC-S050', kano: 'S',
  stage, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], cwd: repo, node: process.version,
  sourceHead: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim(),
  exitCode: run.status, signal: run.signal, error: run.error ? String(run.error) : null,
  stdout: { bytes: stdout.length, sha256: digest(stdout), gzip: `${name}.stdout.raw.gz` },
  stderr: { bytes: stderr.length, sha256: digest(stderr), gzip: `${name}.stderr.raw.gz` },
  testedSourceHashes,
  sourceHashPolicy: 'UTF-8 text normalized CRLF to LF; raw streams and snapshots are byte-exact.',
  snapshots: sourceHashes,
  observations: observationBytes ? {
    file: path.basename(observationPath), bytes: observationBytes.length, sha256: digest(observationBytes),
  } : null,
  proofWrites: 'Explicit capture only; normal test commands do not update retained evidence.',
};
fs.writeFileSync(`${prefix}.json`, `${JSON.stringify(metadata, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = run.status === null ? 1 : run.status;
