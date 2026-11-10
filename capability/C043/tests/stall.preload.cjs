'use strict';

// Test tooling, not production code: a --require preload that stalls the event loop of the SERVER CHILD of the resource
// tests once per explicitly armed phase, with a busy wait of C043_STALL_MS milliseconds.
// It simulates a CORRECT server whose process the scheduler of a loaded machine did not run for that long (a bare
// 400-and-close server showed 11 s of lag there: L-0170), so a resource test that fails under it measures the machine.
// Only the child server is stalled; the attacker, the probes and the test process are untouched.
const net = require('node:net');
const path = require('node:path');
const { createStallObserver } = require('./u059-stall-observer.cjs');

const stallMs = Number(process.env.C043_STALL_MS ?? 0);
if (stallMs > 0 && /^child-server(?:-r3)?\.cjs$/.test(path.basename(process.argv[1] ?? ''))
    && path.dirname(path.resolve(process.argv[1])) === path.resolve(__dirname)) {
  const now = () => Number(process.hrtime.bigint() / 1000000n);
  const observer = createStallObserver({
    requestedTicks: stallMs, now,
    block(ticks) {
      const end = now() + ticks;
      while (now() < end) { /* injected test work, not a success criterion */ }
    },
  });
  const send = process.send;
  process.send = function observedSend(message, ...rest) {
    if (message?.type === 'listening') observer.arm();
    const observed = message?.type === 'stats' ? { ...message, stallObservation: observer.snapshot() } : message;
    return send.call(this, observed, ...rest);
  };
  process.prependListener('message', (message) => { if (message?.type === 'reset') observer.arm(); });
  const emit = net.Server.prototype.emit;
  net.Server.prototype.emit = function stalling(event, ...rest) {
    if (event === 'connection') observer.connection();
    return emit.call(this, event, ...rest);
  };
}
