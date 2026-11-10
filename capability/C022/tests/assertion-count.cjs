'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { AsyncLocalStorage } = require('node:async_hooks');

const active = new AsyncLocalStorage();
const rows = [];
const load = Module._load;
const proxies = new WeakMap();
const methods = new Set([
  'ok', 'fail', 'equal', 'notEqual', 'strictEqual', 'notStrictEqual', 'deepEqual',
  'notDeepEqual', 'deepStrictEqual', 'notDeepStrictEqual', 'partialDeepStrictEqual',
  'throws', 'doesNotThrow', 'rejects', 'doesNotReject', 'ifError', 'match', 'doesNotMatch'
]);
const count = () => { const row = active.getStore(); if (row) row.assertions += 1; };

function assertions(target) {
  if (proxies.has(target)) return proxies.get(target);
  const proxy = new Proxy(target, {
    apply(fn, receiver, args) { count(); return Reflect.apply(fn, receiver, args); },
    get(object, key) {
      const value = Reflect.get(object, key);
      if (key === 'strict') return assertions(value);
      if (methods.has(key) && typeof value === 'function') {
        return (...args) => { count(); return Reflect.apply(value, object, args); };
      }
      return value;
    }
  });
  proxies.set(target, proxy);
  return proxy;
}

function context(target) {
  return new Proxy(target, {
    get(object, key) {
      const value = Reflect.get(object, key, object);
      if (key === 'assert' && value) return assertions(value);
      if (key === 'test') return registration(value.bind(object));
      return typeof value === 'function' ? value.bind(object) : value;
    }
  });
}

function registration(target) {
  if (proxies.has(target)) return proxies.get(target);
  const proxy = new Proxy(target, {
    apply(fn, receiver, args) {
      const at = args.findLastIndex((value) => typeof value === 'function');
      if (at >= 0) {
        const callback = args[at];
        const name = typeof args[0] === 'string' ? args[0] : callback.name || '(anonymous)';
        const changed = args.slice();
        changed[at] = function (t, ...rest) {
          const row = { name, assertions: 0 };
          rows.push(row);
          return active.run(row, () => callback.call(this, context(t), ...rest));
        };
        return Reflect.apply(fn, receiver, changed);
      }
      return Reflect.apply(fn, receiver, args);
    },
    get(object, key) {
      const value = Reflect.get(object, key);
      if (['test', 'only', 'skip', 'todo'].includes(key) && typeof value === 'function') return registration(value);
      return value;
    }
  });
  proxies.set(target, proxy);
  return proxy;
}

Module._load = function (request, parent, isMain) {
  const value = Reflect.apply(load, this, [request, parent, isMain]);
  if (['node:assert', 'assert', 'node:assert/strict', 'assert/strict'].includes(request)) return assertions(value);
  if (request === 'node:test' || request === 'test') return registration(value);
  return value;
};

process.on('exit', () => {
  const directory = process.env.C022_ASSERTION_DIR;
  if (!directory || rows.length === 0) return;
  const file = path.relative(process.cwd(), process.argv[1] || '').split(path.sep).join('/');
  fs.writeFileSync(path.join(directory, `assertions-${process.pid}.json`),
    `${JSON.stringify({ file, tests: rows }, null, 2)}\n`, { flag: 'wx' });
});
