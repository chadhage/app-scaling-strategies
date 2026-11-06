'use strict';

// Review F1, F3 and F5 (C059): the checker is attacked with fixtures of every class it claims to catch. Each negative is valid except for
// ONE defect and is reported BY NAME (on the DOM stub here, and on the real DOM in tests\browser.cjs); no positive may produce a finding.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const subject = process.env.C059_RED_SUBJECT ? path.resolve(process.env.C059_RED_SUBJECT) : path.resolve(__dirname, '..', '..');
const checker = require(path.join(subject, 'a11y-check.js'));
const { NEGATIVES, POSITIVES, documentHtml } = require('./helpers-2/negatives.cjs');
const { parseHtml, press } = require('./helpers-2/dom.cjs');

const OPTIONS = { timeout: 20000 };
const build = (fixture) => {
  const document = parseHtml(documentHtml(fixture));
  document.getElementById(fixture.focus ?? 'top')?.focus();
  return document;
};
const walk = (document, extra = {}) => checker.walkTab({ document, press: (key, options) => press(document, key, options), ...extra });

for (const fixture of NEGATIVES) {
  test(`negative ${fixture.id}: ${fixture.name} is reported by name ${fixture.codes.join(' + ')}`, OPTIONS, () => {
    const verdict = checker.check(build(fixture));
    const found = verdict.findings.map((item) => item.code);
    for (const code of fixture.codes) assert.ok(found.includes(code), `${fixture.id}: ${code} missing in [${[...new Set(found)]}]`);
    for (const code of fixture.absent ?? []) assert.ok(!found.includes(code), `${fixture.id}: ${code} must not be reported`);
    assert.equal(verdict.ok, false);
    for (const item of verdict.findings) assert.ok(item.selector.length > 0 && item.message.length > 10);
  });
}

for (const fixture of POSITIVES) {
  test(`positive ${fixture.id}: ${fixture.name} has no finding`, OPTIONS, () => {
    assert.deepEqual(checker.check(build(fixture)).findings, []);
    assert.deepEqual(walk(build(fixture)).findings, []);
  });
}

for (const fixture of NEGATIVES.filter((item) => item.unreachable)) {
  test(`walkTab ${fixture.id}: real Tab presses never reach #${fixture.unreachable}, found independently of the focusable set`, OPTIONS, () => {
    const document = build(fixture);
    const verdict = walk(document);
    assert.equal(verdict.trapped, true);
    assert.ok(verdict.findings.some((item) => item.code === 'CONTROL_NOT_REACHABLE' && item.selector.includes(`#${fixture.unreachable}`)), JSON.stringify(verdict.findings));
    assert.ok(!verdict.visited.some((element) => element.getAttribute('id') === fixture.unreachable));
  });
}

test('walkTab: the controls are enumerated by tag and role, not from the focusable set the order is derived from', OPTIONS, () => {
  const document = build(NEGATIVES.find((item) => item.id === 'K5'));
  assert.deepEqual(checker.tabOrder(document), [], 'nothing is in the sequential order of this page');
  assert.equal(walk(document).findings.length, 1, 'an empty order must still report the control that Tab can never reach');
  const roving = build(POSITIVES.find((item) => item.id === 'P1'));
  assert.deepEqual(walk(roving).findings, [], 'a member of a one-stop composite is reached by arrow keys, not by Tab');
});

test('unreachable(): the controls that a recorded Tab walk did not visit, composite members excepted (the API the real-Edge run uses)', OPTIONS, () => {
  assert.equal(typeof checker.unreachable, 'function', 'the checker exposes unreachable(document, visited)');
  const document = build(NEGATIVES.find((item) => item.id === 'K6'));
  const button = document.getElementById('b');
  assert.deepEqual(checker.unreachable(document, []).map((element) => element.getAttribute('id')), ['b']);
  assert.deepEqual(checker.unreachable(document, [button]), []);
  assert.deepEqual(checker.unreachable(build(POSITIVES.find((item) => item.id === 'P1')), []), []);
});

