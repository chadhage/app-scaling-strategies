'use strict';

// Test tooling, not production code: a C026 fixture server in a small child process for U040. It prints its automatic loopback
// port, answers one JSON line per "state" line on stdin ({sessions, transcripts}) and exits when stdin ends.
// argv[2] is the transcript mode: none (route disabled), ok (answers at once) or fail (rejects); both count their calls.
const { createLocalServer, closeServer } = require('../server.cjs');

const mode = process.argv[2] ?? 'none';
const counters = { transcripts: 0 };
const transcripts = {
  none: null,
  ok: () => { counters.transcripts += 1; return Promise.resolve({ ok: true }); },
  fail: () => { counters.transcripts += 1; return Promise.reject(new Error('boom')); }
};
const server = createLocalServer({ transcript: transcripts[mode] });
server.listen(0, '127.0.0.1', () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));
let pending = '';
process.stdin.on('data', (chunk) => {
  pending += chunk;
  const lines = pending.split('\n');
  pending = lines.pop();
  for (const line of lines) {
    if (line.trim() === 'state') process.stdout.write(`${JSON.stringify({ sessions: server.hub.sessionCount(), transcripts: counters.transcripts })}\n`);
  }
});
process.stdin.on('end', () => closeServer(server).then(() => process.exit(0)));
