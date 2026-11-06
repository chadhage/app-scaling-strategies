'use strict';

// Hardened composition of tree.cjs and windows.cjs for U005 and U006 (production code: every operating system access is an
// injected adapter). It enforces the U004 review findings at the composition level without touching the accepted files:
//   F1 an empty or truncated process table fails closed (it must contain the caller's own pid)
//   F2 an unreadable descendant is reported as unverifiable, never dropped
//   F3 every awaited adapter call is raced against its deadline by a timer this module owns
//   F4 `terminated` is reported only after a confirming fresh table, never on the kill adapter's word
//   F5 system pids, foreign owners and foreign roots are refused, ownerPid is required, the caller's pid is never forwarded as a target
//   F8 createWindowsAdapters gets process.env itself (a plain copy gets the case-sensitive names added)
//   F9 no timer is ever set above 2147483647 ms (Node would clamp it to 1 ms)

const tree = require('./tree.cjs');

const { LifecycleError } = tree;
const MAX_TIMER_MS = 2147483647;
const SYSTEM_PIDS = new Set([0, 4]);
const DEFAULT_LIST_MS = 30000;
const DEFAULT_TERMINATE_MS = 60000;
const SLACK_MS = 1000;
const MAX_KILL_PASSES = 4;
const KILL_RETRY_MS = 1000;

const invalid = (message) => new LifecycleError('ERR_INVALID_ARG', message);
const isPid = (value) => Number.isSafeInteger(value) && value > 0;
const keyOf = (item) => `${item.pid}:${item.createdAt}`;
const describe = (error) => String((error && error.message) || error);
const identityOf = (item) => ({ pid: item.pid, createdAt: item.createdAt });
const failureOf = (error) => ({ pid: null, createdAt: null, code: (error && error.code) || 'ERR_ADAPTER', message: describe(error) });

function checkMs(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw invalid(`${name} must be a positive finite number`);
  return Math.min(value, MAX_TIMER_MS);
}

// The longest one sweep (OwnedTree.terminate) can take when every adapter hangs: the table read, the kill passes and the confirming read.
function sweepBoundMs(options = {}) {
  const pick = (name, fallback) => checkMs(options[name] === undefined ? fallback : options[name], name);
  return 2 * pick('listMs', DEFAULT_LIST_MS) + pick('terminateMs', DEFAULT_TERMINATE_MS);
}

