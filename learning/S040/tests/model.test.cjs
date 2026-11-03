'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = globalThis.__S040_RED_MODEL__ || require('..\\model.js');

test('cookie-less bearer identity and API routing preserve both clients', () => {
  const result = model.evaluate(model.DEFAULTS);
  assert.equal(result.verdict, 'success');
  assert.deepEqual(result.metrics, {
    passed: 9, failed: 0, unknown: 0, observedClients: 2, moved: 2,
    identitiesPreserved: 2, statesPreserved: 2, withinOriginalBudget: 2, cookiesSent: 0,
  });
  assert.deepEqual(result.clients.map((client) => client.after.elapsedMs), [150, 240]);
  for (const client of result.clients) {
    assert.equal(client.after.subject, client.before.subject);
    assert.deepEqual(client.after.work, client.before.work);
    assert.equal(client.after.originalDeadlineMs, client.before.originalDeadlineMs);
    assert.equal(client.after.destination, 'v2');
    assert.equal(client.after.cookiesSent, 0);
  }
});

test('cookie-dependent identity fails explicitly rather than weakening verification', () => {
  const result = model.evaluate({ ...model.DEFAULTS, identity: 'browser-session' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.identitiesPreserved, 0);
  assert.equal(result.metrics.statesPreserved, 0);
  assert.equal(result.metrics.moved, 2, 'routing is independent of authentication');
  for (const client of result.clients) {
    assert.equal(client.after.status, 401);
    assert.equal(client.after.subject, null);
    assert.equal(client.after.work, null);
  }
});

test('cookie routing without cookies leaves both clients on v1 despite good identity and state', () => {
  const result = model.evaluate({ ...model.DEFAULTS, routing: 'browser-cookie' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.moved, 0);
  assert.equal(result.metrics.identitiesPreserved, 2);
  assert.equal(result.metrics.statesPreserved, 2);
  assert.deepEqual(result.clients.map((client) => client.after.destination), ['v1', 'v1']);
});

test('HTTP 200 on v2 cannot hide instance-local state loss', () => {
  const result = model.evaluate({ ...model.DEFAULTS, state: 'instance-local' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.failed, 2);
  assert.equal(result.metrics.statesPreserved, 0);
  for (const client of result.clients) {
    assert.equal(client.after.status, 200);
    assert.equal(client.after.destination, 'v2');
    assert.equal(client.after.work, null);
  }
});

test('delays consume the original deadline rather than a new post-handoff budget', () => {
  const result = model.evaluate({ ...model.DEFAULTS, observation: 'delayed' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.withinOriginalBudget, 0);
  assert.deepEqual(result.clients.map((client) => client.after.elapsedMs), [350, 440]);
  assert.deepEqual(result.clients.map((client) => client.after.originalDeadlineMs), [300, 300]);
  assert.equal(result.metrics.statesPreserved, 2);
});

test('invalid synthetic bearers remain rejected without a cookie fallback', () => {
  for (const cookies of model.CHOICES.cookies) {
    const result = model.evaluate({ ...model.DEFAULTS, cookies, observation: 'invalid-bearer' });
    assert.equal(result.verdict, 'failure');
    assert.equal(result.metrics.identitiesPreserved, 0);
    assert.deepEqual(result.clients.map((client) => client.after.status), [401, 401]);
  }
});

test('missing mobile observations stay unknown and are not fabricated', () => {
  const result = model.evaluate({ ...model.DEFAULTS, observation: 'unavailable' });
  assert.equal(result.verdict, 'unknown');
  assert.deepEqual([result.metrics.passed, result.metrics.failed, result.metrics.unknown], [5, 0, 4]);
  assert.equal(result.metrics.observedClients, 1);
  assert.equal(result.clients[1].after, null);
  assert.equal(result.checks.filter((check) => check.status === 'unknown').length, 4);
});

test('a known routing failure dominates missing evidence without deleting unknowns', () => {
  const result = model.evaluate({
    ...model.DEFAULTS, routing: 'browser-cookie', observation: 'unavailable',
  });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.metrics.failed, 1);
  assert.equal(result.metrics.unknown, 4);
  assert.equal(result.metrics.observedClients, 1);
});

test('browser-only success does not certify the cookie-less strategy', () => {
  const result = model.evaluate({
    ...model.DEFAULTS, cookies: 'browser-fixture',
    identity: 'browser-session', routing: 'browser-cookie',
  });
  assert.equal(result.verdict, 'unknown');
  assert.deepEqual([result.metrics.passed, result.metrics.failed, result.metrics.unknown], [8, 0, 1]);
  assert.equal(result.metrics.cookiesSent, 2);
  assert.equal(result.checks[0].name, 'cookie-removal');
  assert.equal(result.checks[0].status, 'unknown');
});

test('all 64 declared configurations are deterministic with truthful counts and failure precedence', () => {
  const original = JSON.stringify(model.FIXTURE);
  let count = 0;
  for (const cookies of model.CHOICES.cookies)
    for (const identity of model.CHOICES.identity)
      for (const routing of model.CHOICES.routing)
        for (const state of model.CHOICES.state)
          for (const observation of model.CHOICES.observation) {
            const config = { cookies, identity, routing, state, observation };
            const result = model.evaluate(config);
            assert.deepEqual(model.evaluate(config), result);
            assert.equal(result.checks.length, 9);
            assert.equal(result.metrics.passed + result.metrics.failed + result.metrics.unknown, 9);
            assert.equal(result.verdict, result.metrics.failed ? 'failure' : result.metrics.unknown ? 'unknown' : 'success');
            if (result.verdict === 'success') {
              assert.equal(cookies, 'absent');
              assert.equal(identity, 'bearer-subject');
              assert.equal(routing, 'api-policy');
              assert.equal(state, 'shared-subject');
              assert.equal(observation, 'complete');
            }
            count++;
          }
  assert.equal(count, 64);
  assert.equal(JSON.stringify(model.FIXTURE), original);
});

test('strict configuration guards reject missing, extra, malformed, inherited and accessor input', () => {
  let getterCalls = 0;
  const accessor = { ...model.DEFAULTS };
  Object.defineProperty(accessor, 'cookies', { enumerable: true, get() { getterCalls++; return 'absent'; } });
  const hidden = { ...model.DEFAULTS };
  Object.defineProperty(hidden, 'cookies', { value: 'absent', enumerable: false });
  const bad = [
    null, undefined, [], 1, 'absent', new Date(), Object.create(model.DEFAULTS),
    { ...model.DEFAULTS, cookies: '' }, { ...model.DEFAULTS, observation: 'COMPLETE' },
    { ...model.DEFAULTS, identity: 1 }, { ...model.DEFAULTS, routing: null },
    { ...model.DEFAULTS, state: true }, { ...model.DEFAULTS, extra: 'ignored?' },
    { ...model.DEFAULTS, [Symbol('extra')]: 'no' }, accessor, hidden,
    Object.fromEntries(Object.entries(model.DEFAULTS).slice(1)),
  ];
  for (const input of bad) assert.throws(() => model.evaluate(input), /Invalid/);
  assert.equal(getterCalls, 0);
});

test('invalid input and wrong-state actions leave current evidence and history unchanged', () => {
  const lesson = model.createLesson();
  const initial = lesson.snapshot();
  assert.throws(() => lesson.rehearse({ ...model.DEFAULTS, routing: 'bogus' }), /Invalid routing/);
  assert.deepEqual(lesson.snapshot(), initial);
  lesson.rehearse(model.DEFAULTS);
  const checked = lesson.snapshot();
  assert.throws(() => lesson.rehearse(model.DEFAULTS), /Reset the checked rehearsal/);
  assert.deepEqual(lesson.snapshot(), checked);
});

test('reset preserves complete failed and unknown records and monotonic run numbers', () => {
  const lesson = model.createLesson();
  const failed = lesson.rehearse({ ...model.DEFAULTS, state: 'instance-local' });
  assert.equal(failed.run, 1);
  const reset = lesson.reset();
  assert.equal(reset.current, null);
  assert.equal(reset.phase, 'ready');
  assert.deepEqual(reset.history, [failed]);
  const unknown = lesson.rehearse({ ...model.DEFAULTS, observation: 'unavailable' });
  assert.equal(unknown.run, 2);
  lesson.reset();
  const success = lesson.rehearse(model.DEFAULTS);
  assert.equal(success.run, 3);
  assert.deepEqual(lesson.snapshot().history, [failed, unknown, success]);
  assert.equal(lesson.snapshot().remaining, 9);
});

test('the twelve-rehearsal cap cannot be replenished by reset or stale actions', () => {
  const lesson = model.createLesson();
  for (let run = 1; run <= model.MAX_REHEARSALS; run++) {
    assert.equal(lesson.rehearse(model.DEFAULTS).run, run);
    lesson.reset();
  }
  const before = lesson.snapshot();
  assert.equal(before.phase, 'exhausted');
  assert.equal(before.remaining, 0);
  assert.throws(() => lesson.rehearse(model.DEFAULTS), /budget is exhausted/);
  lesson.reset();
  assert.deepEqual(lesson.snapshot(), before);
});

test('fixtures, results and snapshots are deeply immutable', () => {
  const lesson = model.createLesson();
  const result = lesson.rehearse(model.DEFAULTS);
  assert.throws(() => { result.clients[0].after.work.step = 99; }, TypeError);
  assert.throws(() => { model.FIXTURE[0].subject = 'another'; }, TypeError);
  assert.throws(() => { result.configuration.cookies = 'browser-fixture'; }, TypeError);
  assert.throws(() => lesson.snapshot().history.push(result), TypeError);
  assert.equal(lesson.snapshot().history.length, 1);
  assert.equal(lesson.snapshot().current.clients[0].after.work.step, 2);
});
