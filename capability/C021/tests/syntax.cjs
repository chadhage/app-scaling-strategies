'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(file) : /\.(?:c?js)$/.test(entry.name) ? [file] : [];
  });
}
const files = scripts(root);
for (const file of files) new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const references = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
assert.deepEqual(references, ['../C020/contract.js', '../C020/inspector.js', 'compatibility.js', 'page.js']);
for (const reference of references) assert.equal(fs.statSync(path.resolve(root, reference)).isFile(), true);
assert.equal((html.match(/<script\b/g) || []).length, references.length, 'all scripts must be external and explicit');
assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
assert.doesNotMatch(html, /<style\b|\sstyle\s*=/i);
assert.match(html, /connect-src 'none'/);
assert.match(html, /script-src 'self'/);
assert.match(html, /form-action 'none'/);
console.log(`C021 syntax: ${files.length} actual scripts compiled; 4 existing external references; no inline handlers/styles.`);