const systemClock = Object.freeze({
  now: () => Number(process.hrtime.bigint() / 1000000n),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

// Races work() against a timer owned here; the timer is always cleared, the late outcome of work() is swallowed.
function bounded(clock, ms, label, work) {
  return new Promise((resolve, reject) => {
    const limit = checkMs(ms, 'timeoutMs');
    const timer = clock.setTimeout(() => reject(new LifecycleError('ERR_TIMEOUT', `${label} did not settle within ${limit} ms`)), limit);
    const settle = (fn) => (value) => { clock.clearTimeout(timer); fn(value); };
    try {
      Promise.resolve(work()).then(settle(resolve), settle(reject));
    } catch (error) {
      settle(reject)(error);
    }
  });
}

// process.env itself is case-insensitive on Windows, a spread copy is not: copies get SystemRoot and windir added.
function windowsEnv(env) {
  if (env === process.env) return env;
  const copy = { ...env };
  for (const name of ['SystemRoot', 'windir']) {
    const found = Object.keys(env).find((key) => key.toLowerCase() === name.toLowerCase());
    if (found !== undefined && copy[name] === undefined) copy[name] = env[found];
  }
  return copy;
}

function checkedTable(rows, selfPid, helper) {
  if (!Array.isArray(rows)) throw new LifecycleError('ERR_ADAPTER', 'list adapter must return an array');
  if (!rows.some((row) => Boolean(row) && row.pid === selfPid)) {
    throw new LifecycleError('ERR_TABLE_INCOMPLETE', 'the process table does not contain the caller itself, so it cannot be trusted');
  }
  return rows.filter((row) => !(helper !== null && row.pid === helper && row.ppid === selfPid));
}

// Guarded adapters: { selfPid, clock, now, sleep, list, kill } around injected inner adapters or the Windows ones. The owner pid is
// always process.pid for the real adapters: selfPid can only be injected together with inner (test) adapters.
function createOwnedAdapters(options = {}) {
  if (options.selfPid !== undefined && !options.inner) throw invalid('selfPid can only be injected together with inner adapters: the real adapters always own as process.pid');
  const { clock = systemClock, selfPid = process.pid, listMs = DEFAULT_LIST_MS, killMs = DEFAULT_TERMINATE_MS } = options;
  let base = options.inner;
  let helperPid = () => (base && typeof base.lastHelperPid === 'function' ? base.lastHelperPid() : null);
  if (!base) {
    const { createWindowsAdapters } = require('./windows.cjs');
    const spawn = options.spawn || require('node:child_process').spawn;
    let helper = null;
    const recording = (...args) => {
      const child = spawn(...args);
      helper = child && Number.isSafeInteger(child.pid) ? child.pid : null;
      return child;
    };
    base = createWindowsAdapters({ platform: options.platform, env: windowsEnv(options.env || process.env), spawn: recording });
    helperPid = () => helper;
  }
  const pickMs = (call, fallback) => checkMs(call && call.timeoutMs !== undefined ? call.timeoutMs : fallback, 'timeoutMs');

  return {
    selfPid,
    clock,
    now: () => clock.now(),
    sleep: (ms) => (ms > 0 ? clock.sleep(Math.min(ms, MAX_TIMER_MS)) : Promise.resolve()),
    async list(call) {
      const limit = pickMs(call, listMs);
      let helper = null;
      const rows = await bounded(clock, limit, 'the process table', () => {
        const pending = base.list({ timeoutMs: limit });
        helper = helperPid();
        return pending;
      });
      return checkedTable(rows, selfPid, helper);
    },
    async kill(identities, call) {
      if (!Array.isArray(identities) || !identities.every((item) => Boolean(item) && isPid(item.pid))) throw invalid('identities must be an array of {pid, createdAt}');
      const limit = pickMs(call, killMs);
      const protectedIds = identities.filter((item) => item.pid === selfPid || SYSTEM_PIDS.has(item.pid));
      const forwarded = identities.filter((item) => !protectedIds.includes(item));
      const outcomes = forwarded.length === 0 ? [] : await bounded(clock, limit, 'the kill adapter', () => base.kill(forwarded, { timeoutMs: limit }));
      const refusals = protectedIds.map((item) => ({ pid: item.pid, createdAt: item.createdAt, outcome: 'error', detail: 'refused: protected pid' }));
      return [...(Array.isArray(outcomes) ? outcomes : []), ...refusals];
    },
  };
}

// Rows that hang below the owned entries but cannot be proven owned: a direct child of an owned entry whose creation time
// cannot be read, and everything below such a row (its parent's creation time is unknown, so the age rule cannot run).
function unverifiableOf(rows, entries) {
  const owned = new Set(entries.map((entry) => entry.pid));
  const found = new Map();
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (owned.has(row.pid) || found.has(row.pid)) continue;
      const below = found.has(row.ppid);
      if (below || (owned.has(row.ppid) && row.createdAt === null)) {
        found.set(row.pid, { pid: row.pid, ppid: row.ppid, createdAt: row.createdAt, reason: below ? 'below-unverifiable' : 'unreadable-creation-time' });
        grew = true;
      }
    }
  }
  return [...found.values()];
}

function foreignOwner(ownerPid, adapters) {
  if (!isPid(ownerPid)) throw invalid('ownerPid is required');
  if (ownerPid !== adapters.selfPid) throw new LifecycleError('ERR_FOREIGN_OWNER', 'ownerPid must be the calling process itself');
}

// One root and everything below it, from one table: the root must be a verified child of the caller (F5), never a system process.
async function snapshotOwned(rootPid, adapters, options = {}) {
  const { ownerPid, timeoutMs } = options;
  foreignOwner(ownerPid, adapters);
  if (SYSTEM_PIDS.has(rootPid)) throw new LifecycleError('ERR_PROTECTED_ROOT', 'system processes can never be an owned tree');
  const rows = options.table || await adapters.list({ timeoutMs });
  const snapshot = await tree.snapshotTree(rootPid, { ...adapters, list: async () => rows }, { ownerPid });
  return { snapshot, unverifiable: unverifiableOf(rows, snapshot.entries) };
}

// The latest pass decides who survived; what any pass terminated stays terminated, errors and refusals accumulate.
function mergePasses(previous, next) {
  const alive = new Set(next.survivors.map(keyOf));
  const killed = new Map();
  for (const item of [...previous.terminated, ...next.terminated]) if (!alive.has(keyOf(item))) killed.set(keyOf(item), identityOf(item));
  const refused = new Map();
  for (const item of [...previous.refused, ...next.refused]) refused.set(keyOf(item), item);
  return {
    terminated: [...killed.values()],
    alreadyGone: next.alreadyGone.filter((item) => !killed.has(keyOf(item))),
    survivors: next.survivors,
    refused: [...refused.values()],
    errors: [...previous.errors, ...next.errors],
  };
}

