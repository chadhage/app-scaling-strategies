'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../matrix-contract.js');
const { validMatrix } = require('./fixtures.cjs');
const matrix = require('../matrix-data.js');
const approval = require('../../C001/approved-contract.js').approval;

function rejectMutation(name, mutate, expected) {
  test(name, () => {
    const value = validMatrix();
    mutate(value);
    const result = contract.validateMatrix(value);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(error => error.includes(expected)), result.errors.join(' | '));
  });
}

function extraRow(value) {
  const row = structuredClone(value.rows[0]);
  row.id = 'additional-row';
  row.firstPlannedNativeTarget = false;
  value.rows.push(row);
  return row;
}

test('a valid documented local matrix is accepted without granting native qualification', () => {
  assert.equal(typeof contract.validateMatrix, 'function');
  const result = contract.validateMatrix(validMatrix());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('published dataset validates and round-trips through JSON', () => {
  assert.deepEqual(contract.validateMatrix(matrix), { valid: true, errors: [] });
  assert.deepEqual(contract.validateMatrix(JSON.parse(JSON.stringify(matrix))), { valid: true, errors: [] });
  assert.equal(matrix.rows.length, 17);
});

test('dataset and nested values are immutable', () => {
  assert.ok(Object.isFrozen(matrix));
  assert.ok(Object.isFrozen(matrix.rows[0].constraints[0]));
  assert.throws(() => { matrix.permissions.deploymentApproved = true; }, TypeError);
  assert.throws(() => { matrix.rows.push({}); }, TypeError);
});

test('design matches the immutable C001 artifact, not a Linux native-target selection', () => {
  for (const key of ['runtime', 'framework', 'hosting']) assert.equal(matrix.design[key], approval[key]);
  assert.equal(matrix.design.firstNativeTarget, approval.firstNativeHost);
  assert.equal(matrix.design.testTooling, approval.testTooling.split(';')[0]);
  for (const key of contract.FLAG_KEYS) {
    assert.equal(matrix.permissions[key], approval[key]);
    assert.equal(matrix.permissions[key], false);
  }
  assert.ok(Object.values(matrix.design.target).every(value => value === null));
  const first = matrix.rows.filter(row => row.firstPlannedNativeTarget);
  assert.equal(first.length, 1);
  assert.equal(first[0].os, 'unapproved');
  assert.equal(first[0].status, 'planned');
  assert.equal(matrix.design.productionRuntimeValidated, false);
});

test('all five filter labels exist but no native or synthetic evidence qualifies any row', () => {
  assert.deepEqual(contract.STATUSES, ['planned', 'documented-supported', 'qualified', 'unsupported', 'unknown']);
  assert.ok(matrix.rows.every(row => !row.qualified && row.nativeEvidence.length === 0 && row.status !== 'qualified'));
  assert.ok(matrix.rows.every(row => row.adapter === 'planned' || row.adapter === 'not-applicable'));
  assert.deepEqual(Object.fromEntries(contract.STATUSES.map(status =>
    [status, matrix.rows.filter(row => row.status === status).length])),
  { planned: 2, 'documented-supported': 9, qualified: 0, unsupported: 4, unknown: 2 });
});

test('required platform boundaries are represented with first-party source references', () => {
  const constraintIds = new Set(matrix.rows.flatMap(row => row.constraints.map(constraint => constraint.id)));
  for (const id of ['shared-compute', 'strict-warmup', 'slot-lifecycle', 'no-linux-container-auto-swap',
    'automatic-scaling-slot-traffic', 'revisions-not-slots', 'aks-rollout-readiness', 'pdb-eviction-scope',
    'routing-controller-required', 'functions-slot-plan-limits', 'flex-update-limits', 'spring-boot-runtime-scope']) {
    assert.ok(constraintIds.has(id), id);
  }
  const sources = new Set(matrix.sources.map(source => source.id));
  for (const row of matrix.rows) {
    for (const source of row.sourceIds.concat(row.constraints.flatMap(constraint => constraint.sourceIds))) {
      assert.ok(sources.has(source));
    }
  }
  assert.ok(matrix.sources.every(source => new URL(source.url).hostname === 'learn.microsoft.com'));
});

test('documentation handoff is not native discovery or target approval', () => {
  assert.equal(matrix.provenance.documentationReview, 'researcher-documented');
  assert.match(matrix.provenance.reviewNote, /documentation review only/i);
  assert.equal(matrix.rows.find(row => row.id === 'aks-weighted-routing').status, 'unknown');
  assert.equal(matrix.rows.find(row => row.id === 'spring-boot-host-required').host, 'unselected');
  assert.match(matrix.rows.find(row => row.id === 'functions-flex-site-update').constraints[0].text, /not authoritative completion/);
});

for (const value of [null, [], undefined, 'matrix', false, 1]) {
  test('non-object input fails closed: ' + String(value), () => {
    assert.equal(contract.validateMatrix(value).valid, false);
    assert.deepEqual(contract.filterRows(value), []);
  });
}

rejectMutation('missing version is rejected', value => { delete value.schemaVersion; }, 'schemaVersion');
rejectMutation('future versions are rejected', value => { value.schemaVersion = '2.0.0'; }, 'schemaVersion');
rejectMutation('invented root fields are rejected', value => { value.runCommand = 'anything'; }, 'unexpected');
rejectMutation('wrong local scope is rejected', value => { value.scope = 'native'; }, 'scope');
rejectMutation('approval source drift is rejected', value => { value.provenance.approvalSourceCommit = '0'.repeat(40); }, 'approvalSourceCommit');
rejectMutation('reviewed sources need handoff provenance', value => { value.sources[0].verification = 'researcher-documented'; }, 'review provenance');
rejectMutation('invalid review timestamps are rejected', value => {
  value.provenance.documentationReview = 'researcher-documented';
  value.provenance.reviewedAtUtc = 'yesterday';
}, 'UTC timestamp');
rejectMutation('normalized impossible calendar dates are rejected', value => {
  value.provenance.documentationReview = 'researcher-documented';
  value.provenance.reviewedAtUtc = '2026-02-30T12:00:00Z';
}, 'UTC timestamp');
rejectMutation('Node22 cannot be promoted to production design', value => { value.design.runtime = 'Node.js 22'; }, 'design.runtime');
rejectMutation('production validation cannot be invented', value => { value.design.productionRuntimeValidated = true; }, 'productionRuntimeValidated');

for (const key of contract.FLAG_KEYS) {
  rejectMutation('permission stays false: ' + key, value => { value.permissions[key] = true; }, key);
}
for (const key of contract.TARGET_KEYS) {
  rejectMutation('concrete native target remains unapproved: ' + key, value => { value.design.target[key] = 'unapproved-choice'; }, 'design.target.' + key);
}
rejectMutation('live run allowance cannot be increased', value => { value.permissions.maximumLiveAzureRuns = 1; }, 'maximumLiveAzureRuns');
rejectMutation('spend allowance cannot be increased', value => { value.permissions.authorizedCloudSpend = 1; }, 'authorizedCloudSpend');
rejectMutation('nonboolean permission is rejected', value => { value.permissions.liveAzureExecutionApproved = 'false'; }, 'liveAzureExecutionApproved');
rejectMutation('native evidence cannot be invented', value => { value.rows[0].nativeEvidence = ['synthetic-lesson']; }, 'nativeEvidence');
rejectMutation('native qualification cannot be invented', value => { value.rows[0].qualified = true; }, 'qualified');
rejectMutation('qualified status is reserved, not available in local v1', value => { extraRow(value).status = 'qualified'; }, 'reserved');
rejectMutation('implementation cannot masquerade as an adapter', value => { value.rows[0].adapter = 'implemented'; }, 'adapter');
rejectMutation('empty matrices are rejected', value => { value.rows = []; }, 'rows');
rejectMutation('missing first target is rejected', value => { value.rows[0].firstPlannedNativeTarget = false; }, 'exactly one');
rejectMutation('multiple first targets are rejected', value => {
  const row = extraRow(value);
  row.firstPlannedNativeTarget = true;
}, 'exactly one');
rejectMutation('first target OS cannot be inferred from control API design', value => { value.rows[0].os = 'linux'; }, '.os');
rejectMutation('duplicate row identifiers are rejected', value => { extraRow(value).id = value.rows[0].id; }, 'duplicate identifier');
rejectMutation('unknown support labels are rejected', value => { value.rows[0].documentedSupport = 'probably'; }, 'documentedSupport');
rejectMutation('support and availability contradictions are rejected', value => {
  const row = extraRow(value);
  row.status = 'unknown';
}, 'must match');
rejectMutation('unsupported documentation cannot be hidden behind planned availability', value => {
  Object.assign(extraRow(value), { documentedSupport: 'unsupported', adapter: 'not-applicable' });
}, 'unsupported');
rejectMutation('unknown source references are rejected', value => { value.rows[0].sourceIds = ['not-a-source']; }, 'unknown source');
rejectMutation('duplicate source references are rejected', value => { value.rows[0].sourceIds.push(value.sources[0].id); }, 'duplicate source');
rejectMutation('duplicate source identifiers are rejected', value => { value.sources.push(structuredClone(value.sources[0])); }, 'duplicate identifier');
rejectMutation('JavaScript documentation links are rejected', value => { value.sources[0].url = 'javascript:alert(1)'; }, 'HTTPS Microsoft Learn');
rejectMutation('management URLs cannot be documentation links', value => { value.sources[0].url = 'https://management.azure.com/'; }, 'HTTPS Microsoft Learn');
rejectMutation('credential-bearing URLs are rejected', value => { value.sources[0].url = 'https://secret@learn.microsoft.com/azure/app-service'; }, 'HTTPS Microsoft Learn');
rejectMutation('missing constraint reasons are rejected', value => { value.rows[0].constraints[0].text = ' '; }, 'nonempty');
rejectMutation('unknown constraint sources are rejected', value => { value.rows[0].constraints[0].sourceIds = ['missing']; }, 'unknown source');
rejectMutation('duplicate constraint ids are rejected', value => { value.rows[0].constraints.push(structuredClone(value.rows[0].constraints[0])); }, 'duplicate constraint');
rejectMutation('unexpected row actions are rejected', value => { value.rows[0].run = true; }, 'unexpected');
rejectMutation('oversize matrices are rejected', value => { value.rows = Array(65).fill(value.rows[0]); }, '1..64');
rejectMutation('container hosts cannot imply code format', value => {
  const row = extraRow(value);
  row.host = 'aks';
}, 'container format');

for (const [name, mechanism, os, format] of [
  ['Linux auto-swap', 'native-auto-swap', 'linux', 'code'],
  ['container auto-swap', 'native-auto-swap', 'unspecified', 'container'],
  ['automatic scaling slot traffic', 'http-automatic-scaling-with-slot-traffic', 'unspecified', 'code'],
  ['Flex slots', 'flex-deployment-slots', 'unspecified', 'function-code']
]) {
  rejectMutation(name + ' cannot be marked supported', value => {
    Object.assign(extraRow(value), { mechanism, os, format, status: 'documented-supported' });
  }, 'unsupported');
}

test('all filters return exact matching rows without mutation', () => {
  const before = JSON.stringify(matrix);
  const rows = contract.filterRows(matrix, { host: 'app-service', format: 'code', status: 'unsupported', query: 'AUTO-SWAP' });
  assert.deepEqual(rows.map(row => row.id), ['app-service-linux-auto-swap']);
  assert.equal(JSON.stringify(matrix), before);
  assert.equal(contract.filterRows(matrix).length, 17);
});
test('qualification, incompatible filters, and unmatched text produce honest empty results', () => {
  assert.deepEqual(contract.filterRows(matrix, { status: 'qualified' }), []);
  assert.deepEqual(contract.filterRows(matrix, { host: 'aks', format: 'code' }), []);
  assert.deepEqual(contract.filterRows(matrix, { query: 'not-an-actual-platform' }), []);
  assert.equal(contract.filterRows(matrix, { host: 'container-apps', format: 'container' }).length, 2);
  assert.equal(contract.filterRows(matrix, { query: '  SPRING  ' }).length, 1);
});
test('invalid filters fail closed without evaluation', () => {
  for (const filters of [null, [], 'x', { host: 'imaginary' }, { format: 1 }, { status: 'success' },
    { query: 1 }, { query: 'a'.repeat(201) }, { run: true }]) {
    assert.deepEqual(contract.filterRows(matrix, filters), []);
  }
  assert.deepEqual(contract.filterRows(matrix, { query: '.*' }), []);
});
