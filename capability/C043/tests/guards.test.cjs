'use strict';

// rev-C043 F5: server guards that no test killed (the reviewer's mutants G11, G12, G13, G15 and G16 survived every
// suite). Each test below fails when its guard is removed; tests\mutants.test.cjs names them as the killers.
const net = require('node:net');
const test = require('node:test');
const { createLocalServer } = require('../server.cjs');
const {
  assert, boot, call, createMemoryIo, doc, startService, raw,
} = require('./support.cjs');

const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, firstRequestMs: 600000, idleMs: 600000 });
const lines = (text) => text.split('\n').filter(Boolean).map((line) => `${line}\n`);

test('G11 the action name is a closed pattern: a name outside it is an unknown route, a lower-case name is an unsupported action', { timeout: 30000 }, async () => {
  const service = await startService();
  try {
    const refused = async (name) => (await call(service.port, 'POST', `/v1/presets/abcdefgh/${name}`, '')).json.error.code;
    assert.equal(await refused('undo'), 'UNSUPPORTED_ACTION');
    for (const name of ['Undo', 'undo1', '1undo', 'a_b', `a${'b'.repeat(32)}`]) assert.equal(await refused(name), 'NOT_FOUND', name);
  } finally {
    await service.stop();
  }
});

test('G12 the header count is bounded: more headers than the bound are refused (431) by the parser, a request within it is served', { timeout: 30000 }, async () => {
  const service = await startService({ bounds: QUIET });
  try {
    const junk = Array.from({ length: 70 }, (_, index) => `X-Junk-${index}: 1`);
    const answer = await raw(service.port, ['GET /v1/leases HTTP/1.1', ...junk, `Host: 127.0.0.1:${service.port}`]);
    assert.equal(answer.status, 431, '70 headers are beyond the bound of 64');
    const headers = Object.fromEntries(junk.slice(0, 10).map((line) => line.split(': ')));
    const fine = await call(service.port, 'GET', '/v1/leases', undefined, headers);
    assert.equal(fine.status, 200, 'a request within the bound is served');
  } finally {
    await service.stop();
  }
});

test('G13 the idle timeout closes a connection that went quiet in the middle of a request, with every other timer out of the way', { timeout: 60000 }, async () => {
  const service = await startService({ bounds: { ...QUIET, idleMs: 300 } });
  try {
    const socket = net.connect({ host: '127.0.0.1', port: service.port });
    socket.on('error', () => {});
    const closed = new Promise((resolve) => socket.once('close', () => resolve('closed')));
    await new Promise((resolve) => socket.once('connect', resolve));
    socket.write(`POST /v1/presets HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\nContent-Type: application/json\r\nContent-Length: 50\r\n\r\n{`);
    const verdict = await Promise.race([closed, new Promise((resolve) => setTimeout(() => resolve('still open'), 20000).unref())]);
    socket.destroy();
    assert.equal(verdict, 'closed', 'only server.timeout can end this connection within the bound');
  } finally {
    await service.stop();
  }
});

test('G15 the transcript is built once and shared: concurrent and later requests never rebuild it', { timeout: 30000 }, async () => {
  let builds = 0;
  const service = await startService({ transcript: async () => { builds += 1; await new Promise((resolve) => setImmediate(resolve)); return { kind: 'built-once', builds }; } });
  try {
    const answers = await Promise.all(Array.from({ length: 6 }, () => call(service.port, 'GET', '/transcript.json')));
    assert.deepEqual(answers.map((answer) => answer.json.builds), [1, 1, 1, 1, 1, 1]);
    assert.equal((await call(service.port, 'GET', '/transcript.json')).json.builds, 1);
    assert.equal(builds, 1, 'one build served every request');
  } finally {
    await service.stop();
  }
});

test('G16 the journal health reports the step journal tail that was discarded, and the preset journal tail', { timeout: 30000 }, async () => {
  const stepIo = createMemoryIo();
  const seeded = await startService({ stepIo });
  await call(seeded.port, 'POST', '/v1/presets', doc());
  const stepText = stepIo.read();
  const runText = seeded.runIo.read();
  await seeded.stop();
  const damagedSteps = createMemoryIo();
  damagedSteps.append(`${lines(stepText).slice(0, 5).join('')}{"seq":6,"prev":"torn`);
  const damagedRuns = createMemoryIo();
  damagedRuns.append(`${runText}{"seq":99,"pre`);
  const service = await startService({ stepIo: damagedSteps, runIo: damagedRuns });
  try {
    const health = (await call(service.port, 'GET', '/v1/journal')).json;
    assert.equal(health.stepJournalDiscardedTailBytes, '{"seq":6,"prev":"torn'.length, 'the step journal tail');
    assert.equal(health.discardedTailBytes, '{"seq":99,"pre'.length, 'the preset journal tail');
  } finally {
    await service.stop();
  }
});

test('T1 the timers and bounds are structure: the server object carries exactly the documented values, and every field of the bounds reaches its own setting', { timeout: 30000 }, async () => {
  const booted = await boot();
  const configured = (bounds) => {
    const server = createLocalServer({ engine: booted.real, runner: booted.runner, bounds });
    return {
      requestTimeout: server.requestTimeout, headersTimeout: server.headersTimeout, keepAliveTimeout: server.keepAliveTimeout, timeout: server.timeout,
      connectionsCheckingInterval: server.connectionsCheckingInterval, maxConnections: server.maxConnections, maxHeadersCount: server.maxHeadersCount,
      maxHeaderSize: server.maxHeaderSize, requireHostHeader: server.requireHostHeader,
    };
  };
  assert.deepEqual(configured(undefined), {
    requestTimeout: 5000, headersTimeout: 5000, keepAliveTimeout: 1000, timeout: 90000, connectionsCheckingInterval: 1000,
    maxConnections: 128, maxHeadersCount: 64, maxHeaderSize: 8192, requireHostHeader: false,
  });
  assert.deepEqual(configured({ requestMs: 11, headersMs: 12, keepAliveMs: 13, idleMs: 14, checkMs: 15, connections: 16, headerCount: 17, headerBytes: 18 }), {
    requestTimeout: 11, headersTimeout: 12, keepAliveTimeout: 13, timeout: 14, connectionsCheckingInterval: 15,
    maxConnections: 16, maxHeadersCount: 17, maxHeaderSize: 18, requireHostHeader: false,
  });
});

test('N6 bytes after an answer that closes the connection get no answer even from a writable socket, any other parse error gets the typed 400: the clientError listener on its own', { timeout: 30000 }, async () => {
  const booted = await boot();
  const server = createLocalServer({ engine: booted.real, runner: booted.runner });
  const socketOf = () => ({
    writable: true, destroyed: false, sent: [], pause() {}, destroy() { this.destroyed = true; }, end(buffer, done) { this.sent.push(buffer.toString('latin1')); done(); },
  });
  const closed = socketOf();
  server.emit('clientError', Object.assign(new Error('Data after Connection: close'), { code: 'HPE_CLOSED_CONNECTION' }), closed);
  assert.deepEqual([closed.sent, closed.destroyed], [[], true]);
  const garbled = socketOf();
  server.emit('clientError', Object.assign(new Error('Invalid method'), { code: 'HPE_INVALID_METHOD' }), garbled);
  assert.match(garbled.sent[0], /^HTTP\/1\.1 400 Bad Request\r\n/);
  assert.match(garbled.sent[0], /"code":"MALFORMED_REQUEST"/);
  assert.equal(garbled.destroyed, true);
});
