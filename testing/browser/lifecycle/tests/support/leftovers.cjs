'use strict';

// Read-only leftover scan for the repeat runner (test tooling): lists node.exe processes whose command line carries the
// run prefix of this item's fixtures. It never changes any process; a non-empty answer is reported as a failure.

const path = require('node:path');
const { execFileSync } = require('node:child_process');

const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const QUERY = "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" -Property ProcessId,CommandLine | Where-Object { $_.CommandLine -like '*--run=u004-run-*' } | ForEach-Object { $_.ProcessId }";

function readLeftovers() {
  const text = execFileSync(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', QUERY], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
  return text.split(/\r?\n/).filter(Boolean).map(Number);
}

module.exports = { readLeftovers };
