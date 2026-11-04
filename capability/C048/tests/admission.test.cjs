'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../admission.js');
const { candidate, command, adapterId } = require('./fixtures.cjs');

test('explicit getProfile/1 implementation v1 admits and runs exactly three modeled effects', () => {
  const session = model.createSession({ sessionId: 'session-001' });
  assert.equal(session.read().active, null);
  const result = session.dispatch(command(session, 'admit', candidate()));
  assert.equal(result.outcome, 'admitted');
  assert.equal(session.read().counts.admissions, 1);
  assert.equal(session.read().counts.modeledEffectApplications, 3);
});

test('raw getProfile/2 old DATA consumer actually blocks admission before state or effects', () => {
  const session = model.createSession({ sessionId: 'session-002' });
  const value = candidate();
  value.data.apiContract = 'getProfile/2';
  session.dispatch(command(session, 'admit', value));
  assert.equal(session.read().counts.admissions, 0, 'A bad DATA consumer must block the actual admission transition.');
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  assert.equal(session.read().active, null);
  assert.equal(session.read().history[0].result.code, 'DATA_INCOMPATIBLE');
});

test('incompatible EVENT consumer actually blocks expansion and retains the prior job', () => {
  const session = model.createSession({ sessionId: 'session-003' });
  session.dispatch(command(session, 'admit', candidate()));
  const admitted = session.read().active;
  const value = candidate();
  value.event.consumerWorkVersion = 'profile-effects/2';
  session.dispatch(command(session, 'expand', value));
  assert.equal(session.read().counts.expansions, 0, 'A bad EVENT consumer must block the actual expansion transition.');
  assert.equal(session.read().counts.modeledEffectApplications, 3);
  assert.deepEqual(session.read().active, admitted);
  assert.equal(session.read().history[1].result.code, 'EVENT_DECLARATION_MISMATCH');
});

test('unknown EVENT evidence never admits or applies a modeled effect', () => {
  const session = model.createSession({ sessionId: 'session-004' });
  const value = candidate();
  value.event.evidence = 'unknown';
  session.dispatch(command(session, 'admit', value));
  assert.equal(session.read().counts.admissions, 0, 'Unknown evidence is not a positive admission result.');
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  assert.equal(session.read().history[0].result.code, 'EVENT_EVIDENCE_UNKNOWN');
});

test('explicit C021 adapter admits getProfile/2 for unchanged old consumer', () => {
  const session = model.createSession({ sessionId: 'session-005' });
  const value = candidate();
  value.implementation = 'v2';
  value.data.apiContract = 'getProfile/2';
  value.data.adapterId = adapterId;
  const result = session.dispatch(command(session, 'admit', value));
  assert.equal(result.outcome, 'admitted');
  assert.equal(session.read().counts.admissions, 1);
  assert.equal(session.read().counts.modeledEffectApplications, 3);
});
