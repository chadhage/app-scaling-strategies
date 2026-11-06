'use strict';

// Test tooling, not production code: NAMED negative fixtures for the checker (review F1, F3, F5), shared by the DOM-stub tests and
// the real-Edge run. Every fixture is a valid page except for ONE defect; `codes` are the findings that must be reported BY NAME.
const STATUS = '<div id="status" role="status" aria-live="polite"></div>';
const H1 = '<h1 id="top" tabindex="-1">Heading</h1>';

// A complete, valid page around the fixture markup; a fixture may replace the h1, the status region, the head or the language.
function documentHtml({ body = '', status = STATUS, h1 = H1, head = '', lang = 'en' }) {
  return `<!doctype html><html${lang === null ? '' : ` lang="${lang}"`}><head><title>T</title>${head}</head><body><main>${h1}${body}${status}</main></body></html>`;
}

const GROUP = (items) => `<div id="g" role="radiogroup" aria-label="Choices">${items}</div>`;
const RADIO = (id, checked, tabindex) => `<div id="${id}" role="radio" aria-checked="${checked}" tabindex="${tabindex}">Choice ${id}</div>`;
const RESULT = (outcome, extra = '') => `<section id="r" aria-label="Result" data-outcome="${outcome}" data-recovery="" ${extra}>${outcome}</section>`;

