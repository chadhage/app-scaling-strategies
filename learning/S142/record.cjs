'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = __dirname;
const sealPath = path.join('evidence', 'integrity.json');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonicalSha256 = (bytes) => sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')));
const canCapture = (value = process.env.CAPTURE_BROWSER_EVIDENCE) => value === '1';

function lessonFiles() {
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Lesson evidence cannot traverse symlinks.');
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) result.push(path.relative(root, full));
    }
  }
  walk(root);
  return result.sort();
}

function hashTree() {
  return Object.fromEntries(lessonFiles().map((file) => [file, sha256(fs.readFileSync(path.join(root, file)))]));
}

function captureBrowser(evidence, value = process.env.CAPTURE_BROWSER_EVIDENCE) {
  if (!canCapture(process.env.CAPTURE_BROWSER_EVIDENCE) || !canCapture(value)) return null;
  const name = `browser-${crypto.randomUUID()}.json.txt`;
  const file = path.join('evidence', 'raw', name);
  const bytes = Buffer.from(JSON.stringify(evidence, null, 2).replace(/\n/g, '\r\n') + '\r\n', 'utf8');
  fs.writeFileSync(path.join(root, file), bytes, { flag: 'wx' });
  return { path: file, rawSha256: sha256(bytes) };
}

function writeSeal() {
  if (!canCapture()) throw new Error('Sealing is deliberate evidence preparation, not ordinary verification; exact CAPTURE_BROWSER_EVIDENCE=1 is required.');
  const entries = lessonFiles().filter((file) => file !== sealPath).map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    const raw = file.startsWith(path.join('evidence', 'raw') + path.sep);
    return {
      path: file, rawSha256: sha256(bytes),
      canonicalSha256: raw ? sha256(bytes) : canonicalSha256(bytes),
      gitTreatment: raw ? 'raw-no-text-conversion' : 'canonical-LF',
    };
  });
  const evidence = {
    schema: 's142-byte-integrity/1', entries,
    rawPolicy: 'Raw evidence is -text -diff. CRLF bytes are retained independently of canonical Git code.',
    producerWorkingBytes: 'For ordinary code, rawSha256 records producer working bytes only; canonicalSha256 governs portable code verification. Literal raw evidence requires both hashes unchanged.',
    sourceCommit: JSON.parse(fs.readFileSync(path.join(root, 'source.json'))).sourceCommit,
    verificationWrites: false,
  };
  fs.writeFileSync(path.join(root, sealPath), JSON.stringify(evidence, null, 2) + '\n');
  return entries.length;
}

if (require.main === module) {
  if (process.argv[2] !== 'seal') throw new Error('Only the explicit seal action is supported.');
  console.log(`Sealed ${writeSeal()} owned files; no raw history was overwritten.`);
}

module.exports = { root, sealPath, sha256, canonicalSha256, canCapture, lessonFiles, hashTree, captureBrowser };
