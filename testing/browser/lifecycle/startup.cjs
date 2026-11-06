'use strict';

// U005: bound the browser startup. One injected deadline covers the WHOLE open (launch, context, page, first navigation);
// the sealed opener (testing\browser\isolated.cjs, never edited) is wrapped and raced. On expiry only the process tree this
// open started is ended, by recorded identity (owned.cjs), and the call rejects with a StartupError. The sealed promise keeps
// running after the deadline, so the module keeps watching it: a child that appears late is ended, a session that resolves late
// is closed. Startups in one process are serialised by a lock, so "a new direct child of the caller" is never ambiguous.

const {
  checkMs, bounded, describe, createOwnedAdapters, createOwnedTree, LifecycleError, DEFAULT_LIST_MS, DEFAULT_TERMINATE_MS,
} = require('./owned.cjs');

const DEFAULT_GRACE_MS = 60000;
const DEFAULT_POLL_MS = 250;
const LOCK_KEY = Symbol.for('app-scaling-strategies.U005.startupLock');
const REPORT_KEYS = ['confirmed', 'terminated', 'alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable', 'unconfirmed', 'errors'];

const emptyReport = (clean = false) => ({
  confirmed: false, clean, terminated: [], alreadyGone: [], refused: [], survivors: [], failed: [], unverifiable: [], unconfirmed: [], errors: [],
});

// code: ERR_STARTUP_DEADLINE | ERR_STARTUP_FAILED | ERR_STARTUP_UNOWNED | ERR_STARTUP_BASELINE. clean is never true while the sealed
// open is still unsettled (watching) or when anything is listed as survived, failed, unverifiable or unconfirmed.
class StartupError extends Error {
  constructor(code, message, details = {}) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    const report = details.report || emptyReport();
    this.name = 'StartupError';
    this.code = code;
    this.deadlineMs = details.deadlineMs === undefined ? null : details.deadlineMs;
    this.phase = details.phase === undefined ? 'unknown' : details.phase;
    this.watching = Boolean(details.watching);
    this.settled = details.settled === undefined ? null : details.settled;
    this.clean = report.clean && !this.watching;
    for (const key of REPORT_KEYS) this[key] = report[key];
  }
}

function createLock() {
  let tail = Promise.resolve();
  return {
    acquire() {
      let release;
      const held = new Promise((resolve) => { release = resolve; });
      const ready = tail;
      tail = ready.then(() => held);
      return ready.then(() => release);
    },
  };
}

const defaultLock = () => (globalThis[LOCK_KEY] ||= createLock());

function settingsOf(options) {
  const adapters = options.adapters || createOwnedAdapters(options.adapterOptions);
  const pick = (name, fallback) => checkMs(options[name] === undefined ? fallback : options[name], name);
  if (options.signal !== undefined && !(options.signal && typeof options.signal.addEventListener === 'function')) throw new LifecycleError('ERR_INVALID_ARG', 'signal must be an AbortSignal');
  return {
    adapters,
    signal: options.signal,
    clock: options.clock || adapters.clock,
    deadlineMs: checkMs(options.deadlineMs, 'deadlineMs'),
    graceMs: pick('graceMs', DEFAULT_GRACE_MS),
    pollMs: pick('pollMs', DEFAULT_POLL_MS),
    terminateMs: pick('terminateMs', DEFAULT_TERMINATE_MS),
    listMs: pick('listMs', DEFAULT_LIST_MS),
    lock: options.lock || defaultLock(),
    getPhase: typeof options.getPhase === 'function' ? options.getPhase : () => 'unknown',
  };
}

function phaseOf(settings) {
  try {
    return String(settings.getPhase());
  } catch {
    return 'unknown';
  }
}

async function closeSession(session, settings) {
  try {
    await bounded(settings.clock, settings.terminateMs, 'the session close', () => session.close());
    return { status: 'closed', error: null };
  } catch (error) {
    return { status: 'close-failed', error: describe(error) };
  }
}

const sweep = (tree, settings) => tree.terminate({ timeoutMs: settings.terminateMs, listMs: settings.listMs });

// Keeps watching the unsettled open: a late child is ended by identity, a late session is closed. Never rejects.
async function watch(settings, tree, state, first) {
  let report = first;
  let graceExpired = false;
  let late = { status: 'none', error: null };
  const end = settings.clock.now() + settings.graceMs;
  try {
    while (!state.settled) {
      const left = end - settings.clock.now();
      if (left <= 0) {
        graceExpired = true;
        break;
      }
      await settings.adapters.sleep(Math.min(settings.pollMs, left));
      if (!state.settled) report = await sweep(tree, settings);
    }
    if (state.settled && state.ok) late = await closeSession(state.value, settings);
    report = await sweep(tree, settings);
  } catch (error) {
    report = { ...report, clean: false, errors: [...report.errors, { pid: null, createdAt: null, code: error.code || 'ERR_ADAPTER', message: describe(error) }] };
  }
  return {
    ...report,
    clean: report.clean && state.settled && late.status !== 'close-failed',
    innerSettled: state.settled,
    graceExpired,
    lateSession: late.status,
    lateCloseError: late.error,
  };
}

