'use strict';

// C010 scenario "Every refusal closes the connection and nothing behind it runs", server in THIS process, third share of the rows (see
// pipeline-inproc-a.test.cjs).
const { defineMatrix } = require('./matrix-suite.cjs');
const { startTarget } = require('./targets.cjs');

defineMatrix({ where: 'in this process', start: startTarget, plan: [['default', [2, 3]]] });
