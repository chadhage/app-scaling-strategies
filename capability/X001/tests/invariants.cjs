'use strict';

// Global invariants of the rendered page, read back from the DOM after EVERY action (L-0118, L-0119, L-0190). Everything shown is compared with the
// independent oracle (tests\oracle.cjs, a fold with the C044 reducer): all sixteen console state lines or all seven trace lines, the announcement, the
// producing entry, every row (label, text, class, note), every button, the scrub bar, the limits panel and the provenance. The state ids are ENUMERATED
// from the DOM and must equal the set the oracle compares, so a new displayed line fails until it is compared. The page lists its rows from the marks of
// the model, so each row must also equal stateAt(i).mark of the model (a failed row is never listed as APPLIED).
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const D = require('..\\describe.js');
const saved = require('..\\saved.js');
const oracle = require('.\\oracle.cjs');

const modelCache = new Map();
const modelOf = (run) => {
  if (!modelCache.has(run.id)) modelCache.set(run.id, T.build(run));
  return modelCache.get(run.id);
};
const word = (value) => (typeof value === 'string' ? value.replace(/[^\x20-\x7e]/g, '?').slice(0, 60) : 'unknown');

// Asserts everything the page promises for run `id` shown at 0-based `index`. options.skipError / options.skipStatus leave the error and the
// announcement text to a caller that models refusals (the property test); the slider text always equals the announcement of the shown position.
function assertShown(page, id, index, label = '', options = {}) {
  const run = saved.runs.find((item) => item.id === id);
  const expected = oracle.expectedFor(run, index);
  const model = modelOf(run);
  const hits = oracle.hitsFor(run);
  const ids = page.ids();
  assert.equal(new Set(ids).size, ids.length, `${label} ids are unique`);
  const items = page.$('entries').children;
  assert.equal(items.length, expected.n, `${label} every recorded entry is listed once`);
  assert.deepEqual(['seq-find', 'seq-epoch', 'seq-number'].map((name) => page.$(name).disabled), [false, false, false], `${label} the sequence lookup is available while a run is shown`);
  items.forEach((item, i) => {
    const row = expected.rows[i];
    const here = i === index;
    assert.equal(item.id, `entry-${i + 1}`);
    assert.equal(item.getAttribute('aria-current'), here ? 'step' : null, `${label} one current entry`);
    assert.equal(item.children[0].textContent, oracle.LABEL[row.mark], `${label} text label of entry ${i + 1}`);
    assert.deepEqual(item.children.map((child) => child.className), ['mark', '', 'here', 'note'], `${label} the four spans of entry ${i + 1} keep their style hooks`);
    assert.equal(item.children[0].textContent, D.label(model.stateAt(i).mark), `${label} entry ${i + 1} is the row the model marks (stateAt(i).mark)`);
    assert.equal(item.children[1].textContent, oracle.entryText(row.entry), `${label} recorded text of entry ${i + 1}`);
    assert.equal(item.children[2].textContent, here ? 'current position' : '', `${label} current marker of entry ${i + 1}`);
    assert.equal(item.children[3].textContent, row.note, `${label} the limits show right where they occur (entry ${i + 1})`);
    assert.equal(item.className, here ? 'current' : '', `${label} class of entry ${i + 1}`);
    assert.equal(item.dataset.class, expected.rowClass(i), `${label} failed/unknown never look ok (entry ${i + 1})`);
  });
  assert.equal(page.$('saved-run').value, id, `${label} the chooser names the displayed run`);
  assert.equal(page.position(), index + 1);
  assert.equal(page.text('position'), `Position ${index + 1} of ${expected.n}`);
  assert.equal(page.$('position').dataset.of, String(expected.n));
  const slider = page.$('scrub');
  assert.deepEqual(['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-disabled', 'tabindex'].map((name) => slider.getAttribute(name)), ['1', String(expected.n), String(index + 1), 'false', '0']);
  assert.equal(slider.getAttribute('aria-valuetext'), expected.announcement, `${label} the slider text is the announcement of the shown position`);
  if (!options.skipStatus) assert.equal(page.text('status'), expected.announcement, `${label} announcement`);
  assert.equal(page.$('status').dataset.state, 'SHOWN');
  assert.equal(page.text('producing'), expected.producing, `${label} producing entry`);
  assert.equal(page.$('producing').dataset.mark, expected.row.mark);
  assert.equal(page.location.hash, `#run=${id}&pos=${index + 1}`, `${label} the URL names the displayed position`);
  if (!options.skipError) assert.equal(page.text('error'), '', `${label} no error while a valid position is shown`);
  const fill = page.$('scrub-fill').style.width;
  assert.ok(/^[0-9.]+%$/.test(fill) && Math.abs(Number.parseFloat(fill) - (index * 100) / Math.max(1, expected.n - 1)) < 0.001, `${label} scrub bar ${fill}`);
  const lines = page.$('state').descendants().filter((node) => node.id);
  assert.deepEqual(lines.map((node) => node.id), expected.ids, `${label} the state panel lists exactly the lines the oracle compares, in order`);
  for (const node of lines) assert.equal(node.textContent, expected.lines[node.id], `${label} ${node.id}`);
  assert.deepEqual(page.$('state').children.filter((_, position) => position % 2 === 0).map((node) => node.textContent), oracle.LINE_LABELS[run.kind], `${label} the label of every state line`);
  if (run.kind === 'console') {
    const counts = expected.row.state.counts;
    const delivered = run.entries.slice(0, index + 1).filter((entry) => entry && entry.type === 'event').length;
    assert.equal(delivered, counts.applied + counts.duplicates + counts.outOfOrder + counts.rejected, `${label} delivered = applied + dropped + rejected`);
  }
  assert.equal(page.text('verified'), expected.verified, `${label} verification text`);
  const source = run.source || {};
  assert.equal(page.text('provenance'), `${typeof run.title === 'string' ? run.title.slice(0, 200) : run.id} Source: ${word(source.producer)} ${word(source.accepted)}${source.hostile ? ' (FICTIONAL HOSTILE SET)' : ''}.`);
  assert.deepEqual(page.$('limits').children.map((item) => item.textContent), D.limitLines(model.limits), `${label} limits panel`);
  assert.equal(page.$('prev').disabled, index === 0, `${label} Previous is off only at the first position`);
  assert.equal(page.$('next').disabled, index === expected.n - 1, `${label} Next is off only at the last position`);
  for (const kind of T.JUMPS) {
    assert.equal(page.$(`prev-${kind}`).disabled, !hits[kind].some((hit) => hit < index), `${label} previous ${kind} availability`);
    assert.equal(page.$(`next-${kind}`).disabled, !hits[kind].some((hit) => hit > index), `${label} next ${kind} availability`);
  }
  assert.deepEqual(page.calls, [], `${label} nothing was fetched, timed or opened`);
  return expected;
}

