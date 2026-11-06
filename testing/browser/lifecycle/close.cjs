'use strict';

// U006: a close() that cannot hang. wrapSession(session, options) wraps the session that the bounded startup (U005, startup.cjs) returns:
//   1. the graceful close (default: the sealed session close, injectable as options.graceful) gets `gracefulMs` to settle
//   2. whatever happened, the owned process tree is then ended by identity (session.owned.terminate: fresh table, identity-verified kill,
//      confirming fresh table), never by image name or marker; the tree is the one the startup sealed (U005: positive ownership, fixed at launch),
//      so close() can only end THIS session's browser and never another live session's
//   2a. a survivor still listed at a readable confirming table gets ONE more read-only table read after exitSettleMs (it may be exiting)
//   3. after the tree is gone the sealed cleanup (browser close and the scratch directory removal) gets `settleMs` to settle, so the
//      removal is still attempted when the graceful path failed, and its failure is reported
// close() returns ONE promise for every call: the first outcome (or the first rejection) is the outcome of every caller. It resolves with
// the outcome only when the end state is clean, otherwise it rejects with a CloseError that lists survivors, failures and the scratch result.
// The outcome and the CloseError are deep-frozen copies (one value is shared by every caller). Options are read once and validated (typed refusals).
// The U005 files are consumed read-only (owned.cjs: checkMs, describe, LifecycleError and the defaults).

const { checkMs, bounded, describe, sweepBoundMs, identityOf, failureOf, LifecycleError, DEFAULT_LIST_MS, DEFAULT_TERMINATE_MS } = require('./owned.cjs');

const DEFAULT_GRACEFUL_MS = 15000;
const DEFAULT_SETTLE_MS = 15000;
const DEFAULT_EXIT_SETTLE_MS = 2000;
const FILESYSTEM_SYSCALLS = new Set(['rm', 'rmdir', 'unlink', 'lstat', 'stat', 'opendir', 'scandir', 'rename', 'open']);
const FILESYSTEM_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);
const REPORT_KEYS = Object.freeze(['confirmed', 'terminated', 'alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable', 'unconfirmed', 'errors']);

// code ERR_CLOSE_FAILED. Fields: graceful (closed | failed | timeout), gracefulError, sealed (settled | unsettled), sealedError,
// scratch (removed | failed | unconfirmed), scratchError, clean, exiting, and the termination report (terminated, alreadyGone, refused,
// survivors, failed, unverifiable, unconfirmed, errors, confirmed). Every caller of the one shared close() receives the same outcome, so it is a
// deep-FROZEN copy: no caller can change what another one sees, and no module constant is ever returned.
class CloseError extends Error {
  constructor(message, outcome) {
    super(message);
    this.name = 'CloseError';
    this.code = 'ERR_CLOSE_FAILED';
    Object.assign(this, frozenCopy(outcome));
    Object.freeze(this);
  }
}

function frozenCopy(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(frozenCopy));
  if (value !== null && typeof value === 'object') return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, frozenCopy(item)])));
  return value;
}

const invalidArg = (message) => new LifecycleError('ERR_INVALID_ARG', message);

// A typed refusal (never a TypeError) for options that are not an object and for an option whose getter throws.
function optionsOf(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw invalidArg('options must be an object');
  return options;
}

function readOption(options, name) {
  try {
    return options[name];
  } catch (error) {
    throw invalidArg(`option ${name} cannot be read: ${describe(error)}`);
  }
}

const isScratchFailure = (error) => Boolean(error) && (FILESYSTEM_SYSCALLS.has(error.syscall) || FILESYSTEM_CODES.has(error.code));

// Never rejects: how a promise ended within `ms`.
function settleWithin(clock, promise, ms) {
  return new Promise((resolve) => {
    const timer = clock.setTimeout(() => resolve({ settled: false }), ms);
    const done = (result) => {
      clock.clearTimeout(timer);
      resolve({ settled: true, ...result });
    };
    promise.then((value) => done({ ok: true, value }), (error) => done({ ok: false, error }));
  });
}

// Every close option is read exactly ONCE (a getter cannot answer differently for the check and for the use) and anything unreadable or invalid is a typed refusal.
const OPTION_NAMES = ['gracefulMs', 'terminateMs', 'listMs', 'settleMs', 'exitSettleMs', 'graceful', 'clock'];

function snapshotOf(options) {
  const source = optionsOf(options);
  return Object.fromEntries(OPTION_NAMES.map((name) => [name, readOption(source, name)]));
}

function durationsFrom(given) {
  const pick = (name, fallback) => checkMs(given[name] === undefined ? fallback : given[name], name);
  if (given.graceful !== undefined && typeof given.graceful !== 'function') throw invalidArg('graceful must be a function');
  if (given.clock !== undefined && !(given.clock && typeof given.clock.setTimeout === 'function' && typeof given.clock.clearTimeout === 'function')) throw invalidArg('clock must provide setTimeout and clearTimeout');
  return {
    gracefulMs: pick('gracefulMs', DEFAULT_GRACEFUL_MS),
    terminateMs: pick('terminateMs', DEFAULT_TERMINATE_MS),
    listMs: pick('listMs', DEFAULT_LIST_MS),
    settleMs: pick('settleMs', DEFAULT_SETTLE_MS),
    exitSettleMs: pick('exitSettleMs', DEFAULT_EXIT_SETTLE_MS),
  };
}

