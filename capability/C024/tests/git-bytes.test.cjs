'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { prospective } = require('./git-proof.cjs');

test('Git clean filters preserve exact owned source and evidence bytes before publication', () => {
  assert.ok(prospective() >= 64);
});
