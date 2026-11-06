'use strict';

// U005 composition tests: the hardened adapters and the owned tree (F1, F2, F3, F4, F5, F8, F9) on a fake operating system.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, recorded } = require('./u005-support-world.cjs');
const { fakeSpawn, succeed } = require('./support/fake-spawn.cjs');

const impl = loadImplementation();
const { createOwnedAdapters, snapshotOwned, createOwnedTree, MAX_TIMER_MS, systemClock, LifecycleError } = impl.owned;
const T = { timeout: 20000 };
const code = (error) => error && error.code;

test('F1: an empty process table fails closed, never success-shaped', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  world.behaviors.list = async () => [];
  const out = await drive(world.clock, settle(adapters.list()));
  assert.equal(out.value.ok, false);
  assert.equal(code(out.value.error), 'ERR_TABLE_INCOMPLETE');
});

test('F1: a truncated table without the caller fails closed, one with the caller is accepted', T, async () => {
  const world = new World();
  const other = world.foreign();
  const adapters = world.adapters();
  world.behaviors.list = async () => [{ pid: other.pid, ppid: other.ppid, createdAt: other.createdAt }];
  assert.equal(code((await drive(world.clock, settle(adapters.list()))).value.error), 'ERR_TABLE_INCOMPLETE');
  world.behaviors.list = async () => [{ pid: world.os.selfPid, ppid: 4, createdAt: '134000000000000001' }];
  assert.equal((await drive(world.clock, settle(adapters.list()))).value.ok, true);
  world.behaviors.list = async () => 'not an array';
  assert.equal(code((await drive(world.clock, settle(adapters.list()))).value.error), 'ERR_ADAPTER');
  world.behaviors.list = async () => [null];
  assert.equal(code((await drive(world.clock, settle(adapters.list()))).value.error), 'ERR_TABLE_INCOMPLETE');
});

test('F1: terminating over an empty table reports nothing gone and nothing terminated', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world);
  world.behaviors.list = async () => [];
  const { value: report } = await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((r) => ({ ok: true, value: r })));
  assert.equal(report.ok, true);
  assert.equal(report.value.clean, false);
  assert.equal(report.value.confirmed, false);
  assert.deepEqual(report.value.alreadyGone, []);
  assert.deepEqual(report.value.terminated, []);
  assert.equal(report.value.survivors.length, opener.processes.length);
  assert.ok(report.value.errors.some((error) => error.code === 'ERR_TABLE_INCOMPLETE' || error.code === 'ERR_LIST'));
  assert.equal(opener.alive().length, opener.processes.length);
});

test('helper rows: the helper that printed the table is not a new child, a stranger with that pid is kept', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const rows = await adapters.list();
  assert.equal(rows.some((row) => row.pid === world.lastHelper), false);
  assert.equal(rows.some((row) => row.pid === world.os.selfPid), true);
  world.behaviors.list = async () => {
    world.lastHelper = 777;
    return [{ pid: world.os.selfPid, ppid: 4, createdAt: '1' }, { pid: 777, ppid: world.os.selfPid, createdAt: '2' }, { pid: 778, ppid: world.os.selfPid, createdAt: '3' }];
  };
  const filtered = (await drive(world.clock, settle(adapters.list()))).value.value;
  assert.deepEqual(filtered.map((row) => row.pid), [world.os.selfPid, 778]);
  world.behaviors.list = async () => [{ pid: world.os.selfPid, ppid: 4, createdAt: '1' }, { pid: 777, ppid: 5, createdAt: '4' }];
  const kept = (await drive(world.clock, settle(adapters.list()))).value.value;
  assert.deepEqual(kept.map((row) => row.pid), [world.os.selfPid, 777]);
});

test('F2: an unreadable descendant and everything below it is listed as unverifiable, not dropped', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const root = world.os.spawn(world.os.selfPid);
  const readable = world.os.spawn(root.pid);
  const hidden = world.os.put(2000, root.pid, null);
  const below = world.os.spawn(hidden.pid);
  const table = await adapters.list();
  const { snapshot, unverifiable } = await snapshotOwned(root.pid, adapters, { ownerPid: world.os.selfPid, table });
  assert.deepEqual(snapshot.entries.map((entry) => entry.pid).sort(), [root.pid, readable.pid].sort());
  assert.deepEqual(unverifiable.map((item) => [item.pid, item.reason]).sort(), [[hidden.pid, 'unreadable-creation-time'], [below.pid, 'below-unverifiable']].sort());
});

