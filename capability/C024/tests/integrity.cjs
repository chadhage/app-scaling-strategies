'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const inventoryPath = path.join(root, 'evidence', 'integrity.json');
function inventory() {
  const entries = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (file === inventoryPath) continue;
      if (entry.isDirectory()) walk(file);
      else {
        const bytes = fs.readFileSync(file);
        entries.push({
          path: path.relative(root, file), bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex')
        });
      }
    }
  }
  walk(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path, 'en'));
}
function verify() {
  const expected = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  assert.equal(expected.cardId, 'C024');
  assert.equal(expected.algorithm, 'SHA-256');
  assert.equal(expected.onlyOmittedFile, 'evidence\\integrity.json');
  const observed = inventory();
  assert.deepEqual(observed, expected.files, 'Exact owned file set, byte lengths and SHA-256 must match.');
  return observed.length;
}
if (require.main === module) {
  if (process.argv.length === 3 && process.argv[2] === '--capture') {
    fs.writeFileSync(inventoryPath, `${JSON.stringify({
      cardId: 'C024', capturedAtUtc: new Date().toISOString(), algorithm: 'SHA-256',
      onlyOmittedFile: 'evidence\\integrity.json', files: inventory()
    }, null, 2)}\n`);
    console.log(`Explicit C024 integrity capture: ${verify()} files.`);
  } else {
    assert.equal(process.argv.length, 2, 'Use no arguments for read-only verification, or explicit --capture.');
    console.log(`Read-only C024 integrity verified: ${verify()} files.`);
  }
}
module.exports = Object.freeze({ verify });
