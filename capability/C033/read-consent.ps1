$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'C033 consent reader accepts no source, target or override arguments.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$ledgerPath = Join-Path $root '.docs\wiki\flow-state.json'
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    try { $held = $mutex.WaitOne([TimeSpan]::FromSeconds(5)) }
    catch [Threading.AbandonedMutexException] {
        $held = $true
        throw 'C033 consent mutex was abandoned; no listener may start.'
    }
    if (-not $held) { throw 'C033 consent mutex timed out; no silent fallback.' }
    # ReadAllText closes its file handle before the mutex is released.
    $ledger = [IO.File]::ReadAllText($ledgerPath) | ConvertFrom-Json
    $dependencies = @($ledger.cards | Where-Object { $_.id -eq 'C020' })
    if ($dependencies.Count -ne 1) { throw 'C033 requires exactly one independently accepted C020 dependency.' }
    $dependency = $dependencies[0]
    $record = [ordered]@{
        approval = $ledger.approvals.C001
        dependency = [ordered]@{
            id = $dependency.id
            state = $dependency.state
            kano = $dependency.kano
            acceptedAtUtc = $dependency.acceptedAtUtc
            publication = $dependency.publication
            accepted = $dependency.review.accepted
            focusedTestsPassed = $dependency.review.focusedTestsPassed
            browserObserved = $dependency.review.browserObserved
            remoteVerified = $dependency.review.remoteVerified
        }
        observedAtUtc = [DateTime]::UtcNow.ToString('o')
        mutex = 'Local\AppScalingStrategies_KanbanState_v1'
        readHandlesClosedBeforeRelease = $true
        ledgerRevision = $ledger.revision
    }
    $json = $record | ConvertTo-Json -Depth 24 -Compress
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
[Console]::WriteLine($json)
