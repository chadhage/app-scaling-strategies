'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../admission.js');
const { candidate, command, adapterId } = require('./fixtures.cjs');

function refused(value, code) {
  const session = model.createSession({ sessionId: 'session-schema' });
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const result = session.dispatch(command(session, 'admit', text));
  assert.equal(result.outcome, 'rejected');
  assert.equal(result.code, code);
  const state = session.read();
  assert.equal(state.active, null);
  assert.equal(state.counts.admissions, 0);
  assert.equal(state.counts.expansions, 0);
  assert.equal(state.counts.modeledEffectApplications, 0);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].request.candidateJSON, text);
}

for (const field of ['schema', 'releaseId', 'implementation', 'profileId', 'data', 'event']) {
  test(`missing candidate ${field} fails closed`, () => {
    const value = candidate();
    delete value[field];
    refused(value, 'INVALID_CANDIDATE');
  });
}

for (const tier of ['data', 'event']) {
  for (const field of Object.keys(candidate()[tier])) {
    test(`missing ${tier}.${field} fails closed`, () => {
      const value = candidate();
      delete value[tier][field];
      refused(value, 'INVALID_CANDIDATE');
    });
  }
  for (const value of [null, false, 1, [], 'compatible']) {
    test(`non-record ${tier} ${JSON.stringify(value)} fails closed`, () => {
      const input = candidate();
      input[tier] = value;
      refused(input, 'INVALID_CANDIDATE');
    });
  }
}

for (const field of ['verdict', 'eligible', 'provenance', 'stamp', 'HTTPStatus', 'capacity', 'authorized', 'businessOutcome']) {
  test(`caller ${field} is not compatibility authority`, () => {
    const value = candidate();
    value[field] = field === 'provenance' ? { source: 'trusted', verdict: 'eligible' } : 'positive';
    refused(value, 'INVALID_CANDIDATE');
  });
}

for (const [name, mutate, code] of [
  ['unknown candidate schema', (v) => { v.schema = 'C048/candidate/2'; }, 'UNKNOWN_CANDIDATE_SCHEMA'],
  ['unknown implementation', (v) => { v.implementation = 'v3'; }, 'UNKNOWN_IMPLEMENTATION'],
  ['untrimmed implementation', (v) => { v.implementation = ' v2'; }, 'UNKNOWN_IMPLEMENTATION'],
  ['unknown profile', (v) => { v.profileId = 'synthetic-999'; }, 'UNKNOWN_PROFILE'],
  ['untrimmed profile', (v) => { v.profileId += ' '; }, 'UNKNOWN_PROFILE'],
  ['release identity type', (v) => { v.releaseId = 1; }, 'INVALID_RELEASE_ID'],
  ['release identity whitespace', (v) => { v.releaseId = ' release-001'; }, 'INVALID_RELEASE_ID'],
  ['release identity excessive length', (v) => { v.releaseId = `release-${'a'.repeat(21)}`; }, 'INVALID_RELEASE_ID'],
  ['unknown DATA schema', (v) => { v.data.apiContract = 'getProfile/9'; }, 'DATA_SCHEMA_UNKNOWN'],
  ['unknown DATA consumer', (v) => { v.data.consumerId = 'any-consumer'; }, 'DATA_CONSUMER_UNKNOWN'],
  ['old DATA declaration mismatch', (v) => { v.data.consumerSchema = 'getProfile/2'; }, 'DATA_DECLARATION_MISMATCH'],
  ['DATA evidence unknown', (v) => { v.data.evidence = 'unknown'; }, 'DATA_EVIDENCE_UNKNOWN'],
  ['HTTP200 is not DATA evidence', (v) => { v.data.evidence = 'HTTP200'; }, 'DATA_EVIDENCE_UNKNOWN'],
  ['unknown adapter', (v) => { v.data.adapterId = 'auto'; }, 'ADAPTER_UNKNOWN'],
  ['adapter repeated', (v) => { v.data.adapterId = `${adapterId}|${adapterId}`; }, 'ADAPTER_UNKNOWN'],
  ['adapter applied to getProfile/1', (v) => { v.data.adapterId = adapterId; }, 'ADAPTER_NOT_APPLICABLE'],
  ['unknown EVENT consumer', (v) => { v.event.consumerId = 'unregistered'; }, 'EVENT_CONSUMER_UNKNOWN'],
  ['EVENT consumer state mismatch', (v) => { v.event.consumerStateSchema = 'C023/2'; }, 'EVENT_DECLARATION_MISMATCH'],
  ['EVENT consumer work mismatch', (v) => { v.event.consumerWorkVersion = 'profile-effects/2'; }, 'EVENT_DECLARATION_MISMATCH'],
  ['EVENT state mismatch', (v) => { v.event.stateSchema = 'C023/2'; }, 'EVENT_SCHEMA_INCOMPATIBLE'],
  ['EVENT state unknown', (v) => { v.event.stateSchema = 'unknown'; }, 'EVENT_SCHEMA_INCOMPATIBLE'],
  ['EVENT source work mismatch', (v) => { v.event.workVersion = 'profile-effects/2'; }, 'EVENT_WORK_INCOMPATIBLE'],
  ['EVENT source work unknown', (v) => { v.event.workVersion = 'unknown'; }, 'EVENT_WORK_INCOMPATIBLE'],
  ['EVENT evidence unknown', (v) => { v.event.evidence = 'unknown'; }, 'EVENT_EVIDENCE_UNKNOWN'],
  ['native receipt not implemented', (v) => { v.event.evidence = 'queue-receipt'; }, 'EVENT_EVIDENCE_UNKNOWN'],
  ['extra DATA provenance', (v) => { v.data.provenance = 'eligible'; }, 'INVALID_CANDIDATE'],
  ['extra EVENT payload', (v) => { v.event.payload = { compatible: true }; }, 'INVALID_CANDIDATE'],
  ['coercive schema', (v) => { v.data.apiContract = 1; }, 'INVALID_CANDIDATE'],
  ['boolean evidence', (v) => { v.event.evidence = true; }, 'INVALID_CANDIDATE'],
  ['empty adapter is not none', (v) => { v.data.adapterId = ''; }, 'INVALID_CANDIDATE'],
  ['identifier field bound', (v) => { v.event.stateSchema = 'a'.repeat(129); }, 'INVALID_CANDIDATE']
]) {
  test(`${name} blocks actual admission`, () => {
    const value = candidate();
    mutate(value);
    refused(value, code);
  });
}

