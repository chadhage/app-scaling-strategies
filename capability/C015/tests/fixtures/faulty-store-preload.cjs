'use strict';

// Preload for k-c015-cli.test.cjs: the command line receives a store collaborator that fails with a plain Error.
const path = require('node:path');
const Module = require('node:module');

const target = path.resolve(__dirname, '..', '..', 'store.cjs');
const store = new Module(target);
store.filename = target;
store.loaded = true;
store.exports = Object.freeze({
  persist: async () => { throw new Error('unexpected store failure'); },
  restore: async () => { throw new Error('unexpected store failure'); }
});
require.cache[target] = store;
