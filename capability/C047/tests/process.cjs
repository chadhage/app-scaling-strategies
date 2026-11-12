'use strict';
const cp = require('node:child_process'), path = require('node:path'), assert = require('node:assert/strict');
function birth(pid) {
  assert.equal(Number.isSafeInteger(pid) && pid > 0, true, 'EXPLICIT_OWN_PID');
  const code = `$ErrorActionPreference='Stop';$p=Get-Process -Id ${pid};$b=$p.StartTime.ToUniversalTime();[ordered]@{pid=$p.Id;birthUtc7=$b.ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ');birthFileTime=$b.ToFileTimeUtc().ToString()}|ConvertTo-Json -Compress`;
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')],
    { windowsHide: true, timeout: 20000, encoding: 'utf8', env: { ...process.env, NODE_V8_COVERAGE: '' } });
  assert.equal(result.error, undefined, 'BIRTH_PROBE_MUST_SETTLE');
  assert.equal(result.status, 0, 'BIRTH_PROBE_MUST_CONFIRM_EXPLICIT_PID:' + result.stderr);
  const identity = JSON.parse(result.stdout);
  assert.equal(identity.pid, pid, 'BIRTH_PID_EQUALS_CREATED_PROCESS');
  assert.match(identity.birthUtc7, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$/, 'UTC7_BIRTH_NOT_ROUNDED');
  assert.match(identity.birthFileTime, /^\d{17,19}$/, 'FILETIME_AUTHORITY_IS_STRING');
  return identity;
}
module.exports = { birth };
