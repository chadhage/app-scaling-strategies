'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const saved = require('..\\saved.js');
const { loadPage } = require('.\\dom-stub.cjs');
const root = path.resolve(__dirname, '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const catalogBytes = fs.readFileSync(path.join(__dirname, 'u049-final-equivalents.json'));
const catalog = JSON.parse(catalogBytes);
const sources = Object.fromEntries(['timeline.js', 'page.js'].map((file) => [file, fs.readFileSync(path.join(root, file), 'utf8')]));
for (const [file, source] of Object.entries(sources)) assert.equal(sha(Buffer.from(source)), catalog.sources[file], file);

function model(source) {
  const file = path.join(root, 'timeline.js');
  const subject = new Module(file, module);
  subject.filename = file;
  subject.paths = module.paths;
  subject._compile(source, file);
  return subject.exports;
}

function data(value, seen = new Map()) {
  if (value === null || typeof value !== 'object') return { type: typeof value, value: typeof value === 'function' ? 'callable' : String(value) };
  if (seen.has(value)) return { reference: seen.get(value) };
  seen.set(value, seen.size);
  return {
    array: Array.isArray(value), frozen: Object.isFrozen(value),
    properties: Object.keys(value).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return [key, { enumerable: descriptor.enumerable, writable: descriptor.writable, configurable: descriptor.configurable }, data(value[key], seen)];
    }),
  };
}

function modelObservations(T) {
  const out = [];
  for (const run of saved.runs) {
    const built = T.build(run);
    out.push(['build', run.id, data(built)]);
    if (!built.ok) continue;
    for (let index = 0; index < built.length; index += 1) out.push(['position', run.id, index, data(built.stateAt(index))]);
    for (const index of [-1, built.length, NaN, null, '1']) out.push(['outside', run.id, String(index), data(T.stateAt(built, index))]);
    for (const epoch of [0, 1, 2, 99]) for (const seq of [0, 1, 2, 7, 10, 12, 22, 23]) out.push(['locate', run.id, epoch, seq, data(T.locate(built, epoch, seq))]);
    for (const kind of T.JUMPS) for (const from of [-1, 0, built.length - 1, built.length]) for (const direction of [-1, 1]) {
      out.push(['jump', run.id, kind, from, direction, T.jump(built, from, kind, direction)]);
    }
    out.push(['verify', run.id, data(T.verify(run, built)), data(T.verify(run))]);
    const first = built.stateAt(0);
    const original = JSON.parse(JSON.stringify(first.state));
    const changes = [{ ...original, extra: null }, { ...original, extra: false }, { ...original, extra: 0 }, { ...original, extra: '' }];
    if (original.counts) {
      const renamed = { ...original, counts: { ...original.counts, appliedX: original.counts.applied } };
      delete renamed.counts.applied;
      changes.push(renamed);
    }
    changes.push(Object.fromEntries(Object.entries(original).reverse()));
    for (const state of changes) out.push(['forged-state', run.id, data(T.verify(run, {
      ...built, stateAt: (index) => index === 0 ? { ...first, state } : built.stateAt(index),
    }))]);
    for (const field of ['mark', 'tallies', 'flags']) {
      const replacement = field === 'mark' ? 'forged' : {};
      out.push(['forged-field', run.id, field, data(T.verify(run, {
        ...built, stateAt: (index) => index === 0 ? { ...first, [field]: replacement } : built.stateAt(index),
      }))]);
    }
  }
  const base = saved.runs.find((run) => run.id === 'c044-complete');
  for (const producer of [undefined, null, 0, false, 'x', [], {}, { lastSeq: 1, totalSteps: 1, replayWindow: 1 }]) {
    out.push(['producer', data(producer), data(T.build({ ...base, producer }))]);
  }
  const cycle = {}; cycle.self = cycle;
  const sharedLeaf = { value: 1 };
  const nullPrototype = Object.assign(Object.create(null), { value: 1 });
  for (const input of [cycle, { a: sharedLeaf, b: sharedLeaf }, nullPrototype, new Array(2), [undefined, null, false], { value: Symbol('x') }]) {
    out.push(['owned-shape', data(T.build({ ...base, producer: null, entries: [{ type: 'connect', data: input }] }))]);
  }
  for (const text of ['', '#', '#run=c044-complete&pos=1', '#run=c044-complete&pos=0', '#run=UPPER&pos=1', '#run=x&pos=1', '#'.repeat(100), null]) {
    out.push(['fragment', text, data(T.parseFragment(text, [...saved.runs.map((run) => run.id), 'UPPER']))]);
  }
  return { observations: out.length, bytes: Buffer.from(JSON.stringify(out)) };
}

