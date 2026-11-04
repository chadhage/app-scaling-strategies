param(
    [Parameter(Mandatory=$true)][int]$CallerNodePid,
    [Parameter(Mandatory=$true)][int]$BrowserPid,
    [ValidateSet('profile','closed')][string]$Action = 'profile'
)
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $CallerNodePid -le 0 -or $BrowserPid -le 0) { throw 'Exact actual caller-owned process identifiers required.' }
$self = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PID"
if ($self.ParentProcessId -ne $CallerNodePid) { throw 'Only the actual caller-owned Node may inspect this browser.' }
$process = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $BrowserPid")
if ($Action -eq 'closed') {
    [Console]::WriteLine(([ordered]@{actualBrowserPid=$BrowserPid;processGone=($process.Count -eq 0)}|ConvertTo-Json -Compress))
    return
}
if ($process.Count -ne 1 -or $process[0].ParentProcessId -ne $CallerNodePid -or $process[0].Name -ne 'msedge.exe') { throw 'Exactly this Node-owned Edge child is required.' }
$match=[regex]::Match($process[0].CommandLine,'--user-data-dir=(?:"([^"]+)"|(\S+))')
if (-not $match.Success) { throw 'Actual owned isolated profile is unobserved; no guessed cleanup ownership.' }
$profile=if($match.Groups[1].Success){$match.Groups[1].Value}else{$match.Groups[2].Value}
$profile=[IO.Path]::GetFullPath($profile)
$runtime=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\.git\kanban-orchestrator\browser-runtime'))
if (-not $profile.StartsWith("$runtime\",[StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($profile) -notmatch '^playwright_chromiumdev_profile-[A-Za-z0-9_-]+$') { throw 'Profile is not the actual owned published helper profile.' }
[Console]::WriteLine(([ordered]@{
    actualCallerNodePid=$CallerNodePid;actualBrowserPid=$BrowserPid;actualIsolatedProfile=$profile
    observedAtUtc=[DateTime]::UtcNow.ToString('o')
}|ConvertTo-Json -Compress))
