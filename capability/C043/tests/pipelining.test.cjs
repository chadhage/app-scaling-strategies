'use strict';

// rev-C043 F1: a request pipelined behind a refusal must NEVER run (orders\_PIPELINING.md). Node parses every pipelined
// request of one TCP read and emits each `request` before the first response has finished, so the server must mark the
// connection when the refusal is DECIDED and run the requests of one connection one after the other. Raw sockets, ONE
// write per case unless stated; each case asserts the answers the client received, that the connection was closed, and
// that the state AND the revision (the ledger and both journals, byte for byte) are unchanged behind the refusal.
const test = require('node:test');
const {
  assert, committed, doc, startService, step,
} = require('./support.cjs');
const {
  exchange, get, hostOf, mutation, quiet, sample, send,
} = require('./pipe-support.cjs');

const jsonPost = (port, payload, extra = '') => send(port, 'POST', '/v1/presets', payload, extra);
const fill = async (service) => {
  for (let index = 0; index < 10; index += 1) {
    await service.real.submit({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `fill-step-${String(index).padStart(4, '0')}`, leaseId: 'synthetic-lease-001', units: 10 });
  }
  assert.equal(committed(service.real), 100, 'the lease is full');
};
const crowd = async (service) => {
  for (let index = 0; index < 64; index += 1) {
    const one = doc({ idempotencyKey: `crowd-run-${String(index).padStart(4, '0')}`, steps: [step(1, { idempotencyKey: `crowd-s-${String(index).padStart(4, '0')}`, units: 1 })] });
    await service.runner.run(Buffer.from(JSON.stringify(one)));
  }
};
const noEdit = (value) => JSON.stringify(value);
const without = (name) => { const { [name]: dropped, ...rest } = doc({ idempotencyKey: 'pipe-bad-0001' }); return noEdit(rest); };

// [name, status, request(port), options]. `applies: false` when the valid mutation of the case is itself refused.
const REFUSED = [
  ['an unknown route', 404, (p) => get(p, '/nope')],
  ['a wrong method', 405, (p) => `DELETE /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\n\r\n`],
  ['a query', 400, (p) => get(p, '/v1/leases?x=1')],
  ['an invalid key', 400, (p) => get(p, '/v1/presets/short')],
  ['a foreign host', 421, () => 'GET /v1/leases HTTP/1.1\r\nHost: evil.example\r\n\r\n'],
  ['a foreign origin', 403, (p) => get(p, '/v1/leases', 'Origin: http://evil.example\r\n')],
  ['a wrong media type', 415, (p) => send(p, 'POST', '/v1/presets', '{}', 'X-Pipe: 1\r\n').replace('application/json', 'text/plain')],
  ['a URL that is too long', 414, (p) => get(p, `/${'a'.repeat(2100)}`)],
  ['a GET with a body', 400, (p) => send(p, 'GET', '/v1/leases', '{}')],
  ['an action that does not exist', 422, (p) => `POST /v1/presets/abcdefgh/undo HTTP/1.1\r\nHost: ${hostOf(p)}\r\nContent-Length: 0\r\n\r\n`],
  ['a missing preset', 404, (p) => get(p, '/v1/presets/abcdefgh')],
  ['a declared body that is too large', 413, (p) => send(p, 'POST', '/v1/presets', 'x'.repeat(2049))],
  ['invalid JSON (decided after the body was read)', 400, (p) => jsonPost(p, '{nope')],
  ['an unknown field (decided after an await)', 400, (p) => jsonPost(p, noEdit({ ...doc({ idempotencyKey: 'pipe-bad-0001' }), extra: 1 }))],
  ['a missing field (decided after an await)', 400, (p) => jsonPost(p, without('bounds'))],
  ['a static bound (decided after an await)', 409, (p) => jsonPost(p, noEdit(doc({ idempotencyKey: 'pipe-bad-0001', bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 14 } })))],
  ['a conflicting key (decided after an await)', 409, (p) => jsonPost(p, noEdit(doc({ idempotencyKey: 'pipe-run-0001', steps: [step(1, { units: 6 }), step(2), step(3)] }))), { setup: async (service) => { await service.runner.run(Buffer.from(noEdit(doc({ idempotencyKey: 'pipe-run-0001' })))); } }],
  ['a full lease, the quota (decided after several awaits)', 409, (p) => jsonPost(p, noEdit(doc({ idempotencyKey: 'pipe-quota-0001', steps: [step(1, { idempotencyKey: 'pipe-quota-step-1' })] }))), { setup: fill, applies: false }],
  ['the bounded number of runs (state full)', 503, (p) => jsonPost(p, noEdit(doc({ idempotencyKey: 'pipe-over-0001' }))), { setup: crowd, applies: false }],
];

