'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const [stage, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,63}$/.test(stage || '') || args.length === 0) {
  throw new Error('Explicit capture requires a safe stage name followed by Node arguments.');
}
const receiptPath = path.join(lesson, 'evidence', `${stage}.json`);
if (fs.existsSync(receiptPath)) throw new Error('Evidence is append-only; choose a new stage name.');
fs.mkdirSync(path.join(lesson, 'evidence', 'raw'), { recursive: true });
function byteInventory(directory = lesson) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) return byteInventory(absolute);
      if (!entry.isFile()) throw new Error('Unexpected non-file in owned verification inventory.');
      const bytes = fs.readFileSync(absolute);
      return [{ path: path.relative(lesson, absolute),
        sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
    });
}
const frozenInput = process.env.CAPTURE_BROWSER_EVIDENCE !== '1'
  && fs.existsSync(path.join(lesson, 'evidence', 'content-index.json'))
  ? byteInventory() : null;
const startedAtUtc = new Date().toISOString();
const result = spawnSync(process.execPath, args, {
  cwd: lesson, env: process.env, encoding: null, maxBuffer: 4 * 1024 * 1024,
});
if (result.error || result.signal || !Number.isInteger(result.status)) {
  throw result.error || new Error(`Unqualified capture process: ${result.signal}`);
}
const frozenOutput = frozenInput ? byteInventory() : null;
const unchanged = frozenInput ? JSON.stringify(frozenInput) === JSON.stringify(frozenOutput) : null;
const inputIndexSHA256 = frozenInput ? crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(lesson, 'evidence', 'content-index.json'), 'utf8')
    .replace(/\r\n/g, '\n')).digest('hex') : null;
function save(stream, bytes) {
  const relative = path.join('evidence', 'raw', `${stage}.${stream}.raw`);
  fs.writeFileSync(path.join(lesson, relative), bytes);
  return { path: relative, bytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
const receipt = {
  schemaVersion: 1, cardId: 'A-S101', workerId: 'worker-A-S101', packet: 'SC-S101',
  mode: 'local-synthetic', stage, command: [process.execPath, ...args],
  nodeVersion: process.version, startedAtUtc, endedAtUtc: new Date().toISOString(),
  exitCode: unchanged === false ? 1 : result.status,
  browserEvidenceCaptureEnabled: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  verificationReadOnly: frozenInput ? {
    filesObserved: frozenInput.length, unchanged, inputIndexSHA256,
    inputIndexHashPolicy: 'canonical-text-lf',
    beforeRawByteInventorySHA256: crypto.createHash('sha256')
      .update(JSON.stringify(frozenInput)).digest('hex'),
    afterRawByteInventorySHA256: crypto.createHash('sha256')
      .update(JSON.stringify(frozenOutput)).digest('hex'),
  } : null,
  stdout: save('stdout', result.stdout),
  stderr: save('stderr', result.stderr),
};
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
process.stdout.write(`${stage}: exit ${receipt.exitCode}; raw streams preserved; read-only ${unchanged}.\n`);
process.exitCode = receipt.exitCode;
