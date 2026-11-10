'use strict';

// Second share of the rows, server in a SEPARATE process (see pipeline-process-a.test.cjs).
const { defineMatrix } = require('./matrix-suite.cjs');
const { startChildTarget } = require('./targets.cjs');

defineMatrix({ where: 'against a server process', start: (config) => startChildTarget(config), plan: [['default', [1, 3]], ['timeout', null]] });
