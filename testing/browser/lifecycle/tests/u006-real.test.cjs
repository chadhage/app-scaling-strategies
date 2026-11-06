'use strict';

// U006 real observation: a real isolated headless Edge through the sealed helper (heavy slot first, RUN\scripts\heavy-slot.ps1).
// Skipped unless U006_REAL_EDGE=1 and U006_SCRATCH=<an existing scratch directory>.
//   1. open and close normally: zero owned survivors, the sealed scratch directory is gone
//   2. a forced stuck close: the REAL context.close() is replaced by a call that settles only when the browser disconnects (a hung graceful
//      close with the real tree alive); the bounded close ends the owned tree by identity while a same-image look-alike survives, and the
//      sealed cleanup then runs for real (the scratch removal is attempted and confirmed)
//   3. two live sessions (rev-U005 F1): closing the first leaves the second browser running and answering
// Every real session is opened and ended through guardedSessions (try/finally): a failed assertion never leaks a browser or a scratch directory.
// Short-lived Chromium utility processes exit on their own, so only the ROOTS and lower bounds are asserted alive, never every recorded process.
// The sealed close can answer EBUSY while it removes its scratch directory under heavy load: closeRecording records that (closeBusy) and removes the leftover directory
// named by the error once the tree is gone, and every other close error still fails the test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { openLessonSession } = require('../session.cjs');
const real = require('./u006-support-real.cjs');

const SKIP = process.env.U006_REAL_EDGE === '1' && process.env.U006_SCRATCH ? false : 'set U006_REAL_EDGE=1 and U006_SCRATCH=<scratch dir> (heavy slot, real headless Edge)';
const FIXTURE = 'testing\\browser\\fixtures\\counter.html';
const RUNTIME = path.join(__dirname, '..', '..', '..', '..', '.git', 'kanban-orchestrator', 'browser-runtime');
const TITLE = 'Independent browser counter fixture';
const profileDirs = () => new Set(fs.readdirSync(RUNTIME).filter((name) => name.startsWith('playwright_chromiumdev_profile-')));
// The sealed helper gives the browser launch 15 s (see openRetrying in the support file); exitSettleMs is generous because a terminated Chromium root can stay in the process
// table for tens of seconds on a saturated machine (the settle is only waited when a survivor is still listed). The graceful bound of the NORMAL close is generous too (the
// sealed close of a healthy browser took longer than the 60 s default on a machine at 100 percent CPU: real-2, kept as history): the bound exists for hangs, which test 2 forces.
let openRetries = 0;
const openOnce = (extra) => openLessonSession(FIXTURE, { deadlineMs: 120000, graceMs: 60000, terminateMs: 120000, listMs: 60000, gracefulMs: 60000, settleMs: 60000, exitSettleMs: 45000, ...extra });
const open = (extra) => () => real.openRetrying(() => openOnce(extra), () => { openRetries += 1; });
const rootsAlive = (session, table) => session.owned.roots.every((root) => table.some((row) => row.pid === root.pid && real.isEdge(row)) && real.isAlive(root.pid));

