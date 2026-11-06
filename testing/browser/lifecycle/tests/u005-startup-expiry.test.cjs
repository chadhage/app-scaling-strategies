'use strict';

// U005 startup tests, expiry side: every phase, a late child, a late session, look-alikes, survivors and hostile adapters.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, elapse, quiesce, settle, begin } = require('./u005-support-world.cjs');

const { StartupError } = loadImplementation().startup;
const T = { timeout: 20000 };
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);
const expireError = async (world, start) => (await drive(world.clock, settle(start))).value.error;
const finalOf = async (world, error) => (await drive(world.clock, error.settled)).value;

for (const phase of ['launch', 'new context', 'new page', 'navigation']) {
  test(`expiry during ${phase} ends only the owned tree and rejects with a typed error`, T, async () => {
    const world = new World();
    const lookAlike = world.foreign('msedge.exe', 5000);
    const earlier = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
    const opener = new FakeOpener(world);
    const start = begin(world, opener);
    await quiesce();
    opener.buildTo(phase);
    const error = await expireError(world, start);
    assert.ok(error instanceof StartupError);
    assert.equal(error.name, 'StartupError');
    assert.equal(error.code, 'ERR_STARTUP_DEADLINE');
    assert.equal(error.deadlineMs, 1000);
    assert.equal(error.phase, phase);
    assert.equal(error.clean, true);
    assert.equal(error.watching, false);
    assert.deepEqual(ids(error.terminated), ids(opener.processes));
    for (const key of ['alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable']) assert.deepEqual(error[key], [], key);
    assert.deepEqual(opener.alive(), []);
    assert.equal(world.has(lookAlike), true);
    assert.equal(world.has(earlier), true);
    assert.deepEqual(world.killRequests.filter((request) => request.pid === lookAlike.pid || request.pid === earlier.pid), []);
    assert.equal((await finalOf(world, error)).clean, true);
    assert.equal(world.clock.pending(), 0);
  });
}

test('expiry before any child exists rejects at once and keeps watching; a late browser and a late session are cleaned', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  const start = begin(world, opener);
  await quiesce();
  const error = await expireError(world, start);
  assert.equal(error.code, 'ERR_STARTUP_DEADLINE');
  assert.equal(error.phase, 'before launch');
  assert.equal(error.watching, true);
  assert.equal(error.clean, false);
  assert.deepEqual(error.terminated, []);
  opener.buildTo('navigation');
  await elapse(world.clock, 400);
  assert.deepEqual(opener.alive(), []);
  assert.equal(opener.state, 'pending');
  opener.succeed();
  const final = await finalOf(world, error);
  assert.equal(opener.sessionCloses, 1);
  assert.equal(final.lateSession, 'closed');
  assert.equal(final.innerSettled, true);
  assert.equal(final.clean, true);
  assert.deepEqual(ids(final.terminated), ids(opener.processes));
  assert.equal(world.clock.pending(), 0);
});

test('a session that resolves late, after its tree was ended at expiry, is closed and never left behind', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('new page');
  const error = await expireError(world, start);
  assert.equal(error.watching, true);
  assert.deepEqual(ids(error.terminated), ids(opener.processes));
  opener.succeed();
  const final = await finalOf(world, error);
  assert.equal(opener.sessionCloses, 1);
  assert.equal(final.lateSession, 'closed');
  assert.equal(final.clean, true);
});

test('a late session whose close fails is reported, not hidden, and is not clean', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  opener.closeError = new Error('scratch busy');
  const start = begin(world, opener);
  await quiesce();
  const error = await expireError(world, start);
  opener.succeed();
  const final = await finalOf(world, error);
  assert.equal(final.lateSession, 'close-failed');
  assert.equal(final.lateCloseError, 'scratch busy');
  assert.equal(final.clean, false);
});

test('a late session whose close never settles is abandoned after the grace period and its tree is still ended', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  const start = begin(world, opener);
  await quiesce();
  const error = await expireError(world, start);
  opener.session = () => ({ page: {}, browserVersion: '1', close: () => new Promise(() => {}) });
  opener.buildTo('launch');
  opener.succeed();
  const final = await finalOf(world, error);
  assert.equal(final.lateSession, 'close-failed');
  assert.match(final.lateCloseError, /did not settle/);
  assert.deepEqual(opener.alive(), []);
});

test('an open that never settles and spawns nothing is abandoned after the grace period and reported unclean', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  const error = await expireError(world, start);
  const final = await finalOf(world, error);
  assert.equal(final.graceExpired, true);
  assert.equal(final.innerSettled, false);
  assert.equal(final.clean, false);
  assert.ok(world.clock.t >= 6000);
  assert.equal(opener.calls.length, 1);
});

