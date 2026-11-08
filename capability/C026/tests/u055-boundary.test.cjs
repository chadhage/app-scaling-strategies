'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { child, peer } = require('./u055-network.cjs');
const { wire } = require('./u040-support.cjs');
const limit = { code: 'DROPPED_REQUEST_BACKLOG', limit: 16 };
const pipeline = (port, count) => {
  const host = `127.0.0.1:${port}`;
  return Buffer.concat([
    wire({ host, target: '/transcript.json' }),
    ...Array.from({ length: count }, () => wire({ host, target: '/scope.json' }))
  ]);
};

for (const mode of ['real', 'held']) {
  test(`U055 n2 ${mode}: [T]+16 gives only [200]; [T]+17 loses the transcript itself and announces exactly once`, { timeout: 120000 }, async () => {
    const server = await child(mode);
    const sockets = [];
    try {
      const sixteen = await peer(server.port);
      sockets.push(sixteen.socket);
      sixteen.socket.write(pipeline(server.port, 16));
      const within = await server.wait((message) => message.type === 'barrier' && Number(message.parsed[sixteen.port]) === 17);
      assert.deepEqual(within.limits, []);
      if (mode === 'held') {
        assert.equal(within.connections, 1, 'a parsed-data barrier, not a timed hold, proves the connection is still open');
        server.send({ type: 'release' });
        await server.wait((message) => message.type === 'released');
      }
      assert.deepEqual(await sixteen.ended, [200]);
      await server.wait((message) => message.type === 'closed' && message.peer === sixteen.port);
      const seventeen = await peer(server.port);
      sockets.push(seventeen.socket);
      seventeen.socket.write(pipeline(server.port, 17));
      assert.deepEqual(await seventeen.ended, [], 'the transcript answer itself is lost');
      const over = await server.wait((message) => message.type === 'closed' && message.peer === seventeen.port);
      assert.deepEqual(over.limits, [limit]);
      assert.equal(over.connections, 0);
      assert.equal(over.sessions, 0);
      assert.equal(over.calls, 2, 'only the two first transcript requests reach the producer');
      assert.equal(Number(over.parsed[seventeen.port]), 18);
    } finally {
      for (const socket of sockets) socket.destroy();
      assert.deepEqual(await server.close(), { code: 0, signal: null });
    }
  });
}

test('U055 cleanup: injected assertion failure closes the exact owned child and a repeated close is harmless', { timeout: 120000 }, async () => {
  const server = await child('held');
  await assert.rejects((async () => {
    try { assert.fail('injected fixture-body failure'); } finally { await server.close(); }
  })(), { code: 'ERR_ASSERTION' });
  assert.deepEqual(server.exited(), { code: 0, signal: null });
  assert.deepEqual(await server.close(), { code: 0, signal: null });
  assert.equal(server.stderr(), '');
});

test('U055 minimum request: the 18-byte no-Host shape reaches the handler and is refused 421, not a successful page', { timeout: 120000 }, async () => {
  const server = await child('real');
  let socket;
  try {
    const connection = await peer(server.port);
    socket = connection.socket;
    const request = Buffer.from('GET / HTTP/1.1\r\n\r\n', 'latin1');
    assert.equal(request.length, 18);
    socket.write(request);
    assert.deepEqual(await connection.ended, [421]);
    const state = await server.wait((message) => message.type === 'closed' && message.peer === connection.port);
    assert.equal(Number(state.parsed[connection.port]), 1);
    assert.deepEqual(state.limits, []);
  } finally {
    socket?.destroy();
    assert.deepEqual(await server.close(), { code: 0, signal: null });
  }
});
