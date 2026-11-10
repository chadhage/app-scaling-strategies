'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { call, connect, settleTurn, startService, until } = require('./net.cjs');

const OPTIONS = { timeout: 900000 };
const input = (key) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 1 });
const post = (port, key) => {
  const body = JSON.stringify(input(key));
  return `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
};
const statuses = (text) => [...text.matchAll(/HTTP\/1\.[01] (\d{3})/g)].map((match) => Number(match[1]));

for (const shape of ['alone', 'queued invalid body', 'queued foreign Host']) {
  test(`D2 checkContinue platform demonstration: ${shape} has the same ordered interim/final answers with or without the listener`, OPTIONS, async () => {
    const service = await startService({ hold: true });
    const b = connect(service.port);
    const queued = shape !== 'alone';
    const foreign = shape === 'queued foreign Host';
    try {
      const { port, held } = service;
      const expect = `POST /v1/steps HTTP/1.1\r\nHost: ${foreign ? 'foreign.example' : `127.0.0.1:${port}`}\r\nContent-Type: application/json\r\nContent-Length: 2\r\nExpect: 100-continue\r\n\r\n`;
      b.socket.write((queued ? post(port, 'equiv-slow-0001') : '') + expect);
      if (queued) {
        await held.entered('equiv-slow-0001');
        assert.equal((await call(port, 'GET', '/scope.json')).status, 200);
        for (let turn = 0; turn < 20; turn += 1) await settleTurn();
        assert.deepEqual(statuses(b.received()), [], 'Node buffers the queued interim response behind the held first response');
        held.release('equiv-slow-0001');
      }
      if (!foreign) {
        await until(() => statuses(b.received()).includes(100), 'the interim response reached the wire');
        b.socket.write('{}');
      }
      await b.closed;
      assert.deepEqual(statuses(b.received()), queued ? [201, 100, foreign ? 421 : 400] : [100, 400]);
      assert.match(b.received(), /Connection: close/i);
      assert.match(b.received(), foreign ? /LOCAL_HOST_REQUIRED/ : /REQUIRED_FIELD/);
      assert.equal(b.socket.destroyed, true);
    } finally {
      b.socket.destroy();
      service.held.release('equiv-slow-0001');
      await service.stop();
    }
  });
}

for (const order of ['FIFO', 'LIFO']) {
  test(`D2 closeServer platform demonstration: closeAllConnections closes idle, partial and active connections in ${order} order without touching a neighbour`, OPTIONS, async () => {
    const bounds = { firstRequestMs: 600000, requestMs: 600000, headersMs: 600000, idleMs: 600000 };
    const services = [];
    const clients = [];
    const pending = [];
    try {
      for (let index = 0; index < 3; index += 1) services.push(await startService({ hold: true, bounds }));
      for (let index = 0; index < 2; index += 1) {
        const service = services[index];
        const idle = connect(service.port);
        const partial = connect(service.port);
        clients[index] = [idle, partial];
        await Promise.all([idle, partial].map((client) => new Promise((resolve) => client.socket.once('connect', resolve))));
        partial.socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${service.port}\r\n`);
        pending[index] = call(service.port, 'POST', '/v1/steps', input('equiv-close-0001')).catch(() => null);
        await service.held.entered('equiv-close-0001');
      }
      const indices = order === 'FIFO' ? [0, 1] : [1, 0];
      for (const [position, index] of indices.entries()) {
        await services[index].stop();
        await Promise.all(clients[index].map((client) => client.closed));
        await pending[index];
        assert.equal(services[index].server.listening, false);
        assert.ok(clients[index].every((client) => client.socket.destroyed));
        await services[index].stop();
        assert.equal((await call(services[2].port, 'GET', '/scope.json')).status, 200, 'unrelated neighbour remains live');
        if (position === 0) {
          const other = indices[1];
          assert.equal((await call(services[other].port, 'GET', '/scope.json')).status, 200, 'the other owner remains live');
          assert.equal(services[other].server.engine.inspect('equiv-close-0001').body.step.state, 'in-flight');
        }
      }
    } finally {
      for (const list of clients) for (const client of list ?? []) client.socket.destroy();
      for (const service of services) {
        service.held.release('equiv-close-0001');
        await service.stop();
      }
      await Promise.all(pending);
    }
  });
}