test('real Edge: a normal open and close leaves zero owned survivors and no scratch directory', { skip: SKIP, timeout: 900000 }, async () => {
  openRetries = 0;
  const edge = real.inspectEdge();
  const { requests, adapters } = real.recordingAdapters();
  const before = real.sessionDirs(RUNTIME);
  const profilesBefore = profileDirs();
  await real.guardedSessions([open({ adapters, gracefulMs: 300000 })], async (session) => {
    const during = [...real.sessionDirs(RUNTIME)].filter((name) => !before.has(name));
    const recorded = session.owned.recorded().map((entry) => entry.pid);
    assert.ok(recorded.length >= 1);
    const table = real.readProcessTable();
    assert.ok(rootsAlive(session, table), 'every recorded root is alive before the close');
    const aliveBefore = recorded.filter((pid) => table.some((row) => row.pid === pid && real.isEdge(row)));
    assert.ok(aliveBefore.length >= 1 && aliveBefore.length <= recorded.length, 'a lower bound only: short-lived utility processes exit on their own');
    const { outcome, busy } = await real.closeRecording(session);
    assert.equal(outcome.clean, busy === null, JSON.stringify(outcome));
    assert.equal(outcome.graceful, 'closed');
    assert.equal(outcome.scratch, busy ? 'failed' : 'removed');
    assert.equal(outcome.survivors.length, 0);
    assert.ok(outcome.alreadyGone.length + outcome.terminated.length >= recorded.length, 'the report lists every recorded identity');
    assert.equal(session.close(), session.close());
    assert.deepEqual(real.readProcessTable().filter((row) => recorded.includes(row.pid) && real.isEdge(row) && real.isAlive(row.pid)), []);
    const leftover = during.filter((name) => real.sessionDirs(RUNTIME).has(name));
    const profilesLeft = [...profileDirs()].filter((name) => !profilesBefore.has(name));
    console.log('U006-REAL-OBSERVATION', JSON.stringify({
      case: 'normal', edge, recorded: recorded.length, rootsAliveBeforeClose: true, graceful: outcome.graceful, terminated: outcome.terminated.length, alreadyGone: outcome.alreadyGone.length,
      exiting: outcome.exiting.length, scratch: outcome.scratch, closeBusy: busy ? busy.code : null, openRetries, killRequests: requests.length, newSessionDirs: during.length, sessionDirsLeft: leftover.length, profileDirsLeft: profilesLeft.length,
    }));
    if (during.length === 1) assert.equal(leftover.length, 0, 'the scratch directory of this session is gone');
  });
});

test('real Edge: a forced stuck close is ended by owned-tree termination, the sealed cleanup still runs, a look-alike survives', { skip: SKIP, timeout: 900000 }, async () => {
  openRetries = 0;
  const edge = real.inspectEdge();
  const profile = path.join(process.env.U006_SCRATCH, `lookalike-${crypto.randomUUID()}`);
  const foreignBefore = real.readProcessTable().filter(real.isEdge).filter((row) => real.isAlive(row.pid)).map((row) => row.pid);
  const lookAlike = await real.startLookAlike(profile);
  try {
    const { requests, adapters } = real.recordingAdapters();
    const dirsBefore = real.sessionDirs(RUNTIME);
    const profilesBefore = profileDirs();
    await real.guardedSessions([open({ adapters, gracefulMs: 4000 })], async (session) => {
      const dirs = [...real.sessionDirs(RUNTIME)].filter((name) => !dirsBefore.has(name));
      const recorded = session.owned.recorded().map((entry) => entry.pid);
      const context = session.page.context();
      const browser = context.browser();
      context.close = () => new Promise((resolve, reject) => browser.once('disconnected', () => reject(new Error('Target closed'))));
      let closed;
      try {
        closed = await real.closeRecording(session);
      } catch (error) {
        if (error && error.code === 'ERR_CLOSE_FAILED') console.log('U006-CLOSE-ERROR', JSON.stringify({ scratch: error.scratch, scratchError: error.scratchError, graceful: error.graceful, survivors: error.survivors, terminated: error.terminated.length }));
        throw error;
      }
      const { outcome, busy } = closed;
      assert.equal(outcome.graceful, 'timeout', 'the hung graceful close hit its deadline');
      assert.equal(outcome.clean, busy === null, JSON.stringify(outcome));
      assert.equal(outcome.survivors.length, 0);
      assert.ok(outcome.terminated.length >= 1, 'the owned tree was ended by termination');
      assert.equal(outcome.sealed, 'settled');
      assert.equal(outcome.scratch, busy ? 'failed' : 'removed');
      const keys = new Set([...outcome.terminated, ...outcome.alreadyGone].map((item) => `${item.pid}:${item.createdAt}`));
      assert.ok(requests.length >= 1 && requests.every((item) => keys.has(`${item.pid}:${item.createdAt}`)), 'every kill request names an owned identity');
      assert.equal(requests.some((item) => item.pid === lookAlike.pid), false, 'the look-alike was never a kill target');
      const after = real.readProcessTable();
      assert.deepEqual(after.filter((row) => recorded.includes(row.pid) && real.isEdge(row) && real.isAlive(row.pid)), [], 'the owned tree is gone (independent table)');
      assert.ok(real.isAlive(lookAlike.pid) && after.some((row) => row.pid === lookAlike.pid), 'the same-image look-alike survives');
      const foreignAfter = after.filter(real.isEdge).filter((row) => real.isAlive(row.pid) && !recorded.includes(row.pid)).map((row) => row.pid);
      assert.equal(requests.some((item) => foreignBefore.includes(item.pid)), false, 'no foreign Edge process was a kill target');
      const leftover = dirs.filter((name) => real.sessionDirs(RUNTIME).has(name));
      const profilesLeft = [...profileDirs()].filter((name) => !profilesBefore.has(name));
      console.log('U006-REAL-OBSERVATION', JSON.stringify({
        case: 'forced-stuck-close', edge, recorded: recorded.length, graceful: outcome.graceful, gracefulError: outcome.gracefulError, sealedError: outcome.sealedError,
        terminated: outcome.terminated.length, alreadyGone: outcome.alreadyGone.length, exiting: outcome.exiting.length, scratch: outcome.scratch, closeBusy: busy ? busy.code : null, openRetries, killRequests: requests.length,
        foreignEdgeBefore: foreignBefore.length, foreignEdgeAfter: foreignAfter.length, foreignVanished: foreignBefore.filter((pid) => !foreignAfter.includes(pid)),
        lookAlikeAlive: true, newSessionDirs: dirs.length, sessionDirsLeft: leftover.length, profileDirsLeft: profilesLeft.length,
      }));
      if (dirs.length === 1) assert.equal(leftover.length, 0, 'the sealed scratch removal really ran');
    });
  } finally {
    await real.stopLookAlike(lookAlike, profile);
  }
});

