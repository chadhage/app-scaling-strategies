'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name))
    : [path.relative(root, path.join(directory, entry.name))]).sort();
const write = (file, value) => fs.writeFileSync(path.join(root, file),
  `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const mode = process.argv[2];

if (mode === 'syntax') {
  const startedAtUtc = new Date().toISOString();
  const checks = files().filter((file) => /\.(?:js|cjs)$/.test(file)).map((file) => {
    const data = fs.readFileSync(path.join(root, file));
    const run = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: null });
    const stdout = run.stdout || Buffer.alloc(0);
    const stderr = run.stderr || Buffer.alloc(0);
    return {
      file, command: `node --check ${file}`, exitCode: run.status, signal: run.signal,
      spawnError: run.error?.message || null, sourceCanonicalSha256: sha(canonical(data)),
      stdoutBase64: stdout.toString('base64'), stderrBase64: stderr.toString('base64'),
      rawStdoutSha256: sha(stdout), rawStderrSha256: sha(stderr),
    };
  });
  const outcome = checks.every((check) => check.exitCode === 0 && !check.spawnError) ? 'PASS' : 'FAIL';
  write('evidence\\syntax.json', {
    cardId: 'A-S071', runtime: process.version, startedAtUtc,
    completedAtUtc: new Date().toISOString(), outcome, checks,
  });
  if (outcome !== 'PASS') throw new Error('Syntax capture failed; preserve it without overwriting.');
  console.log(`Syntax PASS: ${checks.length} owned JavaScript files.`);
} else if (mode === 'index') {
  const entries = files().filter((file) => file !== 'evidence\\content-index.json').map((file) => {
    const raw = fs.readFileSync(path.join(root, file));
    const hashMode = /\.(?:snapshot|raw)$/.test(file) ? 'raw' : 'canonical-LF';
    const data = hashMode === 'raw' ? raw : canonical(raw);
    return {
      file, hashMode, bytes: data.length, sha256: sha(data),
      expectedGitBlobSha1: crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'),
    };
  });
  write('evidence\\content-index.json', {
    schemaVersion: 1, cardId: 'A-S071', capturedAtUtc: new Date().toISOString(), algorithm: 'SHA256',
    sourceNormalization: 'CRLF -> LF only; raw evidence bytes are never normalized',
    excludedSelf: 'evidence\\content-index.json',
    gitQualification: 'Read-only tests check clean-filter identities before publication and actual owned HEAD blobs after publication.',
    files: entries,
  });
  console.log(`Sealed ${entries.length} files with raw evidence preserved byte-for-byte.`);
} else {
  throw new Error('Deliberate capture only: use syntax or index. Existing proof is never overwritten.');
}
