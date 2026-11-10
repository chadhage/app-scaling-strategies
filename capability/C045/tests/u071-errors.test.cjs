'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const { pathToFileURL } = require('node:url');
const { test } = require('node:test');
const integrity = require('../source-integrity.cjs');
const root = path.resolve(__dirname, '..', '..', '..');
const dependency = 'capability\\C041\\serve.cjs';
function withMethod(name, replacement, body) {
  const old = fs[name]; fs[name] = replacement(old);
  try { return body(); } finally { fs[name] = old; }
}
test('changed original pin records and changed exact authority are refused by name', () => {
  for (const relative of ['capability\\C045\\evidence\\dependency-pins.json',
    'capability\\C045\\evidence\\u071\\producer-authority.json']) {
    const target = path.join(root, relative);
    withMethod('readFileSync', old => (file, ...options) => {
      const bytes = old.call(fs, file, ...options);
      if (String(file) !== target) return bytes;
      return Buffer.concat([bytes, Buffer.from(' ')]);
    }, () => assert.throws(() => integrity.readDependency(dependency), error => {
      assert.ok(error.message.includes(relative), error.message);
      return true;
    }));
  }
});
test('redirected and non-regular dependency paths are refused', () => {
  const target = path.join(root, dependency);
  withMethod('realpathSync', old => file => String(file) === target ? `${target}.redirect` : old.call(fs, file),
    () => assert.throws(() => integrity.readDependency(dependency), /exact reviewed regular files/));
  withMethod('statSync', old => file => String(file) === target ? { isFile: () => false } : old.call(fs, file),
    () => assert.throws(() => integrity.readDependency(dependency), /exact reviewed regular files/));
});
test('actual complete source also preserves the non-Windows path-comparison branch under a supplied platform fixture', () => {
  const file = path.resolve(__dirname, '..', 'source-integrity.cjs');
  const module = { exports: {} };
  const context = vm.createContext({ Buffer, process: { platform: 'linux' } });
  const factory = vm.compileFunction(fs.readFileSync(file, 'utf8'), ['exports', 'require', 'module', '__filename', '__dirname'],
    { filename: pathToFileURL(file).href, parsingContext: context });
  factory(module.exports, Module.createRequire(file), module, file, path.dirname(file));
  assert.equal(module.exports.verifyDependencies().length, 11);
});