const durationsOf = (options) => durationsFrom(snapshotOf(options));

// The worst case of one close(), from the options only: the graceful close (gracefulMs), one sweep of the owned tree (a table read, the identity-verified
// kills, the confirming read: listMs + terminateMs + listMs), the settle and the single re-read after a confirmed survivor (exitSettleMs, listMs) and the
// wait for the sealed cleanup (settleMs). A table adapter that never answers ends at gracefulMs + sweepBoundMs (+ settleMs when the graceful close hangs too).
function budgetsOf(options = {}) {
  const durations = durationsOf(options);
  const sweep = sweepBoundMs({ listMs: durations.listMs, terminateMs: durations.terminateMs });
  return { ...durations, sweepBoundMs: sweep, closeBoundMs: durations.gracefulMs + sweep + durations.exitSettleMs + durations.listMs + durations.settleMs };
}

function settingsOf(session, options) {
  if (!session || typeof session.close !== 'function' || !session.owned || typeof session.owned.terminate !== 'function') {
    throw invalidArg('session must come from the bounded startup: it needs close() and owned');
  }
  const given = snapshotOf(options);
  return {
    ...durationsFrom(given),
    tree: session.owned,
    clock: given.clock || session.owned.adapters.clock,
    graceful: given.graceful || (() => session.close()),
  };
}

// A process that was still exiting when the confirming table was read is not a survivor: after a bounded settle the table is read ONCE more (read-only: no
// further kill, never by name or marker). Survivors that left the table meanwhile are reported as `exiting` (and counted as terminated); the others stay survivors.
// An unreadable re-read keeps the first report and records the failure.
async function settleExiting(settings, report) {
  if (!report.confirmed || report.survivors.length === 0) return { ...report, exiting: [] };
  await new Promise((resolve) => settings.clock.setTimeout(resolve, settings.exitSettleMs));
  let rows;
  try {
    rows = await bounded(settings.clock, settings.listMs, 'the re-read of the process table', () => settings.tree.adapters.list({ timeoutMs: settings.listMs }));
  } catch (error) {
    return { ...report, exiting: [], errors: [...report.errors, failureOf(error)] };
  }
  const listed = (item) => rows.some((row) => row.pid === item.pid && row.createdAt === item.createdAt);
  const exiting = report.survivors.filter((item) => !listed(item)).map(identityOf);
  const survivors = report.survivors.filter(listed);
  const unverifiable = report.unverifiable.map((item) => ({ ...item, stillListed: rows.some((row) => row.pid === item.pid) }));
  const blocking = report.refused.filter((item) => item.reason !== 'identity-mismatch' && rows.some((row) => row.pid === item.pid));
  const clean = survivors.length === 0 && blocking.length === 0 && !unverifiable.some((item) => item.stillListed);
  return { ...report, terminated: [...report.terminated, ...exiting], survivors, unverifiable, exiting, clean };
}

async function run(settings) {
  const attempt = Promise.resolve().then(() => settings.graceful());
  attempt.catch(() => {});
  const first = await settleWithin(settings.clock, attempt, settings.gracefulMs);
  const report = await settleExiting(settings, await settings.tree.terminate({ timeoutMs: settings.terminateMs, listMs: settings.listMs }));
  // an attempt that settled in time answers at once (a settled promise needs no wait); one that did not gets `settleMs` AFTER the tree is gone
  const sealed = await settleWithin(settings.clock, attempt, settings.settleMs);
  const graceful = !first.settled ? 'timeout' : first.ok ? 'closed' : 'failed';
  const failure = sealed.settled && !sealed.ok ? sealed.error : null;
  const scratch = !sealed.settled ? 'unconfirmed' : isScratchFailure(failure) ? 'failed' : 'removed';
  const outcome = {
    graceful,
    gracefulError: graceful === 'timeout' ? `the graceful close did not settle within ${settings.gracefulMs} ms` : failure && describe(failure),
    sealed: sealed.settled ? 'settled' : 'unsettled',
    sealedError: failure && describe(failure),
    scratch,
    scratchError: scratch === 'failed' ? describe(failure) : null,
    clean: report.clean && scratch === 'removed',
  };
  for (const key of REPORT_KEYS) outcome[key] = report[key];
  outcome.exiting = report.exiting;
  if (!outcome.clean) {
    const left = `survivors ${outcome.survivors.length}, unconfirmed ${outcome.unconfirmed.length}, unverifiable still listed ${outcome.unverifiable.filter((item) => item.stillListed).length}`;
    throw new CloseError(`close() did not leave a clean state (${left}, scratch ${scratch})`, outcome);
  }
  return frozenCopy(outcome);
}

function wrapSession(session, options = {}) {
  const settings = settingsOf(session, options);
  let closing = null;
  const close = () => {
    if (!closing) closing = run(settings);
    return closing;
  };
  return { ...session, close };
}

module.exports = { wrapSession, CloseError, durationsOf, budgetsOf, settleWithin, frozenCopy, readOption, invalidArg, REPORT_KEYS };
