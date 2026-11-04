'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

function capture(label, args) {
  if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Explicit CAPTURE_BROWSER_EVIDENCE=1 required.');
  if (!['red', 'focused', 'browser', 'syntax'].includes(label)) throw new Error('Unknown capture label.');
  const directory = path.resolve(__dirname, '..', 'evidence');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  const name = `${label}-${randomUUID()}`;
  const sourceSnapshots = [];
  if (label === 'red') {
    for (const relative of ['store.cjs', 'tests\\restart.test.cjs']) {
      const bytes = fs.readFileSync(path.resolve(__dirname, '..', relative));
      const file = `${name}-${path.basename(relative)}.snapshot`;
      fs.writeFileSync(path.join(directory, file), bytes, { flag: 'wx' });
      sourceSnapshots.push({ source: relative, file, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  const result = spawnSync(process.execPath, args, {
    cwd: path.resolve(__dirname, '..', '..', '..'), timeout: 600000,
    env: { ...process.env }, maxBuffer: 8 * 1024 * 1024,
  });
  const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const stdout = result.stdout || Buffer.alloc(0);
  const stderr = result.stderr || Buffer.alloc(0);
  fs.writeFileSync(path.join(directory, `${name}.stdout.raw`), stdout, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, `${name}.stderr.raw`), stderr, { flag: 'wx' });
  const report = {
    schemaVersion: 1, cardId: 'C015', label, command: [process.execPath, ...args],
    capturedAtUtc: new Date().toISOString(), exitCode: result.status,
    signal: result.signal, error: result.error ? String(result.error) : null,
    stdout: { file: `${name}.stdout.raw`, sha256: sha(stdout), bytes: stdout.length },
    stderr: { file: `${name}.stderr.raw`, sha256: sha(stderr), bytes: stderr.length },
    nodeVersion: process.version, originalUnitCredits: 0, sourceSnapshots,
  };
  fs.writeFileSync(path.join(directory, `${name}.raw.json`),
    JSON.stringify(report, null, 2).replace(/\n/g, '\r\n') + '\r\n', { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ file: `${name}.raw.json`, exitCode: result.status })}\n`);
  return report;
}

if (require.main === module) {
  const [label, ...args] = process.argv.slice(2);
  const result = capture(label, args);
  process.exitCode = label === 'red' ? (result.exitCode === 1 ? 0 : 1) : (result.exitCode === 0 ? 0 : 1);
}

module.exports = Object.freeze({ capture });
