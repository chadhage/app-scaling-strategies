'use strict';

// Fixture suite for the requalification runner: a suite block without any test inside (node reports zero tests and exits 0).
const { describe } = require('node:test');

describe('a block that holds no test', () => {});
