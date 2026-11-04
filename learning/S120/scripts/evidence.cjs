'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { gzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const shouldCapture = (value) => value === '1';

function sources() {
  const result = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'evidence') continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.isFile()) {
        const bytes = fs.readFileSync(target);
        result.push({ path: path.relative(root, target), bytes: bytes.length, sha256: sha256(bytes), base64: bytes.toString('base64') });
      }
    }
  }
  walk(root);
  return result;
}

function capture(report, value = process.env.CAPTURE_BROWSER_EVIDENCE) {
  if (!shouldCapture(value)) return null;
  const recorded = sources();
  const archive = gzipSync(Buffer.from(JSON.stringify({ format: 'S120-raw-source-v1', sources: recorded })));
  const stem = `browser-${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  const directory = path.join(root, 'evidence');
  fs.mkdirSync(directory, { recursive: true });
  const archiveName = `${stem}.sources.raw.gz`;
  const recordName = `${stem}.json`;
  const record = {
    ...report,
    rawSourceArchive: { file: archiveName, bytes: archive.length, sha256: sha256(archive) },
    rawSources: recorded.map(({ base64, ...entry }) => entry),
    bytePolicy: 'Raw working-tree bytes, including CRLF if present. Canonical Git bytes are checked separately; no normalization of historical proof.'
  };
  fs.writeFileSync(path.join(directory, archiveName), archive, { flag: 'wx' });
  fs.writeFileSync(path.join(directory, recordName), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return { record: recordName, archive: archiveName };
}

module.exports = { sha256, shouldCapture, sources, capture };
