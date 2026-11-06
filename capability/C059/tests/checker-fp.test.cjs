'use strict';

// Second review, N3: two new false positives of the checker. (1) A decorative <button tabindex="-1"> or <a href tabindex="-1"> inside an aria-hidden subtree is
// exposed to nobody and is not in the Tab order (axe accepts it), yet it was reported three times (ARIA_HIDDEN_FOCUSABLE, CONTROL_NOT_REACHABLE, TABINDEX_NEGATIVE).
// (2) <nav role="tablist"> was ROLE_MISMATCH although ARIA in HTML allows it. Fixed with every existing negative fixture still reported BY NAME: a TABBABLE
// control inside aria-hidden stays ARIA_HIDDEN_FOCUSABLE, a tabindex=-1 control outside aria-hidden stays CONTROL_NOT_REACHABLE, and the role table stays closed.
// The shared fixtures (tests\negatives.cjs: P10 to P13, X20 to X24) also run in real Edge (tests\browser.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const checker = require('../a11y-check.js');
const { NEGATIVES, POSITIVES, documentHtml } = require('./negatives.cjs');
const { parseHtml, press } = require('./dom.cjs');

const OPTIONS = { timeout: 20000 };
const build = (fixture) => {
  const document = parseHtml(documentHtml(typeof fixture === 'string' ? { body: fixture } : fixture));
  document.getElementById(fixture.focus ?? 'top')?.focus();
  return document;
};
const codes = (fixture) => [...new Set(checker.check(build(fixture)).findings.map((item) => item.code))];
const walk = (document) => checker.walkTab({ document, press: (key, options) => press(document, key, options) });
const byId = (list, id) => list.find((item) => item.id === id);

for (const id of ['P10', 'P11']) {
  test(`N3 ${id}: ${byId(POSITIVES, id).name}: no finding of any code, Tab never needs to reach it`, OPTIONS, () => {
    const fixture = byId(POSITIVES, id);
    assert.deepEqual(checker.check(build(fixture)).findings, []);
    assert.deepEqual(walk(build(fixture)).findings, []);
    assert.deepEqual(checker.unreachable(build(fixture), []), []);
  });
}

test('N3: the three codes of the reviewer are each absent for a decorative tabindex=-1 control, however deep the aria-hidden ancestor is', OPTIONS, () => {
  for (const markup of [
    '<div aria-hidden="true"><button type="button" tabindex="-1">Decor</button></div>',
    '<div aria-hidden="true"><a href="#top" tabindex="-1">Decor</a></div>',
    '<div aria-hidden="true"><div><ul><li><button type="button" tabindex="-1">Decor</button></li></ul></div></div>',
    '<section><div aria-hidden="true"><span><a href="#top" tabindex="-1">Decor</a></span></div></section>',
  ]) {
    const found = codes(markup);
    for (const code of ['ARIA_HIDDEN_FOCUSABLE', 'CONTROL_NOT_REACHABLE', 'TABINDEX_NEGATIVE']) assert.ok(!found.includes(code), `${markup}: ${code} must not be reported (${found})`);
    assert.deepEqual(found, [], markup);
  }
});

for (const id of ['X20', 'X21', 'X22']) {
  test(`N3 ${id}: ${byId(NEGATIVES, id).name}: still ARIA_HIDDEN_FOCUSABLE (it is in the Tab order and exposed to nobody)`, OPTIONS, () => {
    assert.ok(codes(byId(NEGATIVES, id)).includes('ARIA_HIDDEN_FOCUSABLE'));
  });
}

test('N3: tabindex=-1 outside an aria-hidden subtree is still reported twice (K6, K7), and so is aria-hidden="false" (it hides nothing)', OPTIONS, () => {
  for (const id of ['K6', 'K7', 'X24']) {
    const found = codes(byId(NEGATIVES, id));
    assert.ok(found.includes('CONTROL_NOT_REACHABLE') && found.includes('TABINDEX_NEGATIVE'), `${id}: ${found}`);
    assert.ok(!found.includes('ARIA_HIDDEN_FOCUSABLE'), `${id}: it is not hidden`);
  }
});

test('N3: beside a decorative aria-hidden control a REAL tabindex=-1 control is still reported, and only that one', OPTIONS, () => {
  const both = checker.check(build('<div aria-hidden="true"><button id="b" type="button" tabindex="-1">Decor</button></div><button id="c" type="button" tabindex="-1">Real</button>')).findings;
  assert.deepEqual(both.filter((item) => /REACHABLE|TABINDEX|ARIA_HIDDEN/.test(item.code)).map((item) => `${item.code} ${item.selector.split(' > ').at(-1)}`).sort(), ['CONTROL_NOT_REACHABLE button#c', 'TABINDEX_NEGATIVE button#c']);
  const document = build('<div aria-hidden="true"><button id="b" type="button" tabindex="-1">Decor</button></div><button id="c" type="button" tabindex="-1">Real</button>');
  assert.deepEqual(checker.unreachable(document, []).map((element) => element.getAttribute('id')), ['c'], 'the Tab walk reports the real control only');
});

test('N3: a tabbable control inside aria-hidden is found by the Tab walk and by the rule; a disabled one is neither focusable nor reported', OPTIONS, () => {
  const document = build(byId(NEGATIVES, 'X20'));
  assert.ok(checker.tabOrder(document).some((element) => element.getAttribute('id') === 'b'), 'it is in the sequential order');
  assert.deepEqual(codes('<div aria-hidden="true"><button type="button" disabled>Off</button></div>'), []);
});

for (const id of ['P12', 'P13']) {
  test(`N3 ${id}: ${byId(POSITIVES, id).name}: no ROLE_MISMATCH and no other finding`, OPTIONS, () => {
    const fixture = byId(POSITIVES, id);
    assert.deepEqual(checker.check(build(fixture)).findings, []);
    assert.deepEqual(walk(build(fixture)).findings, []);
  });
}

test('N3: the role table stays closed: nav role=button (X23) and nav role=tab, h2 role=button (K13) and h2 role=link are still ROLE_MISMATCH', OPTIONS, () => {
  assert.ok(codes(byId(NEGATIVES, 'X23')).includes('ROLE_MISMATCH'));
  assert.ok(codes('<nav aria-label="n" role="tab" aria-selected="false" tabindex="0">One</nav>').includes('ROLE_MISMATCH'));
  assert.ok(codes(byId(NEGATIVES, 'K13')).includes('ROLE_MISMATCH'));
  assert.ok(codes('<h2 id="h" role="link" tabindex="0">Go</h2>').includes('ROLE_MISMATCH'));
  for (const allowed of ['<nav aria-label="n" role="navigation"><a href="#top">Top</a></nav>', '<nav aria-label="n" role="presentation"><a href="#top">Top</a></nav>', '<h2 id="h" tabindex="-1" role="presentation">Section</h2>']) {
    assert.ok(!codes(allowed).includes('ROLE_MISMATCH'), allowed);
  }
});
