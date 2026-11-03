'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

if (process.argv[2] !== '--capture') throw new Error('An explicit --capture is required to seal evidence.');
const owned = __dirname;
const summary = JSON.parse(fs.readFileSync(path.join(owned, 'evidence.json'), 'utf8'));
const relativeDestination = summary.contentSeal;
if (!/^evidence\/content-hashes(?:-\d{3})?\.json$/.test(relativeDestination)) throw new Error('Declare an explicit owned content-seal filename.');
const destination = path.join(owned, ...relativeDestination.split('/'));
if (fs.existsSync(destination)) throw new Error('Do not overwrite a historical seal.');
const files = {};
function visit(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (relative === relativeDestination
        || /^evidence\/integrity(?:-\d{3})?\.(?:raw\.json|stdout\.txt|stderr\.txt)$/.test(relative)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file, relative);
    else {
      const bytes = fs.readFileSync(file);
      files[relative] = { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    }
  }
}
visit(owned);
const record = {
  schemaVersion: 1, cardId: 'A-S047', capturedAtUtc: new Date().toISOString(),
  command: { executable: process.execPath, arguments: [__filename, '--capture'] },
  exclusions: ['This seal cannot hash itself; earlier seals are retained and included as historical files.', 'Integrity capture stdout/stderr/raw records are created after verification and independently hash-checked.'],
  files,
};
fs.writeFileSync(destination, JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(`Sealed ${Object.keys(files).length} owned files; historical evidence not overwritten.`);
