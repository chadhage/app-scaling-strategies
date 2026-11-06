'use strict';

// Fixture suite for the requalification runner: every test is todo and would fail if it counted; node exits 0.
const test = require('node:test');

test('first todo fixture', { todo: true }, () => { throw new Error('failing but todo'); });
test('second todo fixture', { todo: 'later' }, () => { throw new Error('failing but todo'); });
