'use strict';

// U005 fix F5 (rev-U005 minor, test strength): the systematic mutation run over owned.cjs (tests\mutate-run.cjs) found guards that no test pinned. Every test below
// is the named killer of such mutants; the README states which ones remain equivalent and why (tests\mutation-equivalents-u005.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, recorded } = require('./u005-support-world.cjs');
const { fakeSpawn, succeed } = require('./support/fake-spawn.cjs');

const { owned } = loadImplementation();
const { createOwnedAdapters, createOwnedTree, snapshotOwned } = owned;
const T = { timeout: 20000 };
const code = (error) => error && error.code;
const idOf = (entry) => ({ pid: entry.pid, createdAt: entry.createdAt });
async function end(world, tree, options) {
  const result = await drive(world.clock, settle(tree.terminate(options))).then((outcome) => outcome.value);
  assert.equal(result.ok, true, `terminate resolves: ${result.error && result.error.message}`);
  return result.value;
}

test('describe, failureOf and checkMs read any thrown value and any duration', T, () => {
  assert.equal(owned.describe(new Error('boom')), 'boom');
  assert.equal(owned.describe('text'), 'text');
  assert.equal(owned.describe(undefined), 'undefined');
  assert.equal(owned.describe(null), 'null');
  assert.equal(owned.describe({ message: '' }), '[object Object]');
  assert.deepEqual(owned.failureOf(Object.assign(new Error('x'), { code: 'ERR_X' })), { pid: null, createdAt: null, code: 'ERR_X', message: 'x' });
  assert.deepEqual(owned.failureOf(new Error('y')), { pid: null, createdAt: null, code: 'ERR_ADAPTER', message: 'y' });
  assert.deepEqual(owned.failureOf(null), { pid: null, createdAt: null, code: 'ERR_ADAPTER', message: 'null' });
  assert.deepEqual(owned.failureOf('s'), { pid: null, createdAt: null, code: 'ERR_ADAPTER', message: 's' });
  for (const bad of ['5', NaN, Infinity, 0, -1, null, undefined, {}]) assert.throws(() => owned.checkMs(bad, 'x'), (error) => code(error) === 'ERR_INVALID_ARG', String(bad));
  assert.equal(owned.checkMs(7, 'x'), 7);
  assert.equal(owned.checkMs(2 ** 40, 'x'), owned.MAX_TIMER_MS);
  assert.equal(owned.sweepBoundMs(), 2 * owned.DEFAULT_LIST_MS + owned.DEFAULT_TERMINATE_MS);
  assert.equal(owned.sweepBoundMs({ listMs: 5 }), 10 + owned.DEFAULT_TERMINATE_MS);
  assert.equal(owned.sweepBoundMs({ terminateMs: 5 }), 2 * owned.DEFAULT_LIST_MS + 5);
  assert.throws(() => owned.sweepBoundMs({ listMs: '1' }), (error) => code(error) === 'ERR_INVALID_ARG');
});

test('kill() refuses every malformed identity list and reaches the inner adapter only with identities it may forward', T, async () => {
  const world = new World();
  const calls = [];
  const innerKill = world.inner.kill;
  world.inner.kill = (identities, call) => { calls.push(identities); return innerKill(identities, call); };
  const adapters = world.adapters();
  const mine = world.os.spawn(world.os.selfPid);
  const own = { pid: mine.pid, createdAt: mine.createdAt };
  for (const bad of [null, 'x', {}, [null], [undefined], [{ pid: 0, createdAt: '1' }], [{ pid: -3 }], [{ pid: 1.5 }], [{ pid: '7' }], [own, null], [own, { pid: 0 }], [{ pid: Number.MAX_SAFE_INTEGER + 2 }]]) {
    const result = await settle(adapters.kill(bad, { timeoutMs: 1000 }));
    assert.equal(code(result.error), 'ERR_INVALID_ARG', JSON.stringify(bad));
  }
  assert.equal(calls.length, 0);
  await drive(world.clock, settle(adapters.kill([{ pid: world.os.selfPid, createdAt: '1' }, { pid: 4, createdAt: '1' }], { timeoutMs: 1000 })));
  assert.equal(calls.length, 0, 'a protected-only batch never reaches the inner adapter');
  await drive(world.clock, settle(adapters.kill([own], { timeoutMs: 1000 })));
  assert.equal(calls.length, 1);
});

