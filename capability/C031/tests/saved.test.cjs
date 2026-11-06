'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const saved = require('..\\saved.js');
const source = require('..\\source.cjs');
const evaluator = require('..\\evaluator.js');
const generator = require('.\\build-saved.cjs');
const f = require('.\\fixtures.cjs');
const { runNodeTest } = require('.\\nested-runner.cjs');

const file = path.join(__dirname, '..', 'saved.js');

test('saved.js is exactly what the deterministic generator renders and what imports.json pins', () => {
  const bytes = fs.readFileSync(file);
  assert.equal(Buffer.compare(bytes, Buffer.from(generator.render(), 'utf8')), 0);
  assert.equal(generator.render(), generator.render(), 'no clock or randomness is used');
  assert.equal(source.hash(bytes), source.pins.own[0].rawSha256);
  assert.ok(bytes.length < 131072);
  assert.ok(!bytes.includes(13), 'saved.js is generated with LF only');
});

test('the generator check mode agrees with the committed bytes in a clean nested runner', () => {
  const run = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, 'build-saved.cjs'), '--check'], {
    env: require('.\\nested-runner.cjs').childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 20000
  });
  assert.deepEqual([run.status, run.stdout.trim()], [0, 'saved.js matches the generator']);
  assert.equal(runNodeTest(path.join(__dirname, 'nested-runner.cjs')).status, 0);
});

test('the saved bundle is a deeply frozen, fictional, closed set of one baseline and five negatives', () => {
  assert.deepEqual([saved.bundleVersion, saved.cardId, saved.fictional], [1, 'C031', true]);
  assert.deepEqual(saved.fleets.map((item) => [item.id, item.role, item.negativeOf]), [
    ['fleet-baseline', 'baseline', null], ['negative-unchanged-flood', 'negative', 'fleet-baseline'],
    ['negative-replayed-v2-request', 'negative', 'fleet-baseline'], ['negative-duplicated-trace', 'negative', 'fleet-baseline'],
    ['negative-stale-cached-ack', 'negative', 'fleet-baseline'], ['negative-out-of-order', 'negative', 'fleet-baseline']]);
  assert.ok(Object.isFrozen(saved) && Object.isFrozen(saved.fleets[0].fleet.clients[0].events[0]));
  for (const item of saved.fleets) {
    assert.equal(item.fleet.id, item.id);
    assert.equal(item.fleet.schema, 'C031-fleet/1');
    assert.deepEqual(item.fleet.clients.slice(0, 10), saved.fleets[0].fleet.clients, `${item.id} keeps the whole baseline`);
  }
  assert.deepEqual(Object.keys(saved.fleets[0].fleet.clients[0]), ['clientId', 'events']);
});

test('the saved clients are fictional: no real-looking identity, token, address or secret', () => {
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!/@|https?:|bearer|password|secret|token/i.test(text));
  for (const item of saved.fleets) for (const client of item.fleet.clients) assert.match(client.clientId, /^[a-z]+-\d{3}$/);
});

test('every saved fleet evaluates exactly like the generator inputs and no negative raises the baseline', () => {
  const baseline = evaluator.evaluateFleet(JSON.parse(JSON.stringify(saved.fleets[0].fleet)));
  for (const [index, item] of f.savedFleets().entries()) {
    const fromFile = evaluator.evaluateFleet(JSON.parse(JSON.stringify(saved.fleets[index].fleet)));
    const fromFixtures = evaluator.evaluateFleet(item.fleet);
    assert.deepEqual(fromFile.successRate, fromFixtures.successRate);
    assert.ok(fromFile.successRate.numerator <= baseline.successRate.numerator, item.id);
  }
});

test('in a browser the bundle defines a read-only global and leaves no CommonJS trace', () => {
  const sandbox = {};
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(sandbox);
  assert.equal(sandbox.C031Saved.fleets.length, 6);
  assert.equal(Object.getOwnPropertyDescriptor(sandbox, 'C031Saved').writable, false);
  assert.equal(Object.isFrozen(sandbox.C031Saved.fleets[0]), true);
});
