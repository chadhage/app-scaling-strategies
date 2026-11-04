'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('./model.js');

function start(fixture = 'retained-assets', budgetMs = 2000, state = lesson.create()) {
  return lesson.command(state, { type: 'start', fixture, budgetMs, dataOnly: true });
}
function step(state, type) { return lesson.command(state, { type }); }
function complete(fixture = 'retained-assets', budgetMs = 2000) {
  let state = start(fixture, budgetMs);
  for (const type of lesson.steps) state = step(state, type);
  return state;
}
function deny(state, input, code) {
  const snapshot = JSON.stringify(state);
  assert.throws(() => lesson.command(state, input), (error) => error.code === code);
  assert.equal(JSON.stringify(state), snapshot);
}

test('loadable API baseline creates and captures a fictional HTML receipt', () => {
  const state = step(start(), 'capture-old');
  assert.equal(lesson.inspect(state).htmlStatus, 200);
});

test('HTML 200 without complete rendered pages must remain unverified', () => {
  const state = step(start(), 'capture-old');
  assert.equal(lesson.inspect(state).verification, 'unverified');
  assert.equal(lesson.inspect(state).counts.succeeded, 0);
});

test('missing required old script after nominal cutover must interrupt browsing', () => {
  const result = lesson.inspect(complete('missing-old-script'));
  assert.equal(result.verification, 'fail');
  assert.equal(result.userImpact, 'interrupted-transition');
  assert.equal(result.counts.failed, 1);
  assert.equal(result.nominalCutover, true);
  assert.deepEqual(result.pages.map((page) => page.htmlStatus), [200, 200]);
  assert.equal(result.pages[0].assets.find((entry) => entry.kind === 'script').status, 404);
});

test('retained old references load after cutover and both complete pages pass', () => {
  let state = start();
  for (const type of lesson.steps.slice(0, 3)) state = step(state, type);
  assert.equal(lesson.inspect(state).pages[0].rendered, false);
  assert.throws(() => lesson.previewPlan(state, 'v1'), { code: 'ERR_PHASE' });
  state = step(state, 'render-old');
  assert.deepEqual(lesson.previewPlan(state, 'v1'), { css: 'v1.css', script: 'v1.js', image: 'v1.svg' });
  const partial = lesson.inspect(state);
  assert.equal(partial.verification, 'unverified');
  assert.equal(partial.counts.succeeded, 1);
  state = step(state, 'render-new');
  const result = lesson.inspect(state);
  assert.equal(result.verification, 'pass');
  assert.equal(result.userImpact, 'uninterrupted-transition');
  assert.equal(result.exerciseAssertion, 'matched');
  assert.deepEqual(result.counts, { attempted: 2, succeeded: 2, failed: 0, unknown: 0, notExposed: 0, notStarted: 0 });
  assert.equal(result.checks.length, 32);
  assert.ok(result.checks.every((entry) => entry.state === 'pass'));
});

test('every fixed negative and unknown fixture has its exact independent outcome', async (t) => {
  for (const fixture of lesson.fixtures.filter((entry) => entry.readiness === true)) {
    await t.test(fixture.id, () => {
      const result = lesson.inspect(complete(fixture.id));
      assert.equal(result.verification, fixture.expected);
      assert.equal(result.exerciseAssertion, 'matched');
      assert.equal(result.counts.attempted, 2);
      assert.equal(result.counts.succeeded + result.counts.failed + result.counts.unknown + result.counts.notExposed, 2);
      if (fixture.expected === 'fail') {
        assert.equal(result.userImpact, 'interrupted-transition');
        assert.equal(result.counts.failed, 1);
        assert.equal(result.counts.succeeded, 1);
      } else if (fixture.expected === 'unverified') {
        assert.equal(result.userImpact, 'unknown-transition');
        assert.ok(result.counts.unknown > 0);
      }
    });
  }
});

test('all-200 cached wrong version fails version and cache checks', () => {
  const result = lesson.inspect(complete('wrong-cache-version'));
  assert.ok(result.pages[0].assets.every((entry) => entry.status === 200));
  assert.ok(result.checks.some((entry) => entry.name === 'v1 required css version' && entry.state === 'fail'));
  assert.ok(result.checks.some((entry) => entry.name === 'v1 css cache payload version' && entry.state === 'fail'));
});

test('asset 200 and correct versions cannot conceal incorrect rendered content', () => {
  const result = lesson.inspect(complete('render-defect'));
  assert.ok(result.pages[1].assets.every((entry) => entry.status === 200 && entry.version === 'v2'));
  assert.equal(result.pages[1].renderedCorrect, false);
  assert.equal(result.pages[1].outcome, 'failed');
});

