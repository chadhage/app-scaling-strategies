'use strict';

// U040 (audit U038, lowest severity): a valid Upgrade plus a masked hello frame pipelined behind ANY refused request used to create
// a hub session, because Node emits `upgrade` for it although the refusal was just decided. Raw sockets, one TCP write per case,
// the fixture in this process AND in a separate node process, HTTP/1.1 and HTTP/1.0 framing. Every wait ends on an event or a bound.
const assert = require('node:assert/strict');
const test = require('node:test');
const framing = require('../framing.cjs');
const { createLocalServer, closeServer } = require('../server.cjs');
const { listen, upgradeRaw } = require('./support.cjs');
const { MODES, REFUSALS, sweep, startFixture, probe } = require('./u040-fixtures.cjs');
const { HELLO, wire, upgradeWithHello, exchange } = require('./u040-support.cjs');

for (const mode of MODES) {
  for (const spec of REFUSALS) {
    test(`${mode}: after a ${spec.name} nothing pipelined behind it upgrades or runs, in every form and both framings`, { timeout: 120000 }, async () => {
      const report = await sweep(mode, spec);
      assert.deepEqual(report.problems, [], `${report.applied} of ${report.variants} variants created a hub session`);
    });
  }

  test(`${mode}: the 15 refusal variants of the U038 audit (5 refusals x [R][M], [G][R][M], two writes) create no session`, { timeout: 120000 }, async () => {
    const applied = [];
    let variants = 0;
    for (const spec of REFUSALS.slice(0, 5)) {
      const fixture = await startFixture(mode, spec.transcript);
      try {
        for (const form of ['R,M', 'G,R,M', 'R then M after 5 ms']) {
          const result = await probe(fixture, { spec, form, rFraming: '1.1', mFraming: '1.1' });
          variants += 1;
          if (result.sessions > 0) applied.push(`${spec.name} ${form} answers ${JSON.stringify(result.statuses)}`);
        }
      } finally {
        await fixture.close();
      }
    }
    assert.equal(variants, 15);
    assert.deepEqual(applied, [], `${applied.length} of 15 variants created a session`);
  });

  test(`${mode}: fifty reads of /transcript.json pipelined behind a refusal in one write run none of them`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'ok');
    try {
      const refused = wire({ target: '/nope', host: fixture.host });
      const read = wire({ target: '/transcript.json', host: fixture.host });
      const result = await exchange(fixture.port, [{ data: Buffer.concat([refused, ...Array.from({ length: 50 }, () => read)]) }]);
      assert.deepEqual(result.statuses, [404]);
      assert.equal(result.closedByServer, true);
      assert.equal((await fixture.state()).transcripts, 0, 'a request behind the refusal reached the transcript producer');
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: a request pipelined behind a transcript answer is dropped when the answer succeeds, and nothing upgrades`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'ok');
    try {
      for (const framing of ['1.1', '1.0k']) {
        const transcript = wire({ target: '/transcript.json', host: fixture.host, framing });
        const result = await exchange(fixture.port, [{ data: Buffer.concat([transcript, upgradeWithHello(fixture.host, '1.1')]) }]);
        const state = await fixture.state();
        assert.deepEqual(result.statuses, [200], `${framing}: the answer comes from an await, so the connection ends after it`);
        assert.equal(result.responses[0].headers.connection, 'close', framing);
        assert.equal(result.closedByServer, true, framing);
        assert.equal(state.sessions, 0, `${framing}: an upgrade pipelined behind the pending answer created a session`);
      }
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: legitimate use is unchanged: a valid upgrade alone, and a valid GET followed by a valid upgrade, are served`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const alone = await exchange(fixture.port, [{ data: upgradeWithHello(fixture.host) }]);
      assert.deepEqual(alone.statuses, [101]);
      assert.equal(alone.closedByServer, false, 'the WebSocket stays open');
      assert.equal((await fixture.state()).sessions, 1);
      const get = wire({ target: '/scope.json', host: fixture.host });
      const piped = await exchange(fixture.port, [{ data: Buffer.concat([get, upgradeWithHello(fixture.host)]) }]);
      assert.deepEqual(piped.statuses, [200, 101]);
      assert.equal((await fixture.state()).sessions, 2);
    } finally {
      await fixture.close();
    }
  });

  test(`${mode}: controls that already held: an HTTP/1.0 refusal without keep-alive and a refused upgrade end the connection, nothing behind them is parsed`, { timeout: 60000 }, async () => {
    const fixture = await startFixture(mode, 'none');
    try {
      const upgrade = upgradeWithHello(fixture.host);
      const plain = await exchange(fixture.port, [{ data: Buffer.concat([wire({ target: '/nope', host: fixture.host, framing: '1.0' }), upgrade]) }]);
      assert.deepEqual(plain.statuses, [404]);
      assert.equal(plain.closedByServer, true);
      const old = Buffer.from(upgrade.toString('latin1').replace('Sec-WebSocket-Version: 13', 'Sec-WebSocket-Version: 8'), 'latin1');
      const refused = await exchange(fixture.port, [{ data: Buffer.concat([old, upgrade]) }]);
      assert.deepEqual(refused.statuses, [426]);
      assert.equal(refused.closedByServer, true);
      assert.equal((await fixture.state()).sessions, 0);
      const fresh = await exchange(fixture.port, [{ data: upgrade }]);
      assert.deepEqual(fresh.statuses, [101], 'a refusal marks its own connection only: the next connection upgrades');
      assert.equal((await fixture.state()).sessions, 1);
    } finally {
      await fixture.close();
    }
  });
}

