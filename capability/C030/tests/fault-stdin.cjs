'use strict';

const fs = require('node:fs');

// Fault injection for cli.test.cjs: an unexpected failure without an error code while reading stdin.
fs.readSync = () => { throw new Error('stdin unavailable'); };
