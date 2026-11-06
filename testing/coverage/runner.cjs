'use strict';

const { spawn, spawnSync } = require('node:child_process');

// Ends the process tree rooted at one child this gate started, by its pid (never by image name, so no other process is touched).
// On Windows taskkill /T walks the tree below that pid; elsewhere the child leads its own process group and the group is signalled.
function killTree(pid, { platform = process.platform, run = spawnSync, signal = process.kill } = {}) {
  if (platform === 'win32') {
    run('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    return;
  }
  try {
    signal(-pid, 'SIGKILL');
  } catch {
    signal(pid, 'SIGKILL');
  }
}

// Runs one child with a hard timeout. Resolves (never rejects) with the exit status, the captured output and how it ended.
// Output beyond maxBuffer is dropped and flagged, so a runaway child cannot exhaust the memory of the gate.
function runProcess({
  command, args, cwd, env, timeoutMs, maxBuffer = 64 * 1024 * 1024, graceMs = 5000,
  start = spawn, kill = killTree, platform = process.platform
}) {
  return new Promise((resolve) => {
    const out = { stdout: [], stderr: [], size: 0, truncated: false };
    let timedOut = false;
    let settled = false;
    let timer = null;
    let grace = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(grace);
      resolve({
        status: null, signal: null, spawnError: null, timedOut,
        stdout: Buffer.concat(out.stdout).toString('utf8'), stderr: Buffer.concat(out.stderr).toString('utf8'), truncated: out.truncated,
        ...result
      });
    };
    let child;
    try {
      child = start(command, args, { cwd, env, windowsHide: true, detached: platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish({ spawnError: error.message });
      return;
    }
    const collect = (bucket) => (chunk) => {
      if (out.size + chunk.length > maxBuffer) {
        out.truncated = true;
        return;
      }
      out.size += chunk.length;
      bucket.push(chunk);
    };
    child.stdout.on('data', collect(out.stdout));
    child.stderr.on('data', collect(out.stderr));
    child.on('error', (error) => finish({ spawnError: error.message }));
    child.on('close', (status, signal) => finish({ status, signal }));
    timer = setTimeout(() => {
      timedOut = true;
      kill(child.pid);
      grace = setTimeout(() => finish({}), graceMs);
    }, timeoutMs);
  });
}

module.exports = Object.freeze({ killTree, runProcess });
