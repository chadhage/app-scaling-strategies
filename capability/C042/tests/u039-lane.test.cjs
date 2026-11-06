'use strict';

// U039, the third pipelining hole: a refusal that NODE decides itself (an unknown Expect with and without a body, a request without Host, a parse error,
// CONNECT) behind ZERO, ONE, TWO or THREE legitimate requests, in this process and in a SEPARATE server process, in HTTP/1.1 framing, with the legitimate
// requests in HTTP/1.0 framing and with everything in HTTP/1.0. The client gets the answers of the earlier requests IN ORDER, then the typed refusal; the
// SERVER ends the connection; nothing behind the refusal runs, and only a mutation that came BEFORE it is applied. The first fix dropped the queued
// earlier answers for a parse error and for CONNECT ([200,200,400] arrived as [200,400]). The structural test counts sockets, it asserts no time.
// RED replay: U039_SUBJECT=file:capability/C042/evidence/u039-pipelining/server.v2-first-fix.cjs.txt (the retained first fix) or U039_SUBJECT=v1.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { LANE_FRAMINGS, LANE_REFUSALS, LANE_SHAPES, laneApplies, laneName, mutation, reading } = require('./u039-rows.cjs');

const TIMEOUT = 900000;
const statuses = (result) => result.responses.map((item) => item.status ?? (item.partial === undefined ? 'garbage' : 'partial'));

let child = null;
test.before(async () => { child = await lib.startChild(); });
test.after(async () => { await child.stop(); });
const TARGETS = [{ name: 'in-process', start: (options) => lib.startInProcess(options) }, { name: 'separate-process', start: (options) => child.start(options) }];

async function trial(target, shape, refusal, framing) {
  const instance = await target.start({});
  try {
    const host = `127.0.0.1:${instance.port}`;
    const framed = (raw, version) => (version === '1.0' ? lib.asVersion(raw, '1.0', true) : raw);
    const legit = (kind) => framed(kind === 'G' ? reading(host) : mutation(host), framing.legit);
    const bytes = Buffer.concat([...shape.before.map(legit), framed(refusal.make(host), framing.refused), ...shape.after.map(legit)]);
    const before = await instance.state();
    const result = await lib.exchange(instance.port, [{ data: bytes }]);
    const after = await lib.settled(instance);
    return { result, mutated: JSON.stringify(before) !== JSON.stringify(after), expected: [...shape.before.map((kind) => (kind === 'G' ? 200 : 201)), refusal.status] };
  } finally {
    await instance.close();
  }
}

for (const target of TARGETS) {
  for (const framing of LANE_FRAMINGS) {
    for (const [shapeName, shape] of Object.entries(LANE_SHAPES)) {
      for (const [refusalName, refusal] of Object.entries(LANE_REFUSALS)) {
        if (!laneApplies(refusal, framing)) continue;
        test(laneName(target.name, framing.id, shapeName, refusalName), { timeout: TIMEOUT }, async () => {
          const got = await trial(target, shape, refusal, framing);
          assert.deepEqual(statuses(got.result), got.expected, 'the answers of the earlier requests in order, then the refusal; nothing after it');
          assert.equal(got.result.responses.at(-1).connection, 'close', 'the refusal says Connection: close');
          assert.equal(got.result.closedByServer, true, 'the SERVER ended the connection');
          assert.equal(got.mutated, shape.before.includes('P'), 'only a mutation that came BEFORE the refusal applied');
        });
      }
    }
  }
}

test('a burst of 128 sockets each sending [G][G][X] leaves no socket open and a legitimate GET is answered (the connection cap is not pinned)', { timeout: TIMEOUT }, async () => {
  const instance = await lib.startInProcess({});
  try {
    const host = `127.0.0.1:${instance.port}`;
    const bytes = Buffer.concat([reading(host), reading(host), LANE_REFUSALS['expect-get'].make(host)]);
    const peers = Array.from({ length: 128 }, () => {
      const socket = net.connect({ port: instance.port, host: '127.0.0.1', allowHalfOpen: true });
      const peer = { socket, chunks: [], closed: false };
      socket.on('data', (chunk) => peer.chunks.push(chunk));
      for (const event of ['error', 'close', 'end']) socket.on(event, () => { peer.closed = true; });
      socket.on('connect', () => socket.write(bytes));
      return peer;
    });
    // The bound is a liveness guard for a broken server (two minutes by default, 6 x U039_CLOSE_MS in the RED and mutant runs); what is asserted is the count of closed sockets.
    const bound = Math.max(lib.CLOSE_MS * 6, 9000);
    const closed = await lib.until(() => peers.every((peer) => peer.closed), 'every flooded socket was closed by the server', bound).then(() => true, () => false);
    assert.equal(closed, true, 'every socket of the burst was closed by the server');
    const open = await lib.until(async () => (await instance.connections()) === 0, 'no connection is left', bound).then(() => 0, () => -1);
    assert.equal(open, 0, 'the server holds no connection of the burst');
    const probe = await lib.exchange(instance.port, [{ data: reading(host) }], { answers: 1 });
    assert.equal(probe.responses[0]?.status, 200, 'a legitimate GET is answered');
    for (const peer of peers) {
      assert.deepEqual(statuses({ responses: lib.parseResponses(Buffer.concat(peer.chunks)) }).slice(0, 3), [200, 200, 417], 'each socket read both answers and the typed refusal');
      peer.socket.destroy();
    }
  } finally {
    await instance.close();
  }
});
