'use strict';

// U005 fix F3, F4 and F7 (rev-U005 minors): the report of a sweep is cumulative over DISTINCT identities (what the core found and ended inside
// one sweep is not lost from the next report), the worst case of the default budgets is stated by one formula and proven on the virtual clock,
// and the owner pid of the real adapters cannot be injected.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, begin, recorded } = require('./u005-support-world.cjs');

const { owned, startup } = loadImplementation();
const T = { timeout: 20000 };
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);
const keysOf = (items) => items.map((item) => `${item.pid}:${item.createdAt}`);

function distinct(report) {
  const all = [...report.terminated, ...report.alreadyGone, ...report.survivors, ...report.refused];
  assert.equal(new Set(keysOf(all)).size, all.length, 'no identity is listed twice or in two lists');
  return new Set(keysOf(all));
}

// Two more descendants of the browser appear AFTER the observe read of the next sweep and BEFORE the core read of the same sweep.
function growBetweenReads(world, opener) {
  let armed = true;
  world.behaviors.list = () => {
    const rows = [...world.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));
    if (armed) {
      armed = false;
      opener.newPage();
      opener.newContext();
    }
    return Promise.resolve(rows);
  };
}

test('F3 (D5): the next report still lists the identities that the core found and ended inside one earlier sweep', T, async () => {
  const world = new World();
  const { opener, owned: tree } = await recorded(world, 'launch');
  growBetweenReads(world, opener);
  const first = (await outcome(world, tree.terminate({ timeoutMs: 20000, listMs: 5000 }))).value;
  assert.equal(opener.processes.length, 4);
  assert.equal(distinct(first).size, 4, 'the first report lists the four identities');
  const second = (await outcome(world, tree.terminate({ timeoutMs: 20000, listMs: 5000 }))).value;
  assert.deepEqual([...distinct(second)].sort(), [...distinct(first)].sort(), 'the second report is cumulative over the same distinct identities');
  assert.equal(second.terminated.length, 4);
  assert.equal(second.clean, true);
});

test('F3 (D5): the final report after an expiry lists every identity that was ended, counted once', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { deadlineMs: 1000 });
  await quiesce();
  const error = (await outcome(world, start)).error;
  assert.equal(error.terminated.length + error.alreadyGone.length, 0, 'nothing existed at the first sweep');
  opener.launch();
  growBetweenReads(world, opener);
  const final = (await drive(world.clock, error.settled)).value;
  const requested = new Set(world.killRequests.map((request) => request.pid));
  const reported = new Set([...distinct(final)].map((key) => Number(key.split(':')[0])));
  assert.deepEqual([...requested].filter((pid) => !reported.has(pid)), [], 'every kill request is in the final report');
  assert.equal(reported.size, opener.processes.length, 'the final report lists all four identities once');
  assert.equal(final.terminated.length + final.alreadyGone.length, 4);
  assert.equal(final.clean, true);
});

test('F4: the sweep bound is one formula, the default grace period covers it and a table that never answers arrives exactly at the stated bound', T, async () => {
  const budgets = (options) => startup.budgetsOf({ deadlineMs: 1000, ...options });
  assert.equal(owned.sweepBoundMs({ listMs: 3000, terminateMs: 7000 }), 13000);
  assert.equal(budgets({}).sweepBoundMs, 2 * owned.DEFAULT_LIST_MS + owned.DEFAULT_TERMINATE_MS);
  assert.equal(budgets({}).graceMs, budgets({}).sweepBoundMs, 'by default deadline + graceMs bounds the rejection');
  assert.equal(budgets({ listMs: 3000, terminateMs: 7000 }).graceMs, 13000);
  assert.equal(budgets({ graceMs: 500 }).graceMs, 500);
  assert.equal(budgets({}).rejectionBoundMs, 1000 + budgets({}).sweepBoundMs);
  for (const custom of [{}, { listMs: 3000, terminateMs: 7000 }]) {
    const world = new World();
    world.behaviors.list = (call, n) => (n === 1 ? world.defaultList() : new Promise(() => {}));
    const opener = new FakeOpener(world);
    const options = { listMs: undefined, terminateMs: undefined, graceMs: undefined, ...custom };
    const started = world.clock.now();
    const error = (await outcome(world, begin(world, opener, options))).error;
    assert.equal(error.code, 'ERR_STARTUP_DEADLINE');
    assert.equal(error.clean, false);
    assert.equal(world.clock.now() - started, world.cost + budgets(custom).rejectionBoundMs, `the rejection arrives at the bound for ${JSON.stringify(custom)}`);
    assert.ok(world.clock.now() - started <= world.cost + 1000 + budgets(custom).graceMs, 'deadline + graceMs holds');
    assert.ok(error.errors.length >= 2);
  }
});

test('F4: with the default budgets the watch of an open that never settles lasts at least one whole sweep, so deadline + graceMs covers the rejection', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { listMs: undefined, terminateMs: undefined, graceMs: undefined, pollMs: 1000 });
  const error = (await outcome(world, start)).error;
  const rejectedAt = world.clock.now();
  await drive(world.clock, error.settled);
  assert.ok(world.clock.now() - rejectedAt >= 2 * owned.DEFAULT_LIST_MS + owned.DEFAULT_TERMINATE_MS, 'the default grace period is at least the sweep bound');
});

test('F4: a kill adapter that never answers cannot push the rejection past the stated bound and the survivors are listed', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  world.behaviors.kill = () => new Promise(() => {});
  const start = begin(world, opener, { listMs: undefined, terminateMs: undefined, graceMs: undefined });
  await quiesce();
  opener.buildTo('navigation');
  const started = world.clock.now();
  const error = (await outcome(world, start)).error;
  assert.ok(world.clock.now() - started <= startup.budgetsOf({ deadlineMs: 1000 }).rejectionBoundMs);
  assert.equal(error.clean, false);
  assert.equal(error.survivors.length, opener.processes.length);
});

test('F7: the owner pid of the real adapters cannot be injected; only injected inner adapters accept it', T, () => {
  assert.throws(() => owned.createOwnedAdapters({ selfPid: 4242 }), (error) => error.code === 'ERR_INVALID_ARG' && /selfPid/.test(error.message));
  assert.throws(() => owned.createOwnedAdapters({ selfPid: process.pid, platform: 'win32' }), (error) => error.code === 'ERR_INVALID_ARG');
  const world = new World();
  assert.equal(owned.createOwnedAdapters({ inner: world.inner, selfPid: 4242 }).selfPid, 4242);
  const real = owned.createOwnedAdapters({ platform: 'win32', spawn: () => { throw new Error('never spawned'); } });
  assert.equal(real.selfPid, process.pid);
});
