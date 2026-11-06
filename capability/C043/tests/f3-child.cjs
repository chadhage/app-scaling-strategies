'use strict';

// Test tooling, not production code: the REAL preset service (composeService + createLocalServer) over FILE journals in
// the directory given as the argument, in its own process. It prints one JSON line with its port; the test kills it hard.
const path = require('node:path');
const { composeService, createLocalServer } = require('../server.cjs');
const { createFileIo } = require('../../C042/journal.cjs');

(async () => {
  const directory = process.argv[2];
  const { engine, runner } = await composeService({ stepIo: createFileIo(path.join(directory, 'steps')), runIo: createFileIo(path.join(directory, 'runs')), clock: () => 0 });
  const server = createLocalServer({ engine, runner, transcript: null });
  server.listen(0, '127.0.0.1', () => process.stdout.write(`${JSON.stringify({ port: server.address().port })}\n`));
})().catch((error) => { process.stdout.write(`${JSON.stringify({ error: String(error && error.message) })}\n`); process.exitCode = 3; });
