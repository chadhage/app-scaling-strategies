'use strict';

// Test tooling (not production code): a virtual clock, a fake operating system with a fake browser opener, and a driver that
// advances virtual time only when the code under test is waiting. Nothing here reads the wall clock or touches a real process.

const { FakeOS } = require('./support/fake-os.cjs');

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function quiesce(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) await tick();
}

class ManualClock {
  constructor() {
    this.t = 0;
    this.timers = [];
    this.seq = 0;
    this.requested = [];
  }

  now() { return this.t; }

  setTimeout(fn, ms) {
    this.seq += 1;
    const handle = { id: this.seq, at: this.t + ms, fn };
    this.timers.push(handle);
    this.requested.push(ms);
    return handle;
  }

  clearTimeout(handle) { this.timers = this.timers.filter((item) => item !== handle); }

  sleep(ms) { return new Promise((resolve) => this.setTimeout(resolve, ms)); }

  pending() { return this.timers.length; }

  fireNext(limit = Infinity) {
    if (this.timers.length === 0) return false;
    this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
    const next = this.timers[0];
    if (next.at > limit) return false;
    this.timers.shift();
    this.t = Math.max(this.t, next.at);
    next.fn();
    return true;
  }
}

const settle = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }));

// Runs virtual time forward until the promise settles; fails the test when nothing is pending and it still has not.
async function drive(clock, promise, maxSteps = 5000) {
  let outcome = null;
  settle(promise).then((result) => { outcome = result; });
  for (let step = 0; step < maxSteps && !outcome; step += 1) {
    await quiesce();
    if (outcome) break;
    if (!clock.fireNext()) {
      await quiesce();
      if (!outcome) throw new Error('stuck: no timer is pending and the promise never settled');
    }
  }
  if (!outcome) throw new Error('drive: step limit reached');
  return outcome;
}

async function elapse(clock, ms) {
  const target = clock.t + ms;
  await quiesce();
  while (clock.fireNext(target)) await quiesce();
  clock.t = target;
  await quiesce();
}

class World {
  constructor({ selfPid = 900 } = {}) {
    this.os = new FakeOS({ selfPid });
    this.os.put(selfPid, 4, this.os.created(), { name: 'node.exe' });
    this.clock = new ManualClock();
    this.cost = 5;
    this.killRequests = [];
    this.listCalls = 0;
    this.afterKill = [];
    this.beforeKill = null;
    this.lastHelper = null;
    this.behaviors = { list: null, kill: null };
    this.inner = {
      lastHelperPid: () => this.lastHelper,
      killByName: (name) => {
        let count = 0;
        for (const [pid, process] of [...this.os.table]) {
          if (process.name === name) { this.os.table.delete(pid); count += 1; }
        }
        for (const callback of this.afterKill) callback();
        return Promise.resolve(count);
      },
      list: (call) => {
        this.listCalls += 1;
        return this.behaviors.list ? this.behaviors.list(call, this.listCalls) : this.defaultList();
      },
      kill: (identities, call) => {
        this.killRequests.push(...identities.map(({ pid, createdAt }) => ({ pid, createdAt })));
        if (this.beforeKill) this.beforeKill(identities);
        const result = this.behaviors.kill ? this.behaviors.kill(identities, call) : this.defaultKill(identities);
        return Promise.resolve(result).then((outcomes) => {
          for (const callback of this.afterKill) callback();
          return outcomes;
        });
      },
    };
  }

  // Every helper is a fresh child of the caller that appears in the table it prints, then exits; every call costs virtual time.
  defaultList() {
    this.clock.t += this.cost;
    const helper = this.os.spawn(this.os.selfPid, { name: 'powershell.exe' });
    this.lastHelper = helper.pid;
    const rows = [...this.os.table.values()].map(({ pid, ppid, createdAt }) => ({ pid, ppid, createdAt }));
    this.os.exit(helper.pid);
    return Promise.resolve(rows);
  }

  defaultKill(identities) {
    this.clock.t += this.cost;
    return identities.map((identity) => this.os.killOne(identity));
  }

  foreign(name = 'msedge.exe', ppid = 5000) { return this.os.spawn(ppid, { name }); }