test('F8: a plain env copy keeps its own SystemRoot, gets a missing spelling added and never gets a key with an undefined value', T, async () => {
  const table = `${process.pid},4,134000000000000001\n`;
  const both = fakeSpawn({ run: succeed(table) });
  await createOwnedAdapters({ platform: 'win32', env: { SYSTEMROOT: 'C:\\A', SystemRoot: 'C:\\B', windir: 'C:\\B', PATH: 'x' }, spawn: both }).list({ timeoutMs: 1000 });
  assert.equal(both.calls[0].command, 'C:\\B\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  const only = fakeSpawn({ run: succeed(table) });
  await createOwnedAdapters({ platform: 'win32', env: { SYSTEMROOT: 'C:\\A', PATH: 'x' }, spawn: only }).list({ timeoutMs: 1000 });
  const env = only.calls[0].options.env;
  assert.equal(env.SystemRoot, 'C:\\A');
  assert.equal(Object.hasOwn(env, 'windir'), false);
});

test('adapters made over inner adapters without lastHelperPid still work, and without a spawn option the real child_process.spawn is the default', T, async (t) => {
  const world = new World();
  const plain = { list: world.inner.list, kill: world.inner.kill };
  const adapters = createOwnedAdapters({ inner: plain, clock: world.clock, selfPid: world.os.selfPid });
  const rows = (await drive(world.clock, settle(adapters.list()))).value.value;
  assert.ok(rows.length >= 1);
  const childProcess = require('node:child_process');
  const spawned = fakeSpawn({ run: succeed(`${process.pid},4,134000000000000001\n`) });
  t.mock.method(childProcess, 'spawn', spawned);
  const real = createOwnedAdapters({ platform: 'win32' });
  assert.equal((await real.list({ timeoutMs: 1000 })).length, 1);
  assert.equal(spawned.calls.length, 1, 'the default spawn is child_process.spawn');
});

test('snapshotOwned uses the table it is given and reads none of its own', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const root = world.os.spawn(world.os.selfPid);
  const table = await adapters.list();
  const before = world.listCalls;
  const { snapshot } = await snapshotOwned(root.pid, adapters, { ownerPid: world.os.selfPid, table });
  assert.equal(world.listCalls, before);
  assert.equal(snapshot.entries.length, 1);
});

test('the unverifiable set is found in any row order, ignores unrelated unreadable rows and never lists an owned process', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const root = world.os.spawn(world.os.selfPid);
  world.os.put(2000, root.pid, null);
  world.os.put(2004, 2000, world.os.created());
  world.os.put(2008, 2004, world.os.created());
  world.os.put(3000, 5000, null);
  const table = await adapters.list();
  const { unverifiable } = await snapshotOwned(root.pid, adapters, { ownerPid: world.os.selfPid, table: [...table].reverse() });
  assert.deepEqual(unverifiable.map((item) => item.pid).sort((a, b) => a - b), [2000, 2004, 2008]);
  assert.deepEqual(unverifiable.map((item) => item.reason).sort(), ['below-unverifiable', 'below-unverifiable', 'unreadable-creation-time']);

  const second = new World();
  const { opener, owned: tree } = await recorded(second, 'navigation');
  world.os.table.clear();
  second.os.table.get(opener.renderer.pid).createdAt = null;
  await tree.observe();
  assert.deepEqual(tree.unverifiable, [], 'a recorded process whose creation time can no longer be read is not an unverifiable descendant');
});

test('the first reason recorded for an unverifiable process wins when it is reported again', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const baseline = await adapters.list();
  const root = world.os.spawn(world.os.selfPid);
  const middle = world.os.put(2000, root.pid, null);
  world.os.put(2004, 2000, null);
  const tree = createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await tree.observe();
  const reasons = () => Object.fromEntries(tree.unverifiable.map((item) => [item.pid, item.reason]));
  assert.deepEqual(reasons(), { 2000: 'unreadable-creation-time', 2004: 'below-unverifiable' });
  middle.createdAt = world.os.created();
  await tree.observe();
  assert.equal(reasons()[2004], 'below-unverifiable', 'the earlier reason is kept');
});

test('observing twice inside the window never records a root twice', T, async () => {
  const world = new World();
  const { owned: tree, opener } = await recorded(world, 'navigation');
  await tree.observe();
  await tree.observe();
  assert.deepEqual(tree.roots, [idOf(opener.root)]);
  assert.equal(tree.snapshot().rootPid, opener.root.pid);
  const empty = createOwnedTree({ adapters: world.adapters(), ownerPid: world.os.selfPid });
  assert.equal(empty.snapshot().rootPid, world.os.selfPid);
});

