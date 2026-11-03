'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./schedule.js');

function run(config) {
  let state = model.schedule(model.createState(), { ...model.DEFAULTS, ...config });
  let steps = 0;
  while (!model.current(state).finished) {
    state = model.advance(state);
    assert.ok(++steps <= 28, 'all admitted windows have a bounded number of steps');
  }
  return model.current(model.assess(state));
}

test('timing boundaries depend on observed strictly-before readiness, not calendar correctness', () => {
  for (const lead of [0, 5, 14, 15, 16, 20, 30]) {
    for (const provision of [0, 8, 30]) {
      for (const warm of [0, 7, 30]) {
        const result = run({ lead, provision, warm });
        const expected = provision + warm < lead;
        assert.equal(result.verdict === 'pass', expected, JSON.stringify({ lead, provision, warm }));
        const ready = result.firstReadyAt;
        if (result.verdict === 'pass') assert.ok(ready < result.config.demandAt);
        assert.equal(result.clients.length, 40);
        assert.equal(new Set(result.clients.map((client) => client.id)).size, 40);
      }
    }
  }
});

test('all fixture outcomes preserve denominator partitions and chronological observed counts', () => {
  for (const fixture of Object.keys(model.FIXTURES)) {
    const result = run({ fixture });
    const counts = result.assessments.at(-1).metrics;
    assert.equal(counts.successful + counts.interrupted + counts.unknown, counts.total);
    assert.equal(counts.total, fixture === 'unsupported-schedule' ? 0 : 40);
    for (let index = 0; index < result.trace.length; index += 1) {
      const row = result.trace[index];
      assert.ok(index === 0 || row.at >= result.trace[index - 1].at);
      assert.ok(row.deployed >= 2 && row.deployed <= result.config.target);
      if (row.ready !== null) assert.ok(row.ready <= row.deployed);
      if (row.eligible !== null) assert.ok(row.eligible <= row.ready);
      assert.equal(row.effectiveRps, row.eligible === null ? null : row.eligible * 40);
    }
    if (result.verdict === 'pass') {
      assert.equal(counts.total, 40);
      assert.equal(counts.interrupted, 0);
      assert.equal(counts.unknown, 0);
      assert.equal(counts.windowComplete, true);
    }
  }
});

test('per-unit capacity boundary uses declared demand without sample rounding hiding overload', () => {
  for (const target of [3, 4, 8]) {
    for (const demand of [target * 40 - 1, target * 40, Math.min(320, target * 40 + 1)]) {
      const result = run({ target, demand });
      assert.equal(result.verdict, demand <= target * 40 ? 'pass' : 'fail');
      const sampledTimes = [...new Set(result.clients.map((client) => client.observedAt))];
      assert.deepEqual(sampledTimes, [30, 35, 40, 45]);
      assert.ok(result.clients.every((client) => client.observedAt < result.endAt));
    }
  }
});

test('input configurations and every earlier state are untouched by action sequences', () => {
  const config = { ...model.DEFAULTS };
  const original = JSON.stringify(config);
  const states = [model.createState()];
  states.push(model.schedule(states[0], config));
  for (let index = 0; index < 10; index += 1) {
    const before = JSON.stringify(states);
    const next = model.advance(states.at(-1));
    assert.equal(JSON.stringify(states), before);
    states.push(next);
  }
  assert.equal(JSON.stringify(config), original);
  assert.equal(model.current(states[1]).now, 0);
  assert.equal(model.current(states.at(-1)).now, 50);
  assert.equal(model.current(states[1]).clients.length, 0);
});