  adapters(overrides = {}) {
    const { createOwnedAdapters } = require('./u005-support-impl.cjs').loadImplementation().owned;
    return createOwnedAdapters({ inner: this.inner, clock: this.clock, selfPid: this.os.selfPid, ...overrides });
  }

  has(process) { return this.os.table.has(process.pid) && this.os.table.get(process.pid).createdAt === process.createdAt; }
}

// A fake of the sealed open: the test decides which phase the browser tree has reached and how the open ends.
class FakeOpener {
  constructor(world) {
    this.world = world;
    this.phase = 'before launch';
    this.processes = [];
    this.calls = [];
    this.state = 'pending';
    this.autoReject = true;
    this.sessionCloses = 0;
    this.closeError = null;
    this.promise = new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; });
    this.promise.catch(() => {});
    world.afterKill.push(() => this.react());
    this.open = (...args) => { this.calls.push(args); return this.promise; };
    this.getPhase = () => this.phase;
  }

  spawn(ppid, name = 'msedge.exe') {
    const process = this.world.os.spawn(ppid, { name });
    this.processes.push(process);
    return process;
  }

  launch() {
    this.phase = 'launch';
    this.root = this.spawn(this.world.os.selfPid);
    this.crashpad = this.spawn(this.root.pid);
  }

  newContext() { this.phase = 'new context'; this.gpu = this.spawn(this.root.pid); }

  newPage() { this.phase = 'new page'; this.renderer = this.spawn(this.root.pid); }

  navigate() { this.phase = 'navigation'; this.utility = this.spawn(this.gpu.pid); }

  buildTo(phase) {
    const steps = { launch: ['launch'], 'new context': ['launch', 'newContext'], 'new page': ['launch', 'newContext', 'newPage'], navigation: ['launch', 'newContext', 'newPage', 'navigate'] };
    for (const step of steps[phase]) this[step]();
  }

  alive() { return this.processes.filter((process) => this.world.has(process)); }

  exitAll() { for (const process of this.processes) this.world.os.exit(process.pid); }

  session() {
    return {
      page: { title: async () => 'fixture' },
      browserVersion: '156.0.0.0',
      close: async () => {
        this.sessionCloses += 1;
        if (this.closeError) throw this.closeError;
        this.exitAll();
      },
    };
  }

  succeed() { this.state = 'resolved'; this.resolve(this.session()); }

  fail(error) { this.state = 'rejected'; this.reject(error); }

  react() {
    const rootGone = this.root && !this.world.has(this.root);
    if (this.autoReject && this.state === 'pending' && rootGone) this.fail(new Error('Target closed'));
  }
}

// Options for a bounded open of the fake opener: small virtual deadlines, a private lock, guarded adapters over the fake OS.
function optionsFor(world, opener, options = {}) {
  const { owned, startup } = require('./u005-support-impl.cjs').loadImplementation();
  const adapters = owned.createOwnedAdapters({ inner: world.inner, clock: world.clock, selfPid: world.os.selfPid });
  return {
    deadlineMs: 1000, graceMs: 5000, pollMs: 100, terminateMs: 20000, listMs: 5000,
    adapters, clock: world.clock, getPhase: opener.getPhase, lock: startup.createLock(), ...options,
  };
}

function begin(world, opener, options = {}) {
  const { startup } = require('./u005-support-impl.cjs').loadImplementation();
  return startup.startBounded(opener.open, optionsFor(world, opener, options));
}

// A fake browser tree of the given phase, recorded by an owned tree (baseline taken before the browser appeared).
async function recorded(world, phase = 'navigation') {
  const { owned } = require('./u005-support-impl.cjs').loadImplementation();
  const adapters = world.adapters();
  const baseline = await adapters.list();
  const opener = new FakeOpener(world);
  opener.buildTo(phase);
  const tree = owned.createOwnedTree({ adapters, ownerPid: world.os.selfPid, baseline });
  await tree.observe();
  return { adapters, opener, owned: tree };
}

module.exports = { ManualClock, World, FakeOpener, quiesce, drive, elapse, settle, begin, optionsFor, recorded };
