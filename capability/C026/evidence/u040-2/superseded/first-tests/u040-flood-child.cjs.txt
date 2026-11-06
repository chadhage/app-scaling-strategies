'use strict';

// Test tooling, not production code (U040 fix 2): the C026 fixture server in a child process, started by the parent with
// --max-old-space-size=48 for the flood probes. It prints its automatic loopback port as one JSON line, answers one JSON line per "state"
// line on stdin and exits when stdin ends. argv[2] is the transcript mode: none (route disabled), real (the default producer: a real
// WebSocket conversation), ok (answers at once), fail (rejects) or hold (never settles). The state is only counts: the sessions, the
// transcript calls, every limit event the server announced, the requests Node handed to the request listeners per client port, the open
// connections, and the heap figures (reported for the record, never asserted).
const { createLocalServer, closeServer } = require('./u040-target.cjs');

const mode = process.argv[2] ?? 'none';
const counters = { transcripts: 0 };
const producers = {
  none: null,
  real: undefined,
  ok: () => { counters.transcripts += 1; return Promise.resolve({ ok: true }); },
  fail: () => { counters.transcripts += 1; return Promise.reject(new Error('boom')); },
  hold: () => { counters.transcripts += 1; return new Promise(() => {}); }
};
const limitEvents = [];
const parsed = new Map();
let peak = 0;
setInterval(() => { peak = Math.max(peak, process.memoryUsage().heapUsed); }, 50).unref();

const server = createLocalServer({ transcript: producers[mode] });
server.prependListener('request', (request) => {
  const port = request.socket.remotePort;
  parsed.set(port, (parsed.get(port) ?? 0) + 1);
});
server.on('limit', (event) => limitEvents.push(event));
server.listen(0, '127.0.0.1', () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));

let pending = '';
process.stdin.on('data', (chunk) => {
  pending += chunk;
  const lines = pending.split('\n');
  pending = lines.pop();
  for (const line of lines) {
    if (line.trim() !== 'state') continue;
    server.getConnections((error, connections) => {
      const used = process.memoryUsage().heapUsed;
      process.stdout.write(`${JSON.stringify({
        sessions: server.hub.sessionCount(), transcripts: counters.transcripts, limitEvents, parsed: Object.fromEntries(parsed),
        connections: error ? -1 : connections, heapUsedMb: Math.round(used / 1048576), peakHeapUsedMb: Math.round(Math.max(peak, used) / 1048576)
      })}\n`);
    });
  }
});
process.stdin.on('end', () => closeServer(server).then(() => process.exit(0)));
