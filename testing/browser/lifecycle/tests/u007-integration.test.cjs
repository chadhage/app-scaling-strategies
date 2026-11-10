'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { World, drive, quiesce } = require('./u005-support-world.cjs');
const { fixture, discard, processReport, error, ManualClock, fakeFileSystem } = require('./u007-support.cjs');
const core = require('../scratch.cjs');
const api = require('../scratch-session.cjs');
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };

test('S009: overlapping creation observers retain original mkdir semantics and isolate both live roots', async () => {
  const parent = fixture();
  const original = fs.promises.mkdir;
  const a = core.createScratchOwner({ parent });
  const b = core.createScratchOwner({ parent });
  const rootA = path.join(parent, 'session-A');
  const rootB = path.join(parent, 'session-B');
  const neighbour = path.join(parent, 'session-neighbour');
  const gateA = deferred(), gateB = deferred();
  let pendingA, pendingB;
  try {
    pendingA = api.observeScratchCreation(a, async () => { await gateA.promise; assert.equal(await fs.promises.mkdir(rootA), undefined); return 'A'; });
    pendingB = api.observeScratchCreation(b, async () => { await gateB.promise; assert.equal(await fs.promises.mkdir(rootB), undefined); return 'B'; });
    await fs.promises.mkdir(neighbour);
    await fs.promises.writeFile(path.join(neighbour, 'sentinel.txt'), 'untouched');
    gateA.resolve();
    assert.equal(await pendingA, 'A');
    assert.notEqual(fs.promises.mkdir, original, 'B still owns an active observer reference');
    assert.deepEqual(a.paths(), [rootA]);
    assert.deepEqual(b.paths(), []);
    gateB.resolve();
    assert.equal(await pendingB, 'B');
    assert.equal(fs.promises.mkdir, original);
    assert.deepEqual(b.paths(), [rootB]);
    assert.equal((await a.cleanup()).clean, true);
    assert.equal(await fs.promises.readFile(path.join(neighbour, 'sentinel.txt'), 'utf8'), 'untouched');
    assert.equal(fs.existsSync(rootB), true);
    assert.equal((await b.cleanup()).clean, true);
  } finally {
    gateA.resolve(); gateB.resolve();
    if (pendingA) await pendingA;
    if (pendingB) await pendingB;
    await discard(parent);
  }
});
test('S007: existing neighbour mkdir rejects with the original EEXIST and grants no ownership', async () => {
  const parent = fixture();
  const target = path.join(parent, 'session-neighbour');
  const owner = core.createScratchOwner({ parent });
  try {
    await fs.promises.mkdir(target);
    await fs.promises.writeFile(path.join(target, 'sentinel.txt'), 'existing');
    await assert.rejects(api.observeScratchCreation(owner, () => fs.promises.mkdir(target)), { code: 'EEXIST' });
    assert.deepEqual(owner.paths(), []);
    assert.equal((await owner.cleanup()).attempts.length, 0);
    assert.equal(await fs.promises.readFile(path.join(target, 'sentinel.txt'), 'utf8'), 'existing');
    await assert.rejects(api.observeScratchCreation({}, () => {}), { code: 'ERR_SCRATCH_OWNERSHIP' });
  } finally { await discard(parent); }
});
for (const order of [[0, 1], [1, 0]]) {
  test(`S012: unchanged U005/U006 composition, two live scopes ${order[0] === 0 ? 'FIFO' : 'LIFO'}, retained scratch failure`, async () => {
    const parent = fixture();
    const world = new World();
    world.cost = 0;
    const live = [];
    const roots = [];
    const neighbour = path.join(parent, 'session-neighbour');
    await fs.promises.mkdir(neighbour);
    await fs.promises.writeFile(path.join(neighbour, 'sentinel.txt'), 'neighbour');
    const adapters = world.adapters();
    try {
      for (const label of ['A', 'B']) {
        const root = path.join(parent, 'session-' + label);
        roots.push(root);
        let sealedClosing;
        const handle = api.startScratchSession(async () => {
          await fs.promises.mkdir(root);
          await fs.promises.writeFile(path.join(root, 'sentinel.txt'), label);
          const browser = world.os.spawn(world.os.selfPid, { name: 'fixture-browser' });
          world.os.spawn(browser.pid, { name: 'fixture-child' });
          return { page: { title: async () => { assert.equal(world.has(browser), true); return label; } }, browserVersion: 'fixture',
            close: () => sealedClosing ||= (async () => { world.os.exit(browser.pid); throw error('EBUSY'); })() };
        }, { scratchParent: parent, scratchClock: world.clock, adapters, clock: world.clock,
          deadlineMs: 1000, gracefulMs: 1000, listMs: 1000, terminateMs: 1000, settleMs: 1000 });
        assert.equal(handle.ok, true);
        const session = await handle.ready;
        assert.deepEqual(handle.scratchPaths(), [root]);
        live.push({ session, handle });
      }
      const first = live[order[0]], last = live[order[1]];
      const pending = first.session.close();
      assert.equal(first.handle.close(), pending);
      const r = await pending;
      assert.equal(r.clean, true);
      assert.equal(r.process.scratch, 'failed');
      assert.equal(r.originalCloseError.code, 'ERR_CLOSE_FAILED');
      assert.equal(r.scratch.clean, true);
      assert.equal(fs.existsSync(roots[order[0]]), false);
      assert.equal(await last.session.page.title(), order[1] === 1 ? 'B' : 'A');
      assert.equal(await fs.promises.readFile(path.join(roots[order[1]], 'sentinel.txt'), 'utf8'), order[1] === 1 ? 'B' : 'A');
      assert.equal(await fs.promises.readFile(path.join(neighbour, 'sentinel.txt'), 'utf8'), 'neighbour');
      assert.equal(first.session.close(), pending);
      assert.equal((await last.session.close()).clean, true);
      assert.equal(await fs.promises.readFile(path.join(neighbour, 'sentinel.txt'), 'utf8'), 'neighbour');
    } finally {
      try { for (const { handle } of live) await handle.close(); }
      finally { await discard(parent); }
    }
  });
}
test('S012: an unsettled bounded process close never removes the positively recorded scratch', async () => {
  const parent = path.resolve('owned-parent');
  const clock = new ManualClock();
  const fake = fakeFileSystem(parent, clock);
  const owner = core.createScratchOwner({ parent, fs: fake.adapter, clock });
  const root = path.join(parent, 'session-owned');
  await owner.mkdir(root);
  const wrapped = api.wrapScratchSession({ close: () => new Promise(() => {}) }, owner, { clock, processTimeoutMs: 200 });
  const result = await drive(clock, wrapped.close());
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'ERR_SCRATCH_SESSION');
  assert.equal(result.error.outcome.scratch.code, 'ERR_SCRATCH_PROCESS_UNCONFIRMED');
  assert.equal(fake.state.calls.length, 0);
  assert.equal(fake.entries.has(root), true);
});
test('S012: failed opener after exclusive creation retains its error and removes only its own root', async () => {
  const parent = fixture();
  const root = path.join(parent, 'session-failed');
  const world = new World(); world.cost = 0;
  try {
    const handle = api.startScratchSession(async () => { await fs.promises.mkdir(root); throw error('OWN_OPEN_FAILED'); },
      { scratchParent: parent, scratchClock: world.clock, clock: world.clock, adapters: world.adapters(), deadlineMs: 1000 });
    await assert.rejects(handle.ready, { code: 'OWN_OPEN_FAILED' });
    const result = await handle.close();
    assert.equal(result.clean, true);
    assert.equal(result.process.startup, 'failed');
    assert.deepEqual(result.scratch.removed, [root]);
    assert.equal(fs.existsSync(root), false);
  } finally { await discard(parent); }
});
test('S012: close during an uncompleted baseline records refusal and never launches or deletes', async () => {
  const parent = fixture();
  const world = new World(); world.cost = 0;
  world.behaviors.list = () => new Promise(() => {});
  let opens = 0;
  try {
    const handle = api.startScratchSession(() => { opens += 1; }, { scratchParent: parent, scratchClock: world.clock,
      clock: world.clock, adapters: world.adapters(), deadlineMs: 1000 });
    const r = await drive(world.clock, handle.close());
    assert.equal(r.ok, false);
    assert.equal(r.error.code, 'ERR_SCRATCH_SESSION');
    assert.equal(opens, 0);
    assert.equal(r.error.outcome.scratch.attempts.length, 0);
    assert.deepEqual(handle.scratchPaths(), []);
  } finally { await discard(parent); }
});
test('S012: lesson and loopback entry points forward the exact caller snapshot to the unchanged bounded session', async () => {
  const parent = fixture();
  const world = new World(); world.cost = 0;
  let invocation = 0, reads = 0;
  const server = {};
  const opener = async (...args) => {
    invocation += 1;
    assert.equal(args[0], 'owned-fixture');
    if (invocation === 2) assert.equal(args[1], server);
    const root = path.join(parent, 'session-' + invocation);
    await fs.promises.mkdir(root);
    const browser = world.os.spawn(world.os.selfPid);
    return { page: {}, close: async () => { world.os.exit(browser.pid); await fs.promises.rm(root, { recursive: true }); } };
  };
  const options = { scratchParent: parent, scratchClock: world.clock, clock: world.clock, adapters: world.adapters(),
    get deadlineMs() { reads += 1; return reads <= 2 ? 1000 : 'changed'; }, opener };
  try {
    const a = await api.openLessonScratchSession('owned-fixture', options);
    assert.equal((await a.close()).clean, true);
    const b = await api.openLoopbackScratchSession('owned-fixture', server, options);
    assert.equal((await b.close()).clean, true);
    assert.equal(reads, 2);
    assert.equal(api.startScratchSession(null).ok, false);
    assert.equal(api.startScratchSession(() => {}, { unknown: true }).ok, false);
    assert.equal(api.startScratchSession(() => {}, { scratchParent: 'NUL' }).ok, false);
    await assert.rejects(api.openLessonScratchSession('owned-fixture', { scratchParent: 'NUL', opener }), { code: 'ERR_SCRATCH_SESSION' });
    await assert.rejects(api.openLoopbackScratchSession('owned-fixture', server, { scratchParent: 'NUL', opener }), { code: 'ERR_SCRATCH_SESSION' });
    assert.equal(api.wrapScratchSession({ close() {} }, core.createScratchOwner({ parent }), { processTimeoutMs: 0 }).ok, false);
  } finally { await discard(parent); }
});
test('S012: an abandoned open retains its non-clean outcome and a late close cannot adopt the next session', async () => {
  const parent = fixture();
  const world = new World(); world.cost = 0;
  const firstCreated = deferred(), late = deferred(), lateClosed = deferred();
  const rootA = path.join(parent, 'session-late-A');
  const rootB = path.join(parent, 'session-live-B');
  let second;
  try {
    const first = api.startScratchSession(async () => {
      await fs.promises.mkdir(rootA);
      world.os.spawn(world.os.selfPid);
      firstCreated.resolve();
      return late.promise;
    }, { scratchParent: parent, scratchClock: world.clock, clock: world.clock, adapters: world.adapters(),
      deadlineMs: 10, graceMs: 10, pollMs: 1, listMs: 1000, terminateMs: 1000 });
    await firstCreated.promise;
    const expired = await drive(world.clock, first.ready);
    assert.equal(expired.ok, false);
    assert.equal(expired.error.code, 'ERR_STARTUP_DEADLINE');
    const original = await drive(world.clock, first.close());
    assert.equal(original.ok, false);
    assert.equal(original.error.code, 'ERR_SCRATCH_SESSION');
    assert.equal(original.error.outcome.process.innerSettled, false);
    assert.equal(original.error.outcome.scratch.attempts.length, 0);
    assert.equal(fs.existsSync(rootA), true);
    const saved = JSON.stringify(original.error.outcome);
    second = api.startScratchSession(async () => {
      await fs.promises.mkdir(rootB);
      await fs.promises.writeFile(path.join(rootB, 'sentinel.txt'), 'B unchanged');
      const browser = world.os.spawn(world.os.selfPid);
      return { page: { title: async () => { assert.equal(world.has(browser), true); return 'B'; } },
        close: async () => { world.os.exit(browser.pid); await fs.promises.rm(rootB, { recursive: true }); } };
    }, { scratchParent: parent, scratchClock: world.clock, clock: world.clock, adapters: world.adapters(), deadlineMs: 1000 });
    const sessionB = await second.ready;
    late.resolve({ close: async () => { await fs.promises.rm(rootA, { recursive: true }); lateClosed.resolve(); } });
    await lateClosed.promise;
    await quiesce();
    assert.equal(await sessionB.page.title(), 'B');
    assert.equal(await fs.promises.readFile(path.join(rootB, 'sentinel.txt'), 'utf8'), 'B unchanged');
    assert.equal(JSON.stringify(original.error.outcome), saved, 'the original unknown outcome is not rewritten as success');
    assert.equal((await sessionB.close()).clean, true);
  } finally {
    try { if (second) await second.close(); }
    finally { await discard(parent); }
  }
});