test('F2: the owned tree counts an unverifiable descendant against clean while it is listed, not once it is gone', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  const hidden = world.os.put(2000, opener.root.pid, null);
  await owned.observe();
  assert.equal(owned.unverifiable.length, 1);
  const first = await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })));
  assert.equal(first.value.value.clean, false);
  assert.deepEqual(first.value.value.unverifiable.map((item) => [item.pid, item.stillListed]), [[hidden.pid, true]]);
  world.os.exit(hidden.pid);
  const second = await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })));
  assert.equal(second.value.value.clean, true);
  assert.deepEqual(second.value.value.unverifiable.map((item) => item.stillListed), [false]);
});

test('F3: a list adapter that never settles is raced against its deadline and the timer is cleared', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  world.behaviors.list = () => new Promise(() => {});
  const out = await drive(world.clock, settle(adapters.list({ timeoutMs: 50 })));
  assert.equal(code(out.value.error), 'ERR_TIMEOUT');
  assert.equal(world.clock.t, 50);
  assert.equal(world.clock.pending(), 0);
});

test('F3: a kill adapter that never settles cannot hang terminate, nothing is claimed', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  world.behaviors.kill = () => new Promise(() => {});
  const out = await drive(world.clock, owned.terminate({ timeoutMs: 3000, listMs: 1000 }).then((value) => ({ value })));
  const report = out.value.value;
  assert.equal(report.clean, false);
  assert.deepEqual(report.terminated, []);
  assert.equal(report.survivors.length, opener.processes.length);
  assert.ok(report.errors.some((error) => error.code === 'ERR_KILL'));
  assert.equal(world.clock.pending(), 0);
});

test('F3: a list adapter that never settles cannot hang terminate either', T, async () => {
  const world = new World();
  const { owned } = await recorded(world, 'launch');
  world.behaviors.list = () => new Promise(() => {});
  const out = await drive(world.clock, owned.terminate({ timeoutMs: 3000, listMs: 500 }).then((value) => ({ value })));
  assert.equal(out.value.value.clean, false);
  assert.equal(out.value.value.confirmed, false);
});

test('F4: a lying kill adapter cannot make a live process terminated', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world);
  world.behaviors.kill = (identities) => identities.map(({ pid, createdAt }) => ({ pid, createdAt, outcome: 'killed' }));
  const report = (await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })))).value.value;
  assert.deepEqual(report.terminated, []);
  assert.equal(report.survivors.length, opener.processes.length);
  assert.equal(report.clean, false);
  assert.equal(opener.alive().length, opener.processes.length);
});

test('F4: terminated is claimed only after a confirming fresh table, otherwise it is unconfirmed', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  let lists = 0;
  world.behaviors.list = () => { lists += 1; return lists >= 4 ? Promise.reject(new Error('helper died')) : world.defaultList(); };
  const report = (await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })))).value.value;
  assert.equal(report.confirmed, false);
  assert.deepEqual(report.terminated, []);
  assert.equal(report.unconfirmed.length, opener.processes.length);
  assert.equal(report.clean, false);
});

test('a real kill is confirmed by the table: terminated, clean, and history keeps terminated over alreadyGone', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world);
  const report = (await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })))).value.value;
  assert.equal(report.clean, true);
  assert.equal(report.confirmed, true);
  assert.equal(report.terminated.length, opener.processes.length);
  assert.deepEqual(opener.alive(), []);
  const again = (await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })))).value.value;
  assert.equal(again.terminated.length, opener.processes.length);
  assert.deepEqual(again.alreadyGone, []);
  assert.equal(again.clean, true);
});

