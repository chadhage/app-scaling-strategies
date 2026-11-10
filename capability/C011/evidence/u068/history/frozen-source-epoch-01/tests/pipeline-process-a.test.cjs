'use strict';

// Scenario "Every refusal closes the connection and nothing behind it runs", server in a SEPARATE process (a small heap, a watchdog, the real clock),
// first share of the rows: the attacker and the server cannot share an event loop, so a stall or a request that ran behind a refusal cannot hide.
// The other shares are pipeline-process-b/c.test.cjs.
const { defineMatrix } = require('./matrix-suite.cjs');
const { startChildTarget } = require('./targets.cjs');

defineMatrix({ where: 'against a server process', start: (config) => startChildTarget(config), plan: [['default', [0, 3]], ['bounds', null], ['replay', null]] });
