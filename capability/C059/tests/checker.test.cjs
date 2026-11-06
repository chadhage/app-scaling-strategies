'use strict';

// The checker's rules, one by one: every rule has its own negative fixture, reported BY NAME with a selector and a message, and the
// valid fixture, the correct error state and the real style sheet have no finding.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const checker = require('../a11y-check.js');
const { DEFECTS, ERROR_STATE, STYLE_DEFECTS, VALID_CSS, build } = require('./fixtures.cjs');
const { parseHtml, press } = require('./dom.cjs');

const OPTIONS = { timeout: 20000 };
const page = (body, { head = '', focus = 'top' } = {}) => {
  const document = parseHtml(`<!doctype html><html lang="en"><head><title>T</title>${head}</head><body><h1 id="top" tabindex="-1">Heading</h1><main>${body}<div id="status" role="status" aria-live="polite"></div></main></body></html>`);
  if (focus) document.getElementById(focus).focus();
  return document;
};
const codes = (document, options) => checker.check(document, options).findings.map((item) => item.code);

test('the valid fixture, a correct error state and the real index.html markup have no finding', OPTIONS, () => {
  assert.deepEqual(checker.check(build()).findings, []);
  assert.deepEqual(checker.check(build(ERROR_STATE), ERROR_STATE.options).findings, []);
  assert.deepEqual(codes(page('<button id="b">Go</button>')), []);
});

