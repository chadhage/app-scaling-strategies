'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const owned = path.resolve(__dirname, '..');
const repo = path.resolve(owned, '..', '..');
const subjects = Object.freeze({
  'stub-load': ['capability\\C045\\tests\\stub-load.cjs'],
  red: ['--test', '--test-reporter=tap', 'capability\\C045\\evidence\\red\\browser.initial.snapshot.cjs'],
  'red-replay': ['--test', '--test-reporter=tap', 'capability\\C045\\evidence\\red\\browser.initial.snapshot.cjs'],
  green: ['--test', '--test-reporter=tap', 'capability\\C045\\tests\\server.test.cjs', 'capability\\C045\\tests\\guards.test.cjs'],
  syntax: ['capability\\C045\\tests\\syntax.cjs'],
  browser: ['capability\\C045\\tests\\browser.cjs'],
  'readonly-browser': ['capability\\C045\\tests\\browser.cjs'],
  cli: ['capability\\C045\\clients.cjs'],
  integrity: ['--test', '--test-reporter=tap', 'capability\\C045\\tests\\integrity.test.cjs']
});
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

function sourceHashes() {
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory() && entry.name !== 'captures') walk(target);
      else if (entry.isFile() && /\.(cjs|js|ps1|html|css|feature)$/.test(entry.name)) {
        const bytes = fs.readFileSync(target);
        const canonical = spawnSync('git', ['hash-object', '--path', path.relative(repo, target), '--stdin'], { cwd: repo, input: bytes });
        result.push({ path: path.relative(repo, target), rawCheckoutSha256: sha256(bytes), bytes: bytes.length,
          gitCanonicalBlob: canonical.status === 0 ? canonical.stdout.toString().trim() : null });
      }
    }
  }
  walk(owned);
  for (const relative of ['capability\\C001\\approved-contract.js', 'capability\\C001\\contract-guard.js',
    'capability\\C020\\contract.js', 'capability\\C020\\profiles.cjs', 'capability\\C020\\inspector.js',
    'capability\\C041\\accepted-catalog.js', 'capability\\C041\\host-policy.js', 'capability\\C041\\lesson-host.js',
    'capability\\C041\\serve.cjs', 'testing\\browser\\isolated.cjs']) {
    const bytes = fs.readFileSync(path.join(repo, relative));
    const canonical = spawnSync('git', ['hash-object', '--path', relative, '--stdin'], { cwd: repo, input: bytes });
    result.push({ path: relative, use: 'read-only reused or boundary source', rawCheckoutSha256: sha256(bytes),
      bytes: bytes.length, gitCanonicalBlob: canonical.status === 0 ? canonical.stdout.toString().trim() : null });
  }
  return result;
}

function saveStream(directory, name, bytes) {
  const gzip = zlib.gzipSync(bytes);
  const readable = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, ''));
  fs.writeFileSync(path.join(directory, `${name}.raw.gz`), gzip, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, `${name}.txt`), readable, { flag: 'wx' });
  return { rawBytes: bytes.length, rawSha256: sha256(bytes), gzipSha256: sha256(gzip),
    readableSha256: sha256(readable), readableBytes: readable.length,
    readableNormalization: 'CRLF to LF and end-of-line horizontal whitespace only; original bytes remain in gzip' };
}

function evidenceInventory(excluded) {
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const target = path.join(directory, entry.name);
      if (target === excluded) continue;
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) {
        const stat = fs.statSync(target);
        result.push({ path: path.relative(owned, target), sha256: sha256(fs.readFileSync(target)), bytes: stat.size, modifiedMs: stat.mtimeMs });
      }
    }
  }
  walk(path.join(owned, 'evidence'));
  return result;
}

function main() {
  const stage = process.argv[2];
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1' || process.argv.length !== 3 || !Object.hasOwn(subjects, stage)) {
    console.error('Deliberate capture requires exact CAPTURE_BROWSER_EVIDENCE=1 and one fixed stage: stub-load, red, red-replay, green, syntax, browser, readonly-browser, cli or integrity.');
    process.exitCode = 1;
    return;
  }
  const slot = `${stage}-${new Date().toISOString().replace(/[-:.]/g, '')}-${crypto.randomUUID()}`;
  const directory = path.join(owned, 'evidence', 'captures', slot);
  fs.mkdirSync(directory, { recursive: true });
  const startedAtUtc = new Date().toISOString();
  const sources = sourceHashes();
  const environment = { ...process.env, C045_CAPTURE_SLOT: slot };
  let before;
  if (stage === 'readonly-browser') {
    delete environment.CAPTURE_BROWSER_EVIDENCE;
    delete environment.C045_CAPTURE_SLOT;
    before = evidenceInventory(directory);
  }
  console.log(JSON.stringify({ event: 'C045-capture-started', stage, slot }));
  const run = spawnSync(process.execPath, subjects[stage], {
    cwd: repo, timeout: 300000, maxBuffer: 8 * 1024 * 1024,
    env: environment
  });
  const stdout = run.stdout || Buffer.alloc(0);
  const stderr = run.stderr || Buffer.alloc(0);
  const record = { cardId: 'C045', kano: 'S', stage, slot, startedAtUtc, finishedAtUtc: new Date().toISOString(),
    command: [process.execPath, ...subjects[stage]], cwd: repo, runtime: process.version,
    exitCode: run.status, signal: run.signal, executionError: run.error ? { code: run.error.code, message: run.error.message } : null,
    stdout: saveStream(directory, 'stdout', stdout), stderr: saveStream(directory, 'stderr', stderr), sources };
  if (before) {
    const after = evidenceInventory(directory);
    record.evidenceReadOnly = { filesChecked: before.length, identicalBytesAndModificationTimes: JSON.stringify(before) === JSON.stringify(after),
      beforeSha256: sha256(JSON.stringify(before)), afterSha256: sha256(JSON.stringify(after)),
      boundary: 'Exact owned evidence inventory; the deliberate outer capture slot is excluded. The child browser command has capture variables removed.' };
  }
  fs.writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  console.log(JSON.stringify({ event: 'C045-capture-preserved', slot, exitCode: run.status, record: path.relative(repo, path.join(directory, 'run.json')) }));
  process.exitCode = run.status === null || record.evidenceReadOnly?.identicalBytesAndModificationTimes === false ? 1 : run.status;
}

if (require.main === module) main();
module.exports = Object.freeze({ sourceHashes, sha256 });