for (const text of ['', '{', '{"schema":', 'null', '[]', 'true', '1', '"eligible"']) {
  test(`invalid JSON or candidate root ${JSON.stringify(text)} rejects`, () => {
    refused(text, ['', '{', '{"schema":'].includes(text) ? 'INVALID_JSON' : 'INVALID_CANDIDATE');
  });
}

test('duplicate and escaped-duplicate JSON keys do not silently select a compatible version', () => {
  const text = JSON.stringify(candidate());
  for (const key of ['apiContract', '\\u0061piContract']) {
    refused(text.replace('"apiContract":"getProfile/1"', `"apiContract":"getProfile/2","${key}":"getProfile/1"`), 'INVALID_JSON');
  }
  refused(text.replace('"schema":"C048/candidate/1"', '"schema":"unknown","schema":"C048/candidate/1"'), 'INVALID_JSON');
});

test('JSON __proto__ and nested non-JSON field names reject without prototype pollution', () => {
  const text = JSON.stringify(candidate());
  refused(text.replace('"data":{', '"data":{"__proto__":{"eligible":true},'), 'INVALID_CANDIDATE');
  assert.equal({}.eligible, undefined);
});

test('candidate text is bounded and oversize cannot enter retained command state', () => {
  const session = model.createSession({ sessionId: 'session-text-bound' });
  const text = ' '.repeat(model.rules.maximumCandidateCharacters + 1);
  const result = session.dispatch(command(session, 'admit', text));
  assert.equal(result.code, 'INVALID_COMMAND');
  assert.equal(session.read().active, null);
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  assert.ok(session.read().history[0].request.invalidInput);
  assert.throws(() => model.parseCandidate(text), { code: 'INVALID_JSON' });
});

test('incompatible DATA and unknown EVENT are reported independently with no unknown-positive result', () => {
  const value = candidate();
  value.data.apiContract = 'getProfile/2';
  value.event.evidence = 'unknown';
  const evidence = model.assessCandidate(JSON.stringify(value));
  assert.equal(evidence.status, 'blocked');
  assert.deepEqual(evidence.checks.map((item) => [item.tier, item.status, item.code]), [
    ['DATA', 'blocked', 'DATA_INCOMPATIBLE'], ['EVENT', 'blocked', 'EVENT_EVIDENCE_UNKNOWN']
  ]);
  assert.deepEqual(evidence.notAssessed, model.rules.notAssessed);
});
