'use strict';

// U039 fix 4 (finding F1 of the review of 146d8f0): a client error for the request that is still reading its BODY (a bad chunk size, a missing CRLF after
// chunk data, a Content-Length body cut by the request timeout, a client FIN in the middle of the body) must get its typed answer and a closed connection.
// The committed fix 3 made the typed refusal wait for the lane entry of that very request, whose handler waits for a body that can never end: nothing was
// written, the connection stayed open until the 90 s idle timeout and 128 sockets of 114 bytes pinned the connection cap. The rows: the four failure kinds
// (and a chunk cut by a FIN) behind zero, one and two complete earlier requests, with and without Expect: 100-continue, in HTTP/1.1 and HTTP/1.0 framing,
// in this process and in a SEPARATE server process; a burst of 128 sockets; clients that send a partial body and leave. What is asserted is structure:
// the answers the client received, a closed connection, and the COUNT of server-side connections returning to zero through a bounded poll (the bound is a
// liveness guard for a broken server, never an assertion). RED replay: U039_SUBJECT=file:capability/C042/evidence/u039-incomplete-bodies/<retained fix 3 bytes>.
const assert = require('node:assert/strict');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { BODY_FRAMINGS, BODY_KINDS, BODY_SHAPES, TIMER_BOUNDS, bodyBytes, bodyName, burstName, leaversName, noConnections, peer, statusesOf } = require('./u039-body-rows.cjs');
const { reading } = require('./u039-rows.cjs');

const TIMEOUT = 900000;

let child = null;
test.before(async () => { child = await lib.startChild(); });
test.after(async () => { await child.stop(); });
const TARGETS = [{ name: 'in-process', start: (options) => lib.startInProcess(options) }, { name: 'separate-process', start: (options) => child.start(options) }];

async function trial(target, kindName, earlier, framing, expect) {
  const kind = BODY_KINDS[kindName];
  // A body that stops is ended by the request timeout, so its client waits longer than the one-second timer before the liveness guard gives up.
  const closeMs = kind.timer ? Math.max(lib.CLOSE_MS * 4, 6000) : lib.CLOSE_MS;
  for (let attempt = 1; ; attempt += 1) {
    const instance = await target.start({ bounds: kind.timer ? TIMER_BOUNDS : lib.QUIET });
    try {
      const bytes = bodyBytes(`127.0.0.1:${instance.port}`, { kind: kindName, earlier, version: framing.version, expect });
      const before = await instance.state();
      const client = peer(instance.port, bytes, { fin: kind.fin, closeMs });
      await client.done;
      // The client still holds its socket: a connection count of zero is the server's own doing.
      const free = await noConnections(instance);
      const answers = client.answers();
      const closed = client.closed;
      client.destroy();
      const after = await lib.settled(instance);
      // A machine that stalled for more than the whole request timeout before the server read the bytes times the connection out first: the client then
      // gets a lone 408 and none of the earlier answers. That is a stalled machine, not the rule under test, so the row is repeated (twice at most); a server
      // that really drops the earlier answers fails all three attempts.
      if (kind.timer && earlier > 0 && attempt < 3 && statusesOf(answers)[0] === 408) continue;
      return { answers, closed, free, mutated: JSON.stringify(before) !== JSON.stringify(after) };
    } finally {
      await instance.close();
    }
  }
}

for (const target of TARGETS) {
  for (const framing of BODY_FRAMINGS) {
    for (const [shape, earlier] of Object.entries(BODY_SHAPES)) {
      for (const expect of framing.expects) {
        for (const [kindName, kind] of Object.entries(BODY_KINDS)) {
          test(bodyName(target.name, framing.id, shape, kindName, expect), { timeout: TIMEOUT }, async () => {
            const got = await trial(target, kindName, earlier, framing, expect);
            assert.deepEqual(statusesOf(got.answers), [...Array(earlier).fill(200), kind.status], 'the answers of the earlier requests in order, then ONE typed refusal');
            const refusal = got.answers.at(-1);
            assert.equal(refusal.code, 'INVALID_FORMAT', 'the refusal is typed');
            assert.equal(refusal.connection, 'close', 'the refusal says Connection: close');
            assert.equal(got.closed, true, 'the SERVER ended the connection');
            assert.equal(got.free, true, 'the server holds no connection of the client');
            assert.equal(got.mutated, false, 'nothing was applied');
          });
        }
      }
    }
  }
}

// The cheapest attack of the class: 114 bytes per socket. The accepted parent answered every one of them; the committed fix 3 kept all 128 sockets for 90 s.
for (const target of TARGETS) {
  test(burstName(target.name), { timeout: TIMEOUT }, async () => {
    const instance = await target.start({ bounds: lib.QUIET });
    const host = `127.0.0.1:${instance.port}`;
    // The bound is a liveness guard for a broken server (two minutes by default, 6 x U039_CLOSE_MS in the RED and mutant runs); what is asserted is the count of closed sockets.
    const bound = Math.max(lib.CLOSE_MS * 6, 9000);
    const bytes = bodyBytes(host, { kind: 'bad-chunk-size', earlier: 0, version: '1.1', expect: false });
    const peers = Array.from({ length: 128 }, () => peer(instance.port, bytes, { closeMs: bound }));
    try {
      await Promise.all(peers.map((client) => client.done));
      const closed = peers.filter((client) => client.closed).length;
      const free = await noConnections(instance, 'the server holds no connection of the burst', bound);
      const probe = await lib.exchange(instance.port, [{ data: reading(host) }], { answers: 1 });
      assert.equal(closed, 128, 'every socket of the burst was closed by the server');
      assert.equal(free, true, 'the server holds no connection of the burst');
      assert.equal(probe.responses[0]?.status, 200, 'a legitimate GET is answered');
      for (const client of peers) assert.deepEqual(statusesOf(client.answers()), [400], 'each socket got its typed refusal');
    } finally {
      for (const client of peers) client.destroy();
      await instance.close();
    }
  });

  test(leaversName(target.name), { timeout: TIMEOUT }, async () => {
    const instance = await target.start({ bounds: lib.QUIET });
    const host = `127.0.0.1:${instance.port}`;
    const bound = Math.max(lib.CLOSE_MS * 3, 9000);
    const peers = ['short-body-fin', 'chunk-cut-fin'].flatMap((kind) => Array.from({ length: 4 }, () => peer(instance.port, bodyBytes(host, { kind, earlier: 0, version: '1.1', expect: false }), { fin: true, closeMs: bound })));
    try {
      await Promise.all(peers.map((client) => client.done));
      const closed = peers.filter((client) => client.closed).length;
      const free = await noConnections(instance, 'the server holds no connection of the clients that left', bound);
      assert.equal(closed, 8, 'the server closed every connection whose client left in the middle of a body');
      assert.equal(free, true, 'no slot is kept for an aborted upload');
      for (const client of peers) assert.deepEqual(statusesOf(client.answers()), [400], 'each client that still listens got its typed refusal');
    } finally {
      for (const client of peers) client.destroy();
      await instance.close();
    }
  });
}
