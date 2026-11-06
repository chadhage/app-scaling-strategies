'use strict';

// L-0117 to L-0119 applied: duplicate and idempotency state must survive every recovery path. A seeded stateful test whose
// operation alphabet contains the recovery operations (abrupt disconnect, takeover, typed failures, stale and forged
// cursors, server restart) checks one global invariant after EVERY operation; the rendered page is checked after
// every recovery click for unique ids and for counts that reconcile with what was delivered.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createHub } = require('../stream.cjs');
const { runPage } = require('./dom-stub.cjs');
const { produceLocalTranscript } = require('../server.cjs');

const TOTAL = 7;
const WINDOW = 3;
const lcg = (seed) => { let state = seed >>> 0; return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; }; };
const pick = (random, list) => list[Math.floor(random() * list.length)];

// Every frame any client ever received, per session: the global history the invariant is checked against.
function checkInvariants(hub, history, snapshots) {
  const violations = [];
  for (const [id, seen] of history) {
    const view = hub.inspect(id);
    seen.first.forEach((seq, index) => { if (seq !== index + 1) violations.push(`${id}: first delivery ${seq} at position ${index + 1}`); });
    seen.acked.forEach((seq, index) => { if (seq !== index + 1) violations.push(`${id}: acknowledgement ${seq} at position ${index + 1}`); });
    if (seen.first.length !== view.lastSent) violations.push(`${id}: ${seen.first.length} first deliveries seen, server says ${view.lastSent}`);
    if (seen.acked.length !== view.ackedThrough) violations.push(`${id}: ${seen.acked.length} acknowledgements seen, server says ${view.ackedThrough}`);
    if (!(view.ackedThrough <= view.lastSent && view.lastSent <= TOTAL && view.lastSent - view.ackedThrough <= WINDOW)) violations.push(`${id}: positions out of range`);
    view.deliveries.forEach((count, index) => { if ((seen.counts.get(index + 1) ?? 0) !== count) violations.push(`${id}: message ${index + 1} sent ${seen.counts.get(index + 1) ?? 0} times, server counts ${count}`); });
    const before = snapshots.get(id);
    if (before && (view.ackedThrough < before.ackedThrough || view.lastSent < before.lastSent || view.deliveries.some((count, index) => count < before.deliveries[index]))) {
      violations.push(`${id}: a counter went backwards`);
    }
    snapshots.set(id, view);
  }
  return violations;
}

function simulate(seed, steps) {
  const random = lcg(seed);
  const stats = { operations: 0, restarts: 0, failures: 0, resumes: 0, takeovers: 0, aborts: 0 };
  const violations = [];
  let hub;
  let history = new Map();
  let snapshots = new Map();
  let clients = [];
  let retired = [];
  let counter = 0;

  function restart() {
    retired = [...retired, ...history.keys()];
    hub = createHub({ total: TOTAL, window: WINDOW, maxSessions: 6, newSessionId: () => `s${(counter += 1)}` });
    history = new Map();
    snapshots = new Map();
    clients = [];
  }

  function open() {
    const client = { conn: null, session: null, received: 0, acked: 0, closed: false, failure: null };
    client.conn = hub.connect({
      send(frame) {
        if (frame.type === 'error') { client.failure = frame.code; return; }
        const id = frame.session ?? /^c1\.([^.]+)\./.exec(frame.cursor)[1];
        const seen = history.get(id) ?? { first: [], acked: [], counts: new Map() };
        history.set(id, seen);
        if (frame.type === 'welcome' || frame.type === 'resumed') client.session = id;
        if (frame.type === 'message') {
          const view = hub.inspect(id);
          if (frame.redelivered === false) seen.first.push(frame.seq);
          else if (!(frame.seq > view.ackedThrough && frame.deliveries >= 2)) violations.push(`${id}: redelivery of ${frame.seq} that is acknowledged or counted once`);
          seen.counts.set(frame.seq, (seen.counts.get(frame.seq) ?? 0) + 1);
          client.received = Math.max(client.received, frame.seq);
        }
        if (frame.type === 'acked') { seen.acked.push(frame.seq); client.acked = frame.seq; }
      },
      close() { client.closed = true; }
    });
    clients.push(client);
    return client;
  }

  const say = (client, value) => client.conn.receive(JSON.stringify(value));
  const sessions = () => [...history.keys()];
  const live = () => clients.filter((client) => !client.closed && client.session !== null);
  const operations = {
    hello() { say(open(), { type: 'hello' }); },
    ack() {
      const ready = live().filter((client) => client.received > client.acked);
      if (ready.length > 0) { const client = pick(random, ready); say(client, { type: 'ack', seq: client.acked + 1 }); }
    },
    forgedAck() {
      const client = pick(random, live().length > 0 ? live() : [open()]);
      const acknowledged = client.session === null ? 0 : hub.inspect(client.session).ackedThrough;
      stats.failures += 1;
      say(client, { type: 'ack', seq: pick(random, [acknowledged, acknowledged + 2, TOTAL + 5, 0, -1]) });
    },
    abort() {
      const client = pick(random, live().length > 0 ? live() : [open()]);
      stats.aborts += 1;
      client.conn.disconnected();
      client.closed = true;
    },
    resume() {
      if (sessions().length === 0) return;
      const id = pick(random, sessions());
      const position = pick(random, ['honest', 'behind', 'future', 'foreign', 'malformed']);
      const view = hub.inspect(id);
      const cursor = {
        honest: `c1.${id}.${view.ackedThrough}`, behind: `c1.${id}.0`, future: `c1.${id}.${view.lastSent + 1}`,
        foreign: `c1.${pick(random, [...sessions(), 'zz'])}.0`, malformed: 'nonsense'
      }[position];
      const client = open();
      stats.resumes += 1;
      if (live().some((other) => other !== client && other.session === id)) stats.takeovers += 1;
      say(client, { type: 'resume', session: id, cursor });
    },
    staleResume() {
      if (retired.length === 0) return;
      const id = pick(random, retired);
      const client = open();
      const before = hub.sessionCount();
      say(client, { type: 'resume', session: id, cursor: `c1.${id}.0` });
      if (client.failure !== 'SESSION_UNKNOWN' || hub.sessionCount() !== before) violations.push(`${id}: a session of an earlier server life was resumed or recreated`);
    },
    restart() { stats.restarts += 1; restart(); }
  };
  const alphabet = ['hello', 'hello', 'ack', 'ack', 'ack', 'ack', 'ack', 'forgedAck', 'abort', 'resume', 'resume', 'staleResume', 'restart'];

  restart();
  const positions = () => JSON.stringify([...history.keys()].map((id) => { const view = hub.inspect(id); return [id, view.lastSent, view.ackedThrough, view.deliveries]; }));
  for (let step = 0; step < steps; step += 1) {
    const name = pick(random, alphabet);
    const before = positions();
    operations[name]();
    stats.operations += 1;
    if (name === 'forgedAck' && positions() !== before) violations.push(`${name} changed server state`);
    violations.push(...checkInvariants(hub, history, snapshots).map((line) => `step ${step} after ${name}: ${line}`));
    if (violations.length > 0) break;
  }
  return { violations, stats };
}

