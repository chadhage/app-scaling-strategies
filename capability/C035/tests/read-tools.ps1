$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No browser tool gate overrides.' }
$path = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\.docs\wiki\flow-state.json'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Tool-gate State timeout.' }
    $ledger = [IO.File]::ReadAllText($path) | ConvertFrom-Json -AsHashtable
    $cards = foreach ($id in @('C033', 'C036')) {
        $found = @($ledger.cards | Where-Object id -eq $id)
        if ($found.Count -ne 1 -or $found[0].state -ne 'Done' -or
            $found[0].review.commit -cne $found[0].publication.commit -or
            $found[0].review.tag -cne $found[0].publication.tag) { throw 'Independent accepted tool provenance required.' }
        foreach ($field in @('accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified')) {
            if ($found[0].review[$field] -isnot [bool] -or $found[0].review[$field] -ne $true) { throw 'Literal accepted tool gate required.' }
        }
        [ordered]@{id=$id;state='Done';publication=$found[0].publication}
    }
    [Console]::WriteLine(([ordered]@{cards=@($cards);ledgerRevision=$ledger.revision;readerPid=$PID;readHandlesClosedBeforeRelease=$true}|ConvertTo-Json -Depth 8 -Compress))
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
