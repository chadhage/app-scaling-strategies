'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runProbe } = require('../model.js');
const { verifyProbe, describeImpact } = require('../verifier.js');

const candidateRoutes = [
  'join-preview', 'direct-ui', 'direct-api', 'indirect-navigation',
  'indirect-callback', 'indirect-gateway'
];
const ga = {
  sessionId: 'ga-session-001',
  subject: 'synthetic-ga-001',
  attribution: 'GA:synthetic-ga-001',
  version: 'v1'
};
const input = (overrides = {}) => ({
  identity: 'approved', route: 'join-preview', policy: 'enforced', callback: 'bound',
  ...overrides
});
const stages = (probe) => probe.trace.map((event) => event.stage);
const assertVerified = (probe) => {
  const verdict = verifyProbe(probe);
  assert.equal(verdict.passed, true, JSON.stringify(verdict.assertions));
  assert.ok(verdict.assertions.length >= 9, 'checks must cover more than admission alone');
  assert.ok(verdict.assertions.every((item) => item.passed));
};

test('approved join preserves modeled login/callback and separate GA attribution', () => {
  const probe = runProbe(input());
  assert.equal(probe.decision, 'allowed');
  assert.equal(probe.statusCode, 200);
  assert.equal(probe.candidateReached, true);
  assert.equal(probe.version, 'v2');
  assert.equal(probe.mode, 'synthetic');
  assert.equal(probe.nativeProof, false);
  assert.deepEqual(probe.ga, { before: ga, after: ga });
  assert.equal(probe.preview.before.subject, 'synthetic-preview-001');
  assert.equal(probe.preview.after.subject, probe.preview.before.subject);
  assert.equal(probe.preview.after.attribution, probe.preview.before.attribution);
  assert.equal(probe.preview.after.sessionId, 'preview-session-001');
  assert.deepEqual(probe.navigation, {
    loginPath: '/auth/login',
    callbackPath: '/auth/callback',
    returnPath: '/candidate-7f3b/profile',
    callbackBinding: 'bound',
    status: 'preserved'
  });
  assert.deepEqual(stages(probe), [
    'ga.baseline', 'preview.request', 'identity.evidence', 'login.request',
    'callback.validate', 'preview.authorize', 'preview.serve', 'ga.after', 'cleanup.scope'
  ]);
  assertVerified(probe);
  assert.equal(describeImpact(probe).preview, 'preview admitted');
});

for (const route of candidateRoutes) {
  test(`approved identity reaches v2 through ${route} with request authorization`, () => {
    const probe = runProbe(input({ route }));
    assert.equal(probe.decision, 'allowed');
    assert.equal(probe.candidateReached, true);
    assert.equal(probe.version, 'v2');
    assert.ok(stages(probe).includes('preview.authorize'));
    assertVerified(probe);
  });

  test(`visitor is forbidden through ${route} even with the obscure path`, () => {
    const probe = runProbe(input({ route, identity: 'visitor' }));
    assert.equal(probe.decision, 'forbidden');
    assert.equal(probe.statusCode, 403);
    assert.equal(probe.candidateReached, false);
    assert.equal(probe.version, null);
    assert.ok(stages(probe).includes('preview.block'));
    assert.ok(!stages(probe).includes('preview.serve'));
    assert.deepEqual(probe.ga.after, ga);
    assertVerified(probe);
    assert.equal(describeImpact(probe).preview, 'preview blocked');
    assert.equal(describeImpact(probe).unauthorizedExposure, false);
  });

  for (const identity of ['missing', 'unrecognized', 'unexpected']) {
    test(`${identity} identity fails closed through ${route}`, () => {
      const probe = runProbe(input({ route, identity }));
      assert.equal(probe.decision, 'unknown');
      assert.equal(probe.statusCode, 401);
      assert.equal(probe.candidateReached, false);
      assert.equal(probe.version, null);
      assertVerified(probe);
      assert.equal(describeImpact(probe).preview, 'preview unknown; access blocked');
    });
  }
}

for (const policy of ['enforced', 'obscurity-only']) {
  for (const identity of ['approved', 'visitor', 'missing', 'unrecognized']) {
    test(`ordinary navigation stays v1 for ${identity} under ${policy}`, () => {
      const probe = runProbe(input({ identity, policy, route: 'ordinary' }));
      assert.equal(probe.decision, 'ga');
      assert.equal(probe.version, 'v1');
      assert.equal(probe.candidateReached, false);
      assert.equal(probe.navigation.status, 'not-used');
      assert.ok(!stages(probe).includes('login.request'));
      assert.deepEqual(probe.ga.after, ga);
      assertVerified(probe);
      assert.equal(describeImpact(probe).preview, 'ordinary navigation on v1');
    });
  }
}