test('seeded operation sequences with disconnects, takeovers, typed failures, stale cursors and restarts never break the global invariant', () => {
  const total = { operations: 0, restarts: 0, failures: 0, resumes: 0, takeovers: 0, aborts: 0 };
  for (let seed = 1; seed <= 40; seed += 1) {
    const { violations, stats } = simulate(seed, 160);
    assert.deepEqual(violations, [], `seed ${seed}`);
    for (const key of Object.keys(total)) total[key] += stats[key];
  }
  for (const key of ['restarts', 'failures', 'resumes', 'takeovers', 'aborts']) assert.equal(total[key] > 20, true, `the alphabet really exercised ${key}: ${JSON.stringify(total)}`);
});

test('the invariant is not vacuous: a repeated first delivery, a lost acknowledgement and a reset counter are all reported', () => {
  const hub = createHub({ total: TOTAL, window: WINDOW, newSessionId: () => 's1' });
  const history = new Map();
  const seen = { first: [], acked: [], counts: new Map() };
  history.set('s1', seen);
  hub.connect({ send(frame) { if (frame.type === 'message') { seen.first.push(frame.seq); seen.counts.set(frame.seq, 1); } }, close() {} }).receive('{"type":"hello"}');
  const snapshots = new Map();
  assert.deepEqual(checkInvariants(hub, history, snapshots), []);
  seen.first.push(3);
  assert.equal(checkInvariants(hub, history, snapshots).some((line) => /first delivery 3/.test(line)), true);
  seen.first.pop();
  seen.counts.set(2, 2);
  assert.equal(checkInvariants(hub, history, snapshots).some((line) => /message 2 sent 2 times/.test(line)), true);
  seen.counts.set(2, 1);
  snapshots.set('s1', { ackedThrough: 5, lastSent: 5, deliveries: [9, 9, 9, 9, 9, 0, 0] });
  assert.equal(checkInvariants(hub, history, snapshots).some((line) => /went backwards/.test(line)), true);
});

test('after every recovery click the rendered ids are unique and the rows reconcile with what the server delivered', async () => {
  const good = await produceLocalTranscript();
  let answer = { ok: true, status: 200, json: async () => structuredClone(good) };
  const { document } = runPage({ fetch: async () => answer });
  const load = document.element('load');
  const rendered = () => document.element('events').children.map((row) => row.children);
  function assertReconciled(label) {
    const rows = rendered();
    const ids = rows.map((cells) => cells[0].textContent);
    assert.equal(new Set(ids).size, ids.length, `${label}: an event id is shown twice`);
    assert.deepEqual(ids, good.events.map((event) => String(event.n)), `${label}: the ids are not exactly the delivered events`);
    const messages = rows.filter((cells) => cells[2].textContent === 'server sends' && cells[3].textContent.startsWith('{"type":"message"')).length;
    const summary = JSON.parse(document.element('summary').textContent);
    assert.equal(messages, summary.firstDeliveries + summary.redeliveries, `${label}: message rows do not reconcile with first deliveries plus redeliveries`);
  }
  await load.click();
  assertReconciled('first load');
  const recoveries = [
    ['HTTP 503', { ok: false, status: 503, json: async () => ({}) }],
    ['unreadable JSON', { ok: true, status: 200, json: async () => { throw new Error('not json'); } }],
    ['a transcript with a repeated event', { ok: true, status: 200, json: async () => { const bad = structuredClone(good); bad.events.splice(3, 0, structuredClone(bad.events[2])); return bad; } }]
  ];
  for (const [name, bad] of recoveries) {
    answer = bad;
    await load.click();
    assert.equal(rendered().length, 0, `${name}: the earlier display must be cleared`);
    answer = { ok: true, status: 200, json: async () => structuredClone(good) };
    await load.click();
    assertReconciled(`recovery after ${name}`);
    await load.click();
    assertReconciled(`retry after ${name}`);
  }
});
