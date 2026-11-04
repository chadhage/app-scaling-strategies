$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No state path, card or approval overrides are accepted.' }
$path = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.docs\wiki\flow-state.json'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(8))
    if (-not $held) { throw 'Current gate state mutex timed out; no fallback.' }
    $ledger = [IO.File]::ReadAllText($path) | ConvertFrom-Json -AsHashtable
    $cards = foreach ($id in @('C020', 'C015', 'C033')) {
        $matches = @($ledger.cards | Where-Object { $_.id -eq $id })
        if ($matches.Count -ne 1) { throw 'One exact accepted entry gate is required.' }
        $card = $matches[0]
        [ordered]@{
            id = $card.id; state = $card.state; publication = $card.publication
            reviewCommit = $card.review.commit; reviewTag = $card.review.tag
            accepted = $card.review.accepted; focusedTestsPassed = $card.review.focusedTestsPassed
            browserObserved = $card.review.browserObserved; remoteVerified = $card.review.remoteVerified
        }
    }
    [Console]::WriteLine(([ordered]@{
        observedAtUtc = [DateTime]::UtcNow.ToString('o'); readerPid = $PID
        ledgerRevision = $ledger.revision; cards = @($cards)
    } | ConvertTo-Json -Depth 8 -Compress))
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
