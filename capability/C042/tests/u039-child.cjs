'use strict';

// Test tooling, not production code (U039): the real service (or the archived accepted bytes, or a mutant: see u039-lib.cjs)
// in a SEPARATE process. Every `start` message makes a fresh service; the parent reads state, connections and CPU over IPC.
const { delayExecutor, openEngine } = require('../engine.cjs');
const { createMemoryIo } = require('../journal.cjs');
const lib = require('./u039-lib.cjs');

const subject = lib.loadSubject();
const instances = new Map();
const sockets = [];
let serial = 0;

async function start({ prefill = 0, settleMs = 0, transcript = null, bounds = lib.QUIET } = {}) {
  const io = createMemoryIo();
  if (prefill > 0) lib.prefillJournal(io, prefill);
  const engine = await openEngine({ io, executor: settleMs > 0 ? delayExecutor(settleMs) : undefined });
  const produce = transcript === 'fail' ? async () => { throw new Error('the transcript fails'); } : null;
  const server = subject.createLocalServer({ engine, transcript: produce, bounds });
  server.on('connection', (socket) => socket.once('close', () => sockets.push({ bytesRead: socket.bytesRead })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  serial += 1;
  instances.set(serial, { server, engine, io });
  return { instance: serial, port: server.address().port };
}

process.on('message', async (message) => {
  const found = instances.get(message.instance);
  const reply = (extra = {}) => process.send({ id: message.id, ...extra });
  if (message.type === 'start') reply(await start(message.options));
  else if (message.type === 'state') reply({ state: { snapshot: found.engine.snapshot(), journal: lib.sha256(found.io.read()) } });
  else if (message.type === 'connections') reply({ count: await new Promise((resolve) => found.server.getConnections((failure, count) => resolve(failure ? -1 : count))) });
  else if (message.type === 'close') { await subject.closeServer(found.server); instances.delete(message.instance); reply(); }
  else if (message.type === 'cpu') reply({ cpu: process.cpuUsage() });
  else if (message.type === 'sockets') reply({ sockets });
  else if (message.type === 'stop') {
    for (const item of instances.values()) await subject.closeServer(item.server);
    reply();
    process.disconnect();
  }
});

process.send({ id: 0, type: 'ready' });
