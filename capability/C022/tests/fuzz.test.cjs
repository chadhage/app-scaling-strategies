'use strict';

// Total on hostile input (self-review 7): a SEEDED fuzz of hostile bodies, queries and whole requests. The answer to anything is a typed
// outcome of the closed table, never a throw (INTERNAL_ERROR is the fail-closed answer to an unexpected exception and must never appear),
// never a hang and never an unbounded amount of work; the pure validators are total functions. Nothing here is timed: the counts decide.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const contract = require('../contract.js');
const { raw, startApp } = require('./helpers.cjs');

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (random, list) => list[Math.floor(random() * list.length)];

const KEYS = ['name', 'units', 'ticket', 'user', 'role', 'tenant', 'sid', 'owner', 'id', 'version', '__proto__', 'constructor', 'prototype', 'toString', 'hasOwnProperty', '', '0', ' ', 'x.y', 'NAME', 'Tenant', 'orgId', 'ünits'];
const STRINGS = ['', ' ', 'a', 'alder-orchard', 'ADA', 'ada', 'admin', 'viewer', 'member', 'proj-0001', 'sid_x', '__proto__', 'constructor', '\u0000', '\ud800', 'ünï', 'a'.repeat(33), 'a'.repeat(257), '-bad', '0', '1e3', 'tenant-birch', 'c022_x'];

function hostile(random, depth = 0) {
  const kind = Math.floor(random() * (depth > 4 ? 9 : 13));
  switch (kind) {
    case 0: return null;
    case 1: return undefined;
    case 2: return random() < 0.5;
    case 3: return Math.floor(random() * 300) - 100;
    case 4: return random() * 1e9;
    case 5: return pick(random, [NaN, Infinity, -Infinity, -0, 0, 1.5, 2 ** 53, 1e999, 100, 101, 0.1]);
    case 6: return pick(random, STRINGS);
    case 7: return pick(random, STRINGS).repeat(Math.floor(random() * 5));
    case 8: return Symbol.for('hostile').description;
    case 9: return Array.from({ length: Math.floor(random() * 4) }, () => hostile(random, depth + 1));
    case 10: return Object.fromEntries(Array.from({ length: Math.floor(random() * 4) }, () => [pick(random, KEYS), hostile(random, depth + 1)]));
    case 11: return JSON.parse('{"__proto__":{"role":"admin"},"constructor":{"prototype":{"x":1}}}');
    default: return Object.assign(Object.create(null), { name: hostile(random, depth + 1), units: hostile(random, depth + 1) });
  }
}

const BODY_OPS = ['project.create', 'project.update', 'admin.role', 'admin.revoke', 'session.login', 'session.switch'];
const VALID = {
  'project.create': (random) => ({ name: `p${Math.floor(random() * 99)}`, units: 1 + Math.floor(random() * 100) }),
  'project.update': (random) => ({ name: `p${Math.floor(random() * 99)}`, units: 1 + Math.floor(random() * 100) }),
  'admin.role': (random) => ({ user: pick(random, ['ada', 'alf', 'dana']), role: pick(random, ['viewer', 'member', 'admin']) }),
  'admin.revoke': (random) => (random() < 0.5 ? { sid: `sid_${Math.floor(random() * 99)}` } : { user: pick(random, ['ada', 'alf']) }),
  'session.login': () => ({ ticket: 't022_x' }),
  'session.switch': () => ({ tenant: 'tenant-birch' })
};

test('validateInput is total: every hostile body of every body operation gets a typed refusal or a clean value, and a clean value has only the declared fields', () => {
  const random = seeded(0xC022);
  const codes = new Set(Object.keys(contract.CODES));
  let accepted = 0;
  let refused = 0;
  for (let round = 0; round < 3000; round += 1) {
    const op = pick(random, BODY_OPS);
    let body;
    if (random() < 0.15) body = hostile(random);
    else if (random() < 0.5) {
      body = VALID[op](random);
      const field = pick(random, [...Object.keys(body), pick(random, KEYS)]);
      if (random() < 0.5) body[field] = hostile(random, 2);
    } else body = Object.fromEntries(Array.from({ length: Math.floor(random() * 4) }, () => [pick(random, ['name', 'units', 'ticket', 'user', 'role', 'sid', 'tenant', pick(random, KEYS)]), hostile(random, 2)]));
    let result;
    assert.doesNotThrow(() => { result = contract.validateInput(op, body); }, `${op} ${typeof body}`);
    if (result.ok) {
      accepted += 1;
      assert.equal(Object.getPrototypeOf(result.value), Object.prototype, 'a clean value is a plain object');
      const declared = { 'project.create': ['name', 'units'], 'project.update': ['name', 'units'], 'admin.role': ['user', 'role'], 'admin.revoke': ['sid', 'user'], 'session.login': ['ticket'], 'session.switch': ['tenant'] }[op];
      assert.ok(Object.keys(result.value).every((key) => declared.includes(key)), `${op}: only declared fields`);
    } else {
      refused += 1;
      assert.ok(codes.has(result.code), `${op}: ${result.code} is a typed code`);
    }
  }
  assert.ok(accepted > 20 && refused > 1000, `the fuzz reached both outcomes (${accepted} accepted, ${refused} refused)`);
});

