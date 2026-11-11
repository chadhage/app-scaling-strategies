'use strict';
const fs = require('node:fs'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { remaining } = require('./budget.cjs');
function record(pids, role) {
  remaining();
  if (!Array.isArray(pids) || pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0 || [31036, 35440].includes(pid))) throw new Error('Exact own positive PIDs only; shared neighbours prohibited');
  const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = "$ErrorActionPreference='Stop';@(" + pids.join(',') + ")|ForEach-Object {$p=Get-Process -Id $_ -ErrorAction Stop;$b=$p.StartTime.ToUniversalTime();[pscustomobject]@{pid=$p.Id;createdAtUtc7=$b.ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ');createdAtFileTimeUtc=$b.ToFileTimeUtc().ToString()}}|ConvertTo-Json -Compress";
  const result = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    env: Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath')),
    timeout: Math.min(remaining(), 60000), windowsHide: true
  });
  if (result.status !== 0 || result.error) throw new Error('Native child birth unavailable; no adoption or kill authority: ' + String(result.stderr));
  const parsed = JSON.parse(result.stdout.toString('utf8')), rows = Array.isArray(parsed) ? parsed : [parsed];
  if (rows.length !== pids.length) throw new Error('Exact own birth cardinality differs');
  for (const row of rows) {
    if (!pids.includes(row.pid) || typeof row.createdAtFileTimeUtc !== 'string' || !/^\d+$/.test(row.createdAtFileTimeUtc) || !/\.\d{7}Z$/.test(row.createdAtUtc7)) throw new Error('100ns identity was not preserved as a string');
    fs.appendFileSync(path.join(process.env.C012_METADATA, 'processes.jsonl'), JSON.stringify({ ...row, role, observedAtUtc: new Date().toISOString(), authority: 'explicit started PID observed before own work' }) + '\n');
  }
  return rows;
}
function utc7(fileTime) {
  const ticks = BigInt(fileTime) - 116444736000000000n;
  const seconds = ticks / 10000000n, fraction = ticks % 10000000n;
  return new Date(Number(seconds * 1000n)).toISOString().slice(0, 19) + '.' + fraction.toString().padStart(7, '0') + 'Z';
}
function append(identity, role) {
  if (!identity || !Number.isSafeInteger(identity.pid) || [31036, 35440].includes(identity.pid) || typeof identity.createdAt !== 'string' || !/^\d+$/.test(identity.createdAt)) throw new Error('Exact native owned identity required');
  const row = { pid: identity.pid, createdAtFileTimeUtc: identity.createdAt, createdAtUtc7: utc7(identity.createdAt), role,
    observedAtUtc: new Date().toISOString(), authority: 'authenticated current owned lifecycle native identity; never a process-name sweep' };
  fs.appendFileSync(path.join(process.env.C012_METADATA, 'processes.jsonl'), JSON.stringify(row) + '\n');
  return row;
}
module.exports = { record, append, utc7 };
