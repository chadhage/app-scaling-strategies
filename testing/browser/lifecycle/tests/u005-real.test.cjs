'use strict';

// U005 real observation: a real isolated headless Edge through the sealed helper (heavy slot first, RUN\scripts\heavy-slot.ps1).
// Skipped unless U005_REAL_EDGE=1 and U005_SCRATCH=<an existing scratch directory>. The test owns the deadline: it fires it once
// the first owned child exists (an independent watcher process reports it), so no tiny wall-clock number is involved.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { readProcessTable, isAlive } = require('./support/process-table.cjs');
const { createOwnedAdapters, systemClock } = require('../owned.cjs');
const { openLessonBounded, StartupError } = require('../startup.cjs');

const SKIP = process.env.U005_REAL_EDGE === '1' && process.env.U005_SCRATCH ? false : 'set U005_REAL_EDGE=1 and U005_SCRATCH=<scratch dir> (heavy slot, real headless Edge)';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const WATCHER = path.join(__dirname, 'u005-real-watch.cjs');
const QUALIFIED = path.join(__dirname, '..', '..', 'qualify', 'qualified.json');
const FIXTURE = 'testing\\browser\\fixtures\\counter.html';
const DEADLINE_MS = 3000000;
const isEdge = (row) => /^msedge\.exe$/i.test(row.name);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, timeoutMs, stepMs = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await wait(stepMs);
  }
  return predicate();
}

// Windows PowerShell 5.1 started from a PowerShell 7 session inherits its PSModulePath and then cannot load the Security module.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));

// Microsoft-signed and within a qualified major: never an equality pin on a version or a binary hash (both are only recorded).
function inspectEdge() {
  assert.ok(fs.existsSync(EDGE), 'Edge is installed');
  const script = `$p = '${EDGE}'; $s = Get-AuthenticodeSignature -LiteralPath $p; ConvertTo-Json -Compress @{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject; version = (Get-Item -LiteralPath $p).VersionInfo.ProductVersion; sha256 = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }`;
  const info = JSON.parse(execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 120000, env: cleanEnv() }));
  const majors = JSON.parse(fs.readFileSync(QUALIFIED, 'utf8')).qualifiedMajors;
  assert.equal(info.status, 'Valid');
  assert.match(info.subject, /O=Microsoft Corporation/);
  assert.ok(majors.includes(Number(info.version.split('.')[0])), `major of ${info.version} is qualified`);
  return { ...info, qualifiedMajors: majors };
}

function recordingAdapters(clock) {
  const base = createOwnedAdapters({ clock });
  const requests = [];
  return { requests, adapters: { ...base, kill: async (identities, call) => { requests.push(...identities.map(({ pid, createdAt }) => ({ pid, createdAt }))); return base.kill(identities, call); } } };
}

// A foreign process of the same image: a second headless Edge started by the test itself BEFORE the open (not a new child).
async function startLookAlike(profile) {
  const child = spawn(EDGE, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const up = await waitFor(() => child.exitCode === null && readProcessTable().some((row) => row.ppid === child.pid && isEdge(row)), 60000);
  assert.ok(up, 'the look-alike Edge started and has children');
  return child;
}

function watchFirstChild(excluded) {
  const watcher = spawn(process.execPath, [WATCHER, String(process.pid), excluded.join(',')], { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
  const waiting = new Map();
  const later = (name) => new Promise((resolve) => waiting.set(name, resolve));
  const ready = later('ready');
  const found = later('found');
  let buffer = '';
  watcher.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
      const message = JSON.parse(buffer.slice(0, at));
      buffer = buffer.slice(at + 1);
      const resolve = waiting.get(message.event === 'timeout' ? 'found' : message.event);
      if (resolve) resolve(message);
    }
  });
  watcher.on('exit', () => { for (const resolve of waiting.values()) resolve({ event: 'watcher-exit' }); });
  return { watcher, ready, found };
}

