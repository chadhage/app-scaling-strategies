'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const model = require('../admission.js');
const source = require('../../C020/contract.js');
const inspector = require('../../C020/inspector.js');
const providers = require('../../C020/profiles.cjs');
const compatibility = require('../../C021/compatibility.js');
const ledger = require('../../C023/ledger.js');
const { candidate, command, adapterId } = require('./fixtures.cjs');

test('the model exports the unchanged C021 and C020 oldConsumer by identity', () => {
  assert.equal(model.oldConsumer, compatibility.oldConsumer);
  assert.equal(model.oldConsumer, inspector.oldConsumer);
});

for (const implementation of ['v1', 'v2']) {
  for (const profile of source.profiles) {
    for (const route of ['original-old', 'raw-new', 'explicit-adapter-old']) {
      test(`${implementation} ${profile.id} ${route} preserves actual provider semantics`, () => {
        const baseline = providers[implementation === 'v1' ? 'getProfileV1' : 'getProfileV2']({ profileId: profile.id });
        const value = candidate();
        value.implementation = implementation;
        value.profileId = profile.id;
        if (route !== 'original-old') value.data.apiContract = compatibility.newContract;
        if (route === 'raw-new') {
          value.data.consumerId = 'new-profile/2';
          value.data.consumerSchema = compatibility.newContract;
        } else if (route === 'explicit-adapter-old') value.data.adapterId = adapterId;
        const evidence = model.assessCandidate(JSON.stringify(value));
        assert.equal(evidence.status, 'eligible');
        assert.deepEqual(evidence.checks[0].semantics, inspector.oldConsumer(baseline));
        assert.deepEqual(evidence.checks[0].sourceStamp, baseline.stamp);
        assert.equal(evidence.checks[1].plannedEffects, 3);
        assert.deepEqual(evidence.checks[1].effectKinds, ledger.contract.effectKinds);
        assert.match(evidence.checks[1].evidenceKind, /not-real-queue-or-protocol-proof/);
        const session = model.createSession({ sessionId: 'session-provider' });
        session.dispatch(command(session, 'admit', value));
        const job = session.read().active.job;
        assert.equal(job.schema, ledger.contract.schema);
        assert.equal(job.plan.workVersion, ledger.contract.workVersion);
        assert.deepEqual(job.plan.source.profile, baseline.profile);
        assert.deepEqual(job.plan.source.stamp, baseline.stamp);
        assert.equal(ledger.inspect(job).counters.effectApplications, 3);
      });
    }
  }
}

test('getProfile/1 to new consumer is genuinely incompatible, not automatically adapted', () => {
  const value = candidate();
  value.data.consumerId = 'new-profile/2';
  value.data.consumerSchema = 'getProfile/2';
  assert.equal(model.assessCandidate(JSON.stringify(value)).code, 'DATA_INCOMPATIBLE');
  value.data.apiContract = 'getProfile/2';
  value.data.adapterId = adapterId;
  assert.equal(model.assessCandidate(JSON.stringify(value)).code, 'ADAPTER_NOT_APPLICABLE');
});

test('compatible implementation upgrade expands but retains original work and effect applications', () => {
  for (const profile of source.profiles) {
    const session = model.createSession({ sessionId: 'session-upgrade' });
    const value = candidate();
    value.profileId = profile.id;
    session.dispatch(command(session, 'admit', value));
    const originalJob = session.read().active.job;
    value.implementation = 'v2';
    const result = session.dispatch(command(session, 'expand', value));
    assert.equal(result.outcome, 'expanded');
    assert.equal(result.eligibility.checks[0].inputContract, 'getProfile/1');
    assert.equal(result.eligibility.checks[0].sourceStamp.implementationVersion, '2.0.0');
    assert.deepEqual(session.read().active.job, originalJob);
    assert.equal(session.read().counts.modeledEffectApplications, 3);
    assert.equal(originalJob.plan.source.stamp.implementationVersion, '1.0.0');
  }
});

test('the independent browser UMD uses the same unchanged models with identical local guard outcomes', () => {
  const context = vm.createContext({});
  const root = path.resolve(__dirname, '..', '..');
  for (const [card, name] of [['C020', 'contract.js'], ['C020', 'inspector.js'],
    ['C021', 'compatibility.js'], ['C023', 'ledger.js'], ['C048', 'admission.js']]) {
    vm.runInContext(fs.readFileSync(path.join(root, card, name), 'utf8'), context, { filename: `${card}\\${name}` });
  }
  context.candidateText = JSON.stringify(candidate());
  const value = vm.runInContext(`(() => {
    const session = C048Admission.createSession({ sessionId: 'session-parity' });
    const bad = JSON.parse(candidateText);
    bad.data.apiContract = 'getProfile/2';
    const blocked = session.dispatch({
      schema: 'C048/command/1', type: 'admit', requestId: 'request-blocked', expectedRevision: 0,
      candidateJSON: JSON.stringify(bad)
    });
    const accepted = session.dispatch({
      schema: 'C048/command/1', type: 'admit', requestId: 'request-good', expectedRevision: 1,
      candidateJSON: candidateText
    });
    return JSON.stringify({
      identity: C048Admission.oldConsumer === C021Compatibility.oldConsumer &&
        C048Admission.oldConsumer === C020Inspector.oldConsumer,
      blocked: blocked.code, accepted: accepted.outcome, state: session.read()
    });
  })()`, context);
  const actual = JSON.parse(value);
  assert.equal(actual.identity, true);
  assert.equal(actual.blocked, 'DATA_INCOMPATIBLE');
  assert.equal(actual.accepted, 'admitted');
  assert.equal(actual.state.counts.modeledEffectApplications, 3);
  assert.equal(actual.state.history[0].result.outcome, 'rejected');
});
