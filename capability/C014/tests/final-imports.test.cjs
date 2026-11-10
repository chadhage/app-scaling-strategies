'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { verify, verifyGit, LIFECYCLE } = require('./final-browser-imports.cjs');

test('the eight new owning API imports and unchanged sealed helper/qualifier match the actual accepted tag and immutable Git blobs', () => {
  assert.equal(LIFECYCLE.length, 8);
  assert.deepEqual(verify(), []);
  assert.deepEqual(verifyGit(), []);
});
