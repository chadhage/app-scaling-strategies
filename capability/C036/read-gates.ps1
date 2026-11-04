$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No ledger, approval, identity or publisher overrides are accepted.' }
$path = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.docs\wiki\flow-state.json'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current state mutex timed out; no historical fallback.' }
    $ledger = [IO.File]::ReadAllText($path) | ConvertFrom-Json -AsHashtable
    if ($ledger.controllerId -ne '942b9aec-aa3f-4179-b6ed-e2bc57abeed2') { throw 'Current parent controller mismatch.' }
    $cards = foreach ($id in @('C015', 'C034')) {
        $matches = @($ledger.cards | Where-Object { $_.id -eq $id })
        if ($matches.Count -ne 1) { throw 'One exact independently accepted entry gate is required.' }
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
        controllerId = $ledger.controllerId; ledgerRevision = $ledger.revision
        C001LocalConsent = $ledger.approvals.C001.designAndLocalImplementationApproved
        C015FixtureApproval = $ledger.approvals.C015.approved
        cards = @($cards); currentParentPublisherAuthorization = $ledger.localPublisherAuthorization
    } | ConvertTo-Json -Depth 16 -Compress))
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
