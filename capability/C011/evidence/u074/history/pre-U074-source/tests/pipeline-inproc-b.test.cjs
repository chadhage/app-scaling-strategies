'use strict';

// Second share of the rows, server in THIS process (see pipeline-inproc-a.test.cjs).
const { defineMatrix } = require('./matrix-suite.cjs');
const { startTarget } = require('./targets.cjs');

defineMatrix({ where: 'in this process', start: startTarget, plan: [['default', [1, 3]], ['timeout', null]] });
