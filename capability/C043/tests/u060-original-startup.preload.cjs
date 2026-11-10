'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const original = Module._load;
const target = path.join(__dirname, 'u060-mutation-runner.cjs');
Module._load = function retainedStartup(request, parent, isMain) {
  if (Module._resolveFilename(request, parent) === target) {
    const source = fs.readFileSync(path.join(__dirname, '..', 'evidence', 'u060', 'startup-original', 'u060-mutation-runner.cjs.txt'), 'utf8');
    const retained = { exports: {} };
    vm.compileFunction(source, ['require', 'module', '__dirname'], { filename: 'capability\\C043\\tests\\u060-mutation-runner.cjs' })(
      Module.createRequire(target), retained, __dirname);
    return retained.exports;
  }
  return original.call(this, request, parent, isMain);
};
