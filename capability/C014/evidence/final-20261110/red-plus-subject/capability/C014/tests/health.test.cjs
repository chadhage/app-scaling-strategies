'use strict';

// Fail-closed and two-instance behaviour of server.cjs. The C009 http-io.cjs file is imported read-only; a private copy of server.cjs is loaded with its
// canStopReading replaced, the way L-0031 and L-0073 do it, so no production file changes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startLocal } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call, exchange, build } = require('./harness.cjs');

const config = seedConfig();

function loadServerWith(canStopReading) {
  const ioPath = require.resolve('../../C009/http-io.cjs');
  const serverPath = require.resolve('../server.cjs');
  const saved = [require.cache[ioPath], require.cache[serverPath]];
  require.cache[ioPath] = { ...require.cache[ioPath], exports: { ...require(ioPath), canStopReading } };
  delete require.cache[serverPath];
  const fresh = require(serverPath);
  return {
    fresh,
    restore() {
      require.cache[ioPath] = saved[0];
      delete require.cache[serverPath];
      if (saved[1]) require.cache[serverPath] = saved[1];
    }
  };
}

test('fail closed at startup: where this Node cannot stop reading a refused connection, startLocal rejects, closes its listener and warns', async () => {
  const loaded = loadServerWith(() => false);
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning.code);
  process.on('warning', onWarning);
  try {
    await assert.rejects(loaded.fresh.startLocal({ config }), /READ_STOP_UNAVAILABLE/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(warnings.includes('C014_READ_STOP_UNAVAILABLE'));
  } finally { process.off('warning', onWarning); loaded.restore(); }
});

test('fail closed at the first connection: able at startup but not on a socket, the server serves nothing and says why', async () => {
  let calls = 0;
  const loaded = loadServerWith(() => { calls += 1; return calls === 1; });
  let local;
  try {
    local = await loaded.fresh.startLocal({ config });
    assert.deepEqual(local.health(), { ok: true, reason: null });
    const reply = await exchange(local.port, build('GET', '/scope.json', { port: local.port }), { settleMs: 1500 });
    assert.equal(reply.bytes.length, 0, 'not one byte is answered');
    assert.deepEqual(local.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' });
    const again = await exchange(local.port, build('GET', '/scope.json', { port: local.port }), { settleMs: 1500 });
    assert.equal(again.bytes.length, 0, 'later connections are refused too');
  } finally { if (local) await local.close(); loaded.restore(); }
});

test('two live servers in one process: separate secrets, separate state, closed in FIFO and in LIFO order, a repeated close, an unrelated neighbour untouched', async () => {
  const other = seedConfig();
  other.signingKey = `OTHER-SIGNING-${'k'.repeat(30)}`;
  const first = await startLocal({ config });
  const second = await startLocal({ config: other });
  const neighbour = await startLocal({ config });
  try {
    await call(first.port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-a'], body: { name: 'only-in-first', units: 1 } });
    assert.equal((await call(first.port, 'GET', '/v1/evidence/runs')).json().total, 1);
    assert.equal((await call(second.port, 'GET', '/v1/evidence/runs')).json().total, 0, 'state is per instance');
    const sign = async (local) => (await call(local.port, 'GET', '/v1/evidence/bundle')).json().signature.value;
    assert.notEqual(await sign(first), await sign(second), 'each instance signs with its own key');
    await first.close();
    assert.equal((await call(second.port, 'GET', '/scope.json')).status, 200, 'FIFO: the second still serves');
    await second.close();
    await second.close();
    await first.close();
    assert.equal((await call(neighbour.port, 'GET', '/scope.json')).status, 200, 'the neighbour is untouched by every close');
    const third = await startLocal({ config });
    const fourth = await startLocal({ config });
    await fourth.close();
    assert.equal((await call(third.port, 'GET', '/scope.json')).status, 200, 'LIFO: closing the last started leaves the earlier one serving');
    await third.close();
    assert.notEqual(third.port, fourth.port);
  } finally { await Promise.all([first.close(), second.close(), neighbour.close()]); }
});

test('service objects are separate too: a token issued by one instance is unknown to the other', async () => {
  const first = await startLocal({ config });
  const second = await startLocal({ config });
  try {
    const token = first.service.issueToken('operator');
    assert.equal((await call(first.port, 'GET', '/v1/manage/config', { token })).status, 200);
    const unknown = await call(second.port, 'GET', '/v1/manage/config', { token });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.json().error.code, 'TOKEN_UNKNOWN');
  } finally { await Promise.all([first.close(), second.close()]); }
});