test('terminate() has defaults for both durations and reports the failure of an unreadable table in errors', T, async () => {
  const world = new World();
  const { owned: tree } = await recorded(world, 'launch');
  assert.equal((await end(world, tree)).confirmed, true);
  assert.equal((await end(world, tree, { timeoutMs: 5000 })).confirmed, true);
  assert.equal((await end(world, tree, { listMs: 1000 })).confirmed, true);

  const failing = new World();
  const { owned: other, opener } = await recorded(failing, 'launch');
  let seen = 0;
  failing.behaviors.list = () => { seen += 1; return seen === 1 ? Promise.reject(new Error('observe read failed')) : failing.defaultList(); };
  const report = await end(failing, other);
  assert.equal(report.confirmed, true);
  assert.ok(report.errors.some((item) => /observe read failed/.test(item.message)), 'the failed observe read is listed in errors');
  assert.deepEqual(opener.alive(), []);

  const unreadable = new World();
  const { owned: third, opener: browser } = await recorded(unreadable, 'launch');
  let reads = 0;
  unreadable.behaviors.list = () => { reads += 1; return reads >= 4 ? Promise.reject(new Error('confirming read failed')) : unreadable.defaultList(); };
  const unconfirmed = await end(unreadable, third);
  assert.equal(unconfirmed.confirmed, false);
  assert.equal(unconfirmed.clean, false);
  assert.deepEqual(unconfirmed.terminated, []);
  assert.deepEqual(unconfirmed.unconfirmed.map((item) => item.pid).sort(), browser.processes.map((item) => item.pid).sort());
  assert.ok(unconfirmed.errors.some((item) => /confirming read failed/.test(item.message)));
});

test('a sweep that read no table at all is never clean, even when nothing was recorded (R10)', T, async () => {
  const world = new World();
  const tree = createOwnedTree({ adapters: world.adapters(), ownerPid: world.os.selfPid });
  world.behaviors.list = () => Promise.reject(new Error('no table'));
  const report = await end(world, tree);
  assert.equal(report.confirmed, false);
  assert.equal(report.clean, false);
  assert.deepEqual([report.terminated, report.alreadyGone, report.survivors, report.unconfirmed], [[], [], [], []]);
});

test('a second terminate of an ended tree reads the table exactly once and keeps listing the ended identities as terminated', T, async () => {
  const world = new World();
  const { owned: tree, opener } = await recorded(world, 'navigation');
  const first = await end(world, tree);
  assert.equal(first.terminated.length, opener.processes.length);
  const reads = world.listCalls;
  const kills = world.killRequests.length;
  const second = await end(world, tree);
  assert.equal(world.listCalls - reads, 1, 'one observe read and nothing else');
  assert.equal(world.killRequests.length, kills);
  assert.equal(second.terminated.length, opener.processes.length);
  assert.deepEqual(second.alreadyGone, []);
});

test('processes that left on their own are alreadyGone, never terminated, also in the next report', T, async () => {
  const world = new World();
  const { owned: tree, opener } = await recorded(world, 'navigation');
  opener.exitAll();
  const first = await end(world, tree);
  assert.deepEqual([first.terminated.length, first.alreadyGone.length], [0, opener.processes.length]);
  const second = await end(world, tree);
  assert.deepEqual([second.terminated.length, second.alreadyGone.length], [0, opener.processes.length]);
});

// The confirming table (the fourth read of a sweep: observe, two core reads, confirm) shows identities again that the core had ended or found gone.
function reappearAtConfirm(world, rows) {
  let reads = 0;
  world.behaviors.list = () => { reads += 1; return reads === 4 ? Promise.resolve(rows) : world.defaultList(); };
}

test('the survivor reasons tell a listed-after-kill identity from a listed-after-reported-gone one', T, async () => {
  const killed = new World();
  const first = await recorded(killed, 'launch');
  const snapshotRows = [...killed.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));
  reappearAtConfirm(killed, snapshotRows);
  const report = await end(killed, first.owned);
  assert.ok(report.survivors.length >= 1);
  assert.ok(report.survivors.every((item) => item.reason === 'still-listed-after-kill'), JSON.stringify(report.survivors));

  const gone = new World();
  const second = await recorded(gone, 'launch');
  const rows = [...gone.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));
  let reads = 0;
  gone.behaviors.list = () => {
    reads += 1;
    if (reads === 1) { const answer = Promise.resolve(rows); second.opener.exitAll(); return answer; }
    if (reads === 3) return Promise.resolve(rows);
    return gone.defaultList();
  };
  const reported = await end(gone, second.owned);
  assert.ok(reported.survivors.length >= 1);
  assert.ok(reported.survivors.every((item) => item.reason === 'listed-after-reported-gone'), JSON.stringify(reported.survivors));
});

