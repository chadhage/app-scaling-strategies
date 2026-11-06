'use strict';

// Fixture suite for the requalification runner: two passing tests.
const assert = require('node:assert/strict');
const test = require('node:test');

test('first fixture passes', () => assert.ok(true));
test('second fixture passes', () => assert.equal(1, 1));