test('F5: ownerPid is required, a foreign owner, a foreign root, system pids and the caller are refused', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const stranger = world.foreign('msedge.exe', 4321);
  const mine = world.os.spawn(world.os.selfPid);
  const table = await adapters.list();
  const attempt = async (rootPid, options) => settle(snapshotOwned(rootPid, adapters, { table, ...options }));
  assert.equal(code((await attempt(mine.pid, {})).error), 'ERR_INVALID_ARG');
  assert.equal(code((await attempt(mine.pid, { ownerPid: 5 })).error), 'ERR_FOREIGN_OWNER');
  assert.equal(code((await attempt(stranger.pid, { ownerPid: world.os.selfPid })).error), 'ERR_NOT_CHILD');
  assert.equal(code((await attempt(4, { ownerPid: world.os.selfPid })).error), 'ERR_PROTECTED_ROOT');
  assert.equal(code((await attempt(0, { ownerPid: world.os.selfPid })).error), 'ERR_PROTECTED_ROOT');
  assert.equal(code((await attempt(world.os.selfPid, { ownerPid: world.os.selfPid })).error), 'ERR_PROTECTED_ROOT');
  assert.equal((await attempt(mine.pid, { ownerPid: world.os.selfPid })).ok, true);
  assert.throws(() => createOwnedTree({ adapters }), (error) => code(error) === 'ERR_INVALID_ARG');
  assert.throws(() => createOwnedTree({ adapters, ownerPid: 5 }), (error) => code(error) === 'ERR_FOREIGN_OWNER');
});

test('F5: the caller and system pids are never forwarded to the kill adapter', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const mine = world.os.spawn(world.os.selfPid);
  const identities = [world.os.identity(world.os.selfPid), { pid: 4, createdAt: '1' }, { pid: 0 + 4, createdAt: '2' }, { pid: mine.pid, createdAt: mine.createdAt }];
  const outcomes = (await drive(world.clock, settle(adapters.kill(identities, { timeoutMs: 1000 })))).value.value;
  assert.deepEqual(world.killRequests.map((item) => item.pid), [mine.pid]);
  assert.deepEqual(outcomes.filter((item) => item.outcome === 'error').map((item) => item.pid).sort(), [4, 4, world.os.selfPid].sort());
  assert.equal(world.has(world.os.table.get(world.os.selfPid)), true);
  const bad = await drive(world.clock, settle(adapters.kill('nope')));
  assert.equal(code(bad.value.error), 'ERR_INVALID_ARG');
  assert.equal(code((await drive(world.clock, settle(adapters.kill([{ pid: 'x' }])))).value.error), 'ERR_INVALID_ARG');
});

test('F5: an all-protected batch reaches no adapter at all and a bogus outcome list is ignored', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const mine = world.os.spawn(world.os.selfPid);
  await drive(world.clock, settle(adapters.kill([{ pid: world.os.selfPid, createdAt: '1' }])));
  assert.deepEqual(world.killRequests, []);
  world.behaviors.kill = () => undefined;
  const outcomes = (await drive(world.clock, settle(adapters.kill([{ pid: mine.pid, createdAt: mine.createdAt }])))).value.value;
  assert.deepEqual(outcomes, []);
});

test('F9: timers are capped at 2147483647 ms and invalid deadlines are rejected', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  world.behaviors.list = () => new Promise(() => {});
  const pending = settle(adapters.list({ timeoutMs: 2 ** 40 }));
  await quiesce();
  assert.deepEqual(world.clock.requested, [MAX_TIMER_MS]);
  assert.equal(code((await drive(world.clock, pending)).value.error), 'ERR_TIMEOUT');
  for (const bad of [0, -1, NaN, Infinity, '5', null]) {
    const out = await drive(world.clock, settle(adapters.list({ timeoutMs: bad })));
    assert.equal(code(out.value.error), 'ERR_INVALID_ARG', String(bad));
  }
  const slept = adapters.sleep(2 ** 40);
  assert.equal(world.clock.requested.at(-1), MAX_TIMER_MS);
  await drive(world.clock, slept);
  assert.equal(await adapters.sleep(0), undefined);
});