test('K11: a disabled button with a tabindex is DISABLED_FOCUSABLE and not a role problem; an enabled div tabindex=0 is still FOCUSABLE_NO_ROLE', OPTIONS, () => {
  const named = (body) => checker.check(build({ body })).findings.map((item) => item.code);
  assert.deepEqual(named('<button id="b" type="button" disabled tabindex="0">Go</button>').filter((code) => /DISABLED|FOCUSABLE/.test(code)), ['DISABLED_FOCUSABLE']);
  assert.ok(named('<div id="d" tabindex="0">x</div>').includes('FOCUSABLE_NO_ROLE'));
  assert.ok(named('<input id="i" aria-label="i" disabled tabindex="0">').includes('DISABLED_FOCUSABLE'));
});

test('hidden content: an aria-hidden ancestor hides every descendant from the live-region and focus rules, an inline style hides it from all rules', OPTIONS, () => {
  const codes = (fixture) => checker.check(build(fixture)).findings.map((item) => item.code);
  assert.ok(codes({ body: '<section aria-hidden="true"><div><button id="b" type="button">Go</button></div></section>' }).includes('ARIA_HIDDEN_FOCUSABLE'));
  assert.ok(!codes({ body: '<section aria-hidden="true"><p>Only text</p></section>' }).includes('ARIA_HIDDEN_FOCUSABLE'), 'plain text inside aria-hidden is fine');
  assert.ok(!codes({ body: '<div style="visibility:hidden"><button id="b" type="button" tabindex="-1">Go</button></div>' }).includes('CONTROL_NOT_REACHABLE'));
  assert.ok(codes({ status: '<div aria-hidden="true"><div id="status" role="status" aria-live="polite"></div></div>' }).includes('LIVE_REGION_HIDDEN'));
});

test('a live region needs an exposed, announcing mode: off, aria-hidden, assertive and a second polite region are each reported', OPTIONS, () => {
  const codes = (status) => checker.check(build({ status })).findings.map((item) => item.code);
  assert.ok(codes('<div id="status" role="log" aria-live="off"></div>').includes('LIVE_REGION_OFF'));
  assert.ok(codes('<div id="status" aria-live="assertive"></div>').includes('LIVE_REGION_COUNT'));
  assert.ok(codes('<div id="status" role="status"></div><div id="s2" role="status"></div>').includes('LIVE_REGION_COUNT'));
  assert.ok(!codes('<div id="status" role="status"></div>').some((code) => code.startsWith('LIVE_REGION')), 'role=status alone is polite');
  assert.ok(!codes('<div id="status" aria-live="polite"></div>').some((code) => code.startsWith('LIVE_REGION')));
});

