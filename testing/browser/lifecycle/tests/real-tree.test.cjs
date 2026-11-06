'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadImplementation } = require('./support/impl.cjs');
const { startScenario, guardAdapters, until, OWNED, LOOKALIKES } = require('./support/scenario.cjs');
const { readProcessTable, withDescendants, isAlive } = require('./support/process-table.cjs');

const { tree, windows } = loadImplementation();
const byNumber = (x, y) => x - y;
const EPOCH_GAP_MS = 11644473600000n;
const filetimeToMs = (createdAt) => Number(BigInt(createdAt) / 10000n - EPOCH_GAP_MS);

// One real scenario: a marked Node tree (every hidden console process also has a conhost.exe child, which is owned too)
// beside look-alikes. Liveness is judged by loopback connections and an independent read-only process table.
test('a real marked Node tree is terminated by identity and every look-alike survives', { timeout: 300000 }, async (t) => {
  const scenario = await startScenario();
  try {
    const table = readProcessTable();
    const pidOf = (name) => scenario.pid(name);
    const ownedExpected = withDescendants(table, OWNED.map(pidOf));
    const lookalikeExpected = withDescendants(table, LOOKALIKES.map(pidOf));
    const guard = guardAdapters(windows.createWindowsAdapters(), { mayKill: new Set([...ownedExpected, ...lookalikeExpected]), forbidden: lookalikeExpected });
    const adapters = guard.adapters;
    const snapshot = await tree.snapshotTree(pidOf('R'), adapters, { ownerPid: process.pid });

    scenario.send('C', { cmd: 'exit' });
    assert.equal(await scenario.waitClosed(['C'], 30000), true, 'branch C exits first so C1 is an orphan');
    assert.equal(await until(() => !isAlive(pidOf('C')), 30000), true, 'C is gone at the operating system level');
    await until(() => table.filter((row) => row.ppid === pidOf('C') && row.name === 'conhost.exe').every((row) => !isAlive(row.pid)), 5000);

    const sRow = (await adapters.list({ timeoutMs: 60000 })).find((row) => row.pid === pidOf('S'));
    const stale = { pid: sRow.pid, ppid: pidOf('R'), createdAt: String(BigInt(sRow.createdAt) - 36000000000n), depth: 1 };
    const withStale = { ...snapshot, entries: [...snapshot.entries, stale] };

    let result;
    let thrown;
    try {
      result = await tree.terminateOwned(withStale, { timeoutMs: 90000, adapters });
    } catch (error) {
      thrown = error;
    }
    const allGone = await until(() => [...ownedExpected].every((pid) => !isAlive(pid)), 30000);
    const alive = {};
    for (const name of LOOKALIKES) alive[name] = await scenario.ping(name);
    const pidsOf = (list) => (list || []).map((item) => item.pid).sort(byNumber);

    await t.test('terminateOwned completes without throwing', () => assert.equal(thrown, undefined, String(thrown && thrown.message)));
    await t.test('the snapshot is exactly the owned tree with identities that match the fixtures', () => {
      assert.deepEqual(snapshot.entries.map((entry) => entry.pid).sort(byNumber), [...ownedExpected].sort(byNumber));
      for (const entry of snapshot.entries) {
        assert.match(entry.createdAt, /^\d+$/);
        assert.equal(entry.ppid, table.find((row) => row.pid === entry.pid).ppid);
      }
      for (const name of OWNED) {
        const entry = snapshot.entries.find((candidate) => candidate.pid === pidOf(name));
        assert.ok(Math.abs(filetimeToMs(entry.createdAt) - scenario.hello(name).startedAtMs) < 10000, `${name} creation time is its real start`);
      }
    });
    await t.test('every owned process is gone and accounted for', () => {
      assert.ok(result, 'terminateOwned returned a result');
      assert.equal(allGone, true);
      assert.equal(scenario.isClosed('R') && scenario.isClosed('A1') && scenario.isClosed('B1') && scenario.isClosed('C1'), true);
      assert.deepEqual([...pidsOf(result.terminated), ...pidsOf(result.alreadyGone)].sort(byNumber), [...ownedExpected].sort(byNumber));
      assert.deepEqual(result.survivors, []);
      assert.deepEqual(result.errors, []);
    });
    await t.test('the orphan whose parent exited first is terminated and the parent is reported already gone', () => {
      assert.ok(result, 'terminateOwned returned a result');
      assert.ok(pidsOf(result.alreadyGone).includes(pidOf('C')));
      for (const name of ['R', 'A', 'B', 'A1', 'B1', 'C1']) assert.ok(pidsOf(result.terminated).includes(pidOf(name)), `${name} terminated`);
      assert.ok(!pidsOf(result.terminated).includes(pidOf('C')));
    });
    await t.test('a Node process with the same marker outside the tree survives', () => assert.equal(alive.L1, true));
    await t.test('a Node process of the same image that is not owned survives', () => assert.equal(alive.L2, true));
    await t.test('a recorded identity with another creation time is refused and its live process survives', () => {
      assert.ok(result, 'terminateOwned returned a result');
      assert.deepEqual(pidsOf(result.refused), [pidOf('S')]);
      assert.equal(result.refused[0].reason, 'identity-mismatch');
      assert.equal(alive.S, true);
    });
    await t.test('no kill was requested for any process outside the snapshot and the look-alike helpers survive', () => {
      assert.deepEqual(guard.forbiddenRequests(), []);
      assert.ok(guard.requested.length > 0, 'something was requested');
      assert.ok(guard.requested.every((identity) => ownedExpected.has(identity.pid)));
      assert.ok([...lookalikeExpected].every((pid) => isAlive(pid)));
    });
  } finally {
    await scenario.close();
  }
});