const NEGATIVES = [
  { id: 'K3', name: 'a focusable button inside an aria-hidden container', body: '<div aria-hidden="true"><button id="b" type="button">Go</button></div>', codes: ['ARIA_HIDDEN_FOCUSABLE'] },
  { id: 'K5', name: 'a mouse-only div role=button without tabindex', body: '<div id="b" role="button">Click me</div>', codes: ['CONTROL_NOT_REACHABLE', 'ROLE_NOT_FOCUSABLE'], unreachable: 'b' },
  { id: 'K6', name: 'a native button with tabindex=-1', body: '<button id="b" type="button" tabindex="-1">Go</button>', codes: ['CONTROL_NOT_REACHABLE', 'TABINDEX_NEGATIVE'], unreachable: 'b' },
  { id: 'K7', name: 'a link with tabindex=-1', body: '<a id="b" href="#top" tabindex="-1">Back to top</a>', codes: ['CONTROL_NOT_REACHABLE', 'TABINDEX_NEGATIVE'], unreachable: 'b' },
  { id: 'K8', name: 'a span role=link without tabindex', body: '<span id="b" role="link">Go there</span>', codes: ['CONTROL_NOT_REACHABLE', 'ROLE_NOT_FOCUSABLE'], unreachable: 'b' },
  { id: 'K9', name: 'a standalone role=checkbox without aria-checked', body: '<div id="b" role="checkbox" tabindex="0">Agree</div>', codes: ['STATE_MISSING'] },
  { id: 'K10', name: 'a standalone role=radio without aria-checked', body: '<div id="b" role="radio" tabindex="0">Pick</div>', codes: ['STATE_MISSING'] },
  { id: 'K11', name: 'a disabled button with tabindex=0 (reported under its own name)', body: '<button id="b" type="button" disabled tabindex="0">Go</button>', codes: ['DISABLED_FOCUSABLE'], absent: ['FOCUSABLE_NO_ROLE'] },
  { id: 'K12', name: 'a button with role=heading', body: '<button id="b" type="button" role="heading">Go</button>', codes: ['ROLE_MISMATCH'] },
  { id: 'K13', name: 'an h2 with role=button', body: '<h2 id="h" role="button" tabindex="0">Go</h2>', codes: ['ROLE_MISMATCH'] },
  { id: 'K14', name: 'an input with role=button', body: '<label for="i">L</label><input id="i" role="button">', codes: ['ROLE_MISMATCH'] },
  { id: 'K15', name: 'a link with role=heading', body: '<a id="a" href="#top" role="heading">Top</a>', codes: ['ROLE_MISMATCH'] },
  { id: 'V2', name: 'a status region with aria-live=off', status: '<div id="status" role="status" aria-live="off"></div>', codes: ['LIVE_REGION_OFF', 'LIVE_REGION_MISSING'] },
  { id: 'V3', name: 'a polite live region that is aria-hidden', status: '<div id="status" role="status" aria-live="polite" aria-hidden="true"></div>', codes: ['LIVE_REGION_HIDDEN', 'LIVE_REGION_MISSING'] },
  { id: 'X1', name: 'tabindex=1 (a positive tabindex of any size)', body: '<button id="b" type="button" tabindex="1">Go</button>', codes: ['TABINDEX_POSITIVE'] },
  { id: 'X2', name: 'a page without an h1', body: '<h2 id="h" tabindex="-1">Only an h2</h2>', h1: '', codes: ['H1_COUNT'], focus: 'h' },
  { id: 'X3', name: 'the first heading is an h2 and an h1 comes later', body: '<h1 id="late">Late</h1>', h1: '<h2 id="top" tabindex="-1">First</h2>', codes: ['HEADING_ORDER'], absent: ['H1_COUNT'] },
  { id: 'X4', name: 'a one-letter document language', body: '', lang: 'e', codes: ['DOC_LANG'] },
  { id: 'X5', name: 'viewport maximum-scale=1 blocks zoom', body: '', head: '<meta name="viewport" content="width=device-width, maximum-scale=1">', codes: ['ZOOM_BLOCKED'] },
  { id: 'X6', name: 'aria-labelledby names a control with other words than its visible text', body: '<span id="n">Save</span><button id="b" type="button" aria-labelledby="n">Delete</button>', codes: ['NAME_MISMATCH'] },
  { id: 'X7', name: 'the only live region is a role=alert', status: '<div id="status" role="alert" aria-live="polite"></div>', codes: ['LIVE_REGION_COUNT'] },
  { id: 'X8', name: 'a pending state that is not aria-busy', body: RESULT('pending'), codes: ['BUSY_NOT_PROGRAMMATIC'] },
  { id: 'X9', name: 'a button whose only text is aria-hidden', body: '<button id="b" type="button"><span aria-hidden="true">Go</span></button>', codes: ['NAME_MISSING'] },
  { id: 'X10', name: 'the roving tab stop is not the checked radio', body: GROUP(`${RADIO('r1', 'false', 0)}${RADIO('r2', 'true', -1)}`), codes: ['ROVING_TABINDEX'] },
  { id: 'X11', name: 'a second radio with a positive tabindex', body: GROUP(`${RADIO('r1', 'true', 0)}${RADIO('r2', 'false', 2)}`), codes: ['ROVING_TABINDEX', 'TABINDEX_POSITIVE'] },
  { id: 'X12', name: 'a native checkbox with tabindex=-1', body: '<input id="c" type="checkbox" aria-label="Agree" tabindex="-1">', codes: ['CONTROL_NOT_REACHABLE', 'TABINDEX_NEGATIVE'], unreachable: 'c' },
  { id: 'X13', name: 'a standalone radio with tabindex=-1 outside any group', body: RADIO('b', 'false', -1), codes: ['CONTROL_NOT_REACHABLE'], unreachable: 'b' },
  { id: 'X14', name: 'a radio group with no tab stop at all', body: GROUP(`${RADIO('r1', 'true', -1)}${RADIO('r2', 'false', -1)}`), codes: ['ROVING_TABINDEX'] },
  { id: 'X15', name: 'a status region hidden by an inline style', status: '<div id="status" role="status" aria-live="polite" style="display: none"></div>', codes: ['LIVE_REGION_MISSING'] },
  { id: 'X16', name: 'a dialog without a name', body: '<div id="d" role="dialog">Content</div>', codes: ['GROUP_NAME_MISSING'] },
  { id: 'X17', name: 'a tab list whose selected tab is not the tab stop', body: '<div id="g" role="tablist" aria-label="Views"><div id="t1" role="tab" aria-selected="false" tabindex="0">One</div><div id="t2" role="tab" aria-selected="true" tabindex="-1">Two</div></div>', codes: ['ROVING_TABINDEX'] },
  { id: 'X18', name: 'a tab without aria-selected', body: '<div id="g" role="tablist" aria-label="Views"><div id="t1" role="tab" tabindex="0">One</div></div>', codes: ['STATE_MISSING'] },
  { id: 'X19', name: 'a switch with an invalid aria-checked value', body: '<div id="s" role="switch" aria-checked="maybe" tabindex="0">Sound</div>', codes: ['STATE_MISSING'] },
  // Second review, N3: the boundaries of the two relaxations below (P10 to P13) stay defects.
  { id: 'X20', name: 'a button with an explicit tabindex=0 inside an aria-hidden container is tabbable', body: '<div aria-hidden="true"><button id="b" type="button" tabindex="0">Go</button></div>', codes: ['ARIA_HIDDEN_FOCUSABLE'] },
  { id: 'X21', name: 'a link inside an aria-hidden container is tabbable', body: '<div aria-hidden="true"><a id="b" href="#top">Top</a></div>', codes: ['ARIA_HIDDEN_FOCUSABLE'] },
  { id: 'X22', name: 'a div role=button tabindex=0 inside an aria-hidden container', body: '<div aria-hidden="true"><div id="b" role="button" tabindex="0">Go</div></div>', codes: ['ARIA_HIDDEN_FOCUSABLE'] },
  { id: 'X23', name: 'a nav with role=button does not fit', body: '<nav id="n" aria-label="Views" role="button" tabindex="0">Go</nav>', codes: ['ROLE_MISMATCH'] },
  { id: 'X24', name: 'a button with tabindex=-1 inside aria-hidden="false" is still a control that Tab never reaches', body: '<div aria-hidden="false"><button id="b" type="button" tabindex="-1">Go</button></div>', codes: ['CONTROL_NOT_REACHABLE', 'TABINDEX_NEGATIVE'], unreachable: 'b' },
];

