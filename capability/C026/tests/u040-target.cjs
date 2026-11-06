'use strict';

// Test tooling, not production code (U040 fix 2): the server module under test. By default it is ..\server.cjs. The environment
// variable U040_SERVER_MODULE (a path to another copy of server.cjs, relative to the working directory or absolute) selects another
// copy, so that the same tests run against the committed bytes before the fix, against the pre-U040 bytes (the control) and against
// one mutant at a time without touching the namespace. The copy must sit in a tree that has its own framing.cjs, stream.cjs,
// conversation.cjs and ..\C001 imports.
const path = require('node:path');

const override = process.env.U040_SERVER_MODULE;
const modulePath = override ? path.resolve(override) : path.join(__dirname, '..', 'server.cjs');

module.exports = Object.freeze({ ...require(modulePath), modulePath, overridden: Boolean(override) });