test('run(): a later pass decides who survived, what an earlier pass ended stays terminated, errors and refusals accumulate and the pause is KILL_RETRY_MS', T, async () => {
  const world = new World();
  const { owned: tree } = await recorded(world, 'launch');
  const [a, b] = tree.recorded().map(idOf);
  const sleeps = [];
  tree.adapters.sleep = async (ms) => { sleeps.push(ms); };
  const failure = { pid: b.pid, createdAt: b.createdAt, code: 'ERR_KILL', message: 'denied' };
  const passes = [
    { terminated: [a], alreadyGone: [], survivors: [b], refused: [{ ...b, reason: 'protected' }], errors: [failure] },
    { terminated: [b], alreadyGone: [a], survivors: [], refused: [{ ...b, reason: 'protected' }], errors: [] },
  ];
  tree.pass = async () => passes.shift();
  const merged = await tree.run(20000);
  assert.deepEqual(merged.terminated.map((item) => item.pid).sort(), [a.pid, b.pid].sort());
  assert.deepEqual(merged.alreadyGone, [], 'what an earlier pass ended is not reported gone');
  assert.deepEqual(merged.survivors, []);
  assert.equal(merged.refused.length, 1, 'the same refusal is kept once');
  assert.deepEqual(merged.errors, [failure]);
  assert.deepEqual(sleeps, [owned.KILL_RETRY_MS || 1000]);

  const again = [
    { terminated: [a], alreadyGone: [], survivors: [b], refused: [], errors: [] },
    { terminated: [], alreadyGone: [], survivors: [a, b], refused: [], errors: [] },
    { terminated: [], alreadyGone: [], survivors: [a, b], refused: [], errors: [] },
    { terminated: [], alreadyGone: [], survivors: [a, b], refused: [], errors: [] },
  ];
  tree.pass = async () => again.shift();
  const alive = await tree.run(20000);
  assert.deepEqual(alive.terminated, [], 'an identity listed alive again is not terminated');
  assert.deepEqual(alive.survivors.map((item) => item.pid).sort(), [a.pid, b.pid].sort());
});

test('an identity found by the core inside a sweep and gone again at the confirming read is reported once, as terminated', T, async () => {
  const world = new World();
  const { owned: tree, opener } = await recorded(world, 'launch');
  const root = opener.root;
  world.behaviors.kill = (identities) => identities.map((item) => {
    world.os.exit(item.pid);
    return { pid: item.pid, createdAt: item.createdAt, outcome: item.pid === root.pid ? 'survived' : 'killed' };
  });
  const report = await end(world, tree);
  const all = [...report.terminated, ...report.alreadyGone, ...report.survivors].map((item) => item.pid);
  assert.equal(new Set(all).size, all.length, 'no identity is listed twice');
  assert.ok(report.terminated.some((item) => item.pid === root.pid));
  assert.equal(report.clean, true);
});

test('a refused identity that has left the table does not block clean, one that is still listed does', T, async () => {
  for (const stays of [false, true]) {
    const world = new World();
    const { owned: tree, opener } = await recorded(world, 'launch');
    const victim = opener.crashpad;
    let reads = 0;
    world.behaviors.list = () => {
      reads += 1;
      const rows = [...world.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt: pid === victim.pid && reads === 2 ? null : createdAt }));
      if (reads === 3 && !stays) world.os.exit(victim.pid);
      return Promise.resolve(rows);
    };
    const report = await end(world, tree);
    assert.ok(report.refused.some((item) => item.pid === victim.pid && item.reason === 'unverifiable'), 'the unreadable identity was refused');
    assert.equal(report.clean, !stays, `clean when the refused identity ${stays ? 'is still' : 'is no longer'} listed`);
  }
});

test('a process that points into the tree but is OLDER than its parent is neither owned nor unverifiable (F10 limit)', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const root = world.os.spawn(world.os.selfPid);
  world.os.put(3000, root.pid, '1');
  const table = await adapters.list();
  const { snapshot, unverifiable } = await snapshotOwned(root.pid, adapters, { ownerPid: world.os.selfPid, table });
  assert.deepEqual(snapshot.entries.map((entry) => entry.pid), [root.pid]);
  assert.deepEqual(unverifiable, []);
});

test('a root whose pid is reused inside the startup window is a NEW root with the new identity', T, async () => {
  const world = new World();
  const adapters = world.adapters();
  const baseline = await adapters.list();
  const first = world.os.spawn(world.os.selfPid);
  const tree = createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await tree.observe();
  world.os.exit(first.pid);
  const reused = world.os.put(first.pid, world.os.selfPid, world.os.created());
  await tree.observe();
  assert.deepEqual(tree.roots, [idOf(first), idOf(reused)]);
  assert.deepEqual(tree.recorded().map(idOf), [idOf(reused)], 'the entry of the pid is the new identity');
});

