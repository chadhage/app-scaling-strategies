'use strict';

// Test tooling, not production code: the server child of the third-round resource tests. It is tests\child-server.cjs plus
// two message hooks, registered first so that they run before the handlers of child-server.cjs:
// - 'stats' collects garbage first (the child is started with --expose-gc), so the heap a test reads is what is RETAINED
//   once the connections are gone, not requests that are still in flight (L-0144);
// - the bytes the server READ from every connection by the time it closed ('reads': the largest and the count), a structural
//   measure of how much a hostile client could make the server parse after a refusal (no duration, L-0170); 'reset' clears it.
const net = require('node:net');

const reads = [];
const emit = net.Server.prototype.emit;
net.Server.prototype.emit = function tracked(event, ...rest) {
  if (event === 'connection') {
    const [socket] = rest;
    socket.once('close', () => reads.push(socket.bytesRead));
  }
  return emit.call(this, event, ...rest);
};
process.on('message', (message) => {
  if (message?.type === 'stats') globalThis.gc?.();
  else if (message?.type === 'reset') reads.length = 0;
  else if (message?.type === 'reads') process.send({ type: 'reads', count: reads.length, max: Math.max(0, ...reads) });
});
require('./child-server.cjs');
