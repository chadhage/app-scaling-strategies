'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = require('..\\source.cjs');
const contract = require('..\\..\\C020\\contract.js');
const providers = require('..\\..\\C020\\profiles.cjs');
const inspector = require('..\\..\\C020\\inspector.js');
const ledger = require('..\\..\\C023\\ledger.js');
const evaluator = require('..\\evaluator.js');
const repository = path.resolve(__dirname, '..', '..', '..');

test('22 current working sources and immutable accepted Git blobs match distinct raw/CRLF-to-LF/Git pins', () => {
  const proof = source.checkHistorical();
  assert.equal(proof.imports.length, 22);
  const profile = proof.imports.find((entry) => entry.path.endsWith('C020\\profiles.cjs'));
  assert.equal(profile.rawEqualsGit, false);
  assert.notEqual(profile.rawSha256, profile.acceptedGitSha256);
  assert.equal(profile.crlfToLfSha256, profile.acceptedGitSha256);
  const journey = proof.imports.find((entry) => entry.path.endsWith('C033\\journey.js'));
  assert.equal(journey.rawEqualsGit, true);
  assert.notEqual(journey.rawSha256, journey.crlfToLfSha256);
});

test('current literal local consent and C020/C023/C033 independent Done acceptance, optional decoder acceptance', () => {
  const gates = source.readGates();
  assert.equal(gates.literalLocalConsent, true);
  assert.equal(gates.readHandlesClosedBeforeRelease, true);
  assert.deepEqual(gates.cards.map((card) => card.id), ['C020', 'C023', 'C033', 'C034']);
  for (const card of gates.cards) {
    assert.equal(card.state, 'Done');
    assert.deepEqual(card.publication, source.pins.accepted[card.id]);
    assert.equal(card.accepted, true);
  }
});

test('both unchanged accepted C020 providers retain exact old-consumer values and compatible stamps', () => {
  for (const profile of contract.profiles) {
    const v1 = providers.getProfileV1({ profileId: profile.id });
    const v2 = providers.getProfileV2({ profileId: profile.id });
    assert.equal(inspector.compare(v1, v2, profile.id).compatible, true);
    assert.deepEqual(v1.profile, profile);
    assert.deepEqual(v2.profile, profile);
    assert.equal(v1.stamp.implementationVersion, '1.0.0');
    assert.equal(v2.stamp.implementationVersion, '2.0.0');
  }
  assert.equal(ledger.contract.effectKinds.length, 3);
  assert.match(ledger.contract.atomicity, /atomic pair/);
});

test('original raw signed browser evidence really held zero requests before first, one acknowledgment between reads', () => {
  const pin = source.pins.dependencies.find((entry) => entry.path.endsWith('summary.json'));
  const report = JSON.parse(source.readPinned(pin));
  const first = report.checks[2].observed;
  const between = report.checks[3].observed;
  assert.equal(first.before.state.requests, 0);
  assert.equal(first.after.state.requests, 0);
  assert.equal(first.actualServerRequestsHeld, 0);
  assert.ok(first.actualElapsedDelta > 0);
  assert.ok(first.actualPausedDelta > 0);
  assert.deepEqual(first.before.state.original, first.after.state.original);
  assert.equal(between.before.state.requests, 1);
  assert.equal(between.before.state.responses, 1);
  assert.equal(between.after.state.acknowledgements.length, 1);
  assert.equal(between.actualServerRequestsHeld, 1);
  assert.equal(between.after.state.acknowledgements[0].stamp.implementationVersion, '1.0.0');
  const slow = report.checks[4].observed;
  assert.equal(slow.originalBudgetMs, 1000);
  assert.equal(slow.held.state.budgetExceeded, true);
  assert.equal(slow.held.state.requests, 0);
  assert.ok(slow.held.state.sampledAt >= slow.originalDeadline);
  assert.equal(evaluator.evaluateSaved('closed-history').originals[2].deadline, slow.originalDeadline);
});

test('actual HTTP/browser driver is pinned read-only; browser bundle is the exact existing saved decoder artifact', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /\.\.\/C034\/evidence\/raw\/trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116\/bundle\.js/);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'bundle.json')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'bundle.js')), false);
  const helper = fs.readFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(source.hash(helper), source.pins.browserHelperRawSha256);
});

test('historical source proof does not contain or enforce a live private publisher hash', () => {
  assert.equal(Object.hasOwn(source.pins, 'publisherSha256'), false);
  assert.ok(source.pins.dependencies.every((pin) => !pin.path.includes('.git')));
  assert.throws(() => source.readPinned({ path: '.git\\kanban-orchestrator\\publish.ps1' }), { code: 'CLOSED_SOURCE_PIN' });
  assert.throws(() => source.checkImports({ source: 'trusted' }), { code: 'NO_SOURCE_OVERRIDES' });
  assert.throws(() => source.readGates({ approval: true }), { code: 'NO_GATE_OVERRIDES' });
});

test('publication validates separate current canonical history only; normal test never reads current private publisher', () => {
  const { policy, validateAuthorization } = require('..\\publisher-policy.cjs');
  const value = {
    id: policy.authorizationId, approvedBy: 'parent-controller', publisherSha256: policy.approvedPublisherSha256,
    focusedGuardChecksPassed: 51, mainMustEqualRemoteBeforeStaging: true,
    namespaceAndFrozenClassGuardsUnchanged: true, syntaxPassed: true, originalKanoCredit: 0,
    cloudAuthorityExpanded: false,
    budgetAndGoalRevision: {
      publisherSha256: policy.approvedPublisherSha256, previousPublisherSha256: policy.historicalPredecessorSha256,
      focusedGuardChecksPassed: 51, namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained: true,
      cloudIdentityOrInfrastructureAuthorityExpanded: false, onlyTwoExactClassTokensChanged: true,
      approvedBy: 'parent-controller', exactAddedClasses: { C029: 'D', X003: 'L' },
      ownedNamespaces: ['capability\\C029', 'capability\\X003'], extraCredits: 0
    }
  };
  assert.equal(validateAuthorization(JSON.stringify(value)).allowed, true);
  for (const change of [
    (copy) => { copy.publisherSha256 = '0'.repeat(64); },
    (copy) => { copy.budgetAndGoalRevision.previousPublisherSha256 = '0'.repeat(64); },
    (copy) => { copy.budgetAndGoalRevision.exactAddedClasses.C029 = 'S'; },
    (copy) => { copy.budgetAndGoalRevision.ownedNamespaces[0] = 'capability'; },
    (copy) => { copy.namespaceAndFrozenClassGuardsUnchanged = 'true'; },
    (copy) => { copy.mainMustEqualRemoteBeforeStaging = false; },
    (copy) => { copy.eligible = true; }
  ]) {
    const modified = JSON.parse(JSON.stringify(value));
    change(modified);
    assert.throws(() => validateAuthorization(JSON.stringify(modified)));
  }
  assert.throws(() => validateAuthorization(JSON.stringify(value), { hash: 'trusted' }));
});