test('strangers in the confirming table are not the identities that left: another pid with the same creation time, the same pid with another creation time', T, async () => {
  const world = new World();
  const { owned: tree, opener } = await recorded(world, 'launch');
  const gone = opener.crashpad;
  let after = 0;
  let ran = false;
  const run = tree.run.bind(tree);
  tree.run = async (limit) => { const result = await run(limit); ran = true; return result; };
  world.behaviors.list = () => {
    if (ran) after += 1;
    const rows = [...world.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));
    return Promise.resolve(after === 1 ? rows.concat([{ pid: 880000, ppid: 4, createdAt: gone.createdAt }, { pid: gone.pid, ppid: 4, createdAt: '999' }]) : rows);
  };
  const report = await end(world, tree);
  assert.deepEqual(report.survivors, []);
  assert.equal(report.clean, true);
  assert.equal(report.terminated.length, opener.processes.length);
});

test('survivors say why: still-listed with a readable table, unconfirmed without one; an unverifiable process is listed while it stays or the table is unreadable', T, async () => {
  for (const { readable, stays } of [{ readable: true, stays: false }, { readable: true, stays: true }, { readable: false, stays: false }]) {
    const world = new World();
    const { owned: tree, opener } = await recorded(world, 'launch');
    world.os.table.get(opener.crashpad.pid).immortal = true;
    const hidden = world.os.put(777000, opener.root.pid, null);
    if (!stays) world.beforeKill = () => world.os.exit(hidden.pid);
    let after = 0;
    let ran = false;
    const run = tree.run.bind(tree);
    tree.run = async (limit) => { const result = await run(limit); ran = true; return result; };
    world.behaviors.list = () => {
      if (ran) after += 1;
      if (!readable && after >= 1) return Promise.reject(new Error('confirming read failed'));
      return world.defaultList();
    };
    const report = await end(world, tree);
    const label = JSON.stringify({ readable, stays });
    assert.ok(report.survivors.some((item) => item.pid === opener.crashpad.pid), `the immortal crashpad survives ${label}`);
    assert.ok(report.survivors.every((item) => item.reason === (readable ? 'still-listed' : 'unconfirmed')), `${label} ${JSON.stringify(report.survivors)}`);
    assert.equal(report.unverifiable.length, 1);
    assert.equal(report.unverifiable[0].stillListed, readable ? stays : true, `stillListed ${label}`);
  }
});

test('with every process gone and one unverifiable process gone too, the sweep is clean; the same process still listed makes it unclean', T, async () => {
  for (const stays of [false, true]) {
    const world = new World();
    const { owned: tree, opener } = await recorded(world, 'launch');
    const hidden = world.os.put(777000, opener.root.pid, null);
    if (!stays) world.beforeKill = () => world.os.exit(hidden.pid);
    const report = await end(world, tree);
    assert.deepEqual(report.survivors, []);
    assert.equal(report.unverifiable.length, 1);
    assert.equal(report.unverifiable[0].stillListed, stays);
    assert.equal(report.clean, !stays);
  }
});

test('a survivor of the kill passes that is gone at the confirming read is reported once, as terminated', T, async () => {
  const world = new World();
  const { owned: tree, opener } = await recorded(world, 'launch');
  const crashpad = opener.crashpad;
  world.os.table.get(crashpad.pid).immortal = true;
  let ran = false;
  const run = tree.run.bind(tree);
  tree.run = async (limit) => { const result = await run(limit); ran = true; return result; };
  world.behaviors.list = () => {
    if (ran) world.os.exit(crashpad.pid);
    return world.defaultList();
  };
  const report = await end(world, tree);
  const everyone = [...report.terminated, ...report.alreadyGone, ...report.survivors].map((item) => item.pid);
  assert.equal(new Set(everyone).size, everyone.length, 'no identity is listed twice');
  assert.ok(report.terminated.some((item) => item.pid === crashpad.pid));
  assert.equal(report.clean, true);
});

test('with no known helper the process table is returned whole, even a row that has no pid', T, async () => {
  const world = new World();
  const rows = [{ pid: world.os.selfPid, ppid: 4, createdAt: '1' }, { pid: null, ppid: world.os.selfPid, createdAt: '5' }];
  const inner = { list: () => Promise.resolve(rows), kill: async () => [], lastHelperPid: () => null };
  const adapters = createOwnedAdapters({ inner, clock: world.clock, selfPid: world.os.selfPid });
  assert.deepEqual(await adapters.list(), rows);
});
