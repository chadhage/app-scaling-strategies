'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let scripts = 0;
let json = 0;
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(?:js|cjs|snapshot)$/.test(entry.name)) {
      new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
      scripts++;
    } else if (entry.name.endsWith('.json')) {
      JSON.parse(fs.readFileSync(file, 'utf8'));
      json++;
    }
  }
}
visit(root);
console.log(`S040 syntax: ${scripts} JavaScript/snapshot files compiled; ${json} JSON files parsed. Read-only verification.`);
