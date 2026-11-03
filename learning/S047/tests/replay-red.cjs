'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const directory = path.resolve(__dirname, '..', 'evidence', 'red');
function load(name, dependencies) {
  const filename = path.join(directory, name);
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  const requireSnapshot = (id) => {
    if (!Object.prototype.hasOwnProperty.call(dependencies, id)) throw new Error(`Unexpected snapshot dependency: ${id}`);
    return dependencies[id];
  };
  new vm.Script(`(function(exports, require, module) {\n${source}\n})`, { filename })
    .runInThisContext()(module.exports, requireSnapshot, module);
  return module.exports;
}

const stub = load('stream.source.snapshot', {});
load('assertion.source.snapshot', {
  'node:test': require('node:test'),
  'node:assert/strict': require('node:assert/strict'),
  '../stream.js': stub,
});