const clientFrame = (opcode, payload) => framing.encodeFrame({ opcode, payload, maskKey: Buffer.from([1, 2, 3, 4]) });

async function pong(peer, text) {
  peer.send(clientFrame(framing.OPCODES.ping, text));
  for (let index = 0; index < 4; index += 1) {
    const frame = await peer.next();
    if (frame.type === 'pong') return frame.data.toString();
  }
  return null;
}

// The mark is per connection, not per module: two live fixtures in one process, a live WebSocket on the neighbour, a refusal with an
// upgrade pipelined behind it on the other, then both closed in each order and the first one closed twice.
for (const order of ['FIFO', 'LIFO']) {
  test(`two live instances in one process: a refusal on one never touches the other, closed ${order} and closed twice`, { timeout: 60000 }, async () => {
    const refusing = createLocalServer({ transcript: null });
    const neighbour = createLocalServer({ transcript: null });
    try {
      const refusingPort = await listen(refusing);
      const neighbourPort = await listen(neighbour);
      const live = await upgradeRaw(neighbourPort, { trailer: HELLO });
      assert.equal((await live.next()).text.includes('"type":"welcome"'), true);
      const host = `127.0.0.1:${refusingPort}`;
      const refused = await exchange(refusingPort, [{ data: Buffer.concat([wire({ target: '/nope', host }), upgradeWithHello(host)]) }]);
      assert.deepEqual(refused.statuses, [404]);
      assert.equal(refusing.hub.sessionCount(), 0);
      assert.equal(neighbour.hub.sessionCount(), 1, 'the neighbour kept its session');
      assert.equal(await pong(live, 'still here'), 'still here', 'the neighbour WebSocket is untouched by the refusal');
      const second = await exchange(neighbourPort, [{ data: upgradeWithHello(`127.0.0.1:${neighbourPort}`) }]);
      assert.deepEqual(second.statuses, [101], 'the neighbour still upgrades');
      assert.equal(neighbour.hub.sessionCount(), 2);
      if (order === 'FIFO') {
        await closeServer(refusing);
        await closeServer(refusing);
        assert.equal(await pong(live, 'after the first close'), 'after the first close', 'closing the refusing instance leaves the neighbour WebSocket open');
        await closeServer(neighbour);
        await closeServer(neighbour);
      } else {
        await closeServer(neighbour);
        await closeServer(neighbour);
        await live.ended();
        const still = await exchange(refusingPort, [{ data: wire({ target: '/scope.json', host }) }]);
        assert.deepEqual(still.statuses, [200], 'closing the neighbour leaves the refusing instance serving');
        await closeServer(refusing);
        await closeServer(refusing);
      }
    } finally {
      await closeServer(refusing);
      await closeServer(neighbour);
    }
  });
}