// F1 of rev-U005 through the U006 API (the reviewer's E5 reproduction: closing the first session used to end the second browser, 0 of 8 processes alive).
test('real Edge: two live sessions, the first is closed, the second browser keeps running and answering, then it closes cleanly', { skip: SKIP, timeout: 900000 }, async () => {
  openRetries = 0;
  const edge = real.inspectEdge();
  const first = real.recordingAdapters();
  const second = real.recordingAdapters();
  await real.guardedSessions([open({ adapters: first.adapters }), open({ adapters: second.adapters })], async (a, b) => {
    const treeA = a.owned.recorded().map((entry) => entry.pid);
    const treeB = b.owned.recorded().map((entry) => entry.pid);
    assert.notEqual(a.owned.roots[0].pid, b.owned.roots[0].pid, 'distinct browser roots');
    assert.equal(treeA.some((pid) => treeB.includes(pid)), false, 'disjoint trees');
    assert.equal(await b.page.title(), TITLE);
    const { outcome: outA, busy: busyA } = await real.closeRecording(a);
    assert.equal(outA.clean, busyA === null, JSON.stringify(outA));
    const table = real.readProcessTable();
    assert.deepEqual(table.filter((row) => treeA.includes(row.pid) && real.isEdge(row) && real.isAlive(row.pid)), [], 'the first tree is gone');
    assert.ok(rootsAlive(b, table), 'the root of the second browser is alive');
    assert.equal(await b.page.title(), TITLE, 'the page of the second session still answers');
    assert.ok(first.requests.every((item) => treeA.includes(item.pid)), 'every kill request of the first close names its own tree');
    assert.equal(second.requests.length, 0, 'the second session sent no kill request');
    assert.equal(a.close(), a.close());
    const { outcome: outB, busy: busyB } = await real.closeRecording(b);
    assert.equal(outB.clean, busyB === null, JSON.stringify(outB));
    assert.deepEqual(real.readProcessTable().filter((row) => (treeA.includes(row.pid) || treeB.includes(row.pid)) && real.isEdge(row) && real.isAlive(row.pid)), [], 'both trees are gone at the end');
    console.log('U006-REAL-OBSERVATION', JSON.stringify({
      case: 'two-live-sessions-fifo', edge, recordedA: treeA.length, recordedB: treeB.length, bRootAliveAfterFirstClose: true, bTitleAfterFirstClose: true, firstClean: outA.clean, secondClean: outB.clean,
      closeBusyFirst: busyA ? busyA.code : null, closeBusySecond: busyB ? busyB.code : null, openRetries,
      killRequestsFirst: first.requests.length, killRequestsSecond: second.requests.length, exitingFirst: outA.exiting.length, exitingSecond: outB.exiting.length,
    }));
  });
});
