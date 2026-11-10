'use strict';

// The closed server-side configuration: defaults, the bounds of every number, the cross-checks, a name outside the table, a single read of everything the
// caller supplies, and a refusal that echoes nothing and leaves nothing behind.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const config = require('../config.cjs');
const contract = require('../contract.js');
const { createApp, startLocal } = require('../server.cjs');

const { resolveConfig, NUMBERS } = config;
const nested = (path, value) => path.split('.').reduceRight((inner, name) => ({ [name]: inner }), value);
const refused = (given) => { try { resolveConfig(given); } catch (error) { return error; } return null; };

test('the defaults are the documented ones and the resolved configuration is deeply frozen', () => {
  const resolved = resolveConfig();
  assert.deepEqual(resolved, {
    pool: { units: 100, spend: 600 }, caps: { 'conductor-a': { units: 60, spend: 400 }, 'conductor-b': { units: 60, spend: 400 } }, prices: { standard: 4, burst: 8 }, ttlMs: 300000, maxActive: 20, entries: 50, keyEntries: 1000,
    limits: { bodyBytes: 4096, headerMs: 5000, checkMs: 1000, idleMs: 8000, connections: 256, pipelined: 4, auditEntries: 200, anonymousEntries: 50 }
  });
  for (const value of [resolved, resolved.pool, resolved.caps, resolved.caps['conductor-a'], resolved.prices, resolved.limits]) assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(resolveConfig({}), resolved);
  assert.deepEqual(resolveConfig(Object.create(null)), resolved);
  assert.equal(NUMBERS.length, 2 + 4 + 2 + 4 + 8, 'a number of the table was added without a test');
});

for (const [path, fallback, min, max] of NUMBERS) {
  test(`${path}: the minimum and the maximum are accepted, everything else is refused with its path`, () => {
    // The cross-checks tie some bounds to others: the neighbours are moved with the number under test.
    const apply = (value) => {
      const given = nested(path, value);
      if (path.startsWith('caps.')) given.pool = { units: 1000, spend: 100000 };
      if (path === 'maxActive') given.entries = 200;
      if (path === 'entries') given.maxActive = 1;
      if (path === 'limits.idleMs') given.limits = { ...given.limits, headerMs: 1, checkMs: 1 };
      if (path === 'limits.headerMs' || path === 'limits.checkMs') given.limits = { ...given.limits, idleMs: 120000 };
      if (path.startsWith('pool.')) given.caps = Object.fromEntries(contract.conductors.map((subject) => [subject, { units: 1, spend: 1 }]));
      return given;
    };
    for (const ok of [min, max, fallback]) assert.doesNotThrow(() => resolveConfig(apply(ok)), `${path}=${ok}`);
    for (const bad of [min - 1, max + 1, 0, -1, 1.5, '5', NaN, Infinity, -Infinity, 2 ** 53, Number.MAX_SAFE_INTEGER + 2, null, true, false, [], {}, [5], -0, 1e21]) {
      if (bad >= min && bad <= max && Number.isSafeInteger(bad)) continue;
      const error = refused(apply(bad));
      assert.ok(error !== null, `${path}=${String(bad)} was accepted`);
      assert.deepEqual([error.code, error.message], ['CONFIG_INVALID', 'CONFIG_INVALID']);
      assert.ok([path, null].includes(error.field), `${path}=${String(bad)} named ${error.field}`);
    }
  });
}

test('a name outside the table and a value that is not a plain object are refused', () => {
  const symbol = Symbol('x');
  for (const given of [{ bogus: 1 }, { pool: { bogus: 1 } }, { pool: 5 }, { caps: { 'conductor-c': { units: 1, spend: 1 } } }, { caps: { 'conductor-a': { cap: 1 } } }, { prices: { gold: 5 } },
    { limits: { bogus: 1 } }, { limits: { idleMs: 9000, extra: { deep: 1 } } }, JSON.parse('{"__proto__":{"units":5}}'), JSON.parse('{"pool":{"__proto__":{"units":5}}}'), { constructor: { prototype: {} } },
    [], 'x', 5, null, true, () => {}, new Map(), new (class Config {})(), new Date(), { ttlMs: 300000, [symbol]: 1, pool: { units: 5, extra: 1 } }, { a: { b: { c: { d: { e: 1 } } } } }]) {
    const error = refused(given);
    assert.ok(error !== null, `${JSON.stringify(given)} was accepted`);
    assert.deepEqual([error.code, error.field], ['CONFIG_INVALID', null]);
  }
});

test('the cross-checks: a lease cap above the pool, a history no longer than the active bound and an idle timeout that cannot win the race', () => {
  assert.equal(refused({ pool: { units: 5 } }).field, 'caps.conductor-a');
  assert.equal(refused({ pool: { units: 60, spend: 399 } }).field, 'caps.conductor-a');
  assert.doesNotThrow(() => resolveConfig({ pool: { units: 60, spend: 400 } }));
  assert.equal(refused({ maxActive: 50, entries: 50 }).field, 'entries');
  assert.doesNotThrow(() => resolveConfig({ maxActive: 49, entries: 50 }));
  assert.equal(refused({ limits: { headerMs: 5000, checkMs: 1000, idleMs: 6000 } }).field, 'limits.idleMs');
  assert.doesNotThrow(() => resolveConfig({ limits: { headerMs: 5000, checkMs: 1000, idleMs: 6001 } }));
});

test('everything the caller supplies is read exactly once: a getter and a Proxy cannot answer twice', () => {
  let reads = 0;
  const given = { pool: {} };
  Object.defineProperty(given.pool, 'units', { enumerable: true, get() { reads += 1; return reads === 1 ? 100 : 'not a number'; } });
  assert.equal(resolveConfig(given).pool.units, 100);
  assert.equal(reads, 1);
  let keyCalls = 0;
  let getCalls = 0;
  const proxy = new Proxy({ ttlMs: 60000 }, {
    ownKeys(target) { keyCalls += 1; return keyCalls === 1 ? Reflect.ownKeys(target) : ['ttlMs', 'bogus']; },
    get(target, name) { getCalls += 1; return getCalls === 1 ? 60000 : 'bad'; }
  });
  assert.equal(resolveConfig(proxy).ttlMs, 60000);
  assert.deepEqual([keyCalls, getCalls], [1, 1]);
});

test('a refused configuration echoes nothing that the caller supplied', () => {
  const canary = 'CANARY-7f3a91';
  for (const given of [{ pool: { units: canary } }, { [canary]: 1 }, { pool: { [canary]: 1 } }, { limits: { idleMs: canary } }, { prices: { standard: { [canary]: canary } } }, canary, [canary], { caps: { [canary]: {} } }]) {
    const error = refused(given);
    assert.ok(error !== null);
    assert.equal(JSON.stringify([error.message, error.code, error.field, String(error), error.stack, Object.keys(error), JSON.stringify(error)]).includes(canary), false);
  }
});

test('a refused configuration leaves nothing behind: no server, no listener, no handle', async () => {
  const handles = () => process.getActiveResourcesInfo().filter((name) => name !== 'TTYWrap' && name !== 'FSReqCallback').sort().join();
  const before = handles();
  assert.throws(() => createApp({ config: { pool: { units: 'canary' } } }), { code: 'CONFIG_INVALID' });
  await assert.rejects(startLocal({ config: { limits: { idleMs: 3 } } }), { code: 'CONFIG_INVALID' });
  assert.equal(handles(), before);
});
