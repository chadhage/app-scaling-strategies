'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const snapshot = path.join(root, 'evidence', 'red', 'upload.stub.cjs');
const retainedModule = { exports: {} };
// Preserve the original ../C020 import base without modifying either retained source.
const context = vm.createContext({
  module: retainedModule, require: createRequire(path.join(root, 'upload.js')), Uint8Array
});
new vm.Script(fs.readFileSync(snapshot, 'utf8'), { filename: snapshot }).runInContext(context);
module.exports = retainedModule.exports;
