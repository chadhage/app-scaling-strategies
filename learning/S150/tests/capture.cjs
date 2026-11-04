'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { root, repo, sha, testedSourceHashes } = require('.\\provenance.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Only exact CAPTURE_BROWSER_EVIDENCE=1 permits deliberate focused raw capture.');
}
const sources = testedSourceHashes();
const stage = process.argv[2] ?? 'focused';
if (!['browser', 'focused'].includes(stage)) throw new Error('Choose exact browser or focused capture stage.');
const files = stage === 'browser' ? ['learning\\S150\\tests\\browser.test.cjs'] : [
  'learning\\S150\\tests\\model.test.cjs', 'learning\\S150\\tests\\surface.test.cjs',
  'learning\\S150\\tests\\integrity.test.cjs', 'learning\\S150\\tests\\browser.test.cjs',
];
const args = ['--test', '--test-concurrency=1', ...files];
const result = spawnSync(process.execPath, args, {
  cwd: repo, encoding: null, timeout: 210000, maxBuffer: 4 * 1024 * 1024,
});
const id = randomUUID();
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
const output = `focused-${id}.stdout.raw`;
const error = `focused-${id}.stderr.raw`;
fs.writeFileSync(path.join(root, 'evidence', output), stdout, { flag: 'wx' });
fs.writeFileSync(path.join(root, 'evidence', error), stderr, { flag: 'wx' });
fs.writeFileSync(path.join(root, 'evidence', `focused-${id}.raw.json`), `${JSON.stringify({
  cardId: 'A-S150', workerId: 'worker-A-S150', captureExplicitlyEnabled: true,
  stage, recordedAtUtc: new Date().toISOString(), command: [process.execPath, ...args],
  runtime: process.version, exitCode: result.status, signal: result.signal,
  failure: result.error ? { message: result.error.message, code: result.error.code } : null,
  stdoutFile: output, stderrFile: error, stdoutSha256: sha(stdout), stderrSha256: sha(stderr),
  testedSourceHashes: sources, extraKanoCredit: 0,
}, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
process.exitCode = result.status === 0 ? 0 : 1;
