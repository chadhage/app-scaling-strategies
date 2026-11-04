'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
function digest() {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else files.push([path.relative(root, file), crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
    }
  }
  visit(root);
  return crypto.createHash('sha256').update(JSON.stringify(files.sort(([a], [b]) => a.localeCompare(b)))).digest('hex');
}
module.exports = Object.freeze({ root, digest });