test('real Edge: a forced expiry ends the launched tree, a same-image look-alike and the owner browser survive', { skip: SKIP, timeout: 1000000 }, async () => {
  const edge = inspectEdge();
  const profile = path.join(process.env.U005_SCRATCH, `lookalike-${crypto.randomUUID()}`);
  const before = readProcessTable();
  const lookAlike = await startLookAlike(profile);
  let watcher = null;
  let fireDeadline = null;
  let outcome = null;
  let releaseGate = () => {};
  try {
    const watched = watchFirstChild([lookAlike.pid]);
    watcher = watched.watcher;
    assert.equal((await watched.ready).event, 'ready', 'the independent watcher is running');
    const clock = {
      ...systemClock,
      setTimeout: (fn, ms) => (ms === DEADLINE_MS && !fireDeadline ? { fn: (fireDeadline = fn) } : systemClock.setTimeout(fn, ms)),
      clearTimeout: (handle) => (handle && handle.fn ? undefined : systemClock.clearTimeout(handle)),
    };
    // The real sealed open, held back after it finished: the open can never complete before the test has fired the deadline.
    const gate = new Promise((resolve) => { releaseGate = resolve; });
    let opened = null;
    const sealedOpened = new Promise((resolve) => { opened = resolve; });
    const opener = async (relativePath) => {
      const session = await require('../../isolated.cjs').openIsolatedLesson(relativePath);
      opened({ event: 'open-complete' });
      await gate;
      return session;
    };
    const { requests, adapters } = recordingAdapters(clock);
    const opening = openLessonBounded(FIXTURE, { opener, deadlineMs: DEADLINE_MS, graceMs: 240000, terminateMs: 300000, listMs: 120000, adapters, clock });
    outcome = opening.then((session) => ({ ok: true, session }), (error) => ({ ok: false, error }));
    const event = await Promise.race([watched.found, sealedOpened]);
    assert.ok(event.event === 'found' || event.event === 'open-complete', `the deadline trigger arrived (${event.event})`);
    assert.equal(typeof fireDeadline, 'function', 'the startup owns a deadline timer that the test can fire');
    fireDeadline();
    const result = await outcome;
    assert.equal(result.ok, false, 'the forced deadline rejected the startup');
    const error = result.error;
    assert.ok(error instanceof StartupError);
    assert.equal(error.code, 'ERR_STARTUP_DEADLINE');
    releaseGate();
    const final = await error.settled;

    const identities = [error, final].flatMap((item) => [...item.terminated, ...item.alreadyGone, ...item.survivors, ...item.refused]);
    const owned = new Set(identities.map((item) => item.pid));
    const ownedKeys = new Set(identities.map((item) => `${item.pid}:${item.createdAt}`));
    const after = readProcessTable();
    const living = (row) => isAlive(row.pid);
    assert.ok(owned.size >= 1, 'the launched tree was recorded');
    assert.ok(event.event !== 'found' || event.pids.every((pid) => owned.has(pid)), 'the root the watcher saw is owned');
    assert.deepEqual(after.filter((row) => owned.has(row.pid) && isEdge(row) && living(row)), [], 'every owned Edge process is gone (independent table)');
    assert.deepEqual(after.filter((row) => owned.has(row.ppid) && living(row)), [], 'nothing below the owned tree is left');
    assert.ok(requests.length >= 1 && requests.every((item) => ownedKeys.has(`${item.pid}:${item.createdAt}`)), 'every kill request names a recorded identity');
    assert.equal(requests.some((item) => item.pid === lookAlike.pid), false, 'the look-alike was never a kill target');
    assert.ok(isAlive(lookAlike.pid) && after.some((row) => row.pid === lookAlike.pid), 'the same-image look-alike survives');
    const foreignBefore = before.filter((row) => isEdge(row) && living(row)).map((row) => row.pid);
    const foreignAfter = after.filter((row) => isEdge(row) && !owned.has(row.pid) && living(row)).map((row) => row.pid);
    assert.equal(requests.some((item) => foreignBefore.includes(item.pid)), false, 'no foreign Edge process was a kill target');
    console.log('U005-REAL-OBSERVATION', JSON.stringify({
      edge, trigger: event.event, errorClean: error.clean, errorPhase: error.phase, finalClean: final.clean, innerSettled: final.innerSettled, lateSession: final.lateSession, lateCloseError: final.lateCloseError,
      terminated: error.terminated.length + final.terminated.length, alreadyGone: final.alreadyGone.length, survivors: final.survivors.length, survivorDetail: final.survivors, finalErrors: final.errors.map((item) => item.code),
      killRequests: requests.length, foreignEdgeBefore: foreignBefore.length, foreignEdgeAfter: foreignAfter.length,
      foreignVanished: foreignBefore.filter((pid) => !foreignAfter.includes(pid)), lookAlikeAlive: true,
    }));
    assert.deepEqual(final.survivors, [], 'the final report lists no survivor');
    assert.equal(final.clean, true, JSON.stringify({ survivors: final.survivors, refused: final.refused, errors: final.errors }));
  } finally {
    releaseGate();
    if (fireDeadline) fireDeadline();
    if (outcome) {
      const result = await outcome;
      if (result.session) { await result.session.close().catch(() => {}); await result.session.owned.terminate({ timeoutMs: 120000, listMs: 60000 }).catch(() => {}); }
      if (result.error && result.error.settled) await result.error.settled;
    }
    if (watcher) { watcher.stdin.end(); watcher.kill(); }
    lookAlike.kill();
    await waitFor(() => lookAlike.exitCode !== null || lookAlike.signalCode !== null, 15000, 200);
    await waitFor(() => !readProcessTable().some((row) => row.ppid === lookAlike.pid && isAlive(row.pid)), 45000, 1000);
    await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {});
  }
});

