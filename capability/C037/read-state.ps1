$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No state, card, context, authority or path overrides are accepted.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current State mutex timeout; no historical authority fallback.' }
    $ledger = [IO.File]::ReadAllText((Join-Path $repository '.docs\wiki\flow-state.json')) | ConvertFrom-Json -AsHashtable -Depth 100
    $cards = @($ledger.cards | Where-Object id -eq 'C037')
    $workers = @($ledger.workers | Where-Object id -eq 'worker-C037')
    if ($cards.Count -ne 1 -or $workers.Count -ne 1) { throw 'Exactly the registered original C037 is required.' }
    $prerequisites = foreach ($id in @('C036','C034','C033','C020','C015')) {
        $matches = @($ledger.cards | Where-Object id -eq $id)
        if ($matches.Count -ne 1) { throw 'Exact independent accepted prerequisite unavailable.' }
        $card = $matches[0]
        [ordered]@{ id=$card.id; state=$card.state; publication=$card.publication
            reviewCommit=$card.review.commit; reviewTag=$card.review.tag
            accepted=$card.review.accepted; focusedTestsPassed=$card.review.focusedTestsPassed
            browserObserved=$card.review.browserObserved; remoteVerified=$card.review.remoteVerified }
    }
    [Console]::WriteLine(([ordered]@{
        schemaVersion=1; sourceSelector='localPublisherAuthorization'; controllerId=$ledger.controllerId
        authorization=$ledger.localPublisherAuthorization
        card=($cards[0] | Select-Object id,kano,kanoUnit,priority,packet,technicalEntryGate,parents,authorization,localScope,state,owner,readiness)
        worker=($workers[0] | Select-Object id,cardId,status); ownedPaths=@('capability\C037')
        C001LocalConsent=$ledger.approvals.C001.designAndLocalImplementationApproved
        C015FixtureApproval=$ledger.approvals.C015.approved; prerequisites=@($prerequisites)
        observedAtUtc=[DateTime]::UtcNow.ToString('o'); readerPid=$PID; ledgerRevision=$ledger.revision
        stateReadHandlesClosed=$true; stateMutexReleasedBeforePublisher=$true
    } | ConvertTo-Json -Depth 25 -Compress))
} finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