// The processes one startup owns: recorded by identity while they live, ended by identity, confirmed by a fresh table.
// Ownership is positive and fixed at startup: new direct children of the caller are adopted as roots ONLY while the startup window is open
// (the per-process lock serialises it); seal() closes the window, afterwards observe() and terminate() refresh the descendants of the
// recorded identities and never adopt a new direct child of the caller (another live session's browser, an unrelated process).
class OwnedTree {
  #sealed = false;

  constructor({ adapters, ownerPid, baseline = [] }) {
    foreignOwner(ownerPid, adapters);
    this.adapters = adapters;
    this.ownerPid = ownerPid;
    this.entries = new Map();
    this.hidden = new Map();
    this.history = new Set();
    this.seen = new Map();
    this.rootList = [];
    this.setBaseline(baseline);
  }

  get roots() { return this.rootList.map(identityOf); }

  get sealed() { return this.#sealed; }

  get unverifiable() { return [...this.hidden.values()].map((item) => ({ ...item })); }

  recorded() { return [...this.entries.values()].map((entry) => ({ ...entry })); }

  snapshot() {
    return {
      version: 1,
      rootPid: this.rootList.length > 0 ? this.rootList[0].pid : this.ownerPid,
      capturedAtMs: this.adapters.now(),
      entries: this.recorded(),
    };
  }

  // The direct children of the caller that already exist are never new roots.
  setBaseline(rows) {
    this.before = new Set(rows.filter((row) => row.ppid === this.ownerPid).map(keyOf));
  }

  // The startup window is over: the roots are fixed (identity = pid + creation time) for the rest of the life of the tree.
  seal() {
    this.#sealed = true;
  }

  // Records the new direct children of the caller (startup window only) and everything below them from one table.
  async adoptRoots(table) {
    const isKnown = (row) => this.entries.has(row.pid) && this.entries.get(row.pid).createdAt === row.createdAt;
    for (const row of table.filter((item) => item.ppid === this.ownerPid && !this.before.has(keyOf(item)) && !isKnown(item))) {
      if (row.createdAt === null) {
        this.hidden.set(row.pid, { pid: row.pid, ppid: row.ppid, createdAt: null, reason: 'unreadable-creation-time' });
        continue;
      }
      try {
        const { snapshot } = await snapshotOwned(row.pid, this.adapters, { ownerPid: this.ownerPid, table });
        for (const entry of snapshot.entries) this.entries.set(entry.pid, entry);
        this.rootList.push(identityOf(row));
      } catch (error) {
        this.hidden.set(row.pid, { pid: row.pid, ppid: row.ppid, createdAt: row.createdAt, reason: `refused: ${error.code}` });
      }
    }
  }

  // Refreshes the descendants of the recorded identities from one table; adopts new roots only while the window is open.
  async adopt(table) {
    if (!this.#sealed) await this.adoptRoots(table);
    if (this.entries.size > 0) {
      const refreshed = await tree.refreshTree(this.snapshot(), { ...this.adapters, list: async () => table });
      this.entries = new Map(refreshed.entries.map((entry) => [entry.pid, entry]));
    }
    for (const item of unverifiableOf(table, [...this.entries.values()])) if (!this.hidden.has(item.pid)) this.hidden.set(item.pid, item);
  }

  async observe(options = {}) {
    const table = await this.adapters.list({ timeoutMs: options.timeoutMs });
    await this.adopt(table);
    return table;
  }

  async terminate(options = {}) {
    const killLimit = checkMs(options.timeoutMs === undefined ? DEFAULT_TERMINATE_MS : options.timeoutMs, 'timeoutMs');
    const listLimit = checkMs(options.listMs === undefined ? DEFAULT_LIST_MS : options.listMs, 'listMs');
    const errors = [];
    let table = null;
    try {
      table = await this.observe({ timeoutMs: listLimit });
    } catch (error) {
      errors.push(failureOf(error));
    }
    const mustKill = table === null || [...this.entries.keys()].some((pid) => table.some((row) => row.pid === pid));
    let result = { terminated: [], alreadyGone: [...this.entries.values()].map(identityOf), survivors: [], refused: [], errors: [] };
    let fresh = table;
    if (mustKill) {
      result = await this.run(killLimit);
      try {
        fresh = await this.adapters.list({ timeoutMs: listLimit });
      } catch (error) {
        fresh = null;
        errors.push(failureOf(error));
      }
    }
    return this.classify(result, fresh, errors);
  }

  // One or more terminateOwned passes: a kill that failed (a process that is still exiting answers access denied) is not retried inside one
  // call of the core, so a surviving identity is tried again, by identity, after a short pause, while the deadline allows.
  async run(limit) {
    const started = this.adapters.now();
    let result = await this.pass(limit);
    for (let pass = 1; pass < MAX_KILL_PASSES && result.survivors.length > 0; pass += 1) {
      const left = limit - (this.adapters.now() - started);
      if (left <= KILL_RETRY_MS) break;
      await this.adapters.sleep(KILL_RETRY_MS);
      result = mergePasses(result, await this.pass(left - KILL_RETRY_MS));
    }
    return result;
  }

  async pass(limit) {
    const snapshot = this.snapshot();
    try {
      const result = await bounded(this.adapters.clock, limit + SLACK_MS, 'terminateOwned', () => tree.terminateOwned(snapshot, { timeoutMs: limit, adapters: this.adapters }));
      for (const item of [...result.terminated, ...result.alreadyGone, ...result.survivors]) this.seen.set(keyOf(item), identityOf(item));
      return result;
    } catch (error) {
      return { terminated: [], alreadyGone: [], survivors: snapshot.entries.map(identityOf), refused: [], errors: [failureOf(error)] };
    }
  }

  // Only the fresh table decides: what the kill adapter claimed is a claim, not a result (F4). The report is cumulative over DISTINCT identities:
  // everything this tree recorded or ended in any earlier sweep (including what the core found inside one sweep) is classified again.
  classify(result, fresh, errors) {
    const listed = (item) => fresh !== null && fresh.some((row) => row.pid === item.pid && row.createdAt === item.createdAt);
    const terminated = [];
    const alreadyGone = [];
    const survivors = [];
    const unconfirmed = [];
    const handled = new Set();
    const put = (item, how) => {
      const identity = identityOf(item);
      handled.add(keyOf(item));
      if (how === 'survivor') survivors.push({ ...identity, reason: fresh === null ? 'unconfirmed' : 'still-listed' });
      else if (fresh === null) unconfirmed.push(identity);
      else if (listed(item)) survivors.push({ ...identity, reason: how === 'killed' ? 'still-listed-after-kill' : 'listed-after-reported-gone' });
      else if (how === 'killed' || this.history.has(keyOf(item))) terminated.push(identity);
      else alreadyGone.push(identity);
    };
    for (const item of result.terminated) put(item, 'killed');
    for (const item of result.alreadyGone) put(item, 'gone');
    for (const item of result.survivors) {
      if (fresh !== null && !listed(item)) {
        handled.add(keyOf(item));
        terminated.push(identityOf(item));
      } else put(item, 'survivor');
    }
    for (const item of this.seen.values()) if (!handled.has(keyOf(item))) put(item, 'gone');
    for (const item of terminated) this.history.add(keyOf(item));
    const refused = result.refused.map((item) => ({ ...item }));
    const stillThere = (item) => fresh === null || fresh.some((row) => row.pid === item.pid);
    const unverifiable = this.unverifiable.map((item) => ({ ...item, stillListed: stillThere(item) }));
    const blocking = refused.filter((item) => item.reason !== 'identity-mismatch' && stillThere(item));
    const failed = [...new Map(result.errors.filter((item) => item.pid !== null).map((item) => [keyOf(item), { pid: item.pid, createdAt: item.createdAt, code: item.code, message: item.message }])).values()];
    const clean = fresh !== null && survivors.length === 0 && unconfirmed.length === 0 && blocking.length === 0 && !unverifiable.some((item) => item.stillListed);
    return { confirmed: fresh !== null, clean, terminated, alreadyGone, refused, survivors, failed, unverifiable, unconfirmed, errors: [...result.errors, ...errors] };
  }
}

const createOwnedTree = (options) => new OwnedTree(options);

module.exports = {
  MAX_TIMER_MS, DEFAULT_LIST_MS, DEFAULT_TERMINATE_MS, systemClock, checkMs, sweepBoundMs, bounded, describe, failureOf, identityOf, keyOf,
  createOwnedAdapters, snapshotOwned, createOwnedTree, OwnedTree, LifecycleError,
};
