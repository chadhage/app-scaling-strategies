'use strict';

// Two guards of server.cjs that are defense in depth (found by the systematic mutants: removing either survived the whole suite, and a
// reachability argument is not an equivalence): a request whose connection was ENDED by the central refusal path (C009 endConnection marks
// the socket finished) while it was reading its body, or while it waited in the commit queue, has no effect and records nothing. The marking
// is done by construction from the test hooks, so the guards are exercised without a race, and nothing waits on a clock: the facts are read
// from the server's own state after the hook has fired and a few turns of the event loop have run (everything is in this process).
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { endConnection } = require('../../C009/http-io.cjs');
const { raw, startApp } = require('./helpers.cjs');

const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));

async function app(t, hooks) {
  const sockets = [];
  const ctx = await startApp({ app: { hooks: hooks(sockets) } });
  t.after(() => ctx.close());
  ctx.app.server.on('connection', (socket) => sockets.push(socket));
  return ctx;
}

// One raw client that stays connected until the test ends.
function open(t, ctx, bytes) {
  const socket = net.connect({ host: '127.0.0.1', port: ctx.port, allowHalfOpen: true });
  socket.on('error', () => {});
  socket.resume();
  socket.write(bytes);
  t.after(() => socket.destroy());
  return socket;
}

const create = (ctx, token, body) => raw.request(ctx.port, 'POST', '/v1/projects', { headers: [`Authorization: Bearer ${token}`, 'Content-Type: application/json'], body });

test('a request whose connection was ended while its body was read has no effect and no audit entry, even for a body that is invalid', { timeout: 30000 }, async (t) => {
  const armed = { value: false };
  const fired = deferred();
  const ctx = await app(t, (sockets) => ({ afterAuthorize: (info) => { if (armed.value && info.op === 'project.create') { endConnection(sockets.at(-1)); fired.resolve(); } } }));
  const { token } = await ctx.session('alf');
  const before = { world: ctx.world(), audit: JSON.stringify(ctx.app.auditLog('tenant-alder')) };
  armed.value = true;
  open(t, ctx, create(ctx, token, '{nope'));
  await fired.promise;
  for (let index = 0; index < 5; index += 1) await turn();
  assert.equal(ctx.world(), before.world);
  assert.equal(JSON.stringify(ctx.app.auditLog('tenant-alder')), before.audit, 'no refusal is recorded for a request whose connection ended');
});

test('a valid mutation whose connection was ended while it waited for the commit queue never commits', { timeout: 30000 }, async (t) => {
  const armed = { value: false };
  const fired = deferred();
  const ctx = await app(t, (sockets) => ({ beforeCommit: (info) => { if (armed.value && info.op === 'project.create') { endConnection(sockets.at(-1)); fired.resolve(); } } }));
  const { token } = await ctx.session('alf');
  armed.value = true;
  open(t, ctx, create(ctx, token, JSON.stringify({ name: 'ghost', units: 1 })));
  await fired.promise;
  armed.value = false;
  // The commit queue is serial: when this later mutation is answered, the ghost has had its turn.
  assert.equal((await ctx.call('POST', '/v1/projects', { token, body: { name: 'real', units: 1 } })).status, 201, 'the app still serves normal requests');
  assert.equal((await ctx.call('GET', '/v1/projects?q=ghost', { token })).json.count, 0, 'the mutation of the ended connection did not commit');
  assert.equal((await ctx.call('GET', '/v1/projects?q=real', { token })).json.count, 1);
});
