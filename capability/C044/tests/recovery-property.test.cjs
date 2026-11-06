'use strict';

// Review fix F1 (property): seeded random walks whose operation alphabet INCLUDES the recovery operations (typed failure,
// rewound re-request, Resync, restart with a new epoch, cut streams). After every operation: no id was applied twice, the
// watermark never moved backwards, every delivery is counted exactly once and applied events plus named gaps cover each epoch.
const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const reducer = require('../reducer.js');

const run = 'synthetic-run-001';
const WINDOW = 12;
const SEEDS = 240;
const STEPS = 70;
const failureCodes = ['CURSOR_MALFORMED', 'CURSOR_RUN_MISMATCH', 'CURSOR_EPOCH_MISMATCH', 'CURSOR_FROM_FUTURE', 'CURSOR_EXPIRED', 'STREAM_CAPACITY'];
const rewinds = [0, 0, 0, 1, 3, 10, 30, 80];

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walk(seed, stats) {
  const random = prng(seed);
  const pick = (count) => Math.floor(random() * count);
  const server = { epoch: 1, head: 0 };
  const seen = new Set();
  const epochs = new Map();
  const history = [];
  const mark = { watermark: [0, 0], delivered: 0 };
  let state = reducer.initial();
  let attached = false;
  const why = (text) => `seed ${seed}: ${text}; operations so far: ${history.join(' ')}`;
  const view = () => ({ runId: run, epoch: server.epoch, headSeq: server.head, firstRetainedSeq: Math.max(1, server.head - WINDOW + 1), replayWindow: WINDOW });
  const frame = (epoch, seq) => ({
    type: 'event', id: cursors.format(run, epoch, seq), event: seq === 1 ? 'run-started' : 'step-completed',
    data: { runId: run, epoch, seq, step: seq - 1, of: 9999, note: 'n' },
  });
  const dispatch = (action) => { state = reducer.reduce(state, action); };

  function deliver(item) {
    const applied = state.counts.applied;
    mark.delivered += 1;
    dispatch(item);
    if (state.counts.applied !== applied + 1) return;
    assert.ok(!seen.has(state.lastId), why(`${state.lastId} was applied twice`));
    seen.add(state.lastId);
    const { epoch, seq } = cursors.parse(state.lastId).cursor;
    const known = epochs.get(epoch) || { first: seq, last: seq, applied: 0 };
    known.last = seq;
    known.applied += 1;
    epochs.set(epoch, known);
  }

  function check() {
    const watermark = [state.epoch ?? 0, state.lastSeq ?? 0];
    assert.ok(watermark[0] > mark.watermark[0] || (watermark[0] === mark.watermark[0] && watermark[1] >= mark.watermark[1]), why('the watermark moved backwards'));
    mark.watermark = watermark;
    const { applied, duplicates, outOfOrder, rejected } = state.counts;
    assert.equal(applied + duplicates + outOfOrder + rejected, mark.delivered, why('a delivery was not counted exactly once'));
    const shown = state.events.map((entry) => entry.id);
    assert.equal(new Set(shown).size, shown.length, why('an id is displayed twice'));
    for (const [epoch, known] of epochs) {
      const skipped = state.gaps.filter((gap) => gap.epoch === epoch).reduce((sum, gap) => sum + gap.skippedTo - gap.skippedFrom + 1, 0);
      assert.equal(known.applied + skipped, known.last - known.first + 1, why(`epoch ${epoch}: applied events plus named gaps must cover the epoch`));
    }
  }

  function stream(afterSeq) {
    dispatch({ type: 'open' });
    attached = true;
    const first = Math.max(afterSeq === null ? 1 : afterSeq + 1, view().firstRetainedSeq);
    const cut = random() < 0.3;
    const stop = cut ? first + pick(Math.max(1, server.head - first + 1)) - 1 : server.head;
    for (let seq = first; seq <= stop; seq += 1) deliver(frame(server.epoch, seq));
    if (cut) {
      attached = false;
      dispatch({ type: 'disconnect', by: 'network' });
    }
  }

  const operations = {
    produce() {
      for (let count = 1 + pick(25); count > 0; count -= 1) {
        server.head += 1;
        if (attached) deliver(frame(server.epoch, server.head));
      }
    },
    disconnect() {
      attached = false;
      dispatch({ type: 'disconnect', by: random() < 0.5 ? 'user' : 'network' });
    },
    reconnect() {
      const cursorless = state.lastSeq === null || Boolean(state.resync);
      const rewound = cursorless ? 0 : Math.min(rewinds[pick(rewinds.length)], state.lastSeq - 1);
      const cursor = cursorless ? null : cursors.format(run, state.epoch, state.lastSeq - rewound);
      dispatch({ type: 'reconnect', cursor, rewound, automatic: false });
      const resolved = cursors.resolve(view(), { query: cursor === null ? [] : [cursor] });
      if (resolved.ok) return stream(resolved.afterSeq);
      attached = false;
      return dispatch({ type: 'failure', failure: JSON.parse(JSON.stringify(resolved.failure)) });
    },
    failure() {
      attached = false;
      const code = failureCodes[pick(failureCodes.length)];
      dispatch({ type: 'failure', failure: JSON.parse(JSON.stringify(cursors.failure(code, view(), cursors.format(run, server.epoch, 1 + pick(5))))) });
    },
    resync() {
      const offered = state.failure && state.failure.allowedActions.some((item) => item.action === 'resync-from-snapshot');
      if (!offered) return;
      dispatch({ type: 'resync' });
      stats.resyncs += 1;
      stream(null);
    },
    restart() {
      server.epoch += 1;
      server.head = 0;
      attached = false;
      dispatch({ type: 'disconnect', by: 'network' });
    },
    stray() {
      if (!attached || seen.size === 0) return;
      const { epoch, seq } = cursors.parse([...seen][pick(seen.size)]).cursor;
      deliver(frame(epoch, seq));
    },
    skip() {
      if (attached && state.lastSeq !== null) deliver(frame(server.epoch, state.lastSeq + 2 + pick(3)));
    },
  };
  const alphabet = ['produce', 'produce', 'produce', 'disconnect', 'reconnect', 'reconnect', 'reconnect', 'failure', 'resync', 'resync', 'resync', 'restart', 'stray', 'skip'];

  for (let step = 0; step < STEPS; step += 1) {
    const name = alphabet[pick(alphabet.length)];
    history.push(name);
    operations[name]();
    check();
  }
  stats.walks += 1;
  stats.gaps += state.gaps.length;
  stats.epochChanges += (state.epochChanges || []).length;
  stats.duplicates += state.counts.duplicates;
  stats.outOfOrder += state.counts.outOfOrder;
  stats.applied += state.counts.applied;
}

test('recovery property: over seeded random walks no id is applied twice and every delivery reconciles', () => {
  const stats = { walks: 0, resyncs: 0, gaps: 0, epochChanges: 0, duplicates: 0, outOfOrder: 0, applied: 0 };
  for (let seed = 1; seed <= SEEDS; seed += 1) walk(seed, stats);
  assert.equal(stats.walks, SEEDS);
  for (const key of ['resyncs', 'gaps', 'epochChanges', 'duplicates', 'outOfOrder']) assert.ok(stats[key] >= 20, `the walks must exercise ${key} (non-vacuous): ${JSON.stringify(stats)}`);
});