for (const route of ['join-preview', 'indirect-callback']) {
  for (const callback of ['missing', 'mismatch', 'external-return']) {
    test(`${route} rejects ${callback} callback evidence for an approved identity`, () => {
      const probe = runProbe(input({ route, callback }));
      assert.equal(probe.decision, 'callback-rejected');
      assert.equal(probe.statusCode, 400);
      assert.equal(probe.candidateReached, false);
      assert.equal(probe.navigation.status, 'rejected');
      assert.ok(!stages(probe).includes('preview.serve'));
      assert.deepEqual(probe.ga.after, ga);
      assertVerified(probe);
      assert.equal(describeImpact(probe).preview, 'preview blocked: callback rejected');
    });
  }
}

for (const overrides of [
  { route: 'made-up-route' }, { policy: 'made-up-policy' }, { callback: 'made-up-evidence' }
]) {
  test(`unrecognized configuration fails closed: ${JSON.stringify(overrides)}`, () => {
    const probe = runProbe(input(overrides));
    assert.equal(probe.decision, 'configuration-rejected');
    assert.equal(probe.statusCode, 400);
    assert.equal(probe.candidateReached, false);
    assert.equal(probe.version, null);
    assertVerified(probe);
  });
}

test('empty configuration is rejected and absent identity evidence never opts in', () => {
  assert.equal(runProbe().decision, 'configuration-rejected');
  const probe = runProbe({ route: 'direct-api', policy: 'enforced', callback: 'bound' });
  assert.equal(probe.decision, 'unknown');
  assert.equal(probe.candidateReached, false);
  assertVerified(probe);
});

for (const route of candidateRoutes) {
  for (const identity of ['visitor', 'missing', 'unrecognized']) {
    test(`obscurity-only exposes ${route} to ${identity}; verifier fails honestly`, () => {
      const probe = runProbe(input({ route, identity, policy: 'obscurity-only' }));
      assert.equal(probe.candidateReached, true);
      assert.equal(probe.version, 'v2');
      assert.equal(probe.automaticCandidatePercent, 0);
      const verdict = verifyProbe(probe);
      assert.equal(verdict.passed, false);
      assert.equal(verdict.assertions.find((item) => item.id === 'candidate-authorization').passed, false);
      const impact = describeImpact(probe);
      assert.equal(impact.unauthorizedExposure, true);
      assert.equal(impact.preview, 'unauthorized preview exposure');
      assert.equal(impact.gaUnchanged, true);
      assert.deepEqual(probe.ga.after, ga);
    });
  }
}

test('a direct handler does not invent a login redirect from irrelevant callback controls', () => {
  const probe = runProbe(input({ route: 'direct-api', callback: 'mismatch' }));
  assert.equal(probe.decision, 'allowed');
  assert.equal(probe.navigation.status, 'not-used');
  assertVerified(probe);
});

const corruptions = [
  ['GA attribution', (probe) => { probe.ga.after.attribution = 'PREVIEW:wrong-client'; }],
  ['both GA snapshots', (probe) => {
    probe.ga.before.subject = 'wrong-user';
    probe.ga.after.subject = 'wrong-user';
  }],
  ['preview callback subject', (probe) => { probe.preview.after.subject = 'different-user'; }],
  ['decision', (probe) => { probe.decision = 'forbidden'; }],
  ['status', (probe) => { probe.statusCode = 403; }],
  ['trace', (probe) => { probe.trace.splice(4, 1); }],
  ['native claim', (probe) => { probe.nativeProof = true; }],
  ['cleanup claim', (probe) => { probe.cleanup.resourcesCreated = 1; }]
];
for (const [label, corrupt] of corruptions) {
  test(`independent verifier detects corrupted ${label}`, () => {
    const probe = structuredClone(runProbe(input()));
    assert.equal(probe.decision, 'allowed');
    corrupt(probe);
    assert.equal(verifyProbe(probe).passed, false);
  });
}

test('fresh probes do not share mutable client state and leave no persistent resources', () => {
  const original = input();
  const first = runProbe(original);
  assert.equal(first.decision, 'allowed');
  first.ga.after.attribution = 'tampered-in-one-run';
  const second = runProbe(original);
  assert.deepEqual(second.ga.after, ga);
  assert.deepEqual(original, input());
  assert.equal(second.cleanup.status, 'not-required');
  assert.equal(second.cleanup.resourcesCreated, 0);
  assert.equal(second.cleanup.persistentStateCreated, false);
  assertVerified(second);
});
