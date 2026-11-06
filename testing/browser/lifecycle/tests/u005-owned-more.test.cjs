'use strict';

// U005 composition tests, part 2: hostile inputs and the documented limits (F3 sleep, F9 terminate, F10 adoption direction).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, drive, settle, recorded } = require('./u005-support-world.cjs');

const { snapshotOwned, createOwnedTree } = loadImplementation().owned;
const T = { timeout: 20000 };
const code = (error) => error && error.code;
const terminate = async (world, owned, options = { timeoutMs: 5000, listMs: 1000 }) => (await drive(world.clock, owned.terminate(options).then((value) => ({ value })))).value.value;

test('a list adapter that throws synchronously is rejected through the race, and the timer is cleared', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  world.behaviors.list = () => { throw new Error('sync boom'); };
  const out = await drive(world.clock, settle(adapters.list()));
  assert.equal(out.value.error.message, 'sync boom');
  assert.equal(world.clock.pending(), 0);
});

test('snapshotOwned reads the table itself when none is given', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const mine = world.os.spawn(world.os.selfPid);
  world.os.spawn(mine.pid);
  const { snapshot } = await snapshotOwned(mine.pid, adapters, { ownerPid: world.os.selfPid, timeoutMs: 1000 });
  assert.equal(snapshot.entries.length, 2);
  assert.equal(world.listCalls, 1);
});

test('a new root that cannot be recorded is listed as unverifiable with its refusal code, never dropped', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const baseline = await adapters.list();
  const root = world.os.spawn(world.os.selfPid);
  for (let i = 0; i < 513; i += 1) world.os.spawn(root.pid);
  const owned = createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await owned.observe();
  assert.deepEqual(owned.roots, []);
  assert.deepEqual(owned.unverifiable.map((item) => [item.pid, item.reason]), [[root.pid, 'refused: ERR_TREE_TOO_LARGE']]);
  const report = await terminate(world, owned);
  assert.equal(report.clean, false);
  assert.deepEqual(report.unverifiable.map((item) => item.stillListed), [true]);
});

test('F3: a sleep that never settles cannot hang terminate; the outer race reports the survivor and the timeout', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  world.os.table.get(opener.root.pid).survivesOnce = true;
  world.clock.sleep = () => new Promise(() => {});
  const report = await terminate(world, owned, { timeoutMs: 3000, listMs: 1000 });
  assert.ok(report.errors.some((item) => item.code === 'ERR_TIMEOUT'));
  assert.equal(report.clean, false);
  assert.deepEqual(report.survivors.map((item) => item.pid), [opener.root.pid]);
  assert.deepEqual(report.terminated.map((item) => item.pid), [opener.crashpad.pid]);
});

test('F3: a defect inside the core is reported as an error and every entry as a survivor, not thrown', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  owned.entries.set(7, { pid: 7 });
  const report = await terminate(world, owned);
  assert.ok(report.errors.some((item) => item.code === 'ERR_INVALID_ARG'));
  assert.equal(report.clean, false);
  assert.ok(opener.processes.every((process) => report.survivors.some((item) => item.pid === process.pid)));
});

test('F9: terminate rejects invalid deadlines before it reads or kills anything', T, async () => {
  const world = new World();
  const { owned } = await recorded(world, 'launch');
  const lists = world.listCalls;
  for (const bad of [0, -1, NaN, Infinity, '5', null]) {
    await assert.rejects(owned.terminate({ timeoutMs: bad }), (error) => code(error) === 'ERR_INVALID_ARG');
    await assert.rejects(owned.terminate({ listMs: bad }), (error) => code(error) === 'ERR_INVALID_ARG');
  }
  assert.equal(world.listCalls, lists);
  assert.deepEqual(world.killRequests, []);
});

test('F4: a lying kill that lands exactly on the deadline is still not terminated', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  world.behaviors.kill = (identities) => { world.clock.t += world.cost; return identities.map(({ pid, createdAt }) => ({ pid, createdAt, outcome: 'killed' })); };
  const report = await terminate(world, owned, { timeoutMs: 10, listMs: 1000 });
  assert.ok(report.errors.some((item) => item.code === 'ERR_DEADLINE'));
  assert.deepEqual(report.terminated, []);
  assert.deepEqual(report.survivors.map((item) => item.pid).sort(), opener.processes.map((item) => item.pid).sort());
  assert.equal(report.clean, false);
});

test('F10 limit: a process the caller itself starts while the open runs cannot be told apart and is recorded as new', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const baseline = await adapters.list();
  const mine = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
  const owned = createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await owned.observe();
  assert.deepEqual(owned.roots.map((item) => item.pid), [mine.pid]);
});

test('a kill that failed once (a process still exiting) is retried by identity in a later pass and ends terminated', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  let refuse = true;
  world.behaviors.kill = (identities) => {
    world.clock.t += world.cost;
    return identities.map((identity) => {
      if (refuse && identity.pid === opener.crashpad.pid) {
        refuse = false;
        return { pid: identity.pid, createdAt: identity.createdAt, outcome: 'error', detail: 'error:terminate:5' };
      }
      return world.os.killOne(identity);
    });
  };
  const report = await terminate(world, owned, { timeoutMs: 20000, listMs: 1000 });
  assert.deepEqual(report.survivors, []);
  assert.deepEqual(report.terminated.map((item) => item.pid).sort(), opener.processes.map((item) => item.pid).sort());
  assert.equal(report.clean, true);
  assert.ok(report.failed.some((item) => item.pid === opener.crashpad.pid), 'the failed attempt is still reported');
  assert.equal(world.killRequests.filter((item) => item.pid === opener.crashpad.pid).length, 2);
});

test('a kill that keeps failing is retried a bounded number of times, then reported as survived', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  world.os.table.get(opener.crashpad.pid).denied = true;
  const report = await terminate(world, owned, { timeoutMs: 60000, listMs: 1000 });
  assert.equal(report.clean, false);
  assert.deepEqual(report.survivors.map((item) => item.pid), [opener.crashpad.pid]);
  assert.deepEqual(report.terminated.map((item) => item.pid), [opener.root.pid]);
  assert.equal(world.killRequests.filter((item) => item.pid === opener.crashpad.pid).length, 4);
});

test('F10 limit: a younger stranger whose parent id points into the tree is adopted and ended, an older one never', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  const older = world.os.put(3100, opener.root.pid, '1', { name: 'stranger.exe' });
  const younger = world.os.spawn(opener.root.pid, { name: 'stranger.exe' });
  const report = await terminate(world, owned);
  assert.ok(report.terminated.some((item) => item.pid === younger.pid));
  assert.equal(world.has(older), true);
  assert.equal(world.killRequests.some((item) => item.pid === older.pid), false);
});

test('the children of a refused entry are never adopted: a stranger that took a recorded pid keeps its child', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'new page');
  let stranger = null;
  let child = null;
  world.beforeKill = () => {
    if (stranger) return;
    world.os.exit(opener.renderer.pid);
    stranger = world.os.put(opener.renderer.pid, 5000, world.os.created(), { name: 'msedge.exe' });
    child = world.os.spawn(stranger.pid, { name: 'msedge.exe' });
  };
  const report = await terminate(world, owned);
  assert.ok(report.refused.some((item) => item.pid === opener.renderer.pid && item.reason === 'identity-mismatch'));
  assert.equal(world.has(stranger), true);
  assert.equal(world.has(child), true);
  assert.equal(world.killRequests.some((item) => item.pid === child.pid), false);
});