// What an unloaded page (nothing chosen, or a refused saved run) shows: no timeline, no state, no provenance, every control off (the whole of unload()).
function assertUnloaded(page, label = '') {
  for (const id of ['entries', 'state', 'limits']) assert.equal(page.$(id).children.length, 0, `${label} ${id} is empty`);
  assert.equal(page.$('status').dataset.state, 'UNLOADED', label);
  assert.equal(page.text('provenance'), '', label);
  assert.equal(page.text('verified'), 'Nothing is verified yet.', label);
  assert.equal(page.text('producing'), 'No position is shown.', label);
  assert.equal(page.$('producing').dataset.mark, 'none', label);
  assert.equal(page.text('position'), 'Position: none', label);
  assert.deepEqual([page.$('position').dataset.position, page.$('position').dataset.of], ['0', '0'], label);
  assert.deepEqual(['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-valuetext', 'aria-disabled', 'tabindex'].map((name) => page.$('scrub').getAttribute(name)),
    ['0', '0', '0', 'No saved run is loaded', 'true', '-1'], label);
  assert.equal(page.$('scrub-fill').style.width, '0%', label);
  assert.equal(page.text('seq-result'), '', label);
  const buttons = ['prev', 'next', 'seq-find', 'seq-epoch', 'seq-number', ...T.JUMPS.flatMap((kind) => [`prev-${kind}`, `next-${kind}`])];
  assert.deepEqual(buttons.filter((id) => page.$(id).disabled !== true), [], `${label} every control is off`);
}

module.exports = Object.freeze({ assertShown, assertUnloaded, expectedFor: oracle.expectedFor, hitsFor: oracle.hitsFor, appliedIndex: oracle.appliedIndex, FAILED: oracle.FAILED, UNKNOWN: oracle.UNKNOWN });
