'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const capture = process.env.CAPTURE_BROWSER_EVIDENCE === '1';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const hashFile = (file) => hash(fs.readFileSync(file));

function sourceHashes() {
  const entries = {};
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'evidence' || entry.name === 'evidence.json') continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) entries[path.relative(root, file)] = hashFile(file);
    }
  }
  visit(root);
  return entries;
}

function writeRecord(label, record) {
  if (!capture) return null;
  fs.mkdirSync(evidence, { recursive: true });
  let number = 1;
  while (fs.existsSync(path.join(evidence, `${label}-${String(number).padStart(3, '0')}.json`))) number += 1;
  const name = `${label}-${String(number).padStart(3, '0')}.json`;
  fs.writeFileSync(path.join(evidence, name), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return name;
}

function command(label, args, expectedExit = 0) {
  const inputs = sourceHashes();
  const startedAtUtc = new Date().toISOString();
  const result = spawnSync(process.execPath, args, {
    cwd: repo, env: process.env, encoding: null, timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  const record = {
    schemaVersion: 1, cardId: 'A-S028', workerId: 'worker-A-S028', kano: 'S', packet: 'SC-S028',
    mode: 'local-synthetic-only', label, startedAtUtc, completedAtUtc: new Date().toISOString(),
    command: [process.execPath, ...args], cwd: repo, node: process.version,
    expectedExit, actualExit: result.status, signal: result.signal, error: result.error?.message || null,
    sourceHashes: inputs, stdoutSha256: hash(stdout), stderrSha256: hash(stderr),
    expectedExitObserved: result.status === expectedExit && !result.error,
    assertionFailure: /ERR_ASSERTION/.test(stdout.toString() + stderr.toString()),
  };
  const name = writeRecord(label, record);
  if (name) {
    const stem = name.slice(0, -5);
    fs.writeFileSync(path.join(evidence, `${stem}.stdout.txt`), stdout, { flag: 'wx' });
    fs.writeFileSync(path.join(evidence, `${stem}.stderr.txt`), stderr, { flag: 'wx' });
    console.log(`Captured ${name}`);
  }
  if (!record.expectedExitObserved || (label === 'red' && !record.assertionFailure)) {
    throw new Error(`${label}: expected exit ${expectedExit}, observed ${result.status}; assertion=${record.assertionFailure}`);
  }
  return record;
}

module.exports = { root, repo, evidence, capture, hash, hashFile, sourceHashes, writeRecord, command };
