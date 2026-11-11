'use strict';

// Third share of the rows, server in THIS process (see pipeline-inproc-a.test.cjs): the closed role table and the failing id generator.
const { defineMatrix } = require('./matrix-suite.cjs');
const { startTarget } = require('./targets.cjs');

defineMatrix({ where: 'in this process', start: startTarget, plan: [['default', [2, 3]], ['closed', null], ['ids', null]] });
