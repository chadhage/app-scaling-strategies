'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const {randomUUID}=require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const scope = new AsyncLocalStorage();
const load = Module._load;
const assertions = new WeakMap();
const records = [];
const directory = process.env.C011_ASSERTION_DIR;

function counted(actual) {
  if ((!actual || typeof actual !== 'object') && typeof actual !== 'function') return actual;
  if (assertions.has(actual)) return assertions.get(actual);
  const wrapped = new Proxy(actual, {
    apply(target, self, args) {
      const current = scope.getStore();
      if (current) current.assertions += 1;
      return Reflect.apply(target, self, args);
    },
    get(target, key) {
      const value = Reflect.get(target, key);
      if (key === 'AssertionError' || key === 'CallTracker' || key === 'name' || key === 'prototype') return value;
      return typeof value === 'function' || key === 'strict' ? counted(value) : value;
    }
  });
  assertions.set(actual, wrapped);
  return wrapped;
}

function observing(args) {
  const copied = [...args];
  const at = copied.findLastIndex((value) => typeof value === 'function');
  if (at < 0) return copied;
  const callback = copied[at];
  const title = typeof copied[0] === 'string' ? copied[0] : callback.name || '(anonymous test)';
  copied[at] = async function (context) {
    const record = { title, assertions: 0 };
    const delegated = new Proxy(context, {
      get(target, key) {
        if (key === 'test') return (...nested) => target.test(...observing(nested));
        if (key === 'assert') return counted(Reflect.get(target, key));
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      }
    });
    try { return await scope.run(record, () => callback(delegated)); }
    finally { records.push(record); }
  };
  return copied;
}

Module._load = function observed(request, parent, isMain) {
  const actual = load.call(this, request, parent, isMain);
  if (request === 'node:assert' || request === 'node:assert/strict') return counted(actual);
  if (request !== 'node:test') return actual;
  let wrapped;
  wrapped = new Proxy(actual, {
    apply(target, self, args) { return Reflect.apply(target, self, observing(args)); },
    get(target, key) { return key === 'test' || key === 'it' ? wrapped : Reflect.get(target, key); }
  });
  return wrapped;
};

process.once('exit', () => {
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, `assertions-${process.pid}-${randomUUID()}.json`), JSON.stringify({
    schema: 'C011-assertions/1', tests: records.length,
    assertions: records.reduce((sum, record) => sum + record.assertions, 0),
    zeroAssertionTests: records.filter((record) => record.assertions === 0).map((record) => record.title),
    records
  }, null, 2) + '\n', { flag: 'wx' });
});
