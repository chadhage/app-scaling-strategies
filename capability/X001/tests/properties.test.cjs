'use strict';

// PROPERTY test with a model (L-0119): a seeded random walk over an operation alphabet that INCLUDES the recovery operations (jump, reload,
// fragment change, back/forward, switch run, hostile fragment, refused load). The page is checked against an independent model and the
// global invariants (assertShown, plus the refusal bookkeeping) are asserted after EVERY step.
const test = require('node:test');
const assert = require('node:assert/strict');
const saved = require('..\\saved.js');
const { loadPage } = require('.\\dom-stub.cjs');
const { assertShown, hitsFor, appliedIndex } = require('.\\invariants.cjs');

const sizeOf = (run) => (run.kind === 'console' ? run.entries.length : run.snapshot.events.length);
const good = saved.runs.filter((run) => !run.source.hostile || run.kind === 'console');
const refused = saved.runs.filter((run) => run.kind === 'trace' && run.source.hostile).map((run) => run.id);
const sizes = Object.fromEntries(good.map((run) => [run.id, sizeOf(run)]));
const hits = Object.fromEntries(good.map((run) => [run.id, hitsFor(run)]));
const applied = Object.fromEntries(good.map((run) => [run.id, appliedIndex(run)]));
const HOSTILE = ['#run=<script>alert(1)</script>&pos=1', '#run=c044-complete&pos=0', '#run=c044-complete&pos=1&pos=2', '#run=__proto__&pos=1', '#pos=1', '#run=nope&pos=1',
  `#run=${'a'.repeat(400)}&pos=1`, '#run=c044-complete&pos=%31', 'run=c044-complete&pos=1', '#run=c044-complete&pos=1.5', '#run=c044-complete&pos=-1', '#&&&', '#=', '#run=&pos='];
const KEYS = [['ArrowRight', 1], ['ArrowLeft', -1], ['ArrowUp', 1], ['ArrowDown', -1], ['PageUp', 10], ['PageDown', -10], ['Home', 'first'], ['End', 'last']];
const JUMPS = ['gap', 'failure', 'unknown', 'epoch'];

function generator(seed) {
  let state = seed;
  return (n) => { state = (state * 1103515245 + 12345) % 2147483648; return Math.floor((state / 2147483648) * n); };
}

