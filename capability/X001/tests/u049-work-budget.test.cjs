'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const T = require(process.env.X001_U049_SUBJECT
  ? path.resolve(process.env.X001_U049_SUBJECT) : '..\\timeline.js');
const { shared, consoleRun, boundedReducer } = require('.\\u049-fixtures.cjs');

for (const depth of [24, 40]) {
  const name = 'G1 retained verify with supplied timeline refuses shared raw work before folding';
  test(depth === 24 ? name : `${name} (depth 40)`, () => {
    let folds = 0;
    const model = T.using({ reducer: boundedReducer(() => { folds += 1; }) });
    const timeline = model.build(consoleRun({}));
    assert.equal(timeline.ok, true, 'the supplied one-entry timeline is valid');
    folds = 0;
    const answer = model.verify(consoleRun(shared(depth)), timeline);
    assert.deepEqual(answer, { ok: false, checked: 0, mismatches: [], code: 'SAVED_RUN_TOO_LARGE' });
    assert.equal(folds, 0, 'refusal precedes reducer work');
  });
}
