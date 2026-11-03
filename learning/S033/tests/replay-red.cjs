'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const snapshotRoot = path.join(__dirname, '..', 'evidence', 'red');
const archivedStub = require(path.join(snapshotRoot, 'affinity.stub.js.txt'));
const testSource = fs.readFileSync(path.join(snapshotRoot, 'assertion.cjs.txt'), 'utf8');

vm.runInNewContext(testSource, {
  require(id) {
    return id === '../affinity.js' ? archivedStub : require(id);
  },
}, { filename: path.join(snapshotRoot, 'assertion.cjs.txt') });
