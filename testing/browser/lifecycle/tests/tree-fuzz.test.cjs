'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { FakeOS, SECOND } = require('./support/fake-os.cjs');
const { loadImplementation } = require('./support/impl.cjs');

const { snapshotTree, terminateOwned } = loadImplementation().tree;

function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Deterministic chaos: random trees with strangers, elders that name an owned pid as parent but are older than it,
// processes that exit, pids that are reused before and during the kill, and children spawned late.
test('seeded chaos: strangers, elders and reused pids are never removed and every live owned identity is', async () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const rand = prng(seed);
    const pick = (list) => list[Math.floor(rand() * list.length)];
    const os = new FakeOS();
    os.put(os.selfPid, 4, os.created());
    const root = os.spawn(os.selfPid);
    const owned = [root];
    for (let i = 0; i < 4 + Math.floor(rand() * 14); i += 1) owned.push(os.spawn(pick(owned).pid));
    const protectedByIdentity = [];
    for (let i = 0; i < 2 + Math.floor(rand() * 6); i += 1) protectedByIdentity.push(os.spawn(rand() < 0.5 ? os.selfPid : 4));
    for (let i = 0; i < 3; i += 1) {
      const elder = os.spawn(pick(owned).pid);
      elder.createdAt = String(BigInt(root.createdAt) - BigInt(i + 1) * SECOND);
      protectedByIdentity.push(elder);
    }

    const adapters = os.adapters();
    const snapshot = await snapshotTree(root.pid, adapters);
    assert.deepEqual(snapshot.entries.map((entry) => entry.pid).sort((x, y) => x - y), owned.map((p) => p.pid).sort((x, y) => x - y), `seed ${seed}`);

    const reusePid = (process) => {
      os.exit(process.pid);
      protectedByIdentity.push(os.put(process.pid, 4, os.created()));
    };
    for (const process of owned) {
      if (!os.table.has(process.pid)) continue;
      const roll = rand();
      if (roll < 0.2) os.exit(process.pid);
      else if (roll < 0.3) reusePid(process);
    }
    const alive = () => owned.filter((process) => os.table.get(process.pid) === process);
    const late = [];
    if (rand() < 0.5 && alive().length) late.push(os.spawn(pick(alive()).pid));
    os.beforeKill = () => {
      os.beforeKill = null;
      const candidates = alive();
      if (candidates.length && rand() < 0.4) os.exit(pick(candidates).pid);
      const others = alive();
      if (others.length && rand() < 0.4) reusePid(pick(others));
    };

    const result = await terminateOwned(snapshot, { timeoutMs: 60000, adapters });
    for (const entry of snapshot.entries) {
      const live = os.table.get(entry.pid);
      assert.ok(!(live && live.createdAt === entry.createdAt), `seed ${seed}: owned pid ${entry.pid} is gone`);
    }
    for (const process of late) assert.ok(!os.table.has(process.pid), `seed ${seed}: a late child of a live owned process is gone`);
    for (const process of protectedByIdentity) assert.equal(os.table.get(process.pid), process, `seed ${seed}: pid ${process.pid} keeps its own live process`);
    assert.deepEqual(result.survivors, [], `seed ${seed}`);
    assert.deepEqual(result.errors, [], `seed ${seed}`);
    for (const identity of os.killBatches.flat()) {
      const recorded = snapshot.entries.find((entry) => entry.pid === identity.pid);
      assert.ok(recorded ? recorded.createdAt === identity.createdAt : late.some((p) => p.pid === identity.pid), `seed ${seed}: only recorded identities are requested`);
    }
  }
});
