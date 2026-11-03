'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
assert.equal(
  fs.readFileSync(path.join(root, 'ledger.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'evidence', 'red', 'ledger.stub.cjs'), 'utf8')
);
const stub = require('../evidence/red/ledger.stub.cjs');
for (const name of ['create', 'apply', 'inspect', 'restore']) assert.equal(typeof stub[name], 'function');
assert.equal(stub.create().schema, 'NOT_IMPLEMENTED');
console.log('Loadable stub and byte-identical retained copy verified; no behavioral implementation.');
