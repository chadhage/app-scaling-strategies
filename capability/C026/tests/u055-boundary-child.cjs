'use strict';

const { createLocalServer, closeServer, produceLocalTranscript } = require('../server.cjs');
const mode = process.argv[2];
const gates = [];
const limits = [];
const parsed = new Map();
let calls = 0;
const notify = (value) => { if (process.connected) process.send(value); };
const producer = mode === 'held' ? () => {
  calls += 1;
  return new Promise((resolve) => {
    gates.push(resolve);
    notify({ type: 'held', calls });
  });
} : () => { calls += 1; return produceLocalTranscript(); };
const server = createLocalServer({ transcript: producer });
server.prependListener('request', (request) => {
  const peer = request.socket.remotePort;
  parsed.set(peer, (parsed.get(peer) ?? 0) + 1);
});
server.on('limit', (event) => limits.push(event));
const state = (type, peer) => server.getConnections((error, connections) => {
  notify({ type, peer, connections: error ? -1 : connections, parsed: Object.fromEntries(parsed), limits: [...limits], calls, sessions: server.hub.sessionCount() });
});
server.on('connection', (socket) => {
  const peer = socket.remotePort;
  socket.on('data', () => setImmediate(() => state('barrier', peer)));
  socket.on('close', () => state('closed', peer));
});
server.listen(0, '127.0.0.1', () => notify({ type: 'ready', port: server.address().port }));
process.on('message', async (message) => {
  if (message.type === 'release') {
    for (const resolve of gates.splice(0)) resolve({ released: true });
    notify({ type: 'released' });
  } else if (message.type === 'state') state('state');
  else if (message.type === 'stop') {
    await closeServer(server);
    notify({ type: 'stopped' });
    process.disconnect();
  }
});
