'use strict';

// C010 scenario "Every refusal closes the connection and nothing behind it runs", server in THIS process, second share of the rows (see
// pipeline-inproc-a.test.cjs): the other half of the default config, the closed role table (deny by default) and the failing id generator.
const { defineMatrix } = require('./matrix-suite.cjs');
const { startTarget } = require('./targets.cjs');

defineMatrix({ where: 'in this process', start: startTarget, plan: [['default', [1, 3]], ['closed', null], ['ids', null]] });