test('correct rendering cannot conceal lost anonymous context or original budget', () => {
  const context = lesson.inspect(complete('lost-browse-context'));
  assert.equal(context.pages[0].renderedCorrect, true);
  assert.equal(context.pages[0].browseContextPreserved, false);
  assert.equal(context.verification, 'fail');
  const slow = lesson.inspect(complete('slow-html-200'));
  assert.equal(slow.pages[1].htmlStatus, 200);
  assert.equal(slow.pages[1].renderedCorrect, true);
  assert.equal(slow.pages[1].durationMs, 2400);
  assert.equal(slow.verification, 'fail');
});

test('asset, cache, version, render, context and journey unknowns remain unknown', () => {
  const result = lesson.inspect(complete('unknown-page-receipts'));
  assert.equal(result.verification, 'unverified');
  assert.equal(result.pages[0].assets[0].status, 200);
  assert.equal(result.pages[0].assets[0].version, null);
  assert.equal(result.pages[0].renderedCorrect, null);
  assert.equal(result.pages[0].journeyCorrect, null);
  assert.equal(result.pages[0].durationMs, null);
  assert.deepEqual(result.counts, { attempted: 2, succeeded: 1, failed: 0, unknown: 1, notExposed: 0, notStarted: 0 });
  assert.ok(result.checks.some((entry) => entry.name.includes('cache') && entry.state === 'unknown'));
});

test('nominal cutover with missing routing proof leaves both transitions unknown', () => {
  const result = lesson.inspect(complete('unknown-routing'));
  assert.equal(result.nominalCutover, true);
  assert.equal(result.observedRoute, null);
  assert.equal(result.verification, 'unverified');
  assert.equal(result.counts.unknown, 2);
  assert.equal(result.counts.succeeded, 0);
});

test('failed and unknown readiness deny exposure and preserve the original state', () => {
  for (const fixture of ['candidate-not-ready', 'unknown-readiness']) {
    let state = step(step(start(fixture), 'capture-old'), 'check-readiness');
    deny(state, { type: 'cutover' }, 'ERR_READINESS');
    assert.equal(lesson.controls(state).next, null);
    state = step(state, 'verify');
    const result = lesson.inspect(state);
    assert.equal(result.verification, fixture === 'candidate-not-ready' ? 'fail' : 'unverified');
    assert.equal(result.userImpact, 'not-exposed');
    assert.equal(result.counts.succeeded, 0);
    assert.equal(result.counts.notExposed, 1);
    assert.equal(result.exerciseAssertion, 'matched');
  }
});

test('exact inclusive original budget boundaries, not HTTP status, decide latency', () => {
  assert.equal(lesson.inspect(complete('retained-assets', 420)).verification, 'pass');
  assert.equal(lesson.inspect(complete('retained-assets', 419)).verification, 'fail');
  assert.equal(lesson.inspect(complete('slow-html-200', 2400)).verification, 'pass');
  assert.equal(lesson.inspect(complete('slow-html-200', 2399)).verification, 'fail');
  assert.equal(lesson.inspect(complete('slow-html-200', 2400)).exerciseAssertion, 'changed-budget');
});

test('coerced budgets and consent are denied without mutation', () => {
  for (const budgetMs of ['2000', 99, 5001, 2000.5, NaN, Infinity, null, true, [], {}]) {
    deny(lesson.create(), { type: 'start', fixture: 'retained-assets', budgetMs, dataOnly: true }, 'ERR_INPUT');
  }
  for (const dataOnly of [false, 'true', 1, null, undefined, {}]) {
    deny(lesson.create(), { type: 'start', fixture: 'retained-assets', budgetMs: 2000, dataOnly }, 'ERR_INPUT');
  }
  assert.equal(start('retained-assets', 100).runs[0].config.budgetMs, 100);
  assert.equal(start('retained-assets', 5000).runs[0].config.budgetMs, 5000);
});

