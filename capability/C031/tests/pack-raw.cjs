'use strict';

// Stores each raw capture (*.raw.txt) of one run directory as byte-exact gzip (*.raw.gz) and records the SHA-256 of the
// decompressed bytes. Captured output keeps its authentic trailing whitespace; gzip keeps it byte-exact and out of whitespace checks.
// Never overwrites (flag wx). The plain files are removed only after the round trip matched.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const directory = path.resolve(process.argv[2] || '');
if (!directory.startsWith(path.resolve(__dirname, '..', 'evidence') + path.sep)) throw new Error('usage: node pack-raw.cjs <run directory under evidence>');
const sums = {};
for (const name of fs.readdirSync(directory).filter((file) => file.endsWith('.raw.txt')).sort()) {
  const bytes = fs.readFileSync(path.join(directory, name));
  const packed = zlib.gzipSync(bytes, { level: 9 });
  if (Buffer.compare(zlib.gunzipSync(packed), bytes) !== 0) throw new Error(`round trip mismatch: ${name}`);
  const target = name.replace(/\.txt$/, '.gz');
  fs.writeFileSync(path.join(directory, target), packed, { flag: 'wx' });
  sums[target] = createHash('sha256').update(bytes).digest('hex');
  fs.rmSync(path.join(directory, name));
}
fs.writeFileSync(path.join(directory, 'raw-sha256.json'), `${JSON.stringify(sums, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify(sums));