for (const [name, status, request, options = {}] of REFUSED) {
  test(`pipelined behind ${name}: the mutation never runs, the state and the revision stay`, { timeout: 60000 }, async (context) => {
    // What the refusal alone leaves behind (nothing for a plain refusal; a recorded, stopped run for the quota case).
    const twin = await startService();
    let expected;
    try {
      await options.setup?.(twin);
      await exchange(twin.port, [request(twin.port)]);
      await quiet(twin);
      expected = sample(twin);
    } finally {
      await twin.stop();
    }
    const cases = [
      ['[refused][valid mutation] in one write', (p) => [request(p), mutation(p, 2)], {}, [status]],
      ['[ok GET][refused][valid mutation] in one write', (p) => [get(p, '/v1/leases'), request(p), mutation(p, 2)], {}, [200, status]],
      ['[refused] then the mutation in a second write, after the answer began', (p) => [request(p), mutation(p, 2)], { paced: true }, [status]],
    ];
    for (const [label, parts, how, wanted] of cases) {
      await context.test(label, async () => {
        const service = await startService();
        try {
          await options.setup?.(service);
          const seen = await exchange(service.port, parts(service.port), how);
          await quiet(service);
          assert.deepEqual(seen.statuses, wanted, 'the client received only the answers of earlier requests and the refusal');
          assert.equal(seen.closed, true, 'the server closed the connection');
          assert.equal(seen.answers.at(-1).close, true, 'the refusal says Connection: close');
          assert.deepEqual(sample(service), expected, 'the state and the revision are exactly what the refusal alone leaves');
        } finally {
          await service.stop();
        }
      });
    }
    if (options.applies === false) return;
    await context.test('[valid mutation][refused]: the first request came first, it is answered and applies once', async () => {
      const service = await startService();
      try {
        await options.setup?.(service);
        const before = sample(service);
        const seen = await exchange(service.port, [mutation(service.port, 2), request(service.port)]);
        await quiet(service);
        assert.deepEqual(seen.statuses, [201, status]);
        assert.equal(seen.closed, true);
        assert.equal(committed(service.real), before.committed + 15, 'the mutation applied exactly once');
      } finally {
        await service.stop();
      }
    });
  });
}

test('a chunked body and an Expect: 100-continue request behind a refusal never run either', { timeout: 60000 }, async (context) => {
  const chunked = (p) => { const body = Buffer.from(JSON.stringify(doc({ idempotencyKey: 'pipe-run-0002' }))); return `POST /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${body.length.toString(16)}\r\n${body}\r\n0\r\n\r\n`; };
  const expecting = (p) => mutation(p, 2).replace('Content-Type:', 'Expect: 100-continue\r\nContent-Type:');
  for (const [label, valid] of [['a chunked body', chunked], ['Expect: 100-continue', expecting]]) {
    await context.test(label, async () => {
      const service = await startService();
      try {
        const before = sample(service);
        const seen = await exchange(service.port, [get(service.port, '/nope'), valid(service.port)]);
        await quiet(service);
        assert.deepEqual(seen.statuses, [404]);
        assert.deepEqual(sample(service), before);
      } finally {
        await service.stop();
      }
    });
  }
});

test('requests of one connection run one after the other, in order: a legitimate pipeline still works', { timeout: 60000 }, async () => {
  const service = await startService();
  try {
    const { port } = service;
    const seen = await exchange(port, [get(port, '/v1/leases'), mutation(port, 3), get(port, '/v1/leases')], { answers: 3 });
    assert.deepEqual(seen.statuses, [200, 201, 200]);
    assert.deepEqual(seen.answers.map((item) => item.close), [false, false, false], 'accepted requests keep the connection');
    assert.equal(JSON.parse(seen.answers[0].body).leases['synthetic-lease-001'].committed, 0);
    assert.equal(JSON.parse(seen.answers[2].body).leases['synthetic-lease-001'].committed, 15, 'the read behind the mutation sees the mutation: strict order');
  } finally {
    await service.stop();
  }
});
