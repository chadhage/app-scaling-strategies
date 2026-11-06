'use strict';

// U005 fix F1 (rev-U005 major): a session owns the processes recorded during ITS startup window and nothing else. New direct children of
// the caller are adopted as roots only while the startup holds the per-process lock; afterwards observe() and terminate() refresh the
// descendants of the recorded identities only. Every scenario below opens two or more sessions in one process (hermetic: virtual clock,
// fake operating system, fake opener); the reviewer's probes D1, D2, D4 and D6 and the real-Edge reproduction E4 are the model.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadImplementation } = require('./u005-support-impl.cjs');
const { World, FakeOpener, drive, quiesce, settle, begin } = require('./u005-support-world.cjs');

const { startup } = loadImplementation();
const T = { timeout: 20000 };
const ids = (items) => items.map((item) => item.pid).sort((a, b) => a - b);
const outcome = (world, promise) => drive(world.clock, settle(promise)).then((result) => result.value);

async function openSession(world, options = {}) {
  const opener = new FakeOpener(world);
  const start = begin(world, opener, options);
  await quiesce();
  opener.buildTo('navigation');
  opener.succeed();
  const result = await outcome(world, start);
  assert.equal(result.ok, true, 'the startup succeeds');
  return { opener, session: result.value };
}

async function end(world, session) {
  const result = await outcome(world, session.owned.terminate({ timeoutMs: 20000, listMs: 5000 }));
  assert.equal(result.ok, true, 'terminate resolves');
  return result.value;
}

const intact = (entry) => entry.opener.alive().length === entry.opener.processes.length;
const requestedOnly = (world, ...entries) => world.killRequests.every((request) => entries.some((entry) => entry.opener.processes.some((item) => item.pid === request.pid)));

test('F1 (D1): with two live sessions the terminate of the first ends only its own tree', T, async () => {
  const world = new World();
  const a = await openSession(world);
  const b = await openSession(world);
  assert.deepEqual(ids(a.session.owned.recorded()), ids(a.opener.processes));
  assert.deepEqual(ids(b.session.owned.recorded()), ids(b.opener.processes));
  const report = await end(world, a.session);
  assert.equal(a.opener.alive().length, 0, 'the first tree is gone');
  assert.equal(intact(b), true, 'the second browser tree survives');
  assert.deepEqual(ids([...report.terminated, ...report.alreadyGone]), ids(a.opener.processes), 'the report lists exactly the first tree');
  assert.equal(report.clean, true);
  assert.equal(requestedOnly(world, a), true, 'no kill request names a process of the second session');
});

test('F1 (D2): observing a session never records the browser of a younger session', T, async () => {
  const world = new World();
  const a = await openSession(world);
  const b = await openSession(world);
  await a.session.owned.observe();
  assert.deepEqual(ids(a.session.owned.recorded()), ids(a.opener.processes));
  assert.deepEqual(a.session.owned.roots.map((root) => root.pid), [a.opener.root.pid]);
  assert.deepEqual(a.session.owned.unverifiable, []);
  assert.equal(intact(b), true);
});

for (const order of [['first', 'second'], ['second', 'first']]) {
  test(`F1: two live sessions ended in the order ${order.join(' then ')}: each end touches only its own tree`, T, async () => {
    const world = new World();
    const entries = { first: await openSession(world), second: await openSession(world) };
    const [early, late] = order;
    await end(world, entries[early].session);
    assert.equal(entries[early].opener.alive().length, 0);
    assert.equal(intact(entries[late]), true, 'the later one is untouched');
    await end(world, entries[late].session);
    assert.equal(entries[late].opener.alive().length, 0);
    assert.equal(requestedOnly(world, entries.first, entries.second), true);
    assert.equal(new Set(world.killRequests.map((request) => request.pid)).size, world.killRequests.length, 'no identity is requested twice');
  });
}

