'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const lib = require('./u039-lib.cjs');
const { TIMER_BOUNDS, UPGRADE_BODY_KINDS, noConnections, peer, statusesOf } = require('./u039-body-rows.cjs');

let child;
test.before(async () => { child = await lib.startChild(); });
test.after(async () => { await child.stop(); });
const targets = [{ name: 'in-process', start: (options) => lib.startInProcess(options) }, { name: 'separate-process', start: (options) => child.start(options) }];

for (const target of targets) {
  for (const [name, kind] of Object.entries(UPGRADE_BODY_KINDS)) {
    test(`F1 ${target.name} ${name}: the documented Upgrade exception closes, releases its slot and applies nothing`, { timeout: 60000 }, async () => {
      const instance = await target.start({ bounds: kind.timer ? TIMER_BOUNDS : lib.QUIET });
      let client;
      try {
        const before = await instance.state();
        const bytes = Buffer.from(kind.make(`127.0.0.1:${instance.port}`), 'latin1');
        assert.match(bytes.toString('latin1'), /^POST \/v1\/steps HTTP\/1\.1\r\n/);
        assert.match(bytes.toString('latin1'), /Connection: Upgrade\r\nUpgrade: websocket\r\n/);
        client = peer(instance.port, bytes, { closeMs: 20000 });
        if (kind.fin) {
          await lib.until(() => client.socket.bytesWritten === bytes.length, 'all ten body bytes were written');
          await lib.until(async () => await instance.connections() === 1, 'the server accepted the pending socket');
          await instance.state();
          await new Promise((resolve) => setImmediate(resolve));
          assert.deepEqual(client.answers(), [], 'silence after the ten body bytes, before client FIN');
          client.socket.end();
        }
        await client.done;
        const free = await noConnections(instance);
        const answers = client.answers();
        assert.deepEqual(statusesOf(answers), kind.status === null ? [] : [kind.status]);
        if (kind.status !== null) {
          assert.equal(answers[0].code, 'INVALID_FORMAT');
          assert.equal(answers[0].connection, 'close');
        }
        assert.equal(client.closed, true, 'the server closed, not the cleanup');
        assert.equal(free, true, 'no connection slot remains');
        assert.deepEqual(await lib.settled(instance), before, 'no effect or journal change');
      } finally {
        client?.destroy();
        await instance.close();
      }
    });
  }
}
