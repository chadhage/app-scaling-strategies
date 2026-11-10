'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomUUID } = require('node:crypto');
const storage = new AsyncLocalStorage();
const rows = [];
const originalLoad = Module._load;
const proxies = new WeakMap();
const assertionProxy = (original) => {
  if (proxies.has(original)) return proxies.get(original);
  const count = (fn, self, args) => { const row = storage.getStore(); if (row) row.assertions += 1; return Reflect.apply(fn, self, args); };
  const proxy = new Proxy(original, {
    apply: (fn, self, args) => count(fn, self, args),
    get(target, key) {
      const value = Reflect.get(target, key);
      if (key === 'strict') return assertionProxy(value);
      if (typeof value !== 'function' || key === 'AssertionError') return value;
      return (...args) => count(value, target, args);
    }
  });
  proxies.set(original, proxy);
  return proxy;
};
function register(target, self, args) {
  const values = [...args];
  const at = values.findLastIndex((value) => typeof value === 'function');
  if (at < 0) return Reflect.apply(target, self, values);
  const parent = storage.getStore();
  if (parent) parent.children += 1;
  const row = { name: typeof values[0] === 'string' ? values[0] : '<unnamed>', assertions: 0, children: 0, executed: false, skipped: null };
  rows.push(row);
  const body = values[at];
  values[at] = function observed(context, ...rest) {
    row.executed = true;
    const wrapped = new Proxy(context, {
      get(holder, key) {
        const value = Reflect.get(holder, key, holder);
        if (key === 'skip') return (reason) => { row.skipped = String(reason || '<unnamed skip>'); return value.call(holder, reason); };
        if (key === 'test') return (...nested) => register(value, holder, nested);
        return typeof value === 'function' ? value.bind(holder) : value;
      }
    });
    return storage.run(row, () => Reflect.apply(body, this, [wrapped, ...rest]));
  };
  return Reflect.apply(target, self, values);
}
let testProxy;
Module._load = function tracked(request, parent, main) {
  const value = Reflect.apply(originalLoad, this, arguments);
  if (request === 'node:assert' || request === 'node:assert/strict') return assertionProxy(value);
  if (request !== 'node:test') return value;
  if (!testProxy) testProxy = new Proxy(value, {
    apply: (target, self, args) => register(target, self, args),
    get(target, key) { return key === 'test' || key === 'it' ? testProxy : Reflect.get(target, key); }
  });
  return testProxy;
};
process.once('exit', () => {
  if (!process.env.C014_CENSUS_DIR) return;
  const vacuous = rows.filter((row) => row.executed && row.assertions === 0 && row.children === 0 && row.skipped === null).map((row) => row.name);
  const report = { schema: 'C014-assertion-census/1', file: path.basename(process.argv[1] || '<runner>'), rows, vacuous };
  fs.mkdirSync(process.env.C014_CENSUS_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.C014_CENSUS_DIR, `${process.pid}-${randomUUID()}.json`), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  if (vacuous.length) process.exitCode = 1;
});