const NEGATIVE_CSS = [
  ['CSS1 outline none on :focus', 'FOCUS_INDICATOR_MISSING', 'button:focus { outline: none; }'],
  ['CSS2 outline 0 on :focus-visible', 'FOCUS_INDICATOR_MISSING', ':focus-visible { outline: 0; }'],
  ['CSS3 no focus rule at all', 'FOCUS_INDICATOR_MISSING', 'body { color: #111; }'],
  ['CSS4 outline: 0px on :focus beside a ring on :focus-visible', 'FOCUS_INDICATOR_MISSING', ':focus-visible { outline: 3px solid red; } button:focus { outline: 0px; }'],
  ['CSS5 outline-width: 0px', 'FOCUS_INDICATOR_MISSING', ':focus-visible { outline-width: 0px; }'],
  ['CSS6 a transparent outline and nothing else', 'FOCUS_INDICATOR_MISSING', ':focus-visible { outline: 3px solid transparent; }'],
  ['CSS7 outline-color: transparent on :focus', 'FOCUS_INDICATOR_MISSING', ':focus-visible { outline: 3px solid red; } a:focus { outline-color: transparent; }'],
  ['CSS8 outline-style none then a width', 'FOCUS_INDICATOR_MISSING', ':focus-visible { outline-style: none; outline-width: 3px; }'],
  ['CSS9 animation without a reduced-motion rule', 'REDUCED_MOTION_IGNORED', ':focus-visible { outline: 3px solid red; } .x { animation: spin 1s infinite; }'],
  ['CSS10 smooth scrolling without a reduced-motion rule', 'REDUCED_MOTION_IGNORED', ':focus-visible { outline: 3px solid red; } html { scroll-behavior: smooth; }'],
  ['CSS11 transition-duration', 'REDUCED_MOTION_IGNORED', ':focus-visible { outline: 3px solid red; } a { transition-duration: .3s; }'],
  ['CSS12 a reduce block that covers only an unrelated selector', 'REDUCED_MOTION_IGNORED', ':focus-visible { outline: 3px solid red; } a { transition: color .3s; } @media (prefers-reduced-motion: reduce) { .other { transition: none; } }'],
  ['CSS13 fixed height with hidden overflow', 'TEXT_CLIPPING_RISK', ':focus-visible { outline: 3px solid red; } .b { height: 40px; overflow: hidden; }'],
  ['CSS14 fixed px font size', 'FIXED_FONT_SIZE', ':focus-visible { outline: 3px solid red; } p { font-size: 12px; }'],
  ['CSS15 max-height in em with hidden overflow', 'TEXT_CLIPPING_RISK', ':focus-visible { outline: 3px solid red; } .b { max-height: 2em; overflow: hidden; }'],
  ['CSS16 a fixed pt font size outside print', 'FIXED_FONT_SIZE', ':focus-visible { outline: 3px solid red; } @media screen { p { font-size: 12pt; } }'],
];
const POSITIVE_CSS = [
  ['FP1 motion only inside prefers-reduced-motion: no-preference', ':focus-visible { outline: 3px solid red; } @media (prefers-reduced-motion: no-preference) { a { transition: color .3s; } }'],
  ['FP2 a focus ring made with box-shadow', ':focus-visible { outline: none; box-shadow: 0 0 0 3px #000; }'],
  ['FP3 outline removed only where :focus-visible does not apply', ':focus-visible { outline: 3px solid red; } :focus:not(:focus-visible) { outline: none; }'],
  ['FP4 a commented-out removal', '/* a { outline: none } */ :focus-visible { outline: 3px solid red; }'],
  ['FP5 min-height with hidden overflow', ':focus-visible { outline: 3px solid red; } .b { min-height: 40px; overflow: hidden; }'],
  ['FP6 an em font size', ':focus-visible { outline: 3px solid red; } p { font-size: 1.2em; }'],
  ['FP7 a pt font size inside @media print', ':focus-visible { outline: 3px solid red; } @media print { p { font-size: 12pt; } }'],
  ['FP8 a universal reduce rule covers every animated selector', ':focus-visible { outline: 3px solid red; } a { transition: color .3s; } @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }'],
  ['FP9 the reduce rule names the animated selector', ':focus-visible { outline: 3px solid red; } a, button { transition: color .3s; } @media (prefers-reduced-motion: reduce) { button, a { transition: none; } }'],
  ['FP10 a transparent outline kept for forced colours beside a box-shadow ring', ':focus-visible { outline: 2px solid transparent; box-shadow: 0 0 0 3px #000; }'],
  ['FP11 percentage and viewport heights are not fixed text boxes', ':focus-visible { outline: 3px solid red; } .b { height: 100%; overflow: hidden; } .c { max-height: 50vh; overflow: hidden; }'],
];

for (const [name, code, css] of NEGATIVE_CSS) {
  test(`style negative ${name}: reported by name ${code}`, OPTIONS, () => {
    const found = checker.checkStyles(css).findings.map((item) => item.code);
    assert.ok(found.includes(code), `${code} missing in [${found}]`);
  });
}

for (const [name, css] of POSITIVE_CSS) {
  test(`style positive ${name}: no finding`, OPTIONS, () => {
    assert.deepEqual(checker.checkStyles(css).findings, []);
  });
}
