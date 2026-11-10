'use strict';

// The audit log: a ring per identified subject and a separate ring for refusals without an identity, so that one identity (or anonymous noise)
// can never evict another identity's records (C009 F5, F11); the log is chronological, unique and cannot be rewritten by a caller.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createAudit } = require('../audit.cjs');

const entry = (subject, code = 'ok') => ({ subject, role: subject === null ? null : 'conductor', route: 'lease.read', method: 'GET', outcome: code === 'ok' ? 'read' : 'refused', code });

test('each subject has its own ring and anonymous refusals have another: noise in one never evicts a record of another', () => {
  const audit = createAudit({ perSubject: 3, anonymous: 2 });
  audit.record(entry('conductor-a', 'TARGET_NOT_FOUND'));
  for (let index = 0; index < 20; index += 1) { audit.record(entry('visitor', 'ROLE_FORBIDDEN')); audit.record(entry(null, 'AUTHENTICATION_REQUIRED')); audit.record(entry('conductor-b')); }
  const log = audit.log();
  assert.equal(log.filter((item) => item.subject === 'visitor').length, 3);
  assert.equal(log.filter((item) => item.subject === 'conductor-b').length, 3);
  assert.equal(log.filter((item) => item.subject === null).length, 2);
  assert.equal(log.filter((item) => item.subject === 'conductor-a').length, 1, 'the one record of conductor-a survived');
  assert.deepEqual(log.map((item) => item.seq), [...log.map((item) => item.seq)].sort((first, second) => first - second), 'chronological');
  assert.equal(new Set(log.map((item) => item.seq)).size, log.length);
});

test('the ring keeps the LAST records, a record is frozen when stored, and the log hands out copies that cannot rewrite it', () => {
  const audit = createAudit({ perSubject: 2, anonymous: 1 });
  const stored = [1, 2, 3].map(() => audit.record(entry('conductor-a')));
  assert.ok(Object.isFrozen(stored[0]));
  assert.deepEqual(audit.log().map((item) => item.seq), [stored[1].seq, stored[2].seq]);
  const copy = audit.log();
  copy[0].code = 'FORGED';
  copy.push({ seq: 99 });
  assert.equal(audit.log()[0].code, 'ok');
  assert.equal(audit.log().length, 2);
  audit.record(entry(null, 'X'));
  audit.record(entry(null, 'Y'));
  assert.deepEqual(audit.log().filter((item) => item.subject === null).map((item) => item.code), ['Y']);
  assert.equal(createAudit({ perSubject: 1, anonymous: 1 }).log().length, 0);
});
