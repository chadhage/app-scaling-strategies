'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const label = process.argv[2];
const commands = {
  red: ['--test', path.join(__dirname, 'model.test.cjs')],
  'red-replay': ['--test', path.join(lesson, 'evidence', 'red', 'replay.cjs')],
  green: ['--test', path.join(__dirname, 'model.test.cjs'), path.join(__dirname, 'page.test.cjs')],
  syntax: [path.join(__dirname, 'syntax.cjs')],
  browser: [path.join(__dirname, 'browser.cjs')],
};
if (process.env.CAPTURE_TEST_EVIDENCE !== '1' || !Object.hasOwn(commands, label)) {
  throw new Error('Deliberate capture only: CAPTURE_TEST_EVIDENCE=1 plus red, red-replay, green, syntax or browser.');
}
const jsonPath = path.join(lesson, 'evidence', `${label}.json`);
const textPath = path.join(lesson, 'evidence', `${label}.txt`);
if (fs.existsSync(jsonPath) || fs.existsSync(textPath)) throw new Error('Refusing to overwrite historical proof.');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence')
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? collect(file) : [file];
    }).sort();
}
const inputs = collect(lesson).map((file) => ({
  path: path.relative(lesson, file), sha256: sha256(fs.readFileSync(file)),
}));
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, commands[label], {
  cwd: repo, windowsHide: true, timeout: 90000, maxBuffer: 8 * 1024 * 1024,
});
const stream = (buffer) => ({
  bytes: buffer.length, sha256: sha256(buffer), base64: buffer.toString('base64'),
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify({
  schemaVersion: 1, cardId: 'A-S039', label, startedAtUtc, completedAtUtc: new Date().toISOString(),
  node: process.version, nodeRole: 'Existing test tooling only; not production Node 24 qualification.',
  command: [process.execPath, ...commands[label]], cwd: repo,
  exitCode: run.status, signal: run.signal, error: run.error ? String(run.error) : null,
  inputs, stdout: stream(stdout), stderr: stream(stderr),
}, null, 2)}\n`, { flag: 'wx' });
const humanLog = Buffer.concat([stdout, stderr]).toString('utf8')
  .replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n');
fs.writeFileSync(textPath, humanLog.endsWith('\n') ? humanLog : `${humanLog}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(`Captured ${label}: exit ${run.status}; raw byte lengths, SHA-256 and base64 retained.`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