test('a browser that cannot be ended is reported as survived: never success-shaped', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener, { terminateMs: 2000 });
  await quiesce();
  opener.buildTo('new page');
  world.os.table.get(opener.root.pid).immortal = true;
  const error = await expireError(world, start);
  assert.equal(error.clean, false);
  assert.deepEqual(ids(error.survivors), [opener.root.pid]);
  assert.equal(ids(error.terminated).includes(opener.root.pid), false);
  assert.equal(error.terminated.length, opener.processes.length - 1);
  await finalOf(world, error);
});

test('an access-denied browser process is listed as failed and survived', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  opener.autoReject = false;
  const start = begin(world, opener, { terminateMs: 2000 });
  await quiesce();
  opener.buildTo('launch');
  world.os.table.get(opener.crashpad.pid).denied = true;
  const error = await expireError(world, start);
  assert.equal(error.clean, false);
  assert.deepEqual(ids(error.failed), [opener.crashpad.pid]);
  assert.equal(error.failed[0].code, 'ERR_KILL');
  assert.deepEqual(ids(error.survivors), [opener.crashpad.pid]);
  await finalOf(world, error);
});

test('F4 at startup: a kill adapter that lies about a kill cannot produce terminated', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  world.behaviors.kill = (identities) => identities.map(({ pid, createdAt }) => ({ pid, createdAt, outcome: 'killed' }));
  const start = begin(world, opener, { terminateMs: 2000 });
  await quiesce();
  opener.buildTo('new context');
  const error = await expireError(world, start);
  assert.deepEqual(error.terminated, []);
  assert.deepEqual(ids(error.survivors), ids(opener.processes));
  assert.equal(error.clean, false);
  await finalOf(world, error);
});

test('F3 at startup: a list adapter that stops answering still lets the rejection arrive, unclean', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  let calls = 0;
  world.behaviors.list = () => { calls += 1; return calls === 1 ? world.defaultList() : new Promise(() => {}); };
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('launch');
  const error = await expireError(world, start);
  assert.equal(error.clean, false);
  assert.ok(error.errors.some((item) => item.code === 'ERR_TIMEOUT'));
  assert.equal(opener.alive().length, opener.processes.length);
  const final = await finalOf(world, error);
  assert.equal(final.clean, false);
  assert.equal(world.clock.pending(), 0);
});

test('F3 at startup: a kill adapter that never settles still lets the rejection arrive, with survivors', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  world.behaviors.kill = () => new Promise(() => {});
  const start = begin(world, opener, { terminateMs: 2000 });
  await quiesce();
  opener.buildTo('launch');
  const error = await expireError(world, start);
  assert.equal(error.clean, false);
  assert.deepEqual(error.terminated, []);
  assert.deepEqual(ids(error.survivors), ids(opener.processes));
  await finalOf(world, error);
});

test('F1 at startup: an empty table at expiry is never read as everything gone', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  let calls = 0;
  world.behaviors.list = () => { calls += 1; return calls === 1 ? world.defaultList() : Promise.resolve([]); };
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('launch');
  const error = await expireError(world, start);
  assert.deepEqual(error.alreadyGone, []);
  assert.deepEqual(error.terminated, []);
  assert.equal(error.clean, false);
  assert.ok(error.errors.some((item) => item.code === 'ERR_TABLE_INCOMPLETE' || item.code === 'ERR_LIST'));
  await finalOf(world, error);
});

test('F2 at startup: an unreadable descendant is listed as unverifiable and counted until it is gone', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('launch');
  const hidden = world.os.put(2000, opener.root.pid, null);
  const error = await expireError(world, start);
  assert.deepEqual(error.unverifiable.map((item) => [item.pid, item.stillListed]), [[hidden.pid, true]]);
  assert.equal(error.clean, false);
  await finalOf(world, error);

  const other = new World();
  const second = new FakeOpener(other);
  const again = begin(other, second);
  await quiesce();
  second.buildTo('launch');
  other.os.put(2000, second.root.pid, null);
  other.afterKill.push(() => other.os.exit(2000));
  const gone = await expireError(other, again);
  assert.deepEqual(gone.unverifiable.map((item) => item.stillListed), [false]);
  assert.equal(gone.clean, true);
  await finalOf(other, gone);
});

test('pid reuse between snapshot and kill: the stranger is refused, never killed, and survives', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('new page');
  let stranger = null;
  world.beforeKill = () => {
    if (stranger) return;
    world.os.exit(opener.renderer.pid);
    stranger = world.os.put(opener.renderer.pid, 5000, world.os.created(), { name: 'msedge.exe' });
  };
  const error = await expireError(world, start);
  assert.ok(error.refused.some((item) => item.pid === opener.renderer.pid && item.reason === 'identity-mismatch'));
  assert.equal(world.has(stranger), true);
  assert.equal(world.killRequests.some((item) => item.pid === stranger.pid && item.createdAt === stranger.createdAt), false);
  assert.equal(error.clean, true);
  await finalOf(world, error);
});
