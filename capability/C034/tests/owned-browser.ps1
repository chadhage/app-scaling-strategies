param(
    [Parameter(Mandatory=$true)][int]$CallerNodePid,
    [Parameter(Mandatory=$true)][int]$BrowserPid,
    [ValidateSet('profile','closed')][string]$Action = 'profile'
)
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $CallerNodePid -le 0 -or $BrowserPid -le 0) { throw 'Exact actual caller-owned browser identifiers required.' }
$self = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PID"
if ($self.ParentProcessId -ne $CallerNodePid) { throw 'Only this script actual caller-owned Node process may inspect its browser.' }
$browser = @(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $BrowserPid")
if ($Action -eq 'closed') {
    [Console]::WriteLine(([ordered]@{ actualBrowserPid = $BrowserPid; processGone = ($browser.Count -eq 0) } | ConvertTo-Json -Compress))
    return
}
if ($browser.Count -ne 1 -or $browser[0].ParentProcessId -ne $CallerNodePid -or $browser[0].Name -ne 'msedge.exe') {
    throw 'Only the actual Node-owned isolated Edge child is in scope.'
}
$match = [regex]::Match($browser[0].CommandLine, '--user-data-dir=(?:"([^"]+)"|(\S+))')
if (-not $match.Success) { throw 'Actual isolated browser profile cannot be identified; do not invent cleanup ownership.' }
$profile = if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value }
$profile = [IO.Path]::GetFullPath($profile)
$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\.git\kanban-orchestrator\browser-runtime'))
if (-not $profile.StartsWith("$runtime\", [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($profile) -notmatch '^playwright_chromiumdev_profile-[A-Za-z0-9_-]+$') {
    throw 'Actual Node-owned profile is outside the exact published helper runtime.'
}
[Console]::WriteLine(([ordered]@{
    actualCallerNodePid = $CallerNodePid; actualBrowserPid = $BrowserPid
    actualIsolatedProfile = $profile
    observedAtUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Compress))
