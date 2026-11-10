'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { scan } = require('./identifier-scan.cjs');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function inventory(root) {
  const entries = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      const relative = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (relative !== 'tests/scratch') walk(full);
      } else {
        const bytes = fs.readFileSync(full);
        entries.push([relative, bytes]);
      }
    }
  }
  walk(root);
  return entries.sort(([a], [b]) => a.localeCompare(b));
}

function inspect(entries, accepted = new Map()) {
  const findings = scan(entries);
  const bytes = new Map(entries);
  const historical = [];
  const unexpected = [];
  for (const file of findings) {
    if (accepted.get(file) === sha(bytes.get(file) ?? Buffer.alloc(0))) historical.push({ file, sha256: accepted.get(file) });
    else unexpected.push(file);
  }
  return { scanned: entries.length, gzip: entries.filter(([file]) => file.endsWith('.gz')).length, findings, historical, unexpected };
}

module.exports = Object.freeze({ inspect, inventory, sha });
