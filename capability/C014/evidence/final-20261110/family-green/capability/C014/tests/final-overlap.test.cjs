'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');
const { createRedactor } = require('../redact.cjs');

test('G2 encodedIn sets aside the union of overlapping covering secrets without manufacturing an outside encoded occurrence', () => {
  const secrets = ['012345abcdef', 'abcdefABCDEF', 'abcdef'];
  const registry = new Map(secrets.map((secret) => [secret, canon.needlesFor(secret)]));
  const text = 'note 012345abcdefABCDEF end';
  assert.equal(canon.encodedIn(text, registry), false, 'the uppercase suffix belongs wholly to a verbatim covering secret');
  assert.equal(createRedactor({ secrets }).maskText(text), 'note [redacted] end', 'unrelated sentence text survives around the merged interval');
  assert.equal(canon.encodedIn(`${text} %61bcdef`, registry), true, 'an actually outside encoded occurrence still counts');
  assert.equal(createRedactor({ secrets }).maskText(`${text} %61bcdef`), '[redacted]');
});
