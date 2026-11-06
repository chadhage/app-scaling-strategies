'use strict';

// Test tooling, not production code: a fixture server in its own heap-limited process, so a memory reproduction can
// end only that process. It prints its automatic loopback port and exits when its stdin ends.
const { createLocalServer, closeServer } = require('../server.cjs');

const server = createLocalServer({ transcript: null });
server.listen(0, '127.0.0.1', () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));
process.stdin.on('end', () => closeServer(server).then(() => process.exit(0)));
process.stdin.resume();
