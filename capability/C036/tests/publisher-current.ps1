$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No card, worker, scope, paths, approval or ledger overrides accepted.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current canonical parent state mutex timed out.' }
    $ledger = [IO.File]::ReadAllText((Join-Path $repository '.docs\wiki\flow-state.json')) | ConvertFrom-Json -AsHashtable -Depth 100
    $cards = @($ledger.cards | Where-Object { $_.id -eq 'C036' })
    $workers = @($ledger.workers | Where-Object { $_.id -eq 'worker-C036' })
    if ($cards.Count -ne 1 -or $workers.Count -ne 1) { throw 'Exact original C036 delegation unavailable.' }
    $prerequisites = foreach ($id in @('C015', 'C034')) {
        $matches = @($ledger.cards | Where-Object { $_.id -eq $id })
        if ($matches.Count -ne 1) { throw 'Exact accepted prerequisite unavailable.' }
        $card = $matches[0]
        [ordered]@{ id=$card.id; state=$card.state; publication=$card.publication
            reviewCommit=$card.review.commit; reviewTag=$card.review.tag
            accepted=$card.review.accepted; focusedTestsPassed=$card.review.focusedTestsPassed
            browserObserved=$card.review.browserObserved; remoteVerified=$card.review.remoteVerified }
    }
    [Console]::WriteLine(([ordered]@{
        schemaVersion=1; sourceSelector='localPublisherAuthorization'; controllerId=$ledger.controllerId
        authorization=$ledger.localPublisherAuthorization
        card=($cards[0] | Select-Object id,kano,kanoUnit,priority,packet,technicalEntryGate,authorization,localScope,state,owner,readiness)
        worker=($workers[0] | Select-Object id,cardId,status); ownedPaths=@('capability\C036')
        historicalRecoveryCandidate=$cards[0].futurePublisherProvenanceRecovery.publicationHeldForC016Candidate
        C001LocalConsent=$ledger.approvals.C001.designAndLocalImplementationApproved
        C015FixtureApproval=$ledger.approvals.C015.approved; prerequisites=@($prerequisites)
        observedAtUtc=[DateTime]::UtcNow.ToString('o'); readerPid=$PID; ledgerRevision=$ledger.revision
        stateReadHandlesClosed=$true; stateMutexReleasedBeforePublisher=$true
    } | ConvertTo-Json -Depth 20 -Compress))
} finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
