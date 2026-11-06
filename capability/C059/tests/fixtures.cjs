'use strict';

// Test tooling, not production code: a valid page fixture and a table of defects. Each defect changes exactly one thing,
// so a checker rule is proven by a fixture that is valid except for that one defect (and the valid fixture has no finding).
const { parseHtml } = require('./dom.cjs');

const VALID = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fixture journey</title></head>
<body>
<a id="skip" href="#main">Skip to the journey</a>
<h1 id="page-heading" tabindex="-1">Fixture journey</h1>
<nav aria-label="Journey steps"><ol><li><a id="to-choose" href="#choose">Choose a lesson</a></li></ol></nav>
<main id="main" tabindex="-1">
<section id="choose" aria-labelledby="choose-h"><h2 id="choose-h">1. Choose a lesson</h2>
<div id="lessons" role="radiogroup" aria-labelledby="choose-h">
<div id="r1" role="radio" aria-checked="true" tabindex="0">First lesson</div>
<div id="r2" role="radio" aria-checked="false" tabindex="-1">Second lesson</div></div>
<button id="open" type="button">Open the chosen lesson</button></section>
<section id="conduct" aria-labelledby="conduct-h"><h2 id="conduct-h">2. Conduct the step</h2>
<form id="f" novalidate>
<section id="error-summary" tabindex="-1" aria-labelledby="error-summary-h" hidden><h3 id="error-summary-h">Fix these fields</h3><ul id="error-list"></ul></section>
<label for="key">Idempotency key</label><input id="key" type="text" aria-describedby="key-help"><p id="key-help">8 to 64 characters</p><p id="key-error" hidden></p>
<label for="units">Units</label><input id="units" type="text" aria-describedby="units-help"><p id="units-help">1 to 10</p><p id="units-error" hidden></p>
<button id="submit" type="submit">Conduct the step</button></form></section>
<section id="result" aria-labelledby="result-h" data-outcome="rejected" data-code="CAPACITY_EXHAUSTED" data-recovery="correct-and-resubmit"><h2 id="result-h" tabindex="-1">3. Result: Rejected</h2>
<div id="recovery" role="group" aria-label="Recovery actions"><button id="recovery-correct-and-resubmit" type="button">Correct and resubmit</button></div></section>
<div id="status" role="status" aria-live="polite" aria-atomic="true">Rejected. Code CAPACITY_EXHAUSTED. The lease does not have that many free synthetic units. Offered: Correct and resubmit.</div>
</main>
<script src="/page.js"></script>
</body></html>`;

const KEY_FIELD = [['<input id="key" type="text" aria-describedby="key-help">', '<input id="key" type="text" aria-invalid="true" aria-describedby="key-help key-error">'],
  ['<p id="key-error" hidden></p>', '<p id="key-error">The key needs 8 to 64 characters.</p>']];
const UNITS_FIELD = [['<input id="units" type="text" aria-describedby="units-help">', '<input id="units" type="text" aria-invalid="true" aria-describedby="units-help units-error">'],
  ['<p id="units-error" hidden></p>', '<p id="units-error">Units must be a whole number from 1 to 10.</p>']];
const KEY_ITEM = '<li><a href="#key">Idempotency key: The key needs 8 to 64 characters.</a></li>';
const UNITS_ITEM = '<li><a href="#units">Units: Units must be a whole number from 1 to 10.</a></li>';
const SUMMARY = (items) => [['tabindex="-1" aria-labelledby="error-summary-h" hidden>', 'tabindex="-1" aria-labelledby="error-summary-h">'], ['<ul id="error-list"></ul>', `<ul id="error-list">${items}</ul>`]];
// A correct error state: both fields invalid and described, the summary lists both, the first invalid field has the focus.
const ERROR_STATE = { edit: [...KEY_FIELD, ...UNITS_FIELD, ...SUMMARY(KEY_ITEM + UNITS_ITEM)], focus: 'key', options: { afterSubmit: true } };

// code: the finding that must be reported; edit: [from, to] replacements of the valid markup; focus: the id to focus (default result-h).
const DEFECTS = [
  { code: 'NAME_MISSING', edit: [['<button id="open" type="button">Open the chosen lesson</button>', '<button id="open" type="button"></button>']] },
  { code: 'NAME_MISMATCH', edit: [['<button id="open" type="button">Open the chosen lesson</button>', '<button id="open" type="button" aria-label="Launch it">Open the chosen lesson</button>']] },
  { code: 'ID_DUPLICATE', edit: [['id="r2"', 'id="r1"']] },
  { code: 'FOCUS_LOST', edit: [], focus: null },
  { code: 'FOCUS_DETACHED', edit: [], focus: 'removed' },
  { code: 'LIVE_REGION_MISSING', edit: [['<div id="status" role="status" aria-live="polite" aria-atomic="true">', '<div id="status">']] },
  { code: 'ANNOUNCEMENT_CONTRADICTS_STATE', edit: [['>Rejected. Code CAPACITY_EXHAUSTED.', '>Succeeded. Reserved 5 synthetic units. Code CAPACITY_EXHAUSTED.']] },
  { code: 'ANNOUNCEMENT_INCOMPLETE', edit: [['Code CAPACITY_EXHAUSTED. ', '']] },
  { code: 'ERROR_FIELD_UNDESCRIBED', edit: [['<input id="key" type="text" aria-describedby="key-help">', '<input id="key" type="text" aria-invalid="true">'], KEY_FIELD[1], ...SUMMARY(KEY_ITEM)], focus: 'key', options: { afterSubmit: true } },
  { code: 'ERROR_FOCUS', edit: ERROR_STATE.edit, focus: 'units', options: { afterSubmit: true } },
  { code: 'H1_COUNT', edit: [['<h2 id="choose-h">1. Choose a lesson</h2>', '<h1 id="second">1. Choose a lesson</h1>']] },
  { code: 'HEADING_ORDER', edit: [['<h2 id="conduct-h">2. Conduct the step</h2>', '<h4 id="conduct-h">2. Conduct the step</h4>']] },
  { code: 'LANDMARK_MAIN', edit: [['<main id="main" tabindex="-1">', '<div id="main" tabindex="-1">'], ['</main>', '</div>']] },
  { code: 'DOC_LANG', edit: [['<html lang="en">', '<html>']] },
  { code: 'DOC_TITLE', edit: [['<title>Fixture journey</title>', '<title></title>']] },
  { code: 'BUSY_NOT_PROGRAMMATIC', edit: [['data-outcome="rejected" data-code="CAPACITY_EXHAUSTED"', 'data-busy="true" data-outcome="rejected" data-code="CAPACITY_EXHAUSTED"']] },
  { code: 'COLOUR_ONLY', edit: [['<h2 id="result-h" tabindex="-1">3. Result: Rejected</h2>', '<h2 id="result-h" tabindex="-1" class="bad">3. Result</h2>']] },
  { code: 'TABINDEX_POSITIVE', edit: [['<button id="open" type="button">', '<button id="open" type="button" tabindex="3">']] },
  { code: 'ROVING_TABINDEX', edit: [['<div id="r2" role="radio" aria-checked="false" tabindex="-1">', '<div id="r2" role="radio" aria-checked="false" tabindex="0">']] },
  { code: 'ZOOM_BLOCKED', edit: [['initial-scale=1"', 'initial-scale=1, user-scalable=no"']] },
  { code: 'ARIA_REF_MISSING', edit: [['aria-labelledby="choose-h"><h2', 'aria-labelledby="nowhere"><h2']] },
  { code: 'LABEL_TARGET_MISSING', edit: [['<label for="key">', '<label for="gone">']] },
  { code: 'ARIA_HIDDEN_FOCUSABLE', edit: [['<button id="open" type="button">', '<button id="open" type="button" aria-hidden="true">']] },
  { code: 'LIVE_REGION_COUNT', edit: [['<div id="recovery" role="group"', '<div id="recovery" aria-live="polite" role="group"']] },
  { code: 'DISABLED_NOT_PROGRAMMATIC', edit: [['<button id="open" type="button">', '<button id="open" type="button" class="is-disabled">']] },
  { code: 'NAV_NAME', edit: [['<nav aria-label="Journey steps">', '<nav>']] },
  { code: 'ERROR_SUMMARY_MISSING', edit: [...KEY_FIELD, ...UNITS_FIELD], focus: 'key', options: { afterSubmit: true } },
];

const STYLE_DEFECTS = [
  { code: 'FOCUS_INDICATOR_MISSING', css: 'a:focus, button:focus { outline: none; }\n' },
  { code: 'REDUCED_MOTION_IGNORED', css: ':focus-visible { outline: 3px solid #000; }\nbutton { transition: background 0.3s; }\n' },
  { code: 'TEXT_CLIPPING_RISK', css: ':focus-visible { outline: 3px solid #000; }\n.box { height: 20px; overflow: hidden; }\n' },
  { code: 'FIXED_FONT_SIZE', css: ':focus-visible { outline: 3px solid #000; }\nbody { font-size: 14px; }\n' },
];
const VALID_CSS = ':focus-visible { outline: 3px solid #000; outline-offset: 2px; }\nbody { font-size: 1rem; }\nbutton { transition: background 0.2s; }\n@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }\n';

// Builds the fixture document; `focus` is an element id, null (nothing focused) or 'removed' (focus on a detached element).
function build({ edit = [], focus = 'result-h', trap = false } = {}) {
  let html = VALID;
  for (const [from, to] of edit) {
    if (!html.includes(from)) throw new Error(`FIXTURE_EDIT_NOT_APPLIED ${from}`);
    html = html.replace(from, to);
  }
  const document = parseHtml(html);
  if (trap) document.getElementById('key').addEventListener('keydown', (event) => { if (event.key === 'Tab') event.preventDefault(); });
  if (focus === 'removed') {
    const ghost = document.createElement('button');
    ghost.setAttribute('id', 'ghost');
    ghost.textContent = 'Ghost';
    Object.defineProperty(document, 'activeElement', { get: () => ghost });
  } else if (focus) document.getElementById(focus).focus();
  return document;
}

module.exports = { DEFECTS, ERROR_STATE, STYLE_DEFECTS, VALID, VALID_CSS, build };
