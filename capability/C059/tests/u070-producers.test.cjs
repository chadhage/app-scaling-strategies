'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { verifyPins } = require('./evidence-verify.cjs');
const root = path.resolve(__dirname, '..', '..', '..');
const pins = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'imports.json')));
const normalize = bytes => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const crlf = bytes => Buffer.from(normalize(bytes).toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
const readBlob = (ref, file) => execFileSync('git', ['cat-file', 'blob', `${ref}:${file}`], { windowsHide: true });
const original = new Map(pins.imports.map(row => [row.path, crlf(readBlob(pins.accepted[row.card].commit, row.path))]));
const current = new Map(pins.imports.map(row => [row.path, fs.readFileSync(path.join(root, ...row.path.split('/')))]));
const differs = problems => problems.filter(problem => problem.startsWith('WORKING_COPY_DIFFERS '));
for (const [version, values] of [['original', original], ['reviewed-private', current]]) {
  for (const [form, transform] of [['raw', bytes => bytes], ['LF', normalize], ['CRLF', crlf]]) {
    test(`${version}: ${form} exact producer files pass real Git-blob and working-copy guards`, () => {
      assert.deepEqual(verifyPins(pins, { readBlob, readFile: file => transform(values.get(file)) }), []);
    });
    for (const row of pins.imports.filter(row => row.card === 'C041' && /(?:accepted-catalog\.js|serve\.cjs)$/.test(row.path))) {
      test(`${version}: ${form} ${row.path} changed byte is refused BY NAME`, () => {
        const bytes = Buffer.from(transform(values.get(row.path))); bytes[bytes.length >> 1] ^= 1;
        assert.deepEqual(differs(verifyPins(pins, { readBlob,
          readFile: file => file === row.path ? bytes : transform(values.get(file)) })), [`WORKING_COPY_DIFFERS ${row.path}`]);
      });
    }
  }
}
test('changing both original pins cannot authorize a future producer', () => {
  for (const target of ['capability/C041/accepted-catalog.js', 'capability/C041/serve.cjs']) {
    const changed = structuredClone(pins);
    const entry = changed.imports.find(row => row.path === target);
    entry.rawSha256 = '0'.repeat(64); entry.crlfToLfSha256 = '1'.repeat(64);
    assert.deepEqual(differs(verifyPins(changed, { readBlob, readFile: file => current.get(file) })), [`WORKING_COPY_DIFFERS ${target}`]);
  }
});
