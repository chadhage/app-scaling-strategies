'use strict';

// U039: the mutant list is tied to the production source. Fast and hermetic: it never runs a mutant (u039-mutate.cjs does).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { mutants } = require('./u039-mutants.cjs');
const { BODY_FRAMINGS, BODY_KINDS, BODY_SHAPES, bodyName, burstName, leaversName } = require('./u039-body-rows.cjs');
const { FRAMINGS, LANE_FRAMINGS, LANE_REFUSALS, LANE_SHAPES, ROWS, laneApplies, laneName } = require('./u039-rows.cjs');

const root = path.resolve(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const source = read('server.cjs').replace(/\r\n/g, '\n');

function titles() {
  const found = [];
  for (const file of ['u039-ordering.test.cjs', 'u039-flood.test.cjs', 'u039-body-order.test.cjs', 'resources.test.cjs']) {
    for (const match of read('tests', file).matchAll(/^test\('((?:[^'\\]|\\.)+)'/gm)) found.push(match[1].replace(/\\'/g, "'"));
  }
  for (const target of ['in-process', 'separate-process']) {
    found.push(burstName(target), leaversName(target));
    for (const framing of BODY_FRAMINGS) {
      for (const shape of Object.keys(BODY_SHAPES)) {
        for (const expect of framing.expects) for (const kind of Object.keys(BODY_KINDS)) found.push(bodyName(target, framing.id, shape, kind, expect));
      }
    }
  }
  for (const row of ROWS) {
    found.push(`in-process h11 ${row.id}: every form`, `in-process h10-m ${row.id}: the pipelined mutation`);
    for (const framing of FRAMINGS) found.push(`separate-process ${framing.id} ${row.id}: ${row.kind} refusal`);
  }
  for (const target of ['in-process', 'separate-process']) {
    for (const framing of LANE_FRAMINGS) {
      for (const shape of Object.keys(LANE_SHAPES)) {
        for (const [name, refusal] of Object.entries(LANE_REFUSALS)) if (laneApplies(refusal, framing)) found.push(laneName(target, framing.id, shape, name));
      }
    }
  }
  return found;
}

test('every mutant replaces one exact and unique text of the current server.cjs', () => {
  assert.equal(new Set(mutants.map((mutant) => mutant.id)).size, mutants.length, 'ids are unique');
  for (const mutant of mutants) {
    assert.equal(source.split(mutant.find).length - 1, 1, `${mutant.id}: the text occurs exactly once`);
    assert.notEqual(mutant.find, mutant.replace, `${mutant.id}: the replacement differs`);
    assert.equal(new Set(mutants.filter((other) => other.find === mutant.find && other.replace === mutant.replace)).size, 1, `${mutant.id}: no duplicate mutant`);
  }
});

test('every mutant names tests that exist, and an equivalent mutant says why', () => {
  const known = titles();
  for (const mutant of mutants) {
    for (const name of [...mutant.fails, ...mutant.passes]) assert.equal(known.some((title) => title.includes(name)), true, `${mutant.id}: no test is named like "${name}"`);
    if (mutant.equivalent) {
      assert.equal(mutant.fails.length, 0, `${mutant.id}: an equivalent mutant fails nothing`);
      assert.equal(mutant.equivalent.length > 30, true, `${mutant.id}: the reason is spelled out`);
    } else {
      assert.equal(mutant.fails.length > 0, true, `${mutant.id}: a named test must kill it`);
    }
  }
});

test('the guards of the fix are all mutated: the mark, the top check, the queue, the listeners, request.socket, the close rule and the destroy', () => {
  const ids = mutants.map((mutant) => mutant.id.slice(4));
  for (const part of ['no-mark', 'no-check-at-top', 'no-queue', 'response-socket-instead-of-request-socket', 'close-only-for-unread-bodies', 'no-destroy-after-flush', 'no-checkExpectation-listener',
    'no-checkContinue-listener', 'no-clientError-listener', 'no-connect-listener', 'host-header-required-by-node', 'drop-does-not-release', 'unparsed-no-dedupe', 'unparsed-marks-closing',
    'wait-for-the-latest-entry-even-when-incomplete', 'incomplete-request-not-dropped', 'complete-request-not-waited-for', 'latest-request-not-stored', 'every-incomplete-request-dropped', 'error-before-any-request-not-handled']) assert.equal(ids.includes(part), true, part);
  assert.equal(mutants.filter((mutant) => !mutant.equivalent).length >= 33, true);
});
