'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
if (process.argv.length !== 3 || process.argv[2] !== '--capture') {
  throw new Error('Deliberate producer action only: seal.cjs --capture. Normal verification never reseals.');
}
const root = path.resolve(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function walk(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const name = path.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Unsupported owned link: ${name}`);
    return entry.isDirectory() ? walk(path.join(directory, entry.name), name) : [name];
  });
}
const evidence = path.join(root, 'evidence');
for (const name of ['syntax.json', 'content-index.json']) {
  if (fs.existsSync(path.join(evidence, name))) throw new Error(`Refusing to overwrite retained ${name}`);
}
const files = walk(root);
const checks = files.filter((file) => /\.(?:js|cjs)$/.test(file)).map((file) => {
  const result = cp.spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: null, timeout: 15000 });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  return {
    file, command: [process.execPath, '--check', path.join(root, file)], exitCode: result.status,
    spawnError: result.error?.message || null,
    stdout: { bytes: stdout.length, sha256: sha(stdout), base64: stdout.toString('base64') },
    stderr: { bytes: stderr.length, sha256: sha(stderr), base64: stderr.toString('base64') },
  };
});
const syntax = {
  schemaVersion: 1, cardId: 'A-S082', node: process.version, capturedAtUtc: new Date().toISOString(),
  outcome: checks.every((check) => check.exitCode === 0 && !check.spawnError) ? 'PASS' : 'FAIL', checks,
};
fs.writeFileSync(path.join(evidence, 'syntax.json'), JSON.stringify(syntax, null, 2) + '\n', { flag: 'wx' });
if (syntax.outcome !== 'PASS') throw new Error('Syntax checks failed; raw base64 diagnostics retained, no content seal created');
const entries = walk(root).map((file) => {
  const bytes = fs.readFileSync(path.join(root, file));
  const raw = /\.(?:snapshot|raw|png)$/.test(file);
  const qualified = raw ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  return { path: file, mode: raw ? 'raw' : 'canonical-lf', bytes: qualified.length, sha256: sha(qualified) };
});
const index = {
  schemaVersion: 1, cardId: 'A-S082', createdAtUtc: new Date().toISOString(), algorithm: 'SHA256',
  scope: 'learning\\S082\\**', excluded: ['evidence\\content-index.json'],
  normalization: 'Text is UTF-8 canonical LF; .snapshot, .raw and .png retain exact raw bytes. Only this self-index is excluded.',
  gitQualification: 'Read-only integrity tests compare this index and every entry with actual owned HEAD blobs after publication.',
  normalVerification: 'Read-only. Only this explicit --capture producer command creates the seal.',
  entries,
};
fs.writeFileSync(path.join(evidence, 'content-index.json'), JSON.stringify(index, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ cardId: 'A-S082', syntaxChecks: checks.length, syntax: syntax.outcome, indexedFiles: entries.length }, null, 2));
