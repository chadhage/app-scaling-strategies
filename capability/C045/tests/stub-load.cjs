'use strict';
const assert = require('node:assert/strict');
const { openClients } = require('../evidence/red/clients.stub.cjs');
assert.equal(typeof openClients, 'function');
console.log('LOADABLE STUB: openClients exported; no listeners or browsers launched by import.');
