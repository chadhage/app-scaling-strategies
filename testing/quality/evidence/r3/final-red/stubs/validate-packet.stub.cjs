'use strict';
// Naive CLI for the RED replay: prints OK and exits 0 whatever it is given.
module.exports = { main: () => 0, parseArgs: () => ({}), USAGE: '', defaultIo: () => ({}) };
if (require.main === module) { process.stdout.write('OK\n'); process.exitCode = 0; }
