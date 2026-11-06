'use strict';

// U006: a close() that cannot hang. wrapSession(session, options) wraps the session that the bounded startup (U005, startup.cjs) returns:
//   1. the graceful close (default: the sealed session close, injectable as options.graceful) gets `gracefulMs` to settle
//   2. whatever happened, the owned process tree is then ended by identity (session.owned.terminate: fresh table, identity-verified kill,
//      confirming fresh table), never by image name or marker, and never retried
//   3. after the tree is gone the sealed cleanup (browser close and the scratch directory removal) gets `settleMs` to settle, so the
//      removal is still attempted when the graceful path failed, and its failure is reported
// close() returns ONE promise for every call: the first outcome (or the first rejection) is the outcome of every caller. It resolves with
// the outcome only when the end state is clean, otherwise it rejects with a CloseError that lists survivors, failures and the scratch result.
// The U005 files are consumed read-only (owned.cjs: checkMs, describe, LifecycleError and the defaults).

const { checkMs, describe, LifecycleError, DEFAULT_LIST_MS, DEFAULT_TERMINATE_MS } = require('./owned.cjs');

const DEFAULT_GRACEFUL_MS = 15000;
const DEFAULT_SETTLE_MS = 15000;
const FILESYSTEM_SYSCALLS = new Set(['rm', 'rmdir', 'unlink', 'lstat', 'stat', 'opendir', 'scandir', 'rename', 'open']);
const FILESYSTEM_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY']);
const REPORT_KEYS = ['confirmed', 'terminated', 'alreadyGone', 'refused', 'survivors', 'failed', 'unverifiable', 'unconfirmed', 'errors'];

// code ERR_CLOSE_FAILED. Fields: graceful (closed | failed | timeout), gracefulError, sealed (settled | unsettled), sealedError,
// scratch (removed | failed | unconfirmed), scratchError, clean, and the termination report (terminated, alreadyGone, refused,
// survivors, failed, unverifiable, unconfirmed, errors, confirmed).
class CloseError extends Error {
  constructor(message, outcome) {
    super(message);
    this.name = 'CloseError';
    this.code = 'ERR_CLOSE_FAILED';
    Object.assign(this, outcome);
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

function durationsOf(options) {
  const pick = (name, fallback) => checkMs(options[name] === undefined ? fallback : options[name], name);
  if (options.graceful !== undefined && typeof options.graceful !== 'function') throw new LifecycleError('ERR_INVALID_ARG', 'graceful must be a function');
  return {
    gracefulMs: pick('gracefulMs', DEFAULT_GRACEFUL_MS),
    terminateMs: pick('terminateMs', DEFAULT_TERMINATE_MS),
    listMs: pick('listMs', DEFAULT_LIST_MS),
    settleMs: pick('settleMs', DEFAULT_SETTLE_MS),
  };
}

function settingsOf(session, options) {
  if (!session || typeof session.close !== 'function' || !session.owned || typeof session.owned.terminate !== 'function') {
    throw new LifecycleError('ERR_INVALID_ARG', 'session must come from the bounded startup: it needs close() and owned');
  }
  return {
    ...durationsOf(options),
    tree: session.owned,
    clock: options.clock || session.owned.adapters.clock,
    graceful: options.graceful || (() => session.close()),
  };
}

async function run(settings) {
  const attempt = Promise.resolve().then(() => settings.graceful());
  attempt.catch(() => {});
  const first = await settleWithin(settings.clock, attempt, settings.gracefulMs);
  const report = await settings.tree.terminate({ timeoutMs: settings.terminateMs, listMs: settings.listMs });
  const sealed = first.settled ? first : await settleWithin(settings.clock, attempt, settings.settleMs);
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
  if (!outcome.clean) {
    const left = `survivors ${outcome.survivors.length}, unconfirmed ${outcome.unconfirmed.length}, unverifiable still listed ${outcome.unverifiable.filter((item) => item.stillListed).length}`;
    throw new CloseError(`close() did not leave a clean state (${left}, scratch ${scratch})`, outcome);
  }
  return outcome;
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

module.exports = { wrapSession, CloseError, durationsOf, settleWithin, REPORT_KEYS };