test('real Edge: an open inside the deadline returns the owned tree and the sealed close leaves nothing', { skip: SKIP, timeout: 1000000 }, async () => {
  const edge = inspectEdge();
  const { requests, adapters } = recordingAdapters(systemClock);
  const session = await openLessonBounded(FIXTURE, { deadlineMs: 240000, graceMs: 60000, terminateMs: 300000, listMs: 120000, adapters });
  let closed = false;
  try {
    assert.ok(session.owned.roots.length >= 1, 'a new direct child of the caller was recorded');
    assert.equal(await session.page.title(), 'Independent browser counter fixture');
    assert.ok(edge.qualifiedMajors.includes(Number(session.browserVersion.split('.')[0])), 'the running browser is within a qualified major');
    const recorded = session.owned.recorded().map((entry) => entry.pid);
    const table = readProcessTable();
    const alive = recorded.filter((pid) => table.some((row) => row.pid === pid && isEdge(row)));
    assert.ok(session.owned.roots.every((root) => alive.includes(root.pid)), 'every recorded root is a live Edge process (independent table)');
    assert.ok(alive.length >= 1 && alive.length <= recorded.length, 'recorded children may exit on their own (short-lived utility processes), the roots may not');
    await session.close();
    closed = true;
    const report = await session.owned.terminate({ timeoutMs: 300000, listMs: 120000 });
    assert.equal(report.clean, true, JSON.stringify(report));
    assert.deepEqual(readProcessTable().filter((row) => recorded.includes(row.pid) && isEdge(row) && isAlive(row.pid)), []);
    console.log('U005-REAL-OBSERVATION', JSON.stringify({ edge, recorded: recorded.length, aliveBeforeClose: alive.length, roots: session.owned.roots.length, terminatedAfterClose: report.terminated.length, alreadyGone: report.alreadyGone.length, killRequests: requests.length, unverifiable: report.unverifiable.length }));
  } finally {
    if (!closed) await session.close().catch(() => {});
  }
});
