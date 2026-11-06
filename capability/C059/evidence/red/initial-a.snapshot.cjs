'use strict';

// RED (written before any production file existed). Initial tests A: the accessibility checker reports each defect BY NAME.
// The subject is the namespace root, or the directory in C059_RED_SUBJECT (a naive checker that reports nothing).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { DEFECTS, ERROR_STATE, STYLE_DEFECTS, VALID_CSS, build } = require('./helpers/fixtures.cjs');
const { press } = require('./helpers/dom.cjs');

const subject = process.env.C059_RED_SUBJECT ? path.resolve(process.env.C059_RED_SUBJECT) : path.resolve(__dirname, '..', '..');
const checker = require(path.join(subject, 'a11y-check.js'));

test('the valid fixture and a correct error state have no finding', () => {
  const clean = checker.check(build());
  assert.deepEqual(clean.findings, []);
  assert.equal(clean.ok, true);
  assert.deepEqual(checker.check(build(ERROR_STATE), ERROR_STATE.options).findings, []);
});

for (const defect of DEFECTS) {
  test(`the checker reports ${defect.code} by name, with a selector and a message`, () => {
    const verdict = checker.check(build(defect), defect.options);
    const finding = verdict.findings.find((item) => item.code === defect.code);
    assert.ok(finding, `expected a finding ${defect.code}, got ${verdict.findings.map((item) => item.code).join(', ') || 'none'}`);
    assert.equal(typeof finding.selector, 'string');
    assert.ok(finding.selector.length > 0);
    assert.ok(finding.message.length > 5);
    assert.equal(verdict.ok, false);
  });
}

for (const defect of STYLE_DEFECTS) {
  test(`the style check reports ${defect.code}`, () => {
    assert.ok(checker.checkStyles(defect.css).findings.some((item) => item.code === defect.code), `expected ${defect.code}`);
  });
}

test('the valid style sheet has no finding', () => {
  assert.deepEqual(checker.checkStyles(VALID_CSS).findings, []);
});

test('a keyboard trap on Tab is reported as KEYBOARD_TRAP and the free fixture is walked completely', () => {
  const trapped = build({ trap: true });
  trapped.getElementById('key').focus();
  const trap = checker.walkTab({ document: trapped, press: (key, options) => press(trapped, key, options) });
  assert.equal(trap.trapped, true);
  assert.ok(trap.findings.some((item) => item.code === 'KEYBOARD_TRAP'));
  const free = build();
  free.getElementById('skip').focus();
  const walk = checker.walkTab({ document: free, press: (key, options) => press(free, key, options) });
  assert.equal(walk.trapped, false);
  assert.deepEqual(walk.visited.map((element) => element.id), checker.tabOrder(free).map((element) => element.id));
});
