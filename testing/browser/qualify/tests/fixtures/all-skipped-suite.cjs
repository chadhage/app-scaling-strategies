'use strict';

// Fixture suite for the requalification runner: every test is skipped, so nothing runs although node exits 0.
const test = require('node:test');

test('first skipped fixture', { skip: true }, () => { throw new Error('never runs'); });
test('second skipped fixture', { skip: 'on purpose' }, () => { throw new Error('never runs'); });
