'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startChild, clients, within } = require('./resource-harness.cjs');

// The server runs in a child capped at 48 MB with a forced GC before each reading: its baseline is about 5 MB, so a retained
// heap above 24 MB means a client made the server keep memory. Every child is killed by PID if a hard timer fires.
const HEAP_LIMIT = 24 * 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function withChild(probe) {
  const server = startChild({ heapMb: 48, hardMs: 60000 });
  let net;
  try {
    const { port, tokens } = await server.receive('listening', 15000);
    net = clients(port);
    return await probe({ server, net, port, tokens, origin: `http://127.0.0.1:${port}` });
  } finally {
    if (net) net.destroyAll();
    server.stop();
  }
}

// After the attack a normal client and a normal authorized command must still be served, and the retained heap must be small.
async function assertServiceable({ server, origin, tokens }) {
  const { heapUsed } = await server.ask('stats', 'stats');
  assert.ok(heapUsed < HEAP_LIMIT, `retained heap ${heapUsed} must stay below ${HEAP_LIMIT}`);
  assert.equal((await fetch(`${origin}/v1/state`, { signal: AbortSignal.timeout(5000) })).status, 200, 'a normal client is still served');
  const resize = await fetch(`${origin}/v1/commands/pool.resize`, {
    method: 'POST', headers: { Authorization: `Bearer ${tokens.operator}`, 'Content-Type': 'application/json' }, body: '{"size":5}', signal: AbortSignal.timeout(5000)
  });
  assert.equal(resize.status, 200, 'a normal authorized command still works');
}

// The attackers are still connected: the CLI shutdown must end every socket and the process must exit by itself, code 0.
async function assertShutdown({ server }) {
  await server.ask('close', 'closed', 8000);
  const end = await within(server.exited, 'the server process ends by itself', 8000);
  assert.deepEqual([end.code, end.signal], [0, null], `the child exits cleanly: ${end.stderr}`);
}

test('pipelined floods that are never read cannot exhaust a small server process, and shutdown still ends it', () => withChild(async (context) => {
  const line = `GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n\r\n`;
  const flood = Buffer.from(line.repeat(20000));
  for (let index = 0; index < 16; index += 1) context.net.open(flood);
  await sleep(1500);
  await assertServiceable(context);
  await assertShutdown(context);
}));

test('silent, partial and half-open clients cannot keep the server alive or block its shutdown', () => withChild(async (context) => {
  const { net, port } = context;
  const host = `Host: 127.0.0.1:${port}`;
  for (let index = 0; index < 100; index += 1) net.open();
  for (let index = 0; index < 40; index += 1) net.open('GET /v1/sta');
  for (let index = 0; index < 40; index += 1) net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\nX-Partial: a`);
  for (let index = 0; index < 20; index += 1) {
    net.open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nContent-Type: application/json\r\nContent-Length: 4096\r\n\r\n{"size"`);
  }
  for (let index = 0; index < 20; index += 1) net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n\r\n`).end();
  await sleep(500);
  await assertServiceable(context);
  await assertShutdown(context);
}));

test('a header flood and an endless chunked upload are cut off without effect and without retained memory', () => withChild(async (context) => {
  const { net, port, tokens, origin } = context;
  const host = `Host: 127.0.0.1:${port}`;
  const flood = net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\n${'X-Pad: 1\r\n'.repeat(100000)}\r\n`, { read: true });
  const answer = await within(new Promise((resolve) => {
    let text = '';
    flood.on('data', (chunk) => { text += chunk; });
    flood.once('close', () => resolve(text));
  }), 'the header flood is answered and closed', 8000);
  assert.match(answer, /^HTTP\/1\.1 431 /);
  const upload = net.open(`POST /v1/commands/pool.resize HTTP/1.1\r\n${host}\r\nAuthorization: Bearer ${tokens.operator}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, { read: true });
  const cut = new Promise((resolve) => upload.once('close', resolve));
  for (let index = 0; index < 400; index += 1) upload.write('1\r\nx\r\n'.repeat(500));
  await within(cut, 'the endless chunked upload is cut off', 8000);
  const state = await (await fetch(`${origin}/v1/state`, { signal: AbortSignal.timeout(5000) })).json();
  assert.deepEqual([state.revision, state.state.pool.size], [0, 2], 'neither attack changed the state');
  await assertServiceable(context);
  await assertShutdown(context);
}));