test('unknown fixtures, paths, extra fields and accessor commands are denied', () => {
  for (const fixture of ['other', ' retained-assets', '../v1', 1, null, {}]) {
    deny(lesson.create(), { type: 'start', fixture, budgetMs: 2000, dataOnly: true }, 'ERR_INPUT');
  }
  deny(lesson.create(), { type: 'start', fixture: 'retained-assets', budgetMs: 2000, dataOnly: true, receipt: 200 }, 'ERR_INPUT');
  deny(start(), { type: 'capture-old', nominal: true }, 'ERR_INPUT');
  deny(start(), { type: 'arbitrary' }, 'ERR_INPUT');
  const accessor = { type: 'capture-old' };
  Object.defineProperty(accessor, 'path', { get() { throw new Error('getter must not be invoked'); }, enumerable: true });
  deny(start(), accessor, 'ERR_INPUT');
  const typeAccessor = {};
  Object.defineProperty(typeAccessor, 'type', { get() { throw new Error('type getter must not be invoked'); }, enumerable: true });
  deny(start(), typeAccessor, 'ERR_INPUT');
  const symbol = { type: 'capture-old', [Symbol('extra')]: true };
  deny(start(), symbol, 'ERR_INPUT');
});

test('only this instance issued immutable states are accepted', () => {
  const state = start();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.runs[0].config));
  assert.throws(() => { state.runs[0].config.budgetMs = 5000; }, TypeError);
  assert.throws(() => { lesson.fixtures[0].old.assets[0].status = 404; }, TypeError);
  for (const forged of [null, {}, JSON.parse(JSON.stringify(state)), Object.freeze({ ...state })]) {
    assert.throws(() => lesson.command(forged, { type: 'capture-old' }), { code: 'ERR_STATE' });
    assert.throws(() => lesson.inspect(forged), { code: 'ERR_STATE' });
  }
});

test('phase and repeated-step guards do not append fabricated observations', () => {
  deny(lesson.create(), { type: 'capture-old' }, 'ERR_PHASE');
  deny(start(), { type: 'render-new' }, 'ERR_PHASE');
  deny(start(), { type: 'verify' }, 'ERR_PHASE');
  const captured = step(start(), 'capture-old');
  deny(captured, { type: 'capture-old' }, 'ERR_PHASE');
  deny(captured, { type: 'cutover' }, 'ERR_PHASE');
  deny(captured, { type: 'start', fixture: 'retained-assets', budgetMs: 2000, dataOnly: true }, 'ERR_PHASE');
  deny(complete(), { type: 'render-new' }, 'ERR_PHASE');
});

test('three advancing verification snapshots retain incomplete and complete results', () => {
  let state = step(start(), 'capture-old');
  state = step(state, 'verify');
  assert.equal(state.runs[0].reviews[0].report.verification, 'unverified');
  deny(state, { type: 'verify' }, 'ERR_PHASE');
  for (const type of ['check-readiness', 'cutover', 'render-old']) state = step(state, type);
  state = step(state, 'verify');
  state = step(step(state, 'render-new'), 'verify');
  assert.deepEqual(state.runs[0].reviews.map((entry) => entry.report.verification), ['unverified', 'unverified', 'pass']);
  assert.equal(state.runs[0].history.filter((entry) => entry.action === 'verify').length, 3);
  deny(state, { type: 'verify' }, 'ERR_PHASE');
});

test('reset preserves failed history when a later independent run passes', () => {
  let state = step(complete('missing-old-script'), 'verify');
  const events = state.runs[0].history;
  state = step(state, 'reset');
  assert.equal(state.active, null);
  assert.equal(state.runs[0].archived, true);
  assert.deepEqual(state.runs[0].history.slice(0, -1), events);
  state = start('retained-assets', 2000, state);
  for (const type of lesson.steps) state = step(state, type);
  state = step(state, 'verify');
  assert.equal(state.runs[0].reviews[0].report.verification, 'fail');
  assert.equal(state.runs[1].reviews[0].report.verification, 'pass');
});

test('six-run bound preserves every run without pruning and denies a seventh', () => {
  let state = lesson.create();
  for (let index = 0; index < 6; index++) {
    state = start('retained-assets', 2000, state);
    state = step(step(state, 'capture-old'), 'reset');
  }
  assert.equal(state.runs.length, 6);
  assert.equal(lesson.controls(state).start, false);
  assert.equal(lesson.controls(state).runBoundReached, true);
  deny(state, { type: 'start', fixture: 'retained-assets', budgetMs: 2000, dataOnly: true }, 'ERR_BOUND');
  assert.equal(step(state, 'reset'), state);
});

test('determinism and fixture plans need no timers, resources or injected receipts', () => {
  assert.deepEqual(lesson.inspect(complete('missing-new-image')), lesson.inspect(complete('missing-new-image')));
  assert.deepEqual(lesson.previewPlan(complete('unknown-page-receipts'), 'v1'), { css: null, script: null, image: null });
  assert.throws(() => lesson.previewPlan(complete(), 'v3'), { code: 'ERR_INPUT' });
});
