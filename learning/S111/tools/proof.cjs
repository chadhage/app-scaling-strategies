'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const captureEnabled = value => value === '1';

function ownedSnapshot(directory = root) {
  const result = {};
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) result[path.relative(directory, file)] = sha256(fs.readFileSync(file));
      else throw new Error(`Non-file entry is not an owned evidence input: ${file}`);
    }
  }
  walk(directory);
  return result;
}

function writeBrowserEvidence(observation) {
  if (!captureEnabled(process.env.CAPTURE_BROWSER_EVIDENCE)) return false;
  if (observation.passed !== true || observation.checks.some(check => check.passed !== true)) {
    throw new Error('Successful actual browser observations are required for this proof.');
  }
  const mutableProofPointers = [path.join('evidence', 'browser.json'), path.join('evidence', 'verification.json')];
  const protectedFileSha256 = { ...observation.protectedFileSha256 };
  for (const pointer of mutableProofPointers) delete protectedFileSha256[pointer];
  const record = { ...observation, protectedFileSha256, mutableProofPointers,
    capturedAtUtc: new Date().toISOString(), captureAuthorization: 'exact CAPTURE_BROWSER_EVIDENCE=1' };
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const basename = `browser-${randomUUID()}.json`;
  const raw = path.join(root, 'evidence', 'raw', basename);
  fs.writeFileSync(raw, bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(root, 'evidence', 'browser.json'), `${JSON.stringify({
    ...record, rawObservation: path.join('raw', basename), rawObservationSha256: sha256(bytes),
  }, null, 2)}\n`, 'utf8');
  return true;
}

module.exports = { sha256, captureEnabled, ownedSnapshot, writeBrowserEvidence };
