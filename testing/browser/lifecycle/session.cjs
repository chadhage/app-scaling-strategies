'use strict';

// U006: the bounded startup (U005) and the bounded close composed. startSession(run, options) starts the sealed open through startBounded
// and returns { ready, close }: `ready` resolves with the session whose close() is the bounded, shared close of close.cjs; `close()` called
// BEFORE the startup produced a session aborts the startup (its owned tree is ended exactly as on expiry and its lock is released) and waits
// for that cleanup; after the session exists it is the session's own close. The U005 files are consumed read-only.

const { startBounded, openLessonBounded, openLoopbackBounded, StartupError } = require('./startup.cjs');
const { wrapSession, CloseError, durationsOf, frozenCopy, readOption, invalidArg, REPORT_KEYS } = require('./close.cjs');

const NOTHING = { confirmed: true, terminated: [], alreadyGone: [], refused: [], survivors: [], failed: [], unverifiable: [], unconfirmed: [], errors: [] };

// How a startup that never produced a session ended: its cleanup report, or "nothing to close" for a failure that left nothing.
function startupOutcome(error, final) {
  if (!(error instanceof StartupError)) return { startup: 'failed', clean: true, ...NOTHING };
  const source = final || error;
  const outcome = { startup: error.code, clean: source.clean };
  for (const key of ['innerSettled', 'graceExpired', 'lateSession', 'lateCloseError']) if (key in source) outcome[key] = source[key];
  for (const key of REPORT_KEYS) outcome[key] = source[key];
  return outcome;
}

async function closeStartup(controller, ready) {
  controller.abort();
  const settled = await ready.then((session) => ({ session }), (error) => ({ error }));
  if (settled.session) return settled.session.close();
  const final = settled.error instanceof StartupError ? await settled.error.settled : null;
  const outcome = startupOutcome(settled.error, final);
  if (!outcome.clean) throw new CloseError(`close() during the startup did not leave a clean state (${outcome.startup})`, outcome);
  return frozenCopy(outcome);
}

// The caller's own signal (if any) is combined with the one that close() fires; anything else than an AbortSignal is a typed refusal.
function signalOf(options, controller) {
  const given = readOption(options, 'signal');
  if (given === undefined) return controller.signal;
  if (!(given instanceof AbortSignal)) throw invalidArg('signal must be an AbortSignal');
  return AbortSignal.any([given, controller.signal]);
}

function startSession(run, options = {}) {
  durationsOf(options);
  const controller = new AbortController();
  const signal = signalOf(options, controller);
  const ready = startBounded(run, { ...options, signal }).then((session) => wrapSession(session, options));
  ready.catch(() => {});
  let closing = null;
  const close = () => {
    if (!closing) closing = closeStartup(controller, ready);
    return closing;
  };
  return { ready, close };
}

async function openLessonSession(relativeRepoPath, options = {}) {
  durationsOf(options);
  return wrapSession(await openLessonBounded(relativeRepoPath, options), options);
}

async function openLoopbackSession(relativeOwnedIndexPath, server, options = {}) {
  durationsOf(options);
  return wrapSession(await openLoopbackBounded(relativeOwnedIndexPath, server, options), options);
}

module.exports = { startSession, openLessonSession, openLoopbackSession };
