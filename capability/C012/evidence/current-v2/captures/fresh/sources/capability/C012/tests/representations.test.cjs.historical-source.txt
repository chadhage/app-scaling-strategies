'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { representation } = require('./representations.cjs');
const { physical } = require('./source.cjs');
const imports = require('../imports.json');
const root = path.resolve(__dirname, '..', '..', '..');
test('LF and CRLF executable trees preserve the actual accepted LF-only qualification policy bytes and reader contract', () => {
  const parent = process.env.C012_RUNTIME;
  assert.ok(parent && path.isAbsolute(parent), 'exact owned runtime child, never system temp');
  for (const kind of ['lf', 'crlf']) {
    const directory = path.join(parent, 'policy-byte-domain-' + kind);
    fs.mkdirSync(directory, { recursive: false });
    const own = physical(directory);
    try {
      for (const item of imports.entries.filter(item => item.path.startsWith('testing\\browser\\qualify\\'))) {
        const bytes = fs.readFileSync(path.join(root, item.path));
        fs.writeFileSync(path.join(directory, path.basename(item.path)), representation(item.path, bytes, kind), { flag: 'wx' });
      }
      let actual = null, refusal = null;
      try { actual = require(path.join(directory, 'adapters.cjs')).readQualified(); }
      catch (error) { refusal = { code: error.code, message: error.message }; }
      assert.equal(refusal, null, 'a source-EOL copy must not corrupt unchanged LF-only sealed policy data: ' + JSON.stringify(refusal));
      assert.deepEqual(actual.qualifiedMajors, [156, 157]);
      assert.equal(actual.qualifiedMajors.includes(158), false);
      const item = imports.entries.find(item => item.path.endsWith('qualified.addendum.jsonl'));
      assert.deepEqual(fs.readFileSync(path.join(directory, path.basename(item.path))), fs.readFileSync(path.join(root, item.path)), 'sealed JSONL bytes remain exact, not normalized');
    } finally {
      assert.deepEqual(physical(directory), own);
      fs.rmSync(directory, { recursive: true, force: false });
      for (const file of Object.keys(require.cache)) if (file.startsWith(directory + path.sep)) delete require.cache[file];
    }
  }
});