async function expire(settings, tree, state, release, inner, reason) {
  const phase = phaseOf(settings);
  const report = await sweep(tree, settings);
  const settled = watch(settings, tree, state, report).then((final) => {
    // after the grace period the open is abandoned; a session that still resolves later is at least closed (its own browser only)
    if (!state.settled) inner.then((session) => closeSession(session, settings), () => {});
    return final;
  }).finally(release);
  const aborted = reason === 'aborted';
  const code = aborted ? 'ERR_STARTUP_ABORTED' : 'ERR_STARTUP_DEADLINE';
  const message = aborted ? `the open was aborted (phase: ${phase})` : `the browser did not open within ${settings.deadlineMs} ms (phase: ${phase})`;
  throw new StartupError(code, message, { deadlineMs: settings.deadlineMs, phase, watching: !state.settled || state.ok, report, settled });
}

async function adopt(settings, tree, state) {
  const session = state.value;
  try {
    await tree.observe({ timeoutMs: settings.listMs });
    if (tree.roots.length === 0) throw new LifecycleError('ERR_NO_OWNED_ROOT', 'the open produced no new child process of the caller');
    return { ...session, owned: tree };
  } catch (error) {
    const closed = await closeSession(session, settings);
    const report = await sweep(tree, settings);
    const message = `the opened session could not be proven to own a browser tree: ${describe(error)}`;
    throw new StartupError('ERR_STARTUP_UNOWNED', message, { cause: error, deadlineMs: settings.deadlineMs, report: { ...report, clean: report.clean && closed.status === 'closed' } });
  }
}

async function failedOpen(settings, tree, state) {
  const report = await sweep(tree, settings);
  if (report.clean && tree.roots.length === 0 && tree.unverifiable.length === 0) throw state.error;
  throw new StartupError('ERR_STARTUP_FAILED', `the open failed and left processes behind: ${describe(state.error)}`, { cause: state.error, deadlineMs: settings.deadlineMs, report });
}

async function runStartup(run, settings, release) {
  if (settings.signal && settings.signal.aborted) {
    throw new StartupError('ERR_STARTUP_ABORTED', 'the open was aborted before it started, nothing was launched', { deadlineMs: settings.deadlineMs, report: emptyReport(true) });
  }
  const tree = createOwnedTree({ adapters: settings.adapters, ownerPid: settings.adapters.selfPid });
  try {
    tree.setBaseline(await settings.adapters.list({ timeoutMs: settings.listMs }));
  } catch (error) {
    const message = `the process table could not be read before the open, nothing was launched: ${describe(error)}`;
    throw new StartupError('ERR_STARTUP_BASELINE', message, { cause: error, deadlineMs: settings.deadlineMs, report: emptyReport(true) });
  }
  const state = { settled: false, ok: false, value: undefined, error: undefined };
  let inner;
  try {
    inner = Promise.resolve(run());
  } catch (error) {
    inner = Promise.reject(error);
  }
  inner.then((value) => Object.assign(state, { settled: true, ok: true, value }), (error) => Object.assign(state, { settled: true, ok: false, error }));
  let timer;
  let onAbort;
  const expiry = new Promise((resolve) => { timer = settings.clock.setTimeout(() => resolve('expired'), settings.deadlineMs); });
  const abort = new Promise((resolve) => {
    if (!settings.signal) return;
    onAbort = () => resolve('aborted');
    settings.signal.addEventListener('abort', onAbort, { once: true });
  });
  const first = await Promise.race([inner.then(() => 'settled', () => 'settled'), expiry, abort]);
  settings.clock.clearTimeout(timer);
  if (onAbort) settings.signal.removeEventListener('abort', onAbort);
  if (first !== 'settled') return expire(settings, tree, state, release, inner, first);
  return state.ok ? adopt(settings, tree, state) : failedOpen(settings, tree, state);
}

// run() starts the sealed open. Resolves with the sealed session plus `owned` (the recorded process tree) or rejects.
async function startBounded(run, options = {}) {
  const settings = settingsOf(options);
  const release = await settings.lock.acquire();
  try {
    const session = await runStartup(run, settings, release);
    release();
    return session;
  } catch (error) {
    if (!(error instanceof StartupError && error.settled !== null)) release();
    throw error;
  }
}

const loadSealed = () => require('../isolated.cjs');

async function openLessonBounded(relativeRepoPath, options = {}) {
  const open = options.opener || (options.loadSealed || loadSealed)().openIsolatedLesson;
  return startBounded(() => open(relativeRepoPath), options);
}

async function openLoopbackBounded(relativeOwnedIndexPath, server, options = {}) {
  const open = options.opener || (options.loadSealed || loadSealed)().openIsolatedLoopback;
  return startBounded(() => open(relativeOwnedIndexPath, server), options);
}

module.exports = { startBounded, openLessonBounded, openLoopbackBounded, StartupError, createLock, defaultLock };
