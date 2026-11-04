$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No source, identity, ledger or publisher overrides.' }
$path = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\.docs\wiki\flow-state.json'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'State mutex timed out; no historical authority fallback.' }
    $ledger = [IO.File]::ReadAllText($path) | ConvertFrom-Json -AsHashtable
    $own = @($ledger.cards | Where-Object { $_.id -ceq 'C038' })
    $worker = @($ledger.workers | Where-Object { $_.id -ceq 'worker-C038' })
    if ($own.Count -ne 1 -or $worker.Count -ne 1) { throw 'One exact original and registered worker required.' }
    $prerequisites = foreach ($id in @('C015','C020','C021','C024','C034','C036')) {
        $entries = @($ledger.cards | Where-Object { $_.id -ceq $id })
        if ($entries.Count -ne 1) { throw 'One exact accepted prerequisite required.' }
        $card = $entries[0]
        [ordered]@{
            id=$card.id; state=$card.state; publication=$card.publication
            reviewCommit=$card.review.commit; reviewTag=$card.review.tag
            accepted=$card.review.accepted; focusedTestsPassed=$card.review.focusedTestsPassed
            browserObserved=$card.review.browserObserved; remoteVerified=$card.review.remoteVerified
        }
    }
    [Console]::WriteLine(([ordered]@{
        schemaVersion=1; sourceSelector='localPublisherAuthorization'
        controllerId=$ledger.controllerId; ledgerRevision=$ledger.revision
        observedAtUtc=[DateTime]::UtcNow.ToString('o'); readerPid=$PID
        C001LocalConsent=$ledger.approvals.C001.designAndLocalImplementationApproved
        C015FixtureApproval=$ledger.approvals.C015.approved
        card=$own[0]; worker=($worker[0] | Select-Object id,cardId,status,agentId)
        ownedPaths=@('capability\C038'); prerequisites=@($prerequisites)
        kanoDone=$ledger.kanoDone
        acceptedOriginalCount=@($ledger.cards|Where-Object state -eq 'Done').Count
        authorization=$ledger.localPublisherAuthorization
    } | ConvertTo-Json -Depth 24 -Compress))
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
