$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No identity, consent, gate or authority overrides.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'State mutex timed out; no cached fallback.' }
    $ledger = [IO.File]::ReadAllText((Join-Path $root '.docs\wiki\flow-state.json')) | ConvertFrom-Json -AsHashtable
    $consent = $ledger.approvals.C001.designAndLocalImplementationApproved
    if ($consent -isnot [bool] -or $consent -ne $true) { throw 'Literal current local design consent is required.' }
    $card = @($ledger.cards | Where-Object id -eq 'C030')
    if ($card.Count -ne 1 -or $card[0].kano -cne 'D' -or $card[0].kanoUnit -cne 'C030' -or
        $card[0].priority -cne 'P0' -or $card[0].packet -cne 'H006' -or
        ($card[0].parents -join ',') -cne 'H006,H012' -or $card[0].technicalEntryGate -cne 'C023, C029' -or
        $card[0].deliver -cne 'Detect missing/duplicate business effects; verify one intended effect remains distinct from delivery retries.') {
        throw 'Exact original C030 frozen identity is required.'
    }
    $row = '| C030 | H006, H012 | D | Detect missing/duplicate business effects; verify one intended effect remains distinct from delivery retries. | C023, C029 |'
    if (@([IO.File]::ReadAllLines((Join-Path $root '.docs\wiki\kanban.md')) | Where-Object { $_ -ceq $row }).Count -ne 1) {
        throw 'Exact original C030 kanban row is required.'
    }
    $cards = foreach ($id in @('C023', 'C029')) {
        $matches = @($ledger.cards | Where-Object id -eq $id)
        if ($matches.Count -ne 1) { throw 'One independently accepted gate is required.' }
        $gate = $matches[0]
        [ordered]@{
            id = $id; state = $gate.state; publication = $gate.publication
            reviewCommit = $gate.review.commit; reviewTag = $gate.review.tag
            accepted = $gate.review.accepted; focusedTestsPassed = $gate.review.focusedTestsPassed
            browserObserved = $gate.review.browserObserved; remoteVerified = $gate.review.remoteVerified
        }
    }
    $result = [ordered]@{
        readerPid = $PID; observedAtUtc = [DateTime]::UtcNow.ToString('o')
        ledgerRevision = $ledger.revision; literalLocalConsent = $true; exactOriginalRow = $true
        mutex = 'Local\AppScalingStrategies_KanbanState_v1'; readHandlesClosedBeforeRelease = $true; cards = @($cards)
    }
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
[Console]::WriteLine(($result | ConvertTo-Json -Depth 8 -Compress))
