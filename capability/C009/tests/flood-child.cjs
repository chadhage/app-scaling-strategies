'use strict';

// Test tooling, not production code: a disposable server process for the stall probes. Start it with a small heap. It serves the real
// createApp on 127.0.0.1 port 0 and measures the delay of ITS OWN event loop (perf_hooks), so a stall is seen from the inside and not
// guessed from a client. Messages: 'reset' (clear the maximum), 'report' (maximum delay, open connections, revision), 'close'.
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { load } = require('./helpers.cjs');

const { createApp } = load('server.cjs');
const app = createApp();
const loop = monitorEventLoopDelay({ resolution: 10 });

app.server.listen(0, '127.0.0.1', () => {
  loop.enable();
  const tokens = Object.fromEntries(['visitor', 'conductor-a', 'operator'].map((name) => [name, app.issueToken(name)]));
  process.send({ type: 'listening', port: app.server.address().port, tokens });
});

process.on('message', (message) => {
  if (message === 'reset') {
    loop.reset();
    process.send({ type: 'reset' });
  } else if (message === 'report') {
    app.server.getConnections((error, connections) => process.send({
      type: 'report', maxDelayMs: Math.round(loop.max / 1e6), connections, revision: app.snapshot().revision
    }));
  } else if (message === 'close') {
    app.close().then(() => process.exit(0));
  }
});
