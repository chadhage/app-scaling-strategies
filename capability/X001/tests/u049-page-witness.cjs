'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { loadPage } = require('.\\dom-stub.cjs');
const saved = require('..\\saved.js');
const prior = require('.\\u049-prior-page.json');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
assert.equal(hash(Buffer.from(source)), prior.sourceRawSha256);
assert.equal(prior.rows.length, 18);

const element = (node) => ({
  tag: node.tag, id: node.id, text: node.textContent, value: node.value, disabled: node.disabled, className: node.className,
  attributes: [...node.attributes].sort(([a], [b]) => a.localeCompare(b)), dataset: { ...node.dataset }, style: { ...node.style },
  children: node.children.map(element),
});
const snapshot = (page) => JSON.stringify({
  elements: [...page.document.elements].sort(([a], [b]) => a.localeCompare(b)).map(([id, node]) => [id, element(node)]),
  hash: page.location.hash, history: page.history.calls, effectCalls: page.calls, creationKinds: page.document.created,
});
const size = (run) => run.kind === 'console' ? run.entries.length : run.snapshot.events.length;
const valid = saved.runs.filter((run) => !run.source.hostile || run.kind === 'console');

function witness(row) {
  const changed = source.slice(0, row.start) + row.replacement + source.slice(row.end);
  const results = { id: row.id, reviewRow: row.reviewRow, observations: 0, differences: [], proof: row.proof };
  const pair = (options = {}) => [loadPage(options), loadPage({ ...options, patch: { 'page.js': () => changed } })];
  const compare = (pages, label, before = null) => {
    results.observations += 1;
    const values = pages.map(snapshot);
    const identity = before ? pages.map((page, index) => {
      const after = page.$('entries').children;
      return after.length === before[index].length && after.every((node, offset) => node === before[index][offset]);
    }) : [true, true];
    if (values[0] !== values[1] || identity[0] !== identity[1]) {
      if (results.differences.length < 12) results.differences.push({ label, publicDomEqual: values[0] === values[1], entryIdentityEqual: identity[0] === identity[1] });
    }
  };
  const act = (pages, label, action) => {
    const entries = pages.map((page) => [...page.$('entries').children]);
    for (const page of pages) assert.doesNotThrow(() => action(page), `${row.id}: ${label}`);
    compare(pages, label, entries);
  };
  const pages = pair();
  compare(pages, 'unloaded');
  for (const run of valid) {
    act(pages, `${run.id} Load`, (page) => { page.$('saved-run').value = run.id; page.click('load'); });
    for (const position of [2, size(run), 1, Math.max(1, Math.floor(size(run) / 2))]) {
      act(pages, `${run.id} fragment ${position}`, (page) => page.changeHash(`#run=${run.id}&pos=${position}`));
    }
    for (const key of ['Home', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'End', 'Home', 'Tab']) {
      act(pages, `${run.id} ${key}`, (page) => page.key(key));
    }
    for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      act(pages, `${run.id} ${modifier}`, (page) => page.$('scrub').dispatch('keydown', { key: 'ArrowRight', [modifier]: true }));
    }
    for (const kind of ['gap', 'failure', 'unknown', 'epoch']) for (const direction of ['prev', 'next']) {
      act(pages, `${run.id} ${direction}-${kind}`, (page) => page.click(`${direction}-${kind}`));
    }
    for (const [epoch, sequence] of [['1', '1'], ['1', '11'], ['2', '8'], ['0', '1'], ['', '']]) {
      act(pages, `${run.id} lookup ${epoch}:${sequence}`, (page) => {
        page.$('seq-epoch').value = epoch;
        page.$('seq-number').value = sequence;
        page.$('seq-number').dispatch('keydown', { key: 'Enter' });
        page.click('seq-find');
      });
    }
    for (const fragment of ['', '#run=__proto__&pos=1', `#run=${run.id}&pos=999999`, '#run=c034-reordered&pos=1']) {
      act(pages, `${run.id} refused/empty fragment`, (page) => page.changeHash(fragment));
    }
  }
  for (const page of pages) assert.deepEqual(page.calls, []);
  for (const sourceValue of [null, 7, {}, { producer: 7, accepted: null }]) {
    const good = { ...saved.runs.find((run) => run.id === 'c044-complete'), source: sourceValue };
    const bad = { ...good, id: 'u049-no-detail', format: 'unsupported' };
    const injected = pair({ saved: { schema: 'X001-saved/1', runs: [good, bad] } });
    act(injected, 'source fallback', (page) => { page.$('saved-run').value = good.id; page.click('load'); });
    act(injected, 'same source fallback Load again', (page) => page.click('load'));
    act(injected, 'no-detail refusal', (page) => { page.$('saved-run').value = bad.id; page.click('load'); });
    act(injected, 'refused run fragment', (page) => page.changeHash('#run=u049-no-detail&pos=1'));
    for (const page of injected) {
      const types = JSON.parse(JSON.stringify(vm.runInContext('[typeof ({}).producer, typeof (false).producer, typeof (true).producer, typeof (false).hostile]', page.context)));
      assert.deepEqual(types, ['undefined', 'undefined', 'undefined', 'undefined'], 'actual original/mutant VM realm has the claimed primitive property semantics');
    }
  }
  results.result = results.differences.length ? 'observable-difference' : 'equivalent-on-declared-domain';
  if (row.requiredDisposition === 'equivalent') {
    assert.deepEqual(results.differences, [], `${row.id}: claimed equivalence must have identical observations`);
    assert.ok(row.proof);
  } else assert.ok(results.differences.length > 0, `${row.id}: observable survivor needs a real original-versus-mutant difference`);
  return results;
}

const eventTarget = [];
for (const value of [false, true, undefined]) {
  const target = new EventTarget();
  let later = 0;
  target.addEventListener('witness', () => value);
  target.addEventListener('witness', () => { later += 1; });
  const event = new Event('witness', { cancelable: true });
  assert.equal(target.dispatchEvent(event), true);
  assert.equal(event.defaultPrevented, false);
  assert.equal(later, 1);
  eventTarget.push({ returned: value === undefined ? 'undefined' : String(value), cancelled: event.defaultPrevented, laterListeners: later });
}
assert.deepEqual([-1, 1].map((direction) => direction < 0), [-1, 1].map((direction) => direction <= 0));
const results = prior.rows.map(witness);
const report = {
  schema: 'X001-U049-page-witness/1', sourceRawSha256: prior.sourceRawSha256, priorRowsSha256: hash(fs.readFileSync(path.join(__dirname, 'u049-prior-page.json'))),
  witnessSha256: hash(fs.readFileSync(__filename)), runtime: process.version,
  domain: 'Immutable saved inputs for each page lifetime; clean VM realm; every rendered element/attribute/value/class/disabled state, address/history, entry identity, creation kinds and zero effect calls. Node EventTarget return handling is measured; no Edge qualification is claimed.',
  eventTarget, rows: results, equivalent: results.filter((row) => row.result === 'equivalent-on-declared-domain').length,
  observableDifferences: results.filter((row) => row.result === 'observable-difference').length,
};
if (process.env.X001_U049_WITNESS_OUT) fs.writeFileSync(process.env.X001_U049_WITNESS_OUT, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