function element(node) {
  return { tag: node.tag, id: node.id, text: node.textContent, value: node.value, disabled: node.disabled, className: node.className,
    attributes: [...node.attributes].sort(([a], [b]) => a.localeCompare(b)), dataset: { ...node.dataset }, style: { ...node.style }, children: node.children.map(element) };
}
function pageObservations(file, changed) {
  const out = [];
  const patch = changed ? { [file]: () => changed } : null;
  const create = (options = {}) => loadPage({ ...options, patch });
  const snapshot = (page, label, previous = null) => {
    const current = page.$('entries').children;
    out.push({ label, elements: [...page.document.elements].sort(([a], [b]) => a.localeCompare(b)).map(([id, node]) => [id, element(node)]),
      hash: page.location.hash, history: [...page.history.calls], calls: [...page.calls], creationKinds: [...page.document.created],
      sameEntryNodes: previous === null ? null : previous.length === current.length && current.every((node, index) => node === previous[index]) });
  };
  const act = (page, label, action) => {
    const previous = [...page.$('entries').children];
    assert.doesNotThrow(() => action(page), label);
    snapshot(page, label, previous);
  };
  const pristine = model(sources['timeline.js']);
  const page = create();
  snapshot(page, 'unloaded');
  for (const run of saved.runs.filter((input) => pristine.build(input).ok)) {
    const count = run.kind === 'console' ? run.entries.length : run.snapshot.events.length;
    act(page, `${run.id} load`, (view) => { view.$('saved-run').value = run.id; view.click('load'); });
    act(page, `${run.id} load again`, (view) => view.click('load'));
    for (const position of [2, count, 1, count + 1, Math.max(1, Math.floor(count / 2))]) {
      act(page, `${run.id} fragment ${position}`, (view) => view.changeHash(`#run=${run.id}&pos=${position}`));
    }
    for (const key of ['Home', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'End', 'Home', 'Tab']) act(page, `${run.id} key ${key}`, (view) => view.key(key));
    for (const kind of ['gap', 'failure', 'unknown', 'epoch']) for (const direction of ['prev', 'next']) {
      act(page, `${run.id} ${direction}-${kind}`, (view) => view.click(`${direction}-${kind}`));
    }
    for (const [epoch, seq] of [['1', '1'], ['2', '10'], ['', '']]) act(page, `${run.id} sequence ${epoch}:${seq}`, (view) => {
      view.$('seq-epoch').value = epoch; view.$('seq-number').value = seq; view.click('seq-find');
    });
    for (const fragment of ['', '#run=UPPER&pos=1', '#run=c034-reordered&pos=1']) act(page, `${run.id} refused`, (view) => view.changeHash(fragment));
  }
  for (const source of [null, false, 7, {}, { producer: 7, accepted: null }]) {
    const good = { ...saved.runs.find((run) => run.id === 'c044-complete'), source };
    const bad = { ...good, id: 'u049-no-detail', format: 'unsupported' };
    const view = create({ saved: { schema: 'X001-saved/1', runs: [good, bad] } });
    act(view, 'fallback source', (value) => { value.$('saved-run').value = good.id; value.click('load'); });
    act(view, 'fallback load again', (value) => value.click('load'));
    act(view, 'no-detail refusal', (value) => { value.$('saved-run').value = bad.id; value.click('load'); });
    const facts = JSON.parse(JSON.stringify(vm.runInContext('[typeof module, typeof ({}).producer, typeof (false).producer, typeof (true).producer]', view.context)));
    assert.deepEqual(facts, ['undefined', 'undefined', 'undefined', 'undefined']);
  }
  return { observations: out.length, bytes: Buffer.from(JSON.stringify(out)) };
}

