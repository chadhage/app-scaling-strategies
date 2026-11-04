$ErrorActionPreference = 'Stop'
$ledgerPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.docs\wiki\flow-state.json'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    if ($args.Count -ne 0) { throw 'No ledger path or approval overrides are accepted.' }
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current-consent state mutex timed out; no fallback.' }
    $ledger = [IO.File]::ReadAllText($ledgerPath) | ConvertFrom-Json -AsHashtable
    [ordered]@{ C001 = $ledger.approvals.C001; C015 = $ledger.approvals.C015 } |
        ConvertTo-Json -Depth 16 -Compress
} catch {
    [Console]::Error.WriteLine('Current C001/C015 consent is unreadable; no fixture write is authorized.')
    exit 1
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
