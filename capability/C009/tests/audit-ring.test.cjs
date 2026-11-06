'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, send, withApp } = require('./helpers.cjs');

// Review finding F11: the ring of identified audit records was shared by every identified subject, so one visitor with a valid token
// evicted the record of every other identity with 200 denials. Each identified subject now has a ring of its own.
const contract = load('contract.js');
const denied = (context, token, command = 'run.create') => send(context, command, token, command === 'run.create' ? { name: 'x', units: 1 } : { size: 3 });

test('one subject that is denied again and again cannot evict the denial record of another identified subject', () => withApp({ app: { limits: { auditEntries: 5 } } }, async (context) => {
  const other = context.app.issueToken('conductor-b');
  const visitor = context.app.issueToken('visitor');
  assert.equal((await denied(context, other, 'pool.resize')).status, 403);
  for (let index = 0; index < 12; index += 1) assert.equal((await denied(context, visitor)).status, 403);
  const log = context.app.auditLog();
  assert.deepEqual(log.filter((entry) => entry.subject === 'conductor-b').map((entry) => [entry.code, entry.command]), [['ROLE_FORBIDDEN', 'pool.resize']], 'the denial of conductor-b survives the visitor flood');
  assert.equal(log.filter((entry) => entry.subject === 'visitor').length, 5, 'the visitor ring keeps only its own newest records');
  assert.deepEqual(log.map((entry) => entry.seq), log.map((entry) => entry.seq).sort((left, right) => left - right), 'the merged log stays in sequence order');
}));

test('with the shipped limits 210 denials of one visitor leave every other subject record in place', () => withApp({}, async (context) => {
  const other = context.app.issueToken('conductor-b');
  const visitor = context.app.issueToken('visitor');
  assert.equal((await denied(context, other, 'pool.resize')).status, 403);
  for (let index = 0; index < contract.limits.auditEntries + 10; index += 1) await denied(context, visitor);
  const log = context.app.auditLog();
  assert.equal(log.filter((entry) => entry.subject === 'conductor-b').length, 1);
  assert.equal(log.filter((entry) => entry.subject === 'visitor').length, contract.limits.auditEntries);
}));

test('the whole log stays bounded: at most one ring per identity of the closed identity table plus the anonymous ring', () => {
  const subjects = Object.keys(contract.identities).length;
  const bound = subjects * contract.limits.auditEntries + contract.limits.anonymousEntries;
  assert.ok(bound <= 1000, `the audit log never holds more than ${bound} records`);
});
