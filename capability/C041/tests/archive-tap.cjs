'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const base = path.resolve(__dirname, '..');
const manifestPath = path.join(base, 'evidence', 'raw-tap-archives.json');
const previous = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : null;
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const rows = [];
let changed = false;

for (const name of ['red.txt', 'red-replay.txt', 'origin-red.txt']) {
  const display = `evidence\\${name}`;
  const archive = `${display}.gz`;
  const bytes = fs.readFileSync(path.join(base, ...display.split('\\')));
  const existing = previous?.files.find(file => file.display === display);
  if (existing && existing.normalizedSha256 === sha(bytes)) {
    const raw = zlib.gunzipSync(fs.readFileSync(path.join(base, ...archive.split('\\'))));
    if (sha(raw) !== existing.rawSha256) throw new Error('Archived original TAP bytes changed.');
    rows.push(existing);
    continue;
  }
  const compressed = zlib.gzipSync(bytes);
  const normalized = Buffer.from(bytes.toString('utf8').split(/\r?\n/).map(line => line.replace(/[ \t]+$/u, '')).join('\n'));
  fs.writeFileSync(path.join(base, ...archive.split('\\')), compressed);
  fs.writeFileSync(path.join(base, ...display.split('\\')), normalized);
  rows.push({
    display, archive, rawSha256: sha(bytes), archiveSha256: sha(compressed),
    normalizedSha256: sha(normalized), rawBytes: bytes.length, archivedAtUtc: new Date().toISOString()
  });
  changed = true;
}

if (changed) {
  fs.writeFileSync(manifestPath, JSON.stringify({
    schemaVersion: 1,
    reason: 'Publisher diff --check rejects TAP end-of-line whitespace. Preserve original bytes as gzip; only readable display copies are normalized.',
    normalization: 'UTF-8 display: remove end-of-line spaces/tabs and normalize CRLF to LF. No assertion, value, test outcome, or raw archive is rewritten.',
    files: rows
  }, null, 2) + '\n');
}
console.log(`Preserved ${rows.length} original raw TAP archives; display-only whitespace normalization.`);
