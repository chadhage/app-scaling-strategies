'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const capture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'red.json'), 'utf8'));
const stubPath = path.join(__dirname, 'model.stub.snapshot');
const testPath = path.join(__dirname, 'contract.source.snapshot');
const stub = fs.readFileSync(stubPath);
const original = fs.readFileSync(testPath);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(hash(stub), capture.inputs.find((entry) => entry.path === 'model.js').sha256);
assert.equal(hash(original), capture.inputs.find((entry) => entry.path === 'tests\\model.test.cjs').sha256);
const stubModule = { exports: {} };
vm.runInNewContext(stub.toString('utf8'), { module: stubModule }, { filename: stubPath });
vm.runInNewContext(original.toString('utf8'), {
  require: (name) => name === '..\\model.js' ? stubModule.exports : require(name),
}, { filename: testPath });
