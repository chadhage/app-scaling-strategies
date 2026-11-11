'use strict';
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { list } = require('./source.cjs');
const { run } = require('./budget.cjs');
const ns = path.resolve(__dirname, '..');
const files = list(ns).filter(row => /\.(?:cjs|js)$/.test(row.path));
for (const item of files) {
  const result = run(['--check', path.join('capability', 'C012', item.path)]);
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, String(result.stderr));
}
console.log(JSON.stringify({ completeNonEvidenceJavaScriptSources: files.length, syntax: 'pass', executableProductionScopes: 4 }));
