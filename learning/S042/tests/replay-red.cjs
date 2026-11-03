'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const red = path.join(__dirname, '..', 'evidence', 'red');
const modelModule = { exports: {} };
vm.compileFunction(fs.readFileSync(path.join(red, 'model.source.snapshot'), 'utf8'), ['module'], {
  filename: 'S042-preserved-loadable-stub.snapshot',
})(modelModule);
const allowed = new Map([
  ['node:test', require('node:test')],
  ['node:assert/strict', require('node:assert/strict')],
  ['../long-work.js', modelModule.exports],
]);
vm.compileFunction(fs.readFileSync(path.join(red, 'assertion.source.snapshot'), 'utf8'), ['require'], {
  filename: 'S042-preserved-behavioral-assertions.snapshot',
})((name) => {
  if (!allowed.has(name)) throw new Error('Unexpected RED snapshot dependency.');
  return allowed.get(name);
});
