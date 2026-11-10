'use strict';

const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const load = Module._load;

function argumentsWithAssertion(args) {
  const values = [...args];
  const index = values.findLastIndex((value) => typeof value === 'function');
  if (index < 0) return values;
  const callback = values[index];
  values[index] = async (context) => {
    const childContext = new Proxy(context, {
      get(target, key) {
        if (key === 'test') return (...nested) => target.test(...argumentsWithAssertion(nested));
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    try { return await callback(childContext); } catch (error) {
      if (error?.code === 'ERR_ASSERTION' || /MODULE_NOT_FOUND|SyntaxError|MUTANT_BASE_DIFFERS|MUTANT_TARGET_NOT_UNIQUE/.test(String(error?.stack))) throw error;
      assert.fail(`U060_BEHAVIOR_REJECTED: a valid test operation unexpectedly rejected: ${String(error?.stack ?? error)}`);
    }
  };
  return values;
}

Module._load = function assertionObserved(request, parent, isMain) {
  const actual = load.call(this, request, parent, isMain);
  if (request !== 'node:test' || !parent?.filename || !path.resolve(parent.filename).startsWith(root + path.sep)) return actual;
  let wrapped;
  wrapped = new Proxy(actual, {
    apply(target, self, args) { return Reflect.apply(target, self, argumentsWithAssertion(args)); },
    get(target, key) { return key === 'test' ? wrapped : Reflect.get(target, key); },
  });
  return wrapped;
};