test('F8: process.env itself reaches the Windows adapters and a plain copy with other casing works too', T, async () => {
  const table = `${process.pid},4,134000000000000001\n`;
  const direct = fakeSpawn({ run: succeed(table) });
  const adapters = createOwnedAdapters({ platform: 'win32', spawn: direct });
  assert.equal((await adapters.list({ timeoutMs: 1000 })).length, 1);
  assert.equal(direct.calls[0].options.env, process.env);

  const upper = fakeSpawn({ run: succeed(table) });
  const copy = createOwnedAdapters({ platform: 'win32', env: { SYSTEMROOT: 'C:\\Windows', WINDIR: 'C:\\Windows', PATH: 'x' }, spawn: upper });
  await copy.list({ timeoutMs: 1000 });
  assert.equal(upper.calls[0].command, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');

  const spread = fakeSpawn({ run: succeed(table) });
  const clone = createOwnedAdapters({ platform: 'win32', env: { ...process.env }, spawn: spread });
  await clone.list({ timeoutMs: 1000 });
  assert.match(spread.calls[0].command, /powershell\.exe$/);
  assert.throws(() => createOwnedAdapters({ platform: 'win32', env: { PATH: 'x' }, spawn: spread }), (error) => code(error) === 'ERR_PLATFORM');
  assert.throws(() => createOwnedAdapters({ platform: 'linux', spawn: spread }), (error) => code(error) === 'ERR_PLATFORM');
});

test('the real Windows adapters record their helper pid so the helper never looks like a new child', T, async () => {
  const spawn = fakeSpawn({ run: (child) => { child.stdout.emit('data', Buffer.from(`${process.pid},4,134000000000000001\n4242,${process.pid},134000000000000002\n4244,${process.pid},134000000000000003\n`)); child.emit('close', 0); } });
  const raw = spawn;
  const wrapped = (...args) => { const child = raw(...args); child.pid = 4242; return child; };
  wrapped.calls = raw.calls;
  const adapters = createOwnedAdapters({ platform: 'win32', spawn: wrapped });
  const rows = await adapters.list({ timeoutMs: 1000 });
  assert.deepEqual(rows.map((row) => row.pid), [process.pid, 4244]);
});

test('the owned tree records exactly the new children of the caller, not the baseline, and replaces a reused pid', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const older = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
  const baseline = await adapters.list();
  const opener = new FakeOpener(world);
  opener.buildTo('new page');
  const owned = createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await owned.observe();
  assert.deepEqual(owned.roots, [{ pid: opener.root.pid, createdAt: opener.root.createdAt }]);
  assert.deepEqual(owned.recorded().map((entry) => entry.pid).sort(), opener.processes.map((process) => process.pid).sort());
  assert.equal(owned.recorded().some((entry) => entry.pid === older.pid), false);
  world.os.exit(opener.renderer.pid);
  world.os.put(opener.renderer.pid, opener.root.pid, world.os.created());
  await owned.observe();
  assert.equal(owned.recorded().filter((entry) => entry.pid === opener.renderer.pid).length, 1);
  assert.equal(owned.recorded().find((entry) => entry.pid === opener.renderer.pid).createdAt, world.os.table.get(opener.renderer.pid).createdAt);
});

test('a new direct child with an unreadable creation time is unverifiable, a protected one is refused, nothing throws', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const baseline = await adapters.list();
  const hidden = world.os.put(3000, world.os.selfPid, null);
  const owned = createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await owned.observe();
  assert.deepEqual(owned.roots, []);
  assert.deepEqual(owned.unverifiable.map((item) => [item.pid, item.reason]), [[hidden.pid, 'unreadable-creation-time']]);
});

test('pid reuse between the snapshot and the kill is refused as an identity mismatch and the stranger survives', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world);
  let stranger = null;
  world.beforeKill = () => {
    if (stranger) return;
    world.os.exit(opener.renderer.pid);
    stranger = world.os.put(opener.renderer.pid, 5000, world.os.created(), { name: 'msedge.exe' });
  };
  const report = (await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })))).value.value;
  assert.ok(report.refused.some((item) => item.pid === opener.renderer.pid && item.reason === 'identity-mismatch'));
  assert.equal(world.has(stranger), true);
  assert.equal(world.killRequests.filter((item) => item.pid === opener.renderer.pid && item.createdAt === stranger.createdAt).length, 0);
  assert.equal(report.clean, true);
});

test('a protected or unverifiable refusal that is still listed is not clean', T, async () => {
  const world = new World();
  const { owned, opener } = await recorded(world, 'launch');
  world.os.table.get(opener.crashpad.pid).createdAt = null;
  const report = (await drive(world.clock, owned.terminate({ timeoutMs: 5000, listMs: 1000 }).then((value) => ({ value })))).value.value;
  assert.ok(report.refused.some((item) => item.pid === opener.crashpad.pid && item.reason === 'unverifiable'));
  assert.equal(report.clean, false);
});

test('the system clock and the shared exports behave', T, async () => {
  assert.equal(typeof systemClock.now(), 'number');
  const handle = systemClock.setTimeout(() => {}, 1000);
  systemClock.clearTimeout(handle);
  assert.equal(await systemClock.sleep(1), undefined);
  assert.equal(MAX_TIMER_MS, 2147483647);
  assert.equal(new LifecycleError('ERR_X', 'x').code, 'ERR_X');
});
