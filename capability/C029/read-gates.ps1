$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No identity, consent or gate overrides are supported.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'State mutex timed out; no fallback.' }
    $ledger = [IO.File]::ReadAllText((Join-Path $root '.docs\wiki\flow-state.json')) | ConvertFrom-Json -AsHashtable
    $consent = $ledger.approvals.C001.designAndLocalImplementationApproved
    if ($consent -isnot [bool] -or $consent -ne $true) { throw 'Current literal true local design consent is required.' }
    $cards = foreach ($id in @('C020','C023','C033','C034')) {
        $matches = @($ledger.cards | Where-Object id -eq $id)
        if ($matches.Count -ne 1) { throw 'Exactly one independent gate is required.' }
        $card = $matches[0]
        [ordered]@{
            id = $id; state = $card.state; publication = $card.publication
            reviewCommit = $card.review.commit; reviewTag = $card.review.tag
            accepted = $card.review.accepted; focusedTestsPassed = $card.review.focusedTestsPassed
            browserObserved = $card.review.browserObserved; remoteVerified = $card.review.remoteVerified
        }
    }
    $result = [ordered]@{
        readerPid = $PID; observedAtUtc = [DateTime]::UtcNow.ToString('o')
        ledgerRevision = $ledger.revision; literalLocalConsent = $true
        mutex = 'Local\AppScalingStrategies_KanbanState_v1'
        readHandlesClosedBeforeRelease = $true; cards = @($cards)
    }
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
[Console]::WriteLine(($result | ConvertTo-Json -Depth 8 -Compress))
