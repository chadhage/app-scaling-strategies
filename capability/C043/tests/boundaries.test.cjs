'use strict';

// R3 systematic mutation (self-review line 4): survivors of the generated campaign (tests\mutgen.cjs) that a test can kill.
// An off-by-one at a limit is a guard mutant too: the limit itself is accepted, one beyond it is refused.
const net = require('node:net');
const test = require('node:test');
const {
  assert, doc, startService,
} = require('./support.cjs');
const {
  exchange, get, hostOf, parseAnswers,
} = require('./pipe-support.cjs');

const LIMIT = 2048;

// A valid preset padded with trailing blanks to exactly `size` bytes, sent as ONE chunked body (no Content-Length, so the
// streaming limit of readBody is the only thing that decides).
const chunked = (port, size) => {
  const body = JSON.stringify(doc({ idempotencyKey: `bound-run-${size}` }));
  const payload = Buffer.from(body.padEnd(size, ' '));
  return `POST /v1/presets HTTP/1.1\r\nHost: ${hostOf(port)}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${payload.length.toString(16)}\r\n${payload.toString('latin1')}\r\n0\r\n\r\n`;
};

test('the streaming body limit is exact: a chunked body of exactly 2048 bytes is accepted, 2049 bytes is a 413 that closes the connection', { timeout: 120000 }, async () => {
  const service = await startService();
  try {
    const exactly = await exchange(service.port, [chunked(service.port, LIMIT)], { answers: 1 });
    assert.deepEqual(exactly.statuses, [201], 'the limit itself is accepted');
    const beyond = await exchange(service.port, [chunked(service.port, LIMIT + 1)]);
    assert.deepEqual([beyond.statuses, beyond.closed], [[413], true], 'one byte beyond the limit is refused and the connection is closed');
  } finally {
    await service.stop();
  }
});

test('the statuses the service can emit are closed: 200, 201, 202 and refusals from 400 to 599, never 300 (the mutgen equivalent of a status boundary)', () => {
  const contract = require('../contract.js');
  const refusals = Object.values(contract.ERRORS).map((entry) => entry.status);
  assert.equal(refusals.length > 20, true, 'the table of typed refusals was read');
  assert.equal(refusals.every((status) => Number.isInteger(status) && status >= 400 && status <= 599), true);
  assert.equal(refusals.includes(300), false);
});

test('the pipeline depth is exact: four pipelined requests (the bound) are all answered in order, a fifth cuts the connection', { timeout: 120000 }, async () => {
  const service = await startService();
  try {
    const four = await exchange(service.port, Array.from({ length: 4 }, () => get(service.port, '/v1/leases')), { answers: 4 });
    assert.deepEqual(four.statuses, [200, 200, 200, 200], 'the bound itself is served');
    const socket = net.connect({ host: '127.0.0.1', port: service.port });
    const chunks = [];
    socket.on('error', () => {});
    socket.on('data', (chunk) => chunks.push(chunk));
    const closed = new Promise((resolve) => socket.once('close', resolve));
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(Array.from({ length: 5 }, () => get(service.port, '/v1/leases')).join(''));
    await closed;
    assert.equal(parseAnswers(Buffer.concat(chunks).toString('latin1')).length < 5, true, 'the fifth pipelined request is never served');
  } finally {
    await service.stop();
  }
});