// Fixtures that must produce NO finding: composites and natives that look like defects to a naive rule.
const POSITIVES = [
  { id: 'P1', name: 'a radio group with one roving tab stop', body: GROUP(`${RADIO('r1', 'true', 0)}${RADIO('r2', 'false', -1)}`) },
  { id: 'P2', name: 'a tab list with one roving tab stop', body: '<div id="g" role="tablist" aria-label="Views"><div id="t1" role="tab" aria-selected="true" tabindex="0">One</div><div id="t2" role="tab" aria-selected="false" tabindex="-1">Two</div></div>' },
  { id: 'P3', name: 'a native disabled button (not in the Tab order by design)', body: '<button id="b" type="button" disabled>Go</button>' },
  { id: 'P4', name: 'a heading that may take focus programmatically', body: '<h2 id="h" tabindex="-1">Section</h2>' },
  { id: 'P5', name: 'an aria-disabled button stays in the Tab order', body: '<button id="b" type="button" aria-disabled="true">Go</button>' },
  { id: 'P6', name: 'a button with role=link and a link with role=button are permitted', body: '<button id="b" type="button" role="link">Go</button><a id="a" href="#top" role="button">Top</a>' },
  { id: 'P7', name: 'a status region with explicit aria-live=polite and a live role', status: '<div id="status" role="status" aria-live="polite" aria-atomic="true"></div>' },
  { id: 'P8', name: 'a checkbox, a radio and a switch that carry their state', body: '<div id="c" role="checkbox" aria-checked="mixed" tabindex="0">A</div><div id="s" role="switch" aria-checked="false" tabindex="0">B</div>' },
  { id: 'P9', name: 'a hidden control is not in the page', body: '<button id="b" type="button" tabindex="-1" hidden>Go</button><div style="display: none"><div id="x" role="button">Hidden</div></div>' },
  // Second review, N3: exposed to nobody, or allowed by ARIA in HTML.
  { id: 'P10', name: 'a decorative button with tabindex=-1 inside an aria-hidden subtree is exposed to nobody and needs no Tab stop', body: '<div aria-hidden="true"><button type="button" tabindex="-1">Decor</button></div>' },
  { id: 'P11', name: 'a decorative link with tabindex=-1 inside an aria-hidden subtree is exposed to nobody and needs no Tab stop', body: '<div aria-hidden="true"><p><a href="#top" tabindex="-1">Decor</a></p></div>' },
  { id: 'P12', name: 'a nav element with role=tablist (ARIA in HTML allows it) and one roving tab stop', body: '<nav id="n" role="tablist" aria-label="Views"><button id="t1" type="button" role="tab" aria-selected="true" tabindex="0">One</button><button id="t2" type="button" role="tab" aria-selected="false" tabindex="-1">Two</button></nav>' },
  { id: 'P13', name: 'a heading with role=menuitem (ARIA in HTML allows it)', body: '<h2 id="m" role="menuitem" tabindex="0">Item</h2>' },
];

module.exports = { NEGATIVES, POSITIVES, documentHtml };