test('parseListQuery is total over hostile query strings: a typed refusal or a bounded query', () => {
  const random = seeded(0xC023);
  const pieces = ['limit', 'cursor', 'q', 'x', '=', '&', '%', '%zz', '%00', '%ff', '1', '10', '11', '0', '-1', '999', 'a b', '+', 'A_b-c', 'a'.repeat(33), '', ';', '[]', '\u0000'];
  let ok = 0;
  for (let round = 0; round < 3000; round += 1) {
    const text = Array.from({ length: Math.floor(random() * 8) }, () => pick(random, pieces)).join('');
    let result;
    assert.doesNotThrow(() => { result = contract.parseListQuery(new URLSearchParams(text)); }, JSON.stringify(text));
    if (result.ok) {
      ok += 1;
      assert.ok(Number.isInteger(result.query.limit) && result.query.limit >= 1 && result.query.limit <= contract.limits.pageMax);
      assert.match(result.query.q, /^[a-z0-9 _-]{0,32}$/);
      assert.ok(result.query.cursor === null || typeof result.query.cursor === 'string');
    } else assert.equal(result.code, 'QUERY_INVALID');
  }
  assert.ok(ok > 100);
});

let ctx;
let tokens;
before(async () => {
  ctx = await startApp();
  tokens = [(await ctx.session('ada')).token, (await ctx.session('alf')).token, (await ctx.session('ana')).token, (await ctx.session('bea')).token];
});
after(async () => { await ctx.close(); });

test('a seeded fuzz of whole requests (method, path, headers, body): every answer is a typed outcome, none is INTERNAL_ERROR, and the server stays healthy', { timeout: 120000 }, async () => {
  const random = seeded(0xC024);
  const known = new Set(Object.keys(contract.CODES));
  const methods = ['GET', 'GET', 'GET', 'POST', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'TRACE'];
  const paths = ['/', '/v1/projects', '/v1/projects/proj-0001', '/v1/projects/proj-0002', '/v1/projects/%zz', '/v1/projects/%00', `/v1/projects/${'a'.repeat(200)}`, '/v1/session', '/v1/session/login',
    '/v1/session/anonymous', '/v1/session/logout', '/v1/session/switch', '/v1/admin/role', '/v1/admin/revoke', '/v1/admin/sessions', '/v1/admin/audit', '/v1/profiles', '/v1/profiles/synthetic-001',
    '/v1/nowhere', '//v1/projects', '/v1/projects?limit=%', '/v1/projects?limit=1&limit=2', '/v1/projects?cursor=%ff', '/v1/projects?q=%00', '/v1/projects?limit=3&q=a-b', '/scope.json?x', '/page.js', '/v1/projects/..%2fsession'];
  const headerSets = [
    () => [],
    () => [`Authorization: Bearer ${pick(random, tokens)}`],
    () => [`Authorization: Bearer ${pick(random, tokens)}`, 'X-Tenant: tenant-birch'],
    () => ['Authorization: Bearer garbage'],
    () => [`Authorization: Bearer ${pick(random, tokens)}`, `If-Match: ${pick(random, ['*', 'W/"x"', ',,,', '"a","b"', '"stale"'])}`],
    () => [`Authorization: Bearer ${pick(random, tokens)}`, `If-None-Match: ${pick(random, ['*', 'W/"x"', ',,,', '"a","b"'])}`],
    () => [`Authorization: Bearer ${pick(random, tokens)}`, 'Origin: http://evil.invalid'],
    () => [`Authorization: Bearer ${pick(random, tokens)}`, 'Cookie: sid=1', 'Referer: http://evil.invalid/']
  ];
  const bodies = [null, null, '{}', '[]', '"x"', '{nope', '{"name":"fz","units":1}', '{"name":"fz","units":1,"owner":"ada"}', '{"user":"dana","role":"viewer"}', '{"ticket":"t022_x"}', '{"sid":"sid_x"}',
    JSON.stringify({ deep: JSON.parse('['.repeat(200) + ']'.repeat(200)) }), `{"name":"${'a'.repeat(5000)}"}`, '{"__proto__":{"role":"admin"}}'];
  const seen = new Map();
  for (let round = 0; round < 150; round += 1) {
    const method = pick(random, methods);
    const body = pick(random, bodies);
    const headers = [...pick(random, headerSets)(), ...(body !== null && random() < 0.8 ? ['Content-Type: application/json'] : [])];
    const result = await raw.exchange(ctx.port, raw.request(ctx.port, method, pick(random, paths), { headers, body }), { waitMs: 6000, settleMs: 250 });
    const [answer] = result.answers;
    assert.ok(answer, `${method}: an answer came back (${round})`);
    const isAsset = answer.status === 200 && /^(text|application\/json)/.test(answer.headers['content-type'] || '') && !answer.json;
    if (answer.status !== 204 && !isAsset) assert.ok(answer.json && (typeof answer.json.outcome === 'string' || answer.json.cardId === 'C022'), `${method} ${answer.status}: a typed body`);
    if (answer.status >= 400) {
      assert.ok(known.has(answer.json.outcome), `${answer.json.outcome} is a typed code`);
      assert.notEqual(answer.json.outcome, 'INTERNAL_ERROR', 'no request makes the server throw');
      assert.equal(result.closedByServer, true, `${answer.status}: a refusal closes the connection`);
    }
    seen.set(answer.status, (seen.get(answer.status) || 0) + 1);
  }
  assert.ok(seen.size >= 6, `the fuzz reached many kinds of answers: ${[...seen.keys()].sort().join(',')}`);
  assert.equal(ctx.app.health().ok, true);
  assert.equal((await ctx.call('GET', '/v1/session', { token: tokens[0] })).status, 200, 'the server still serves');
});
