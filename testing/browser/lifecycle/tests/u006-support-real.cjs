'use strict';

// U006 real-browser tooling (test tooling, never production code): the Edge signature check, a same-image look-alike started by the test
// before the open, an independent read-only process table (U004 support) and an adapter wrapper that records every kill request.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { readProcessTable, isAlive } = require('./support/process-table.cjs');
const { createOwnedAdapters, systemClock } = require('../owned.cjs');
const { readQualified } = require('../../qualify/adapters.cjs');
const { openLookAlike } = require('./u006-owned-lookalike.cjs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const isEdge = (row) => /^msedge\.exe$/i.test(row.name);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Windows PowerShell 5.1 started from PowerShell 7 inherits its PSModulePath and then cannot load the Security module.
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));

async function waitFor(predicate, timeoutMs, stepMs = 500) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await wait(stepMs);
  }
  return predicate();
}

// Microsoft-signed and within a qualified major: never an equality pin on a version or a binary hash (both are only recorded). The qualified majors come from
// readQualified() of testing\browser\qualify (the sealed list plus its append-only addendum), never from the sealed file itself.
function inspectEdge() {
  assert.ok(fs.existsSync(EDGE), 'Edge is installed');
  const script = `$p = '${EDGE}'; $s = Get-AuthenticodeSignature -LiteralPath $p; ConvertTo-Json -Compress @{ status = [string]$s.Status; subject = [string]$s.SignerCertificate.Subject; version = (Get-Item -LiteralPath $p).VersionInfo.ProductVersion; sha256 = (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash }`;
  const info = JSON.parse(execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 120000, env: cleanEnv() }));
  const majors = readQualified().qualifiedMajors;
  assert.equal(info.status, 'Valid');
  assert.match(info.subject, /O=Microsoft Corporation/);
  assert.ok(majors.includes(Number(info.version.split('.')[0])), `major of ${info.version} is qualified`);
  return { ...info, qualifiedMajors: majors };
}

function recordingAdapters(clock = systemClock) {
  const base = createOwnedAdapters({ clock });
  const requests = [];
  return { requests, adapters: { ...base, kill: async (identities, call) => { requests.push(...identities.map(({ pid, createdAt }) => ({ pid, createdAt }))); return base.kill(identities, call); } } };
}

// The sealed opener owns its own unique session/profile; a caller label is never process or deletion authority.
async function startLookAlike(_profile) {
  return openLookAlike('testing\\browser\\fixtures\\counter.html', { opener: (relativePath) => require('../../isolated.cjs').openIsolatedLesson(relativePath) });
}

async function stopLookAlike(child, _profile) {
  return child.close();
}

const sessionDirs = (runtime) => new Set(fs.readdirSync(runtime).filter((name) => name.startsWith('session-')));

// The sealed close removes its scratch directory with three short retries: under heavy load a file that an exiting Edge still holds (a BITS temp file) answers EBUSY.
// close() reports it honestly (scratch failed, the EBUSY text, the tree gone). That is a hygiene error of the sealed helper, not the property under test (the retry on
// a transient lock is U007): it is recorded and tolerated ONLY when the report shows nothing else wrong; every other close error still fails the test.
const BUSY = /\b(EBUSY|EPERM|ENOTEMPTY)\b/;
const SCRATCH_DIR = /([A-Za-z]:\\[^'"\r\n]*?\\browser-runtime\\session-[0-9a-f-]{36})(?=[\\'"\s]|$)/i;
const NOTHING_ELSE = ['survivors', 'failed', 'refused', 'unconfirmed', 'errors'];

function busyOnly(error) {
  return Boolean(error) && error.code === 'ERR_CLOSE_FAILED' && error.scratch === 'failed' && error.sealed === 'settled' && BUSY.test(String(error.scratchError)) && error.confirmed === true
    && NOTHING_ELSE.every((key) => Array.isArray(error[key]) && error[key].length === 0) && Array.isArray(error.unverifiable) && error.unverifiable.every((item) => !item.stillListed);
}

// The session directory that the failed removal names: positive (taken from the error itself, never from a directory listing: the runtime folder is shared with every agent's real runs).
const scratchDirOf = (error) => (SCRATCH_DIR.exec(String(error && error.scratchError)) || [])[1] || null;

async function removeScratchOf(error) {
  const dir = scratchDirOf(error);
  if (dir) await fs.promises.rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 }).catch(() => {});
  return dir;
}

// Closes a session and records how: { outcome, busy: null } for a clean close, { outcome: the CloseError, busy: { code, dir } } for the tolerated scratch-removal EBUSY (the leftover
// session directory it names is removed once the tree is gone); anything else is thrown.
async function closeRecording(session) {
  try {
    return { outcome: await session.close(), busy: null };
  } catch (error) {
    if (!busyOnly(error)) throw error;
    return { outcome: error, busy: { code: BUSY.exec(error.scratchError)[1], dir: await removeScratchOf(error) } };
  }
}

// The sealed helper gives the browser launch 15 s: on a machine at 100 percent CPU that can expire (a typed TimeoutError of browserType.launch, thrown after the helper ended its own
// launch). The open is retried ONCE and the retry is counted by the caller (openRetries in the observation); any other error, and a second timeout, fail the test.
const isLaunchTimeout = (error) => Boolean(error) && error.name === 'TimeoutError' && /^browserType\.launch: Timeout \d+ms exceeded/.test(String(error.message));

async function openRetrying(openOnce, onRetry) {
  try {
    return await openOnce();
  } catch (error) {
    if (!isLaunchTimeout(error)) throw error;
    onRetry();
    return openOnce();
  }
}

// Opens the sessions one after the other, runs the body with them and ALWAYS closes and ends every session that was opened (the real tests' try/finally):
// a failed assertion in the body must never leave a real browser tree or a scratch directory behind.
async function guardedSessions(openers, body, { terminateMs = 120000, listMs = 60000 } = {}) {
  const sessions = [];
  try {
    for (const open of openers) sessions.push(await open());
    return await body(...sessions);
  } finally {
    for (const session of sessions) {
      await session.close().catch((error) => removeScratchOf(error));
      await session.owned.terminate({ timeoutMs: terminateMs, listMs }).catch(() => {});
    }
  }
}

module.exports = { EDGE, isEdge, waitFor, inspectEdge, recordingAdapters, startLookAlike, stopLookAlike, sessionDirs, guardedSessions, closeRecording, busyOnly, scratchDirOf, isLaunchTimeout, openRetrying, readProcessTable, isAlive };
