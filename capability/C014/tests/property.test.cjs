'use strict';

// Seeded random sequences over {plant a canary somewhere, call a route as an identity, post a command, export, issue a token, restart, cancel a request,
// refuse-and-pipeline, overflow the ring, repeat a plant}. The recovery operations (restart, cancel, refusal, ring overflow, duplicate) are IN the alphabet,
// and the global invariant is checked after EVERY operation: the bytes served so far, and the console, hold no canary in any covered encoding; every list
// reconciles (shown of total), every bundle verifies and counts what it holds, the revision never goes backwards within one lifetime.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { createHmac } = require('node:crypto');
const { startLocal } = require('../server.cjs');
const { WHO, seedConfig, canaryList, clientCanaries } = require('./canaries.cjs');
const { ENCODERS, scan } = require('./scanner.cjs');
const { call, build, exchange } = require('./harness.cjs');

const PLACES = ['run', 'trace', 'log', 'audit', 'error'];
const ROUTES = ['/', '/scope.json', '/v1/evidence/trace?limit=200', '/v1/evidence/runs?limit=200', '/v1/evidence/audit?limit=200', '/v1/evidence/logs?limit=200', '/v1/evidence/bundle', '/v1/manage/config', '/v1/nowhere'];
const OPS = ['plant', 'plant', 'plantIssued', 'get', 'get', 'get', 'post', 'export', 'restart', 'cancel', 'pipeline', 'bound', 'duplicate'];

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function sequence(seed, steps) {
  const random = prng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const config = seedConfig();
  const everything = [...canaryList(config), ...clientCanaries()];
  const held = canaryList(config);
  const encoders = Object.values(ENCODERS);
  const served = [];
  const log = [];
  let lines = [];
  let last = null;
  let lifetime = 0;
  let revision = 0;
  const start = async () => startLocal({ config, logSink: (line) => lines.push(String(line)) });
  let local = await start();
  const noisy = () => ({ 'User-Agent': pick(clientCanaries()).value, Referer: `http://127.0.0.1/${pick(clientCanaries()).value}`, Cookie: `sid=${pick(clientCanaries()).value}` });
  const token = () => pick([null, ...WHO.map((who) => config.tokens[who]), `c009_${'A'.repeat(43)}`, 'garbage']);
  const keep = (result) => { served.push(result.bytes); return result; };
  const plant = (place, value) => { last = [place, value]; local.service.plant(place, value); };
  const reconcile = (doc) => {
    assert.ok(doc.shown <= doc.total && doc.items.length === doc.shown, 'shown of total reconciles');
    assert.ok(doc.revision >= revision, 'the revision never goes backwards within one lifetime');
    revision = doc.revision;
  };

  try {
    for (let step = 0; step < steps; step += 1) {
      const op = pick(OPS);
      const before = served.length;
      log.push(op);
      if (op === 'plant') plant(pick(PLACES), pick(encoders)(pick(held).value));
      else if (op === 'plantIssued') {
        const issued = local.service.issueToken(pick(WHO), { ttlMs: 600000 });
        everything.push({ id: `issued-${everything.length}`, value: issued });
        plant(pick(PLACES), pick(encoders)(issued));
      } else if (op === 'get') {
        const result = keep(await call(local.port, 'GET', pick(ROUTES), { token: token(), headers: noisy() }));
        if (result.status === 200 && result.answer.headers['content-type'].startsWith('application/json') && result.answer.body.length && result.json().items) reconcile(result.json());
      } else if (op === 'post') {
        keep(await call(local.port, 'POST', pick(['/v1/commands/run.create', '/v1/commands/config.check']), { token: token(), headers: noisy(), body: pick([{ name: 'seq-run', units: 2 }, { mode: 'fail' }, { mode: 'ok' }, '{']) }));
      } else if (op === 'export') {
        const result = keep(await call(local.port, 'GET', '/v1/evidence/bundle'));
        const { signature, ...unsigned } = result.json();
        assert.equal(signature.value, createHmac('sha256', config.signingKey).update(JSON.stringify(unsigned)).digest('hex'));
        for (const kind of ['trace', 'runs', 'audit', 'logs']) assert.equal(unsigned.counts[kind], unsigned[kind].length);
        assert.ok(unsigned.revision >= revision);
        revision = unsigned.revision;
      } else if (op === 'restart') {
        await local.close();
        local = await start();
        lifetime += 1;
        revision = 0;
      } else if (op === 'cancel') {
        await new Promise((resolve) => {
          const socket = net.connect({ port: local.port, host: '127.0.0.1' }, () => { socket.write(`POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${local.port}\r\nContent-Length: 100\r\n\r\n{"na`); setTimeout(() => socket.destroy(), 10); });
          socket.on('close', resolve);
          socket.on('error', () => {});
        });
      } else if (op === 'pipeline') {
        const refused = build('POST', '/v1/commands/run.create', { port: local.port, headers: { 'Content-Type': 'application/json', ...noisy() }, body: { name: 'a', units: 1 } });
        const mutation = build('POST', '/v1/commands/run.create', { port: local.port, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.tokens['conductor-a']}` }, body: { name: 'behind', units: 1 } });
        const total = async () => (await call(local.port, 'GET', '/v1/evidence/runs')).json().total;
        const runs = await total();
        keep(await exchange(local.port, Buffer.concat([refused, mutation]), { settleMs: 10000 }));
        assert.equal(await total(), runs, 'nothing ran behind the refusal');
      } else if (op === 'bound') {
        for (let index = 0; index < 205; index += 1) plant('trace', `bound ${index} ${pick(encoders)(pick(held).value)}`);
        const list = (await call(local.port, 'GET', '/v1/evidence/trace?limit=200')).json();
        assert.equal(list.items.length, 200);
        assert.ok(list.total <= 200, 'the ring is bounded');
      } else if (op === 'duplicate' && last) plant(last[0], last[1]);
      const fresh = Buffer.concat(served.slice(before));
      const printed = lines.splice(0).join('\n');
      assert.deepEqual(scan(fresh, everything), [], `seed ${seed} step ${step} (${log.join(' > ')}): bytes served`);
      assert.deepEqual(scan(printed, everything), [], `seed ${seed} step ${step}: console`);
    }
    assert.deepEqual(scan(Buffer.concat(served), everything), [], `seed ${seed}: everything served over ${lifetime + 1} lifetimes`);
    return { steps, bytes: served.reduce((sum, bytes) => sum + bytes.length, 0), restarts: lifetime, ops: new Set(log) };
  } finally { await local.close(); }
}

for (const seed of [11, 2027, 90210, 1234567]) {
  test(`property, seed ${seed}: after every operation no canary has been served, in any covered encoding`, { timeout: 150000 }, async () => {
    const result = await sequence(seed, 28);
    assert.ok(result.bytes > 1000, 'something was served');
    assert.ok(result.ops.size >= 6, `${[...result.ops].join(',')}`);
  });
}

test('the generator is deterministic: the same seed draws the same sequence', () => {
  const first = prng(5);
  const second = prng(5);
  assert.deepEqual(Array.from({ length: 5 }, first), Array.from({ length: 5 }, second));
  assert.notDeepEqual(Array.from({ length: 5 }, prng(6)), Array.from({ length: 5 }, prng(5)));
});
