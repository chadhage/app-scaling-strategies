'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash } = require('node:crypto');
const test = require('node:test');
const table = require('./u060-generated-equivalence.json');
const contract = require('../contract.js');
const result = require('../result.cjs');
const { call, gate, inFlight, startService } = require('./support.cjs');
const { exchange, get, mutation, sample, send } = require('./pipe-support.cjs');

const selected = process.env.C043_EQ_ID ? table.proofs.filter((proof) => proof.id === process.env.C043_EQ_ID) : table.proofs;
assert.ok(selected.length > 0, 'a requested equivalence has an exact declared proof');
let original = fs.readFileSync(path.join(__dirname, '..', table.file), 'utf8');
if (process.env.C043_MUTANT_AT) {
  const change = JSON.parse(process.env.C043_MUTANT_AT);
  assert.equal(selected.length, 1);
  const proof = selected[0];
  assert.equal(change.file, table.file);
  assert.equal(change.sha256, table.sourceSha256);
  assert.equal(change.start, Number(proof.id.split(':')[0]));
  assert.equal(change.end, change.start + proof.from.length);
  assert.equal(change.to, proof.to);
  assert.equal(original.slice(change.start, change.start + proof.to.length), proof.to);
  // The retained preload mutates string reads as well as compilation; bind its exact inverse to the original hash.
  original = original.slice(0, change.start) + proof.from + original.slice(change.start + proof.to.length);
}
assert.equal(createHash('sha256').update(original).digest('hex'), table.sourceSha256);
const frames = (seen) => ({ closed: seen.closed, answers: seen.answers.map(({ status, close, body }) => ({ status, close, body: JSON.parse(body) })) });

async function closedParser(service) {
  const socket = new net.Socket();
  let closed = 0;
  socket.on('close', () => { closed += 1; });
  const complete = new Promise((resolve) => socket.once('close', resolve));
  socket.destroy();
  await complete;
  const before = closed;
  service.server.emit('clientError', Object.assign(new Error('closed parser fixture'), { code: 'HPE_CLOSED_CONNECTION' }), socket);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closed, before, 'a second native destroy emits no second close');
  return { destroyed: socket.destroyed, closed };
}

async function witness(family) {
  const service = await startService();
  try {
    if (family === 'falsy-return') {
      const observed = [];
      for (const [method, target, body, expected] of [
        ['PUT', '/v1/leases', undefined, 405], ['GET', '/v1/leases?extra=1', undefined, 400],
        ['GET', '/v1/leases', Buffer.from('x'), 400], ['GET', '/v1/presets/x', undefined, 400],
        ['POST', '/v1/presets/x/cancel', undefined, 400], ['GET', '/v1/leases', undefined, 200],
      ]) {
        const answer = await call(service.port, method, target, body);
        assert.equal(answer.status, expected);
        observed.push({ status: answer.status, body: answer.json, connection: answer.headers.connection, allow: answer.headers.allow ?? null });
      }
      assert.equal(sample(service).committed, 0);
      return { family, observed, state: sample(service) };
    }
    if (family === 'void-return') {
      const bytes = ' '.repeat(2049);
      const request = `POST /v1/presets HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${bytes.length.toString(16)}\r\n${bytes}\r\n0\r\n\r\n`;
      const seen = await exchange(service.port, [request, mutation(service.port, 2)]);
      assert.deepEqual(seen.statuses, [413]); assert.equal(seen.closed, true);
      assert.equal(sample(service).committed, 0);
      return { family, observed: frames(seen), nativeClosed: await closedParser(service), state: sample(service) };
    }
    if (family === 'post-closed') {
      const observed = [];
      for (const refused of [get(service.port, '/absent'), send(service.port, 'POST', '/v1/presets', '{}')]) {
        const seen = await exchange(service.port, [refused, get(service.port, '/v1/leases'), mutation(service.port, 2)]);
        assert.equal(seen.answers.length, 1); assert.equal(seen.closed, true);
        assert.equal(sample(service).committed, 0);
        observed.push(frames(seen));
      }
      return { family, observed, nativeClosed: await closedParser(service), state: sample(service) };
    }
    if (family === 'parser-marker') {
      const observed = [];
      for (const parts of [
        ['G@T / HTTP/1.1\r\n\r\n', mutation(service.port, 2)],
        [get(service.port, '/v1/leases'), '\u0000\u0001garbage\r\n\r\n', mutation(service.port, 2)],
        [get(service.port, '/v1/leases'), `CONNECT 127.0.0.1:${service.port} HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\n\r\n`, mutation(service.port, 2)],
      ]) {
        const seen = await exchange(service.port, parts);
        assert.equal(seen.closed, true);
        assert.equal(seen.statuses.at(-1), parts[1]?.startsWith('CONNECT ') ? 405 : 400);
        assert.equal(sample(service).committed, 0);
        observed.push(frames(seen));
      }
      return { family, observed, state: sample(service) };
    }
    if (family === 'statuses') {
      const accepted = [];
      for (const action of ['run', 'inspect', 'resume']) for (const state of ['completed', 'running']) for (const fresh of [false, true]) {
        const view = { state, steps: [{ index: 1, key: 'synthetic-step-key', leaseId: 'synthetic-lease-001', units: 5, status: 'succeeded',
          code: null, applied: true, appliedByThisRequest: fresh, reservedAfter: 5 }], trail: [], attempts: 1, elapsedMs: 0, bound: null, contradicted: false };
        accepted.push(result.build({ action, accepted: true, view }).status);
      }
      const refused = Object.values(contract.ERRORS).map(({ status }) => status);
      assert.deepEqual([...new Set(accepted)].sort(), [200, 201, 202]);
      assert.equal(refused.every((status) => Number.isInteger(status) && status >= 400 && status <= 599), true);
      assert.equal([...accepted, ...refused].includes(300), false);
      const seen = await exchange(service.port, [mutation(service.port), get(service.port, '/v1/leases'), get(service.port, '/absent')]);
      assert.deepEqual(seen.statuses, [201, 200, 404]); assert.equal(seen.closed, true);
      return { family, accepted, refused, observed: frames(seen), state: sample(service) };
    }
    assert.equal(family, 'queue');
  } finally { await service.stop(); }
  const held = gate();
  const queued = await startService({ executor: held.executor });
  try {
    const pending = exchange(queued.port, [mutation(queued.port), get(queued.port, '/v1/leases'), get(queued.port, '/v1/leases'), get(queued.port, '/v1/leases')], { answers: 4 });
    await inFlight(held, 'pipe-s1-step-1', [pending]);
    assert.equal(sample(queued).committed, 0);
    for (const step of [1, 2, 3]) held.release(`pipe-s1-step-${step}`);
    const seen = await pending;
    assert.deepEqual(seen.statuses, [201, 200, 200, 200]);
    assert.equal(sample(queued).committed, 15);
    return { family, observed: frames(seen), state: sample(queued) };
  } finally { await queued.stop(); }
}

for (const proof of selected) {
  test(`U060 demonstrated generated equivalence ${proof.id}: ${proof.family}`, { timeout: 120000 }, async () => {
    const start = Number(proof.id.split(':')[0]);
    assert.equal(original.slice(start, start + proof.from.length), proof.from, 'the proof binds the exact original generated position');
    const facts = await witness(proof.family);
    console.log(`U060_EQ_TRACE_BASE64 ${proof.id} ${Buffer.from(JSON.stringify(facts), 'utf8').toString('base64')}`);
  });
}
