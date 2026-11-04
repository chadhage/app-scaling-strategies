'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fixtureSession } = require('./support.cjs');
async function mutate(change) {
  const session = await fixtureSession();
  const copy = session.getEvidence('complete');
  change(copy);
  return session.inspectText(JSON.stringify(copy));
}
const mutations = [
  ['caller eligible', (value) => { value.eligible = true; }],
  ['caller status', (value) => { value.status = 'ready'; }],
  ['caller expected context', (value) => { value.expectedContext = value.context; }],
  ['schema version', (value) => { value.schemaVersion = 2; }],
  ['numeric schema string', (value) => { value.schemaVersion = '1'; }],
  ['unknown model', (value) => { value.modelId = 'actual-pool'; }],
  ['unknown round', (value) => { value.roundId = 'fictional-C038-round-99'; }],
  ['invented node', (value) => { value.observations[0].instanceId = 'actual-server'; }],
  ['invented probe', (value) => { value.observations[0].probeId = 'ping'; }],
  ['probe from other original', (value) => { value.observations[0].originalId = 'fictional-C038-round-01'; }],
  ['wrong node id type', (value) => { value.observations[0].instanceId = 1; }],
  ['wrong tier type', (value) => { value.observations[0].tier = true; }],
  ['wrong API contract', (value) => { value.observations[0].version.apiContract = 'getProfile/2'; }],
  ['wrong deployment stamp', (value) => { value.observations[0].version.deploymentStamp = 'old'; }],
  ['wrong dependency version', (value) => { value.observations[1].dependency.version = 'other/2'; }],
  ['wrong inventory version', (value) => { value.inventory.instances[0].version.implementationVersion = '0.0.1'; }],
  ['omitted required-by node', (value) => { value.inventory.dependencies[0].requiredBy.pop(); }],
  ['unknown inventory field', (value) => { value.inventory.capacity = 2; }],
  ['duplicate inventory node', (value) => { value.inventory.instances[1] = structuredClone(value.inventory.instances[0]); }],
  ['wrong run', (value) => { value.observations[0].context.runId = 'synthetic-run-002'; }],
  ['wrong namespace', (value) => { value.observations[0].context.fixtureNamespace = 'other'; }],
  ['wrong digest', (value) => { value.observations[0].context.stateSha256 = '0'.repeat(64); }],
  ['epoch type', (value) => { value.observations[0].context.epoch = '3'; }],
  ['epoch version', (value) => { value.observations[0].context.epochVersion = 2; }],
  ['untrusted source', (value) => { value.source.kind = 'live-Azure'; }],
  ['per-node native source adoption', (value) => { value.observations[0].source.nativeFreshnessAttested = true; }],
  ['extra lease authority', (value) => { value.observations[0].context.leaseAuthority = true; }],
  ['wrong request', (value) => { value.observations[0].request.id = 'other-request'; }],
  ['wrong response request', (value) => { value.observations[0].response.requestId = 'other-request'; }],
  ['complete string', (value) => { value.observations[0].response.complete = 'true'; }],
  ['HTTP status string', (value) => { value.observations[0].response.httpStatus = '200'; }],
  ['HTTP status range', (value) => { value.observations[0].response.httpStatus = 600; }],
  ['unknown state value', (value) => { value.observations[0].response.state = 'healthy-by-default'; }],
  ['negative time', (value) => { value.observations[0].response.observedTick = -1; }],
  ['unbounded time', (value) => { value.observations[0].response.observedTick = 86400001; }],
  ['fractional time', (value) => { value.observations[0].response.observedTick = 95.1; }],
  ['clock TTL override', (value) => { value.clock.ttlTicks = 100; }],
  ['clock now override', (value) => { value.clock.nowTick = 99; }],
  ['huge observations', (value) => { value.observations.push(value.observations[0]); }],
  ['extra per-node field', (value) => { value.observations[0].callerEligible = true; }]
];
for (const [name, change] of mutations) {
  test(`${name} fails closed`, async () => {
    const result = await mutate(change);
    assert.equal(result.syntheticPoolReady, false);
    assert.equal(result.action, 'HOLD');
    assert.equal(result.actualPoolReady, false);
  });
}
test('missing nested fields never acquire defaults', async () => {
  const paths = [
    ['inventory', 'complete'], ['inventory', 'dependencies'], ['context', 'epochVersion'],
    ['context', 'stateSha256'], ['clock', 'nowTick'], ['clock', 'ttlTicks']
  ];
  for (const [parent, key] of paths) {
    const result = await mutate((value) => { delete value[parent][key]; });
    assert.equal(result.syntheticPoolReady, false, `${parent}.${key}`);
    assert.equal(result.decision, 'UNKNOWN');
  }
  for (const key of ['id', 'instanceId', 'probeId', 'tier', 'version', 'dependency', 'context', 'source', 'request', 'response']) {
    const result = await mutate((value) => { delete value.observations[0][key]; });
    assert.equal(result.syntheticPoolReady, false, key);
  }
});
test('unknown/future/ambiguous per-node clock and request order hold', async () => {
  for (const change of [
    (value) => { value.observations[0].response.clockId = 'distributed-other-clock'; },
    (value) => { value.observations[0].request.clockId = 'unknown'; },
    (value) => { value.observations[0].request.sentTick = 96; },
    (value) => { delete value.observations[0].response.observedTick; }
  ]) {
    assert.equal((await mutate(change)).syntheticPoolReady, false);
  }
});
test('duplicate JSON fields including escaped names are rejected before interpretation', async () => {
  for (const text of ['{"schemaVersion":1,"schemaVersion":1}', '{"a":1,"\\u0061":2}',
    '{"clock":{"nowTick":100,"nowTick":100}}']) {
    const session = await fixtureSession();
    const result = await session.inspectText(text);
    assert.equal(result.code, 'DUPLICATE_FIELD');
    assert.equal(result.syntheticPoolReady, false);
  }
});
test('unsafe finite/precision/negative-zero JSON literals and invalid UTF-8 cannot become ready', async () => {
  for (const token of ['1e400', '9007199254740993', '-0', '0.10000000000000001']) {
    const session = await fixtureSession();
    const result = await session.inspectText(`{"schemaVersion":${token}}`);
    assert.equal(result.code, 'UNSAFE_NUMBER_LITERAL', token);
  }
  const session = await fixtureSession();
  assert.equal((await session.inspectBytes(Uint8Array.from([0xc3, 0x28]))).code, 'INVALID_UTF8');
  assert.equal((await session.inspectBytes('not bytes')).code, 'UTF8_BYTES_REQUIRED');
});
test('bounded input, depth, extra/inherited-looking fields and exact one argument', async () => {
  const session = await fixtureSession();
  assert.equal((await session.inspectText(' '.repeat(65537))).code, 'INPUT_TOO_LARGE');
  assert.equal((await session.inspectText('{"x":'.repeat(18) + '1' + '}'.repeat(18))).code, 'JSON_DEPTH');
  assert.equal((await session.inspectText('{"__proto__":{"eligible":true}}')).syntheticPoolReady, false);
  assert.equal((await session.inspectText(Object.create({ observations: [] }))).code, 'JSON_TEXT_REQUIRED');
  assert.equal((await session.inspectText('{}', { expected: 'override' })).code, 'NO_CALLER_CONTEXT_VERDICT_OR_OVERRIDE');
  assert.throws(() => session.getEvidence('__proto__'), /UNKNOWN_FIXTURE_ID/);
  assert.throws(() => session.getEvidence('complete', {}), /UNKNOWN_FIXTURE_ID/);
});
test('complete UTF-8 bytes use exactly the same guarded transition', async () => {
  const session = await fixtureSession();
  const bytes = new TextEncoder().encode(JSON.stringify(session.getEvidence('complete')));
  const result = await session.inspectBytes(bytes);
  assert.equal(result.syntheticPoolReady, true);
  assert.equal(result.actualPoolReady, false);
});
