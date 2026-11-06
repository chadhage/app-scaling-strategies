'use strict';

// Independent observer for the real-browser test (test tooling, never production code). It runs as its own process, started
// before the open; its table reads run as ITS descendants, so nothing it does becomes a direct child of the test process while the
// startup under test compares "direct children before and after". One Windows PowerShell child compiles a small Toolhelp reader
// and polls every 20 ms for a process called msedge.exe that is a direct child of the test process (excluded pids skipped).
// It never changes any process. Protocol on stdout, one JSON line each: {"event":"ready"} then {"event":"found","pids":[...]}
// or {"event":"timeout"}. It exits when its stdin closes.
//   node u005-real-watch.cjs <parentPid> <excludedPidsCsv>

const path = require('node:path');
const { spawn } = require('node:child_process');

const parent = Number(process.argv[2]);
const excluded = String(process.argv[3] || '').split(',').filter(Boolean).map(Number);
if (![parent, ...excluded].every((pid) => Number.isSafeInteger(pid) && pid > 0)) throw new Error('pids must be positive integers');

const SOURCE = String.raw`
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class U005Watch
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct PROCESSENTRY32
    {
        public uint dwSize; public uint cntUsage; public uint th32ProcessID; public IntPtr th32DefaultHeapID;
        public uint th32ModuleID; public uint cntThreads; public uint th32ParentProcessID; public int pcPriClassBase;
        public uint dwFlags;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szExeFile;
    }

    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint pid);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32FirstW(IntPtr snapshot, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern bool Process32NextW(IntPtr snapshot, ref PROCESSENTRY32 entry);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool CloseHandle(IntPtr handle);

    public static string Wait(uint parent, uint[] excluded, int loops)
    {
        HashSet<uint> skip = new HashSet<uint>(excluded);
        for (int i = 0; i < loops; i++)
        {
            IntPtr snapshot = CreateToolhelp32Snapshot(2, 0);
            if (snapshot != new IntPtr(-1))
            {
                try
                {
                    PROCESSENTRY32 entry = new PROCESSENTRY32();
                    entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
                    List<uint> found = new List<uint>();
                    for (bool more = Process32FirstW(snapshot, ref entry); more; more = Process32NextW(snapshot, ref entry))
                    {
                        if (entry.th32ParentProcessID == parent && !skip.Contains(entry.th32ProcessID)
                            && string.Equals(entry.szExeFile, "msedge.exe", StringComparison.OrdinalIgnoreCase)) found.Add(entry.th32ProcessID);
                    }
                    if (found.Count > 0) return string.Join(",", found);
                }
                finally { CloseHandle(snapshot); }
            }
            Thread.Sleep(20);
        }
        return "";
    }
}
`;

const SCRIPT = `$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'${SOURCE}'@
[Console]::Out.WriteLine('READY')
[Console]::Out.Flush()
[Console]::Out.WriteLine('FOUND ' + [U005Watch]::Wait(${parent}, [uint32[]]@(${excluded.join(',')}), 12000))
`;
const POWERSHELL = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'psmodulepath'));
const child = spawn(POWERSHELL, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')], { stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true, env });
const say = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

let buffer = '';
child.stdout.on('data', (chunk) => {
  buffer += chunk;
  for (let at = buffer.indexOf('\n'); at >= 0; at = buffer.indexOf('\n')) {
    const line = buffer.slice(0, at).trim();
    buffer = buffer.slice(at + 1);
    if (line === 'READY') say({ event: 'ready' });
    else if (line === 'FOUND') say({ event: 'timeout' });
    else if (line.startsWith('FOUND ')) say({ event: 'found', pids: line.slice(6).split(',').map(Number) });
  }
});
child.on('exit', () => setTimeout(() => process.exit(0), 200));
process.stdin.resume();
process.stdin.on('end', () => { child.kill(); process.exit(0); });
process.stdin.on('error', () => { child.kill(); process.exit(0); });
