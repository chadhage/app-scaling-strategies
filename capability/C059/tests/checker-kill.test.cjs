'use strict';

// Review F3 (C059): single-condition checker mutants that the named negatives of checker-reach.test.cjs and the older rule tests do not
// observe. Each test pins the boundary of one condition (what must NOT be reported, or what exactly is reported).
const test = require('node:test');
const assert = require('node:assert/strict');
const checker = require('../a11y-check.js');
const { NEGATIVES, documentHtml } = require('./negatives.cjs');
const { parseHtml, press } = require('./dom.cjs');

const OPTIONS = { timeout: 20000 };
const build = (fixture) => {
  const document = parseHtml(documentHtml(fixture));
  document.getElementById(fixture.focus ?? 'top')?.focus();
  return document;
};
const codes = (fixture) => checker.check(build(fixture)).findings.map((item) => item.code);

test('a natively focusable element with a tabindex is not FOCUSABLE_NO_ROLE; a disabled non-control with a tabindex is not DISABLED_FOCUSABLE', OPTIONS, () => {
  assert.ok(!codes({ body: '<iframe id="f" title="Frame" tabindex="0"></iframe>' }).includes('FOCUSABLE_NO_ROLE'));
  assert.ok(!codes({ body: '<fieldset id="f" disabled tabindex="0"><legend>Group</legend></fieldset>' }).includes('DISABLED_FOCUSABLE'));
  assert.ok(codes({ body: '<button id="b" type="button" disabled tabindex="0">Go</button>' }).includes('DISABLED_FOCUSABLE'));
  assert.ok(!codes({ body: '<button id="b" type="button" disabled tabindex="-1">Go</button>' }).includes('DISABLED_FOCUSABLE'), 'a disabled button that is not in the Tab order is consistent');
});

test('walkTab on a page with an empty Tab order presses nothing and visits nothing', OPTIONS, () => {
  const document = build(NEGATIVES.find((item) => item.id === 'K5'));
  let presses = 0;
  const verdict = checker.walkTab({ document, press: () => { presses += 1; } });
  assert.deepEqual([presses, verdict.visited], [0, []]);
});

test('role boundaries: an anchor without href is generic, an input is judged by its type, a native checkbox carries its own state', OPTIONS, () => {
  assert.ok(!codes({ body: '<a id="a" role="heading">Not a link</a>' }).includes('ROLE_MISMATCH'));
  assert.ok(codes({ body: '<a id="a" href="#top" role="heading">A link</a>' }).includes('ROLE_MISMATCH'));
  assert.ok(!codes({ body: '<input id="c" type="checkbox" role="switch" aria-checked="false" aria-label="Sound">' }).includes('ROLE_MISMATCH'));
  assert.ok(codes({ body: '<input id="c" type="checkbox" role="button" aria-label="Sound">' }).includes('ROLE_MISMATCH'));
  assert.ok(!codes({ body: '<input id="c" type="checkbox" role="checkbox" aria-label="Sound">' }).includes('STATE_MISSING'));
  assert.ok(!codes({ body: '<input id="t" type="text" role="combobox" aria-label="Search" aria-expanded="false">' }).includes('ROLE_MISMATCH'));
});

test('composite widgets: an empty group and a member without its state are ROVING_TABINDEX', OPTIONS, () => {
  assert.ok(codes({ body: '<div id="g" role="radiogroup" aria-label="Choices"></div>' }).includes('ROVING_TABINDEX'));
  assert.ok(codes({ body: '<div id="g" role="radiogroup" aria-label="Choices"><div id="r1" role="radio" tabindex="0">One</div></div>' }).includes('ROVING_TABINDEX'));
  assert.ok(!codes({ body: '<div id="g" role="radiogroup" aria-label="Choices"><div id="r1" role="radio" aria-checked="false" tabindex="0">One</div></div>' }).includes('ROVING_TABINDEX'), 'no radio is checked: the first is the stop');
});

test('a Tab walk presses the keys it is given: a forward trap on one control is reported, a clean page is not', OPTIONS, () => {
  const document = build({ body: '<button id="a" type="button">A</button><button id="b" type="button">B</button><button id="c" type="button">C</button>', focus: 'a' });
  const clean = checker.walkTab({ document, press: (key, options) => press(document, key, options) });
  assert.deepEqual(clean.findings, []);
  document.getElementById('b').addEventListener('keydown', (event) => { if (event.key === 'Tab' && !event.shiftKey) event.preventDefault(); });
  const trapped = checker.walkTab({ document: build({ body: '<button id="a" type="button">A</button><button id="b" type="button">B</button>', focus: 'a' }), press: () => {} });
  assert.equal(trapped.trapped, true);
});
