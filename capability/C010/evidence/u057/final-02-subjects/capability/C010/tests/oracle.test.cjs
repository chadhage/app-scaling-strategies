'use strict';

// C010 scenario "A foreign resource and an absent resource are indistinguishable", the work and the timing part. (1) STRUCTURE: the store counts the
// elements it looks at; a foreign target, an expired one and an absent one cost the same, on every route, counted and never timed. (2) The remote
// attacker's view: a SEPARATE server process answers interleaved requests for a foreign and for an absent lease; the ratio of the two medians is
// near one for the service and far from one for a naive control measured in the same run (a ratio against a control, never seconds: L-0170).
const assert = require('node:assert/strict');
const test = require('node:test');
const { startChildTarget } = require('./targets.cjs');
const { call, seed, target, withApp } = require('./helpers.cjs');

const ABSENT = Object.freeze({ lease: 'lease-ffffffffffffffff', run: 'run-ffffffffffffffff' });

test('every route does the same amount of work for a foreign lease, an expired lease and a lease that never existed (elements looked at, counted)', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const short = (await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'short', ttlMs: 100 })).json.lease.id;
  context.clock.advance(200);
  const routes = [
    ['GET', (l) => `/v1/leases/${l}`], ['DELETE', (l) => `/v1/leases/${l}`], ['GET', (l) => `/v1/leases/${l}/runs`], ['POST', (l) => `/v1/leases/${l}/scratches`, { name: 'x' }],
    ['GET', (l) => `/v1/leases/${l}/runs/${ids.b.run}`], ['PATCH', (l) => `/v1/leases/${l}/runs/${ids.b.run}`, { units: 2 }], ['DELETE', (l) => `/v1/leases/${l}/exports/${ids.b.export}`],
    ['POST', (l) => `/v1/leases/${l}/runs/${ids.b.run}/cancel`], ['POST', () => '/v1/batch', (l) => ({ ops: [{ op: 'delete', lease: l, kind: 'scratch', id: ids.b.scratch }] })]
  ];
  for (const [method, route, body] of routes) {
    const work = [];
    for (const lease of [ids.a.lease, short, ABSENT.lease]) {
      const before = context.app.stats().visited;
      const answer = await call(context, tokens['conductor-b'], method, route(lease), typeof body === 'function' ? body(lease) : body);
      assert.equal(answer.status, 404, `${method} ${route(lease)}`);
      work.push(context.app.stats().visited - before);
    }
    assert.ok(work[0] > 0, 'the lookup happened');
    assert.deepEqual(work, [work[0], work[0], work[0]], `${method} ${route('LEASE')}: foreign, expired and absent differ in work: ${work}`);
  }
  const own = context.app.stats().visited;
  await call(context, tokens['conductor-b'], 'GET', target(ids.b, 'run'));
  assert.ok(context.app.stats().visited - own > 0);
}));

const median = (values) => [...values].sort((first, second) => first - second)[Math.floor(values.length / 2)];
const PAIRS = 120;

async function ratio(child, token, foreign, absent) {
  const timed = async (route) => { const started = process.hrtime.bigint(); await call(child, token, 'GET', route); return Number(process.hrtime.bigint() - started) / 1e6; };
  for (let warm = 0; warm < 10; warm += 1) { await timed(foreign); await timed(absent); }
  const first = [];
  const second = [];
  for (let pair = 0; pair < PAIRS; pair += 1) {
    first.push(await timed(foreign));
    second.push(await timed(absent));
  }
  return median(first) / median(second);
}

test('a remote attacker measures no difference between a foreign and an absent lease from another process, and the same measurement does see a naive server\'s difference', { timeout: 120000 }, async (t) => {
  const service = await startChildTarget('default', { watchdogMs: 100000 });
  const naive = await startChildTarget('default', { mode: 'oracle-naive', watchdogMs: 100000 });
  try {
    const foreignLease = (await call(service, service.tokens['conductor-a'], 'POST', '/v1/leases', { name: 'victim', ttlMs: 600000 })).json.lease.id;
    const run = (await call(service, service.tokens['conductor-a'], 'POST', `/v1/leases/${foreignLease}/runs`, { name: 'victim', units: 1 })).json.resource.id;
    const attacker = service.tokens['conductor-b'];
    const served = await ratio(service, attacker, `/v1/leases/${foreignLease}/runs/${run}`, `/v1/leases/${ABSENT.lease}/runs/${ABSENT.run}`);
    const control = await ratio(naive, null, '/v1/leases/lease-aaaaaaaaaaaaaaaa/runs/run-aaaaaaaaaaaaaaaa', `/v1/leases/${ABSENT.lease}/runs/${ABSENT.run}`);
    t.diagnostic(JSON.stringify({ serviceRatio: Number(served.toFixed(3)), naiveRatio: Number(control.toFixed(3)), pairs: PAIRS }));
    assert.ok(control > 2.5, `the control must show a difference the measurement can see: ${control}`);
    assert.ok(served > 0.4 && served < 2.5, `the service shows a timing difference between a foreign and an absent lease: ratio ${served}`);
  } finally {
    await service.close();
    await naive.close();
  }
});
