'use strict';

// Test tooling, not production code: a --require preload that stalls the event loop of the SERVER CHILD of the resource
// tests (tests\child-server*.cjs) once, at its first accepted connection, with a busy wait of C043_STALL_MS milliseconds.
// It simulates a CORRECT server whose process the scheduler of a loaded machine did not run for that long (a bare
// 400-and-close server showed 11 s of lag there: L-0170), so a resource test that fails under it measures the machine.
// Only the child server is stalled; the attacker, the probes and the test process are untouched.
const net = require('node:net');
const path = require('node:path');

const stallMs = Number(process.env.C043_STALL_MS ?? 0);
if (stallMs > 0 && /^child-server/.test(path.basename(process.argv[1] ?? ''))) {
  const emit = net.Server.prototype.emit;
  let stalled = false;
  net.Server.prototype.emit = function stalling(event, ...rest) {
    if (event === 'connection' && !stalled) {
      stalled = true;
      const end = process.hrtime.bigint() + BigInt(stallMs) * 1000000n;
      while (process.hrtime.bigint() < end) { /* not scheduled */ }
    }
    return emit.call(this, event, ...rest);
  };
}
