'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = require('./model.js');

function start(fixture) {
  return lesson.command(lesson.create(), {
    type: 'start', fixture, budgetMs: 2000, dataOnly: true,
  });
}

test('loadable API baseline creates and captures a fictional HTML receipt', () => {
  const state = lesson.command(start('retained-assets'), { type: 'capture-old' });
  assert.equal(lesson.inspect(state).htmlStatus, 200);
});

test('HTML 200 without complete rendered pages must remain unverified', () => {
  const state = lesson.command(start('retained-assets'), { type: 'capture-old' });
  assert.equal(lesson.inspect(state).verification, 'unverified');
  assert.equal(lesson.inspect(state).counts.succeeded, 0);
});

test('missing required old script after nominal cutover must interrupt browsing', () => {
  let state = start('missing-old-script');
  for (const type of ['capture-old', 'check-readiness', 'cutover', 'render-old', 'render-new']) {
    state = lesson.command(state, { type });
  }
  assert.equal(lesson.inspect(state).verification, 'fail');
  assert.equal(lesson.inspect(state).userImpact, 'interrupted-transition');
  assert.equal(lesson.inspect(state).counts.failed, 1);
});