function walk(seed, steps, report) {
  const random = generator(seed);
  const pick = (list) => list[random(list.length)];
  let page = loadPage();
  let reloadsLeft = 10;
  const model = { run: null, pos: 0, error: false, announced: false };
  const ids = good.map((run) => run.id);
  const fragment = (runId, position) => {
    const refusedRun = refused.includes(runId);
    page.changeHash(`#run=${runId}&pos=${position}`);
    if (refusedRun) Object.assign(model, { run: null, error: true, announced: false });
    else if (position <= sizes[runId]) Object.assign(model, { run: runId, pos: position - 1, error: false, announced: true });
    else Object.assign(model, { error: true, announced: false });
  };
  const operations = [
    ['key', () => {
      const [key, delta] = pick(KEYS);
      page.key(key);
      if (!model.run) return `${key} (unloaded)`;
      const n = sizes[model.run];
      const target = delta === 'first' ? 0 : delta === 'last' ? n - 1 : model.pos + delta;
      if (target >= 0 && target < n) Object.assign(model, { pos: target, error: false, announced: true });
      else Object.assign(model, { error: true, announced: false });
      return key;
    }],
    ['button', () => {
      const name = pick(['prev', 'next', ...JUMPS.flatMap((kind) => [`prev-${kind}`, `next-${kind}`])]);
      page.click(name);
      if (!model.run) return `${name} (unloaded)`;
      const n = sizes[model.run];
      const [direction, kind] = name.startsWith('prev') ? [-1, name.slice(5)] : [1, name.slice(5)];
      let target;
      if (name === 'prev' || name === 'next') target = model.pos + (name === 'prev' ? -1 : 1);
      else target = direction === 1 ? hits[model.run][kind].find((i) => i > model.pos) : hits[model.run][kind].findLast((i) => i < model.pos);
      if (target !== undefined && target >= 0 && target < n) Object.assign(model, { pos: target, error: false, announced: true });
      else if (name === 'prev' || name === 'next') Object.assign(model, { error: true, announced: false });
      else model.announced = false;
      return name;
    }],
    ['fragment same run', () => { const id = model.run || pick(ids); fragment(id, 1 + random(sizes[id] + 3)); return 'fragment'; }],
    ['switch run by fragment', () => { const id = pick([...ids, ...refused]); fragment(id, 1 + random((sizes[id] || 5) + 2)); return `switch ${id}`; }],
    ['switch run by chooser', () => {
      const id = pick([...ids, ...refused]);
      page.$('saved-run').value = id;
      page.click('load');
      if (refused.includes(id)) Object.assign(model, { run: null, error: true, announced: false });
      else Object.assign(model, { run: id, pos: 0, error: false, announced: true });
      return `choose ${id}`;
    }],
    ['find sequence', () => {
      const epoch = 1 + random(3);
      const sequence = 1 + random(26);
      page.$('seq-epoch').value = String(epoch);
      page.$('seq-number').value = String(sequence);
      page.click('seq-find');
      if (!model.run) return 'find (unloaded)';
      const found = applied[model.run].get(`${epoch}:${sequence}`);
      if (found !== undefined) Object.assign(model, { pos: found, error: false, announced: true });
      return `find ${epoch}:${sequence}`;
    }],
    ['hostile fragment', () => {
      page.changeHash(pick(HOSTILE));
      Object.assign(model, { error: true, announced: false });
      return 'hostile';
    }],
    ['empty fragment', () => { page.changeHash(''); model.announced = false; return 'empty'; }],
    ['back or forward', () => {
      const trail = page.history.calls;
      if (trail.length === 0) return 'back (no history)';
      const [, runId, position] = /^#run=([a-z0-9-]+)&pos=(\d+)$/.exec(pick(trail));
      fragment(runId, Number(position));
      return 'back';
    }],
    ['reload', () => {
      if (reloadsLeft === 0) return 'reload (budget used)';
      reloadsLeft -= 1;
      const hash = page.location.hash;
      page = loadPage({ hash });
      if (!model.run) Object.assign(model, { error: hash !== '', announced: false });
      else Object.assign(model, { error: false, announced: true });
      return 'reload';
    }],
  ];
  const trail = [];
  for (let step = 0; step < steps; step++) {
    const [name, run] = pick(operations);
    const label = `seed ${seed} step ${step} ${name}`;
    try {
      const detail = run();
      trail.push(`${label} (${detail}) hash=${page.location.hash.slice(0, 50)} model=${model.run}:${model.pos} error=${model.error}`);
      report.operations[name] = (report.operations[name] || 0) + 1;
      check(label, detail, name);
    } catch (error) {
      error.message += `\nlast operations:\n${trail.slice(-12).join('\n')}`;
      throw error;
    }
    report.steps += 1;
  }

  function check(label, detail, name) {
    if (model.run) {
      assertShown(page, model.run, model.pos, `${label} (${detail})`, { skipError: true, skipStatus: !model.announced });
      if (model.announced && name !== 'reload') assert.equal(page.$('scrub').getAttribute('aria-valuetext'), page.text('status'), label);
    } else {
      assert.equal(page.$('entries').children.length, 0, `${label} nothing is shown`);
      assert.equal(page.$('scrub').getAttribute('aria-disabled'), 'true');
      assert.equal(page.text('position'), 'Position: none');
      assert.equal(page.$('status').dataset.state, 'UNLOADED');
    }
    assert.equal(page.text('error') !== '', model.error, `${label} (${detail}) the refusal is shown exactly when the model says so: ${page.text('error').slice(0, 60)}`);
    assert.equal(new Set(page.ids()).size, page.ids().length, `${label} ids are unique`);
    assert.deepEqual(page.calls, [], `${label} no network or timer`);
  }
}

test('property: after every step of a random walk with recovery operations the page equals the model and the global invariants hold', (t) => {
  const report = { steps: 0, operations: {} };
  for (const seed of [11, 2026, 77777, 424242]) walk(seed, 700, report);
  t.diagnostic(`property steps: ${report.steps}; operations: ${JSON.stringify(report.operations)}`);
  assert.equal(report.steps, 2800);
  assert.ok(Object.keys(report.operations).length >= 10, 'every operation of the alphabet was used, including the recovery operations');
});
