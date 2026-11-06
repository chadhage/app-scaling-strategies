'use strict';

// Seeded stateful property test: random journeys whose operation alphabet INCLUDES the recovery operations (a lost answer,
// a tampered answer, retry, inspect, cancel, resume, correct-and-resubmit, a restart of the service, start over). After EVERY
// operation the global accessibility contract (checker + oracle) holds, the announcements stay one per state change, the
// ledger never over-commits and nothing is announced as success unless the state says so.
const test = require('node:test');
const assert = require('node:assert/strict');
const { checker, c042, gate, openSession, oracle } = require('./harness.cjs');
const { idle } = require('./dom.cjs');

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
const LEASES = ['synthetic-lease-001', 'synthetic-lease-002'];
// Recovery operations that really found their button and were pressed (a draw with no button is a no-op).
const effective = new Set();

async function run(seed, steps) {
  const random = prng(seed);
  const pick = (list) => list[Math.floor(random() * list.length)];
  const held = gate();
  let drop = false;
  const heldKeys = new Set();
  const dropped = [];
  const executor = async (job) => { heldKeys.add(job.key); await held.executor(job); };
  const session = await openSession({ executor, wrap: (base) => async (route, options) => {
    if (drop && route === '/v1/steps') { drop = false; dropped.push(JSON.parse(options.body).idempotencyKey); base(route, options).catch(() => {}); throw new TypeError('connection lost'); }
    return base(route, options);
  } });
  let counter = 0;
  const key = () => `prop-${seed}-${String(counter += 1).padStart(4, '0')}`;
  const sequence = [];
  const operations = {
    choose: () => pick(session.radios()).click(),
    arrow: () => { pick(session.radios()).focus(); session.press(pick(ARROWS)); },
    space: () => { pick(session.radios()).focus(); session.press(' '); },
    open: () => { session.$('open-lesson').focus(); session.press('Enter'); },
    close: () => { session.$('close-lesson').focus(); session.press('Enter'); },
    fillValid: () => session.fill({ key: random() < 0.3 ? session.$('key').value : key(), lease: pick(LEASES), units: 1 + Math.floor(random() * 10) }),
    fillInvalid: () => session.fill({ key: pick(['', 'x', 'bad key!']), units: pick(['', '0', '11', '1.5', 'abc']) }),
    submit: () => session.submit(),
    lose: () => { drop = true; },
    tamper: () => { session.fetch.state.next = () => session.fetch.answer({ status: 200, body: { kind: 'C042-step-result', prose: 'trust me' } }); },
    restart: () => session.restart(executor),
    release: () => { for (const heldKey of heldKeys) held.release(heldKey); heldKeys.clear(); },
    start: () => { session.$('start-over').focus(); session.press('Enter'); },
    tab: () => session.press('Tab', { shift: random() < 0.5 }),
  };
  for (const name of ['retry', 'inspect', 'cancel', 'resume', 'correct-and-resubmit']) {
    operations[`recovery-${name}`] = () => {
      const button = session.$(`recovery-${name}`);
      if (!button) return;
      effective.add(name);
      button.focus();
      session.press('Enter');
    };
  }
  const names = [...Object.keys(operations)];
  // Compound operations reach the states that recovery needs (in flight, interrupted, rejected, conflict); each expands into
  // primitive operations, and the contract is checked after every primitive.
  const macros = {
    overCapacity: ['fillBig', 'submit', 'fillOne', 'submit', 'recovery-correct-and-resubmit'],
    lostStep: ['fillFresh', 'lose', 'submit', 'recovery-inspect', 'recovery-cancel'],
    interrupted: ['fillFresh', 'lose', 'submit', 'restart', 'recovery-inspect', 'recovery-resume'],
    interruptedCancel: ['fillFresh', 'lose', 'submit', 'restart', 'recovery-inspect', 'recovery-cancel'],
    conflict: ['fillValid', 'submit', 'fillConflict', 'submit', 'recovery-correct-and-resubmit'],
  };
  operations.fillFresh = () => session.fill({ key: key(), lease: 'synthetic-lease-001', units: 1 });
  operations.fillBig = () => session.fill({ key: key(), lease: 'synthetic-lease-002', units: 10 });
  operations.fillOne = () => session.fill({ key: key(), lease: 'synthetic-lease-002', units: 1 });
  operations.fillConflict = () => session.fill({ units: (Number(session.$('units').value) % 10) + 1 });
  const alphabet = [...names, ...Object.keys(macros)];
  const queue = [];
  for (let step = 0; step < steps; step += 1) {
    let name = queue.length ? queue.shift() : pick(alphabet);
    while (macros[name]) { queue.push(...macros[name]); name = queue.shift(); }
    sequence.push(name);
    const before = session.document.announcements.length;
    await operations[name]();
    // The request whose answer was lost keeps running on the service: wait (bounded, no sleep) until the executor holds it.
    for (const lostKey of dropped.splice(0)) {
      for (let turn = 0; turn < 5000 && !heldKeys.has(lostKey); turn += 1) await new Promise((resolve) => setImmediate(resolve));
    }
    // A step held in flight keeps a joined or resumed request waiting: only a request that stays busy is waiting for a held step, so
    // release what is held then (as the network would), never while the page is merely answering a quick read.
    for (let turn = 0; turn < 20000 && session.$('result').getAttribute('aria-busy') === 'true'; turn += 1) {
      if (turn > 100) operations.release();
      await new Promise((resolve) => setImmediate(resolve));
    }
    await idle(session.document);
    const label = `seed ${seed} step ${step} (${sequence.join(' > ')})`;
    assert.deepEqual(checker.check(session.document).findings.map((item) => `${item.code} ${item.selector}`), [], label);
    assert.deepEqual(oracle(session.document), [], label);
    assert.ok(session.document.announcements.slice(before).filter((entry) => entry.text !== '').length <= 2, `${label}: more than two announcements`);
    for (const [id, lease] of Object.entries(session.engine.snapshot().leases)) {
      assert.ok(lease.committed + lease.held <= lease.capacity, `${label}: ${id} is over-committed`);
      assert.equal(lease.available, lease.capacity - lease.committed - lease.held, `${label}: ${id} available`);
    }
    const outcome = session.$('result').getAttribute('data-outcome');
    const text = session.$('status').textContent;
    if (outcome !== 'succeeded') assert.doesNotMatch(text, /Reserved \d+ synthetic units/, `${label}: a reservation is claimed in the state ${outcome}`);
    assert.doesNotMatch(session.document.documentElement.textContent, /trust me/, `${label}: server prose is shown`);
  }
  operations.release();
  await idle(session.document);
  return sequence;
}

test('40 seeded random journeys of 40 operations, recovery operations included: the contract holds after every operation', { timeout: 280000 }, async () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed += 1) for (const name of await run(seed, 40)) seen.add(name);
  for (const name of ['lose', 'tamper', 'restart', 'recovery-retry', 'recovery-inspect', 'recovery-cancel', 'recovery-resume', 'recovery-correct-and-resubmit', 'start']) {
    assert.ok(seen.has(name), `the alphabet operation ${name} was never drawn`);
  }
  assert.deepEqual([...effective].sort(), ['cancel', 'correct-and-resubmit', 'inspect', 'resume', 'retry'], 'every recovery control was really pressed at least once');
});

test('the C042 engine and the page agree: a key submitted twice is one effect in the ledger', { timeout: 20000 }, async () => {
  const session = await openSession();
  session.fill({ key: 'prop-dup-0001', units: 2 });
  session.submit();
  await idle(session.document);
  session.$('recovery-retry').focus();
  session.press('Enter');
  await idle(session.document);
  assert.equal(c042('contract.js').LEASES['synthetic-lease-001'], 100);
  assert.equal(session.engine.snapshot().leases['synthetic-lease-001'].committed, 2);
});
