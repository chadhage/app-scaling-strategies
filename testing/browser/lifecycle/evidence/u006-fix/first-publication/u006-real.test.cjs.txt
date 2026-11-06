'use strict';

// U006 real observation: a real isolated headless Edge through the sealed helper (heavy slot first, RUN\scripts\heavy-slot.ps1).
// Skipped unless U006_REAL_EDGE=1 and U006_SCRATCH=<an existing scratch directory>.
//   1. open and close normally: zero owned survivors, the sealed scratch directory is gone
//   2. a forced stuck close: the REAL context.close() is replaced by a call that settles only when the browser disconnects (a hung graceful
//      close with the real tree alive); the bounded close ends the owned tree by identity while a same-image look-alike survives, and the
//      sealed cleanup then runs for real (the scratch removal is attempted and confirmed)

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { openLessonSession } = require('../session.cjs');
const { CloseError } = require('../close.cjs');
const real = require('./u006-support-real.cjs');

const SKIP = process.env.U006_REAL_EDGE === '1' && process.env.U006_SCRATCH ? false : 'set U006_REAL_EDGE=1 and U006_SCRATCH=<scratch dir> (heavy slot, real headless Edge)';
const FIXTURE = 'testing\\browser\\fixtures\\counter.html';
const RUNTIME = path.join(__dirname, '..', '..', '..', '..', '.git', 'kanban-orchestrator', 'browser-runtime');

test('real Edge: a normal open and close leaves zero owned survivors and no scratch directory', { skip: SKIP, timeout: 480000 }, async () => {
  const edge = real.inspectEdge();
  const { requests, adapters } = real.recordingAdapters();
  const before = real.sessionDirs(RUNTIME);
  const session = await openLessonSession(FIXTURE, { deadlineMs: 120000, graceMs: 60000, terminateMs: 120000, listMs: 60000, gracefulMs: 60000, settleMs: 60000, adapters });
  const during = [...real.sessionDirs(RUNTIME)].filter((name) => !before.has(name));
  const recorded = session.owned.recorded().map((entry) => entry.pid);
  assert.ok(recorded.length >= 1);
  const table = real.readProcessTable();
  assert.ok(recorded.every((pid) => table.some((row) => row.pid === pid && real.isEdge(row))), 'the whole tree is alive before the close');
  const outcome = await session.close();
  assert.equal(outcome.clean, true, JSON.stringify(outcome));
  assert.equal(outcome.graceful, 'closed');
  assert.equal(outcome.scratch, 'removed');
  assert.equal(outcome.survivors.length, 0);
  assert.equal(outcome.alreadyGone.length + outcome.terminated.length, recorded.length);
  assert.equal(session.close(), session.close());
  assert.deepEqual(real.readProcessTable().filter((row) => recorded.includes(row.pid) && real.isEdge(row) && real.isAlive(row.pid)), []);
  const leftover = during.filter((name) => real.sessionDirs(RUNTIME).has(name));
  console.log('U006-REAL-OBSERVATION', JSON.stringify({
    case: 'normal', edge, recorded: recorded.length, graceful: outcome.graceful, terminated: outcome.terminated.length, alreadyGone: outcome.alreadyGone.length,
    scratch: outcome.scratch, killRequests: requests.length, newSessionDirs: during.length, sessionDirsLeft: leftover.length,
  }));
  if (during.length === 1) assert.equal(leftover.length, 0, 'the scratch directory of this session is gone');
});

test('real Edge: a forced stuck close is ended by owned-tree termination, the sealed cleanup still runs, a look-alike survives', { skip: SKIP, timeout: 480000 }, async () => {
  const edge = real.inspectEdge();
  const profile = path.join(process.env.U006_SCRATCH, `lookalike-${crypto.randomUUID()}`);
  const foreignBefore = real.readProcessTable().filter(real.isEdge).filter((row) => real.isAlive(row.pid)).map((row) => row.pid);
  const lookAlike = await real.startLookAlike(profile);
  let session = null;
  try {
    const { requests, adapters } = real.recordingAdapters();
    const dirsBefore = real.sessionDirs(RUNTIME);
    session = await openLessonSession(FIXTURE, { deadlineMs: 120000, graceMs: 60000, terminateMs: 120000, listMs: 60000, gracefulMs: 4000, settleMs: 60000, adapters });
    const dirs = [...real.sessionDirs(RUNTIME)].filter((name) => !dirsBefore.has(name));
    const recorded = session.owned.recorded().map((entry) => entry.pid);
    const context = session.page.context();
    const browser = context.browser();
    context.close = () => new Promise((resolve, reject) => browser.once('disconnected', () => reject(new Error('Target closed'))));
    const outcome = await session.close();
    assert.equal(outcome.graceful, 'timeout', 'the hung graceful close hit its deadline');
    assert.equal(outcome.clean, true, JSON.stringify(outcome));
    assert.equal(outcome.survivors.length, 0);
    assert.ok(outcome.terminated.length >= 1, 'the owned tree was ended by termination');
    assert.equal(outcome.sealed, 'settled');
    assert.equal(outcome.scratch, 'removed');
    const keys = new Set([...outcome.terminated, ...outcome.alreadyGone].map((item) => `${item.pid}:${item.createdAt}`));
    assert.ok(requests.length >= 1 && requests.every((item) => keys.has(`${item.pid}:${item.createdAt}`)), 'every kill request names an owned identity');
    assert.equal(requests.some((item) => item.pid === lookAlike.pid), false, 'the look-alike was never a kill target');
    const after = real.readProcessTable();
    assert.deepEqual(after.filter((row) => recorded.includes(row.pid) && real.isEdge(row) && real.isAlive(row.pid)), [], 'the owned tree is gone (independent table)');
    assert.ok(real.isAlive(lookAlike.pid) && after.some((row) => row.pid === lookAlike.pid), 'the same-image look-alike survives');
    const foreignAfter = after.filter(real.isEdge).filter((row) => real.isAlive(row.pid) && !recorded.includes(row.pid)).map((row) => row.pid);
    assert.equal(requests.some((item) => foreignBefore.includes(item.pid)), false, 'no foreign Edge process was a kill target');
    const leftover = dirs.filter((name) => real.sessionDirs(RUNTIME).has(name));
    console.log('U006-REAL-OBSERVATION', JSON.stringify({
      case: 'forced-stuck-close', edge, recorded: recorded.length, graceful: outcome.graceful, gracefulError: outcome.gracefulError, sealedError: outcome.sealedError,
      terminated: outcome.terminated.length, alreadyGone: outcome.alreadyGone.length, scratch: outcome.scratch, killRequests: requests.length,
      foreignEdgeBefore: foreignBefore.length, foreignEdgeAfter: foreignAfter.length, foreignVanished: foreignBefore.filter((pid) => !foreignAfter.includes(pid)),
      lookAlikeAlive: true, newSessionDirs: dirs.length, sessionDirsLeft: leftover.length,
    }));
    if (dirs.length === 1) assert.equal(leftover.length, 0, 'the sealed scratch removal really ran');
  } catch (error) {
    if (error instanceof CloseError) console.log('U006-CLOSE-ERROR', JSON.stringify({ scratch: error.scratch, scratchError: error.scratchError, graceful: error.graceful, survivors: error.survivors, terminated: error.terminated.length }));
    throw error;
  } finally {
    if (session) await session.close().catch(() => {});
    await real.stopLookAlike(lookAlike, profile);
  }
});
