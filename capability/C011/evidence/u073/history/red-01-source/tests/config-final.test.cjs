'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resolveConfig } = require('../config.cjs');
const { createApp } = require('../server.cjs');
const CANARY = 'SYNTHETIC-CONFIG-EXCEPTION-83bc2';
const hostile = () => [
  Object.defineProperty({}, 'pool', { enumerable: true, get() { throw new Error(CANARY); } }),
  { pool: Object.defineProperty({}, 'units', { enumerable: true, get() { throw new Error(CANARY); } }) },
  new Proxy({}, { ownKeys() { throw new Error(CANARY); } }),
  new Proxy({}, { getPrototypeOf() { throw new Error(CANARY); } })
];

test('throwing configuration properties and proxy inspection always produce a closed typed refusal without the supplied error', () => {
  for (const given of hostile()) {
    let caught;
    try { resolveConfig(given); } catch (error) { caught = error; }
    assert.ok(caught instanceof RangeError, 'configuration refusal remains a typed RangeError');
    assert.deepEqual([caught.code, caught.message, caught.field], ['CONFIG_INVALID', 'CONFIG_INVALID', null]);
    assert.equal(JSON.stringify([String(caught), caught.stack, Object.keys(caught), caught]).includes(CANARY), false);
  }
});

test('revoked configuration proxies are refused by the same closed configuration error', () => {
  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.throws(() => resolveConfig(proxy), { code: 'CONFIG_INVALID', message: 'CONFIG_INVALID', field: null });
});

test('a throwing configuration snapshot creates no app resource and echoes no caller exception', () => {
  const resources = () => process.getActiveResourcesInfo().filter((name) => !['TTYWrap', 'FSReqCallback'].includes(name)).sort();
  const before = resources();
  for (const given of hostile()) assert.throws(() => createApp({ config: given }), {
    code: 'CONFIG_INVALID', message: 'CONFIG_INVALID', field: null
  });
  assert.deepEqual(resources(), before);
});