for (const defect of DEFECTS) {
  test(`rule ${defect.code}: reported by name with a selector and a message`, OPTIONS, () => {
    const verdict = checker.check(build(defect), defect.options);
    const finding = verdict.findings.find((item) => item.code === defect.code);
    assert.ok(finding, `${defect.code} missing in ${verdict.findings.map((item) => item.code)}`);
    assert.match(finding.selector, /^[a-z0-9#:>() .-]+$/i);
    assert.ok(finding.message.length > 10);
    assert.equal(verdict.ok, false);
  });
}

test('every defect of the table is reported and the fixture builder refuses an edit that did not apply', OPTIONS, () => {
  assert.throws(() => build({ edit: [['not in the markup', 'x']] }), /FIXTURE_EDIT_NOT_APPLIED/);
  assert.ok(new Set(DEFECTS.map((item) => item.code)).size >= 27);
});

const EXTRA = [
  ['ROLE_INVALID', '<div id="x" role="banana">x</div>'],
  ['FOCUSABLE_NO_ROLE', '<div id="x" tabindex="0">x</div>'],
  ['GROUP_NAME_MISSING', '<div id="x" role="group"><button id="b">Go</button></div>'],
  ['NAME_MISSING', '<iframe id="x"></iframe>'],
  ['NAME_MISMATCH', '<label for="k">Visible label</label><input id="k" aria-label="Other words">'],
  ['LIVE_REGION_COUNT', '<div id="x" role="alert">x</div>'],
  ['ID_DUPLICATE', '<p id="a">1</p><p id="a">2</p>'],
  ['ARIA_REF_MISSING', '<input id="k" aria-describedby="gone" aria-label="k">'],
  ['ARIA_HIDDEN_FOCUSABLE', '<button id="b" aria-hidden="true">Go</button>'],
  ['ERROR_STALE', '<input id="k" aria-label="k"><p id="k-error">Wrong</p>'],
  ['ERROR_SUMMARY_STALE', '<section id="error-summary" aria-label="Errors"><ul><li>x</li></ul></section>'],
  ['STATE_AMBIGUOUS', '<section id="r1" aria-label="a" data-outcome="none">none</section><section id="r2" aria-label="b" data-outcome="none">none</section>'],
];

for (const [code, body] of EXTRA) {
  test(`rule ${code} on a minimal page`, OPTIONS, () => {
    assert.ok(codes(page(body)).includes(code), `${code} in ${codes(page(body))}`);
  });
}

const state = (outcome, extra, text, buttons = '') => `<section id="r" aria-label="Result" data-outcome="${outcome}" ${extra}>${outcome === 'validation' ? 'not submitted' : outcome}${buttons}</section>`;

test('announcement rules: success words, progress, the typed code, every offered action, and the recovery count', OPTIONS, () => {
  const said = (outcome, extra, text, buttons, about) => {
    const document = page(`${state(outcome, extra, text, buttons)}`);
    document.getElementById('status').setAttribute('data-about', about ?? 'result');
    document.getElementById('status').textContent = text;
    return codes(document);
  };
  assert.deepEqual(said('succeeded', 'data-recovery=""', 'Succeeded. Done.'), []);
  assert.ok(said('succeeded', 'data-recovery=""', 'Succeeded, but the step failed.').includes('ANNOUNCEMENT_CONTRADICTS_STATE'));
  assert.ok(said('succeeded', 'data-recovery=""', 'Reserved five units.').includes('ANNOUNCEMENT_CONTRADICTS_STATE'));
  assert.ok(said('rejected', 'data-code="X_CODE" data-recovery=""', 'Rejected. All done.').includes('ANNOUNCEMENT_CONTRADICTS_STATE'));
  assert.ok(said('unknown', 'data-recovery=""', 'Rejected.').includes('ANNOUNCEMENT_CONTRADICTS_STATE'), 'the wrong state word');
  assert.deepEqual(said('rejected', 'data-code="X_CODE" data-recovery=""', 'Rejected. Code X_CODE.'), []);
  assert.ok(said('rejected', 'data-code="X_CODE" data-recovery=""', 'Rejected.').includes('ANNOUNCEMENT_INCOMPLETE'));
  const offered = '<button id="b" type="button">Retry now</button>';
  assert.ok(said('rejected', 'data-code="X_CODE" data-recovery="retry"', 'Rejected. Code X_CODE.', offered).includes('ANNOUNCEMENT_INCOMPLETE'), 'an offered action that is not announced');
  assert.deepEqual(said('rejected', 'data-code="X_CODE" data-recovery="retry"', 'Rejected. Code X_CODE. Offered: Retry now.', offered), []);
  assert.ok(said('rejected', 'data-code="X_CODE" data-recovery="retry cancel"', 'Rejected. Code X_CODE. Offered: Retry now.', offered).includes('RECOVERY_MISMATCH'));
  assert.deepEqual(said('pending', 'aria-busy="true" data-recovery=""', 'Working. Waiting for the server.', '', 'progress'), []);
  assert.ok(said('rejected', 'data-code="X" data-recovery=""', 'Working. Waiting.', '', 'progress').includes('ANNOUNCEMENT_CONTRADICTS_STATE'));
  assert.ok(said('none', 'data-recovery=""', 'Success!', '', 'navigation').includes('ANNOUNCEMENT_CONTRADICTS_STATE'));
  assert.deepEqual(said('none', 'data-recovery=""', 'Chosen.', '', 'navigation'), []);
  assert.deepEqual(said('validation', 'data-recovery=""', 'Not submitted: 1 field needs correction.', '', 'validation'), []);
});

test('focus rules: a removed previous focus, a hidden or disabled focus, an unnamed focus, a detached focus', OPTIONS, () => {
  const document = page('<button id="b">Go</button>', { focus: 'b' });
  const removed = document.getElementById('b');
  removed.remove();
  assert.ok(codes(document, { previousFocus: removed }).includes('FOCUS_DETACHED'));
  assert.ok(codes(document, { previousFocus: removed }).includes('FOCUS_LOST'));
  assert.ok(!codes(document).includes('FOCUS_DETACHED'));
  const disabled = page('<button id="b" disabled>Go</button>');
  Object.defineProperty(disabled, 'activeElement', { get: () => disabled.getElementById('b') });
  assert.ok(codes(disabled).includes('FOCUS_HIDDEN'));
  const unnamed = page('<div id="u" tabindex="-1"></div>', { focus: 'u' });
  assert.ok(codes(unnamed).includes('FOCUS_UNNAMED'));
  const hidden = page('<section hidden><button id="b">Go</button></section>');
  Object.defineProperty(hidden, 'activeElement', { get: () => hidden.getElementById('b') });
  assert.ok(codes(hidden).includes('FOCUS_HIDDEN'));
  const nothing = page('<p>x</p>');
  Object.defineProperty(nothing, 'activeElement', { get: () => null });
  assert.ok(codes(nothing).includes('FOCUS_LOST'));
  assert.ok(codes(page('<p>x</p>', { focus: null })).includes('FOCUS_LOST'));
});

test('accessible names: aria-labelledby, aria-label, a wrapping label, a button value, a frame title and the label-in-name rule', OPTIONS, () => {
  const document = page('<span id="n">Named by</span><button id="a" aria-labelledby="n">Named by</button><label id="w">Wrapped<input id="i"></label><input id="v" type="submit" value="Send it"><iframe id="f" title="A frame"></iframe><button id="m" aria-label="Open the box">Open</button><button id="x" title="Only title"></button>');
  const nameOf = (id) => checker.accessibleName(document.getElementById(id), document);
  assert.deepEqual(nameOf('a'), { name: 'Named by', source: 'aria-labelledby' });
  assert.deepEqual(nameOf('i'), { name: 'Wrapped', source: 'label' });
  assert.deepEqual(nameOf('v'), { name: 'Send it', source: 'value' });
  assert.deepEqual(nameOf('f'), { name: 'A frame', source: 'title' });
  assert.deepEqual(nameOf('m'), { name: 'Open the box', source: 'aria-label' });
  assert.deepEqual(nameOf('x'), { name: 'Only title', source: 'title' });
  assert.deepEqual(codes(document), []);
  assert.equal(checker.normalize('  a \n b  '), 'a b');
});

test('the hooks: isHidden removes an element from the checks; selectors name the element; the Tab order puts positive tabindex first', OPTIONS, () => {
  const document = page('<button id="b" tabindex="2">Go</button><button id="c">Also</button><div id="d"><p></p><p></p><button></button></div>');
  assert.ok(codes(document).includes('NAME_MISSING'));
  assert.ok(!codes(document, { isHidden: (element) => element.tagName === 'BUTTON' && !element.getAttribute('id') }).includes('NAME_MISSING'));
  const finding = checker.check(document).findings.find((item) => item.code === 'NAME_MISSING');
  assert.match(finding.selector, /^div#d > button$/);
  assert.deepEqual(checker.tabOrder(document).map((element) => element.getAttribute('id')), ['b', 'c', null]);
  assert.deepEqual(checker.tabOrder(page('<button id="z" tabindex="-1">z</button><a href="#top" id="l">l</a><a id="nolink">n</a><input type="hidden" id="h"><button id="y" disabled>y</button>')).map((element) => element.getAttribute('id')), ['l']);
  assert.equal(checker.selectorOf(document.getElementById('top')), 'h1#top');
  assert.match(checker.selectorOf(document.getElementsByTagName?.('p')?.[0] ?? document.documentElement.children[1].children[1]), /main|body|html|h1/);
});

test('walkTab: a trap that moves but never reaches a stop, the backward cycle, a bound, and a page without tab stops', OPTIONS, () => {
  const document = page('<button id="a">A</button><button id="b">B</button><button id="c">C</button>', { focus: 'a' });
  document.getElementById('b').addEventListener('keydown', (event) => { if (event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); document.getElementById('a').focus(); } });
  const skipped = checker.walkTab({ document, press: (key, options) => press(document, key, options) });
  assert.equal(skipped.trapped, true);
  assert.match(skipped.findings[0].message, /never reaches 1 tab stop/);
  const stuck = page('<button id="a">A</button><button id="b">B</button>', { focus: 'a' });
  stuck.getElementById('a').addEventListener('keydown', (event) => { if (event.key === 'Tab') event.preventDefault(); });
  const stuckWalk = checker.walkTab({ document: stuck, press: (key, options) => press(stuck, key, options) });
  assert.equal(stuckWalk.trapped, true);
  assert.deepEqual(stuckWalk.findings.map((item) => [item.code, item.selector]), [['KEYBOARD_TRAP', 'button#a']]);
  assert.match(stuckWalk.findings[0].message, /does not move the focus out of this element/);
  const free = page('<button id="a">A</button><button id="b">B</button>', { focus: 'a' });
  const backwards = checker.walkTab({ document: free, press: (key, options) => press(free, key, options), shift: true });
  assert.equal(backwards.trapped, false);
  assert.deepEqual(backwards.visited.map((element) => element.id), ['a', 'b']);
  assert.equal(checker.walkTab({ document: free, press: (key, options) => press(free, key, options), limit: 1 }).visited.length >= 1, true);
  const none = page('<p>x</p>');
  assert.deepEqual(checker.walkTab({ document: none, press: () => assert.fail('no press without tab stops') }), { trapped: false, visited: [], findings: [] });
  const single = page('<button id="only">Only</button>', { focus: 'only' });
  assert.equal(checker.walkTab({ document: single, press: (key, options) => press(single, key, options) }).trapped, false, 'a page with one tab stop is not a trap');
});

for (const defect of STYLE_DEFECTS) {
  test(`style rule ${defect.code}: reported by name with the offending selector`, OPTIONS, () => {
    const finding = checker.checkStyles(defect.css).findings.find((item) => item.code === defect.code);
    assert.ok(finding);
    assert.ok(finding.selector.length > 0 && finding.message.length > 10);
  });
}

test('style rules: what is accepted and what is not', OPTIONS, () => {
  const clean = (css) => checker.checkStyles(css).findings.map((item) => item.code);
  assert.deepEqual(clean(VALID_CSS), []);
  assert.deepEqual(clean(fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8')), [], 'the real style sheet');
  assert.deepEqual(clean(':focus-visible { box-shadow: 0 0 0 3px #000; }'), []);
  assert.deepEqual(clean(':focus-visible { outline: 0; box-shadow: 0 0 0 3px #000; }'), []);
  assert.deepEqual(clean('a:focus { outline: none; }\n:focus-visible { outline: 3px solid #000; }'), ['FOCUS_INDICATOR_MISSING']);
  assert.deepEqual(clean(':focus-visible { outline: 3px solid red; }\n@media (prefers-reduced-motion: reduce) { * { animation-duration: 0s !important; } }\nb { animation: spin 1s; }'), []);
  assert.deepEqual(clean(':focus-visible { outline: 3px solid red; }\nhtml { scroll-behavior: smooth; }'), ['REDUCED_MOTION_IGNORED']);
  assert.deepEqual(clean(':focus-visible { outline: 3px solid red; }\nb { transition: none; }'), []);
  assert.deepEqual(clean(':focus-visible { outline: 3px solid red; }\n.x { overflow: clip; max-height: 4pt; }'), ['TEXT_CLIPPING_RISK']);
  assert.deepEqual(clean(':focus-visible { outline: 3px solid red; }\n.x { overflow: hidden; height: 5rem; }'), []);
  assert.deepEqual(clean(':focus-visible { outline: 3px solid red; }\nbody { font-size: 12pt; }'), ['FIXED_FONT_SIZE']);
  assert.deepEqual(clean('/* :focus { outline: none } */\n:focus-visible { outline: 2px dashed red; }'), []);
  assert.deepEqual(clean('body { margin: 0 }'), ['FOCUS_INDICATOR_MISSING']);
});
