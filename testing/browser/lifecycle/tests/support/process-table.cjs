'use strict';

// Read-only process table for the real-process tests (test tooling, independent of the code under test).
// It lists pid, parent pid and image name with one Get-CimInstance query and never changes any process.

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const QUERY = 'Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name | ForEach-Object { "$($_.ProcessId),$($_.ParentProcessId),$($_.Name)" }';

function readProcessTable() {
  const text = execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', QUERY], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const [pid, ppid, name] = line.split(',');
    return { pid: Number(pid), ppid: Number(ppid), name };
  });
}

// The roots plus everything linked to them by parent id (the table was read while the whole tree was alive).
function withDescendants(rows, rootPids) {
  const found = new Set(rootPids);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (found.has(row.ppid) && !found.has(row.pid)) {
        found.add(row.pid);
        grew = true;
      }
    }
  }
  return found;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

module.exports = { readProcessTable, withDescendants, isAlive };
