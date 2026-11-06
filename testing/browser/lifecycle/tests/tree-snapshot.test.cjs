'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeOS, buildTree } = require('./support/fake-os.cjs');
const { loadImplementation } = require('./support/impl.cjs');

const { snapshotTree, refreshTree } = loadImplementation().tree;
const pidsOf = (snapshot) => snapshot.entries.map((entry) => entry.pid);

test('snapshot holds the root and every live descendant as (pid, creation time) and nothing else', async () => {
  const os = new FakeOS();
  const t = buildTree(os);
  const sibling = os.spawn(os.selfPid);
  const stranger = os.spawn(4);
  const snapshot = await snapshotTree(t.root.pid, os.adapters());
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.rootPid, t.root.pid);
  assert.deepEqual(pidsOf(snapshot), [t.root, t.a, t.b, t.c, t.a1, t.b1, t.c1].map((p) => p.pid));
  assert.deepEqual(snapshot.entries.map((entry) => entry.depth), [0, 1, 1, 1, 2, 2, 2]);
  for (const entry of snapshot.entries) {
    assert.equal(entry.createdAt, os.table.get(entry.pid).createdAt);
    assert.equal(entry.ppid, os.table.get(entry.pid).ppid);
  }
  assert.ok(![sibling.pid, stranger.pid].some((pid) => pidsOf(snapshot).includes(pid)));
  assert.equal(os.killBatches.length, 0, 'taking a snapshot never kills');
});

test('a process whose parent id names a reused pid is not a descendant of the younger holder of that pid', async () => {
  const os = new FakeOS();
  os.put(os.selfPid, 4, os.created());
  const older = os.spawn(7777);
  const reused = os.put(7777, 4, os.created());
  const child = os.spawn(7777);
  const snapshot = await snapshotTree(reused.pid, os.adapters());
  assert.deepEqual(pidsOf(snapshot), [reused.pid, child.pid]);
  assert.ok(!pidsOf(snapshot).includes(older.pid));
});

test('a child created at exactly the creation time of its parent still counts', async () => {
  const os = new FakeOS();
  os.put(os.selfPid, 4, os.created());
  const stamp = os.created();
  os.put(2000, os.selfPid, stamp);
  os.put(2004, 2000, stamp);
  assert.deepEqual(pidsOf(await snapshotTree(2000, os.adapters())), [2000, 2004]);
});

test('parent links that form a cycle terminate and list each process once', async () => {
  const os = new FakeOS();
  const stamp = os.created();
  os.put(10, 12, stamp);
  os.put(12, 10, stamp);
  assert.deepEqual(pidsOf(await snapshotTree(10, os.adapters())), [10, 12]);
});

test('a missing root gives an empty snapshot and an unreadable root or child is never recorded', async () => {
  const os = new FakeOS();
  const gone = await snapshotTree(31337, os.adapters());
  assert.deepEqual(gone.entries, []);
  assert.equal(gone.rootPid, 31337);
  os.put(2000, os.selfPid, os.created());
  os.put(2004, 2000, null);
  assert.deepEqual(pidsOf(await snapshotTree(2000, os.adapters())), [2000]);
  os.put(3000, os.selfPid, null);
  await assert.rejects(snapshotTree(3000, os.adapters()), { code: 'ERR_UNVERIFIABLE_ROOT' });
});

test('bad arguments and malformed adapter output are rejected with a code', async () => {
  const os = new FakeOS();
  for (const bad of [0, -4, 1.5, '12', NaN, null, undefined]) {
    await assert.rejects(snapshotTree(bad, os.adapters()), { code: 'ERR_INVALID_ARG' });
  }
  for (const adapters of [null, {}, { list: async () => [] }]) {
    await assert.rejects(snapshotTree(5, adapters), { code: 'ERR_INVALID_ARG' });
  }
  const rows = [
    [{ pid: 0, ppid: 1, createdAt: '1' }], [{ pid: 5, ppid: -1, createdAt: '1' }], [{ pid: 5, ppid: 1, createdAt: '12a' }],
    [{ pid: 5, ppid: 1, createdAt: 1 }], [{ pid: 5, ppid: 1, createdAt: '1' }, { pid: 5, ppid: 1, createdAt: '2' }], {}, null,
  ];
  for (const bogus of rows) {
    os.listBogus = bogus;
    await assert.rejects(snapshotTree(5, os.adapters()), { code: 'ERR_ADAPTER' });
  }
});

