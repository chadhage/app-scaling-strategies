'use strict';

// U006 real-browser tooling (test tooling, never production code): the Edge signature check, a same-image look-alike started by the test
// before the open, an independent read-only process table (U004 support) and an adapter wrapper that records every kill request.

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { readProcessTable, isAlive } = require('./support/process-table.cjs');
const { createOwnedAdapters, systemClock } = require('../owned.cjs');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const QUALIFIED = path.join(__dirname, '..', '..', 'qualify', 'qualified.json');
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

function recordingAdapters(clock = systemClock) {
  const base = createOwnedAdapters({ clock });
  const requests = [];
  return { requests, adapters: { ...base, kill: async (identities, call) => { requests.push(...identities.map(({ pid, createdAt }) => ({ pid, createdAt }))); return base.kill(identities, call); } } };
}

// A foreign process of the same image: a second headless Edge started by the test BEFORE the open (never a new child of the caller).
async function startLookAlike(profile) {
  const child = spawn(EDGE, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-extensions', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  const up = await waitFor(() => child.exitCode === null && readProcessTable().some((row) => row.ppid === child.pid && isEdge(row)), 60000);
  assert.ok(up, 'the look-alike Edge started and has children');
  return child;
}

async function stopLookAlike(child, profile) {
  child.kill();
  await waitFor(() => child.exitCode !== null || child.signalCode !== null, 15000, 200);
  await waitFor(() => !readProcessTable().some((row) => row.ppid === child.pid && isAlive(row.pid)), 45000, 1000);
  await fs.promises.rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }).catch(() => {});
}

const sessionDirs = (runtime) => new Set(fs.readdirSync(runtime).filter((name) => name.startsWith('session-')));

module.exports = { EDGE, isEdge, waitFor, inspectEdge, recordingAdapters, startLookAlike, stopLookAlike, sessionDirs, readProcessTable, isAlive };
