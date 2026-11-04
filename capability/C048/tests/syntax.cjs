'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const references = [...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)].map((match) => match[1]);
assert.equal(references.length, 6);
assert.equal([...html.matchAll(/<script\b/g)].length, references.length, 'Only exact external scripts are allowed.');
assert.doesNotMatch(html, /\son\w+\s*=|<style\b|\sstyle\s*=/i);
const scripts = new Set([
  ...references.map((name) => path.resolve(root, name)),
  path.join(root, 'publication', 'publish.cjs.txt'),
  ...fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.cjs'))
    .map((name) => path.join(root, 'tests', name))
]);
for (const file of scripts) {
  const text = fs.readFileSync(file, 'utf8');
  new vm.Script(text, { filename: file });
  assert.equal(text.replace(/\r\n/g, '').includes('\r'), false, `No bare carriage returns: ${file}`);
}
console.log(`SYNTAX GREEN: ${scripts.size} current/external scripts compile; ${references.length} exact external references; no inline handlers/styles.`);