test('a failing list adapter surfaces as an error with a code', async () => {
  const os = new FakeOS();
  os.failList = new Error('helper failed');
  await assert.rejects(snapshotTree(5, os.adapters()), { code: 'ERR_ADAPTER', message: /helper failed/ });
});

test('the caller and its ancestors can never be a snapshot root', async () => {
  const os = new FakeOS();
  os.put(30, 4, os.created());
  os.put(31, 30, os.created());
  os.put(os.selfPid, 31, os.created());
  for (const pid of [os.selfPid, 31, 30]) {
    await assert.rejects(snapshotTree(pid, os.adapters()), { code: 'ERR_PROTECTED_ROOT' });
  }
  const young = new FakeOS();
  young.put(young.selfPid, 40, young.created());
  young.put(40, 4, young.created());
  assert.deepEqual(pidsOf(await snapshotTree(40, young.adapters())), [40], 'the caller is older than that pid, so not its descendant');
});

test('ownerPid proves the root was started by the caller', async () => {
  const os = new FakeOS();
  const t = buildTree(os);
  const options = { ownerPid: os.selfPid };
  assert.equal((await snapshotTree(t.root.pid, os.adapters(), options)).entries.length, 7);
  await assert.rejects(snapshotTree(t.a.pid, os.adapters(), options), { code: 'ERR_NOT_CHILD' });
  await assert.rejects(snapshotTree(t.root.pid, os.adapters(), { ownerPid: 4242 }), { code: 'ERR_NOT_CHILD' });
  os.table.get(os.selfPid).createdAt = os.created();
  await assert.rejects(snapshotTree(t.root.pid, os.adapters(), options), { code: 'ERR_NOT_CHILD' });
});

test('a tree larger than maxEntries is refused instead of being recorded partially', async () => {
  const os = new FakeOS();
  const t = buildTree(os);
  await assert.rejects(snapshotTree(t.root.pid, os.adapters(), { maxEntries: 3 }), { code: 'ERR_TREE_TOO_LARGE' });
  assert.equal((await snapshotTree(t.root.pid, os.adapters(), { maxEntries: 7 })).entries.length, 7);
});

test('refresh adds new children of live entries, keeps dead orphans and never adopts children of dead entries', async () => {
  const os = new FakeOS();
  const t = buildTree(os);
  const snapshot = await snapshotTree(t.root.pid, os.adapters());
  const added = os.spawn(t.a1.pid);
  os.exit(t.c.pid);
  os.exit(t.b.pid);
  const lateChildOfDead = os.spawn(t.b.pid);
  const refreshed = await refreshTree(snapshot, os.adapters());
  assert.deepEqual(pidsOf(refreshed), [...pidsOf(snapshot), added.pid]);
  assert.equal(refreshed.entries.find((entry) => entry.pid === added.pid).depth, 3);
  assert.ok(!pidsOf(refreshed).includes(lateChildOfDead.pid));
  assert.equal(snapshot.entries.length, 7, 'the input snapshot is not mutated');
});

test('refresh replaces the dead identity when a new descendant reuses its pid and rejects an invalid snapshot', async () => {
  const os = new FakeOS();
  const t = buildTree(os);
  const snapshot = await snapshotTree(t.root.pid, os.adapters());
  os.exit(t.a1.pid);
  const reuse = os.put(t.a1.pid, t.a.pid, os.created());
  const refreshed = await refreshTree(snapshot, os.adapters());
  assert.equal(refreshed.entries.filter((entry) => entry.pid === t.a1.pid).length, 1);
  assert.equal(refreshed.entries.find((entry) => entry.pid === t.a1.pid).createdAt, reuse.createdAt);
  await assert.rejects(refreshTree({ version: 2, entries: [] }, os.adapters()), { code: 'ERR_INVALID_ARG' });
});