function canonicalPairs(original, changed) {
  const extract = (source) => {
    const start = source.indexOf('function canonical(value) {');
    const end = source.indexOf('\n  // The mark', start);
    assert.ok(start >= 0 && end > start);
    return vm.runInNewContext(`(${source.slice(start, end).trim()})`);
  };
  const before = extract(original);
  const after = extract(changed);
  const values = [undefined, null, false, true, 0, -0, 1, NaN, Infinity, '', 'null', '[]', '{}', 'a,b:~',
    [], {}, [null], [false], [undefined], { a: 1 }, { b: 1 }, { a: 1, b: 2 }, { b: 2, a: 1 }, { 'a,b': 'c:~' },
    [[], {}], { a: [0, null], b: { '': false } }, () => {}, Symbol('x'), 1n];
  const value = (fn, input) => { try { return ['value', fn(input)]; } catch (error) { return ['throw', error.name]; } };
  let pairs = 0;
  for (const left of values) for (const right of values) {
    const a = value(before, left); const b = value(before, right);
    const c = value(after, left); const d = value(after, right);
    assert.equal(JSON.stringify(a) === JSON.stringify(b), JSON.stringify(c) === JSON.stringify(d), 'actual canonical equality relation is preserved');
    pairs += 1;
  }
  return pairs;
}

const baselineModel = modelObservations(model(sources['timeline.js']));
const baselinePage = pageObservations('page.js', null);
const visiblePageControl = require('.\\u049-prior-page.json').rows.find((row) => row.reviewRow === 5);
const apply = (source, row) => {
  assert.equal(source.slice(row.start, row.end), row.original);
  return source.slice(0, row.start) + row.replacement + source.slice(row.end);
};
assert.notEqual(sha(pageObservations('page.js', apply(sources['page.js'], visiblePageControl)).bytes), sha(baselinePage.bytes), 'witness detects the actual no-detail null-rendering counterexample');
const visibleModelControl = sources['timeline.js'].replace('shown.mark !== steps[index].mark', 'true');
assert.notEqual(sha(modelObservations(model(visibleModelControl)).bytes), sha(baselineModel.bytes), 'witness detects an actual verification corruption');
const rows = [];
for (const row of catalog.rows) {
  const source = sources[row.file];
  const changed = apply(source, row);
  assert.equal(sha(Buffer.from(changed)), row.mutatedSha256, row.id);
  let original;
  let observed;
  if (row.file === 'page.js') {
    original = baselinePage;
    observed = pageObservations(row.file, changed);
  } else {
    original = baselineModel;
    observed = modelObservations(model(changed));
  }
  assert.equal(sha(observed.bytes), sha(original.bytes), `${row.id}: actual current original/mutant observable equality`);
  let pairs = 0;
  if (row.witness === 'canonical-equality') pairs = canonicalPairs(source, changed);
  if (row.witness === 'set-membership') {
    const object = {};
    const set = new Set([object]);
    assert.equal(set.has(object), true);
    for (const primitive of [null, undefined, false, true, 0, 'x', Symbol('x'), 1n]) assert.equal(set.has(primitive), false);
  }
  if (row.witness === 'commonjs-and-global') {
    assert.equal(sha(pageObservations(row.file, changed).bytes), sha(baselinePage.bytes), 'the actual browser-script branch is unchanged too');
  }
  if (row.witness === 'direction-domain') {
    const changed = row.op === 'operator-<' ? (direction) => direction <= 0 : (direction) => direction < 1;
    assert.deepEqual([-1, 1].map((direction) => direction < 0), [-1, 1].map(changed));
  }
  rows.push({ id: row.id, proof: row.proof, witness: row.witness, observations: observed.observations,
    originalObservableSha256: sha(original.bytes), mutantObservableSha256: sha(observed.bytes), canonicalValuePairs: pairs, passed: true });
}
const report = { schema: 'X001-U049-final-equivalence-witness/1', sources: catalog.sources, catalogSha256: sha(catalogBytes),
  witnessSha256: sha(fs.readFileSync(__filename)), runtime: process.version, rows,
  controls: { actualNoDetailRefusalDistinguished: true, actualVerificationCorruptionDistinguished: true },
  scope: 'Current production bytes; real CommonJS model and actual-script clean VM DOM. Every row has an explicit data/observation equivalence argument plus a runnable original-versus-mutant comparison. Native Edge EventTarget/module facts are recorded separately.' };
if (process.env.X001_U049_EQUIVALENCE_OUT) fs.writeFileSync(process.env.X001_U049_EQUIVALENCE_OUT, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(report));
