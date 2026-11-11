'use strict';

// Third share of the rows, server in a SEPARATE process (see pipeline-process-a.test.cjs): the closed role table and the failing id generator.
const { defineMatrix } = require('./matrix-suite.cjs');
const { startChildTarget } = require('./targets.cjs');

defineMatrix({ where: 'against a server process', start: (config) => startChildTarget(config), plan: [['default', [2, 3]], ['closed', null], ['ids', null]] });