test('F1: two concurrent startups own disjoint trees and ending either leaves the other alone', T, async () => {
  for (const firstEnded of ['a', 'b']) {
    const world = new World();
    const lock = startup.createLock();
    const oa = new FakeOpener(world);
    const ob = new FakeOpener(world);
    const sa = begin(world, oa, { lock });
    const sb = begin(world, ob, { lock });
    await quiesce();
    oa.buildTo('navigation');
    oa.succeed();
    const a = (await outcome(world, sa)).value;
    await quiesce();
    ob.buildTo('navigation');
    ob.succeed();
    const b = (await outcome(world, sb)).value;
    assert.equal(a.owned.recorded().some((entry) => ob.processes.some((item) => item.pid === entry.pid)), false);
    assert.equal(b.owned.recorded().some((entry) => oa.processes.some((item) => item.pid === entry.pid)), false);
    const [first, second] = firstEnded === 'a' ? [[a, oa], [b, ob]] : [[b, ob], [a, oa]];
    await end(world, first[0]);
    assert.equal(second[1].alive().length, second[1].processes.length, `the browser of the other startup survives (ended first: ${firstEnded})`);
    assert.equal(first[1].alive().length, 0);
  }
});

test('F1 (D4): an unrelated direct child of the caller that appears after the startup is never adopted or ended', T, async () => {
  const world = new World();
  const a = await openSession(world);
  const stranger = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
  await a.session.owned.observe();
  assert.deepEqual(ids(a.session.owned.recorded()), ids(a.opener.processes));
  await end(world, a.session);
  await end(world, a.session);
  assert.equal(world.has(stranger), true, 'the stranger survived two terminate calls');
  assert.equal(world.killRequests.some((request) => request.pid === stranger.pid), false);
});

test('F1 (D6): a second terminate of an ended session ends nothing and a browser opened in between survives', T, async () => {
  const world = new World();
  const a = await openSession(world);
  const first = await end(world, a.session);
  assert.equal(first.clean, true);
  const killedBefore = world.killRequests.length;
  const b = await openSession(world);
  const again = await end(world, a.session);
  assert.equal(intact(b), true, 'the next session browser survives the repeated terminate');
  assert.equal(world.killRequests.length, killedBefore, 'the repeated terminate sends no kill request');
  assert.equal(again.clean, true);
  assert.deepEqual(ids(again.terminated), ids(first.terminated), 'the repeated report lists the same identities');
  assert.deepEqual(a.session.owned.roots.map((root) => root.pid), [a.opener.root.pid]);
});

test('F1: after the startup the descendants of the recorded identities are still refreshed and ended', T, async () => {
  const world = new World();
  const a = await openSession(world);
  const b = await openSession(world);
  const late = a.opener.spawn(a.opener.renderer.pid);
  const lateRoot = a.opener.spawn(a.opener.root.pid);
  await a.session.owned.observe();
  assert.deepEqual(ids(a.session.owned.recorded()), ids(a.opener.processes), 'the late descendants are recorded');
  const report = await end(world, a.session);
  assert.equal(world.has(late) || world.has(lateRoot), false, 'the late descendants are ended with the tree');
  assert.deepEqual(ids([...report.terminated, ...report.alreadyGone]), ids(a.opener.processes));
  assert.equal(intact(b), true);
});

test('F1 limit: a child the caller itself starts inside the startup window is still adopted (the window is the honest limit)', T, async () => {
  const world = new World();
  const opener = new FakeOpener(world);
  const start = begin(world, opener);
  await quiesce();
  opener.buildTo('navigation');
  const intruder = world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
  opener.succeed();
  const session = (await outcome(world, start)).value;
  assert.ok(ids(session.owned.recorded()).includes(intruder.pid), 'inside the window a new direct child is a new root');
  assert.equal(session.owned.roots.length, 2);
});

test('F1: a session sealed by its startup can be observed and ended repeatedly without ever growing its roots', T, async () => {
  const world = new World();
  const a = await openSession(world);
  const rootsBefore = a.session.owned.roots;
  for (let i = 0; i < 3; i += 1) {
    world.os.spawn(world.os.selfPid, { name: 'msedge.exe' });
    await a.session.owned.observe();
    await end(world, a.session);
  }
  assert.deepEqual(a.session.owned.roots, rootsBefore);
  assert.equal(a.session.owned.sealed, true);
  assert.throws(() => { a.session.owned.sealed = false; }, TypeError, 'the window cannot be reopened from outside');
  assert.equal(a.session.owned.sealed, true);
});
