'use strict';

// C010 scenario "Every refusal closes the connection and nothing behind it runs", server in a SEPARATE process, second share of the rows (see
// pipeline-process-a.test.cjs).
const { defineMatrix } = require('./matrix-suite.cjs');
const { startChildTarget } = require('./targets.cjs');

defineMatrix({ where: 'against a server process', start: (config) => startChildTarget(config), plan: [['default', [1, 3]], ['closed', null], ['ids', null]] });
