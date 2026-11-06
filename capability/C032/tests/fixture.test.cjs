'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const contract = require('../contract.js');
const { CURRENT_EPOCH, FixtureError, createWorld, issuedCredentials } = require('../fixture.cjs');
const { credentials } = require('./support.cjs');

function failure(call) {
  try { call(); } catch (error) { return error; }
  assert.fail('expected a FixtureError');
}

test('valid synthetic credentials identify exactly their own client', () => {
  const world = createWorld();
  assert.equal(world.authenticate(`Bearer ${credentials.alpha}`), 'synthetic-client-alpha');
  assert.equal(world.authenticate(`Bearer ${credentials.beta}`), 'synthetic-client-beta');
  assert.equal(world.authenticate(`bearer ${credentials.alpha}`), 'synthetic-client-alpha', 'the Bearer scheme is case-insensitive');
  assert.deepEqual([...issuedCredentials].sort(), [credentials.alpha, credentials.beta, credentials.expired].sort());
});

for (const [name, header, status, code] of [
  ['an absent header', undefined, 401, 'CREDENTIAL_MISSING'],
  ['an empty Bearer value', 'Bearer ', 401, 'CREDENTIAL_MALFORMED'],
  ['the Basic scheme', 'Basic YWxwaGE6YWxwaGE=', 401, 'CREDENTIAL_MALFORMED'],
  ['a bare token without a scheme', credentials.alpha, 401, 'CREDENTIAL_MALFORMED'],
  ['extra whitespace inside the value', `Bearer ${credentials.alpha} extra`, 401, 'CREDENTIAL_MALFORMED'],
  ['an unexpected token shape', 'Bearer eyJhbGciOiJub25lIn0.e30.', 401, 'CREDENTIAL_MALFORMED'],
  ['a prototype key', 'Bearer __proto__', 401, 'CREDENTIAL_MALFORMED'],
  ['an over-long segment', `Bearer c032-synthetic-opaque-${'a'.repeat(17)}-0001`, 401, 'CREDENTIAL_MALFORMED'],
  ['a well-formed but unissued credential', `Bearer ${credentials.forged}`, 401, 'CREDENTIAL_FORGED'],
  ['a well-formed credential named after an Object prototype member', 'Bearer c032-synthetic-opaque-constructor-0001', 401, 'CREDENTIAL_FORGED'],
  ['the expired credential', `Bearer ${credentials.expired}`, 401, 'CREDENTIAL_EXPIRED']
]) {
  test(`${name} is the typed failure ${code} and never an identity`, () => {
    const error = failure(() => createWorld().authenticate(header));
    assert.ok(error instanceof FixtureError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    assert.ok(contract.errorCodes.includes(error.code));
  });
}

test('expiry follows the logical epoch and its inclusive boundary, never a clock', () => {
  assert.equal(CURRENT_EPOCH, 5);
  assert.equal(createWorld({ epoch: 9 }).authenticate(`Bearer ${credentials.alpha}`), 'synthetic-client-alpha');
  assert.equal(failure(() => createWorld({ epoch: 10 }).authenticate(`Bearer ${credentials.alpha}`)).code, 'CREDENTIAL_EXPIRED');
  assert.equal(failure(() => createWorld({ epoch: 10 }).authenticate(`Bearer ${credentials.beta}`)).code, 'CREDENTIAL_EXPIRED');
  assert.equal(createWorld({ epoch: 4 }).authenticate(`Bearer ${credentials.expired}`), 'synthetic-client-alpha');
  assert.equal(failure(() => createWorld().authenticate(`Bearer ${credentials.expired}`)).code, 'CREDENTIAL_EXPIRED');
  for (const epoch of [-1, 1.5, '5', null, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => createWorld({ epoch }), TypeError, String(epoch));
  }
});

test('the server-owned plan moves a client from blue to green after two served requests', () => {
  const world = createWorld();
  const served = Array.from({ length: 4 }, () => world.serve('synthetic-client-alpha'));
  assert.deepEqual(served.map((item) => item.state.counter), [1, 2, 3, 4]);
  assert.deepEqual(served.map((item) => item.destination.id), [
    'synthetic-destination-blue', 'synthetic-destination-blue', 'synthetic-destination-green', 'synthetic-destination-green']);
  assert.deepEqual(served.map((item) => item.destination.version), ['1.0.0', '1.0.0', '2.0.0', '2.0.0']);
  assert.ok(served.every((item) => item.apiContract === 'cookieless-observation/1' && item.stamp === 'C032-loopback-r1' && item.businessData === 'synthetic'));
});

test('state is per client and per world', () => {
  const world = createWorld();
  for (let index = 0; index < 3; index += 1) world.serve('synthetic-client-alpha');
  assert.equal(world.serve('synthetic-client-beta').state.counter, 1);
  assert.equal(world.serve('synthetic-client-alpha').state.counter, 4);
  assert.equal(createWorld().serve('synthetic-client-alpha').state.counter, 1, 'a fresh world starts from the beginning');
});

test('observations are immutable and never share references', () => {
  const world = createWorld();
  const first = world.serve('synthetic-client-alpha');
  const second = world.serve('synthetic-client-alpha');
  assert.notEqual(first.destination, second.destination);
  assert.throws(() => { first.destination.id = 'synthetic-destination-green'; }, TypeError);
  assert.throws(() => { first.state.counter = 99; }, TypeError);
  assert.throws(() => { contract.destinations.blue.version = '9.9.9'; }, TypeError);
  assert.throws(() => { contract.errorCodes.push('CREDENTIAL_FORGED'); }, TypeError);
  assert.equal(world.serve('synthetic-client-alpha').state.counter, 3);
});

test('the public contract names two fictional clients and two fictional destinations', () => {
  assert.deepEqual([...contract.clients], ['synthetic-client-alpha', 'synthetic-client-beta']);
  assert.deepEqual(Object.values(contract.destinations).map((item) => item.id), ['synthetic-destination-blue', 'synthetic-destination-green']);
  assert.match(credentials.alpha, new RegExp(contract.credentialPattern));
  assert.equal(contract.transitionAfter, 2);
});
