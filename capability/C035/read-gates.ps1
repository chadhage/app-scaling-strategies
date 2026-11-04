$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No state, context, identity, approval or path overrides are accepted.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current State read timed out; no historical authority fallback.' }
    $bytes = [IO.File]::ReadAllBytes((Join-Path $root '.docs\wiki\flow-state.json'))
    $ledger = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -AsHashtable
    if ($ledger.controllerId -cne '942b9aec-aa3f-4179-b6ed-e2bc57abeed2') { throw 'Current controller mismatch.' }
    $cards = foreach ($id in @('C015', 'C029', 'C001', 'C002')) {
        $found = @($ledger.cards | Where-Object id -eq $id)
        if ($found.Count -ne 1) { throw "One exact accepted $id entry is required." }
        $card = $found[0]
        [ordered]@{
            id=$card.id; state=$card.state; publication=$card.publication
            reviewCommit=$card.review.commit; reviewTag=$card.review.tag
            accepted=$card.review.accepted; focusedTestsPassed=$card.review.focusedTestsPassed
            browserObserved=$card.review.browserObserved; remoteVerified=$card.review.remoteVerified
        }
    }
    $own = @($ledger.cards | Where-Object id -eq 'C035')
    $worker = @($ledger.workers | Where-Object id -eq 'worker-C035')
    if ($own.Count -ne 1 -or $worker.Count -ne 1) { throw 'One registered original C035 and worker required.' }
    $card = $own[0]
    $a = $ledger.localPublisherAuthorization
    $authorization = [ordered]@{
        id=$a.id; approvedBy=$a.approvedBy; publisherSha256=$a.publisherSha256
        exactAddedClasses=$a.exactAddedClasses; focusedGuardChecksPassed=$a.focusedGuardChecksPassed
        mainMustEqualRemoteBeforeStaging=$a.mainMustEqualRemoteBeforeStaging
        namespaceAndFrozenClassGuardsUnchanged=$a.namespaceAndFrozenClassGuardsUnchanged
        syntaxPassed=$a.syntaxPassed; cloudAuthorityExpanded=$a.cloudAuthorityExpanded
        originalKanoCredit=$a.originalKanoCredit; gitWritesDuringGuardTests=$a.gitWritesDuringGuardTests
        classificationAndInspectionRevision=$a.classificationAndInspectionRevision
    }
    [Console]::WriteLine(([ordered]@{
        schemaVersion=1; sourceSelector='localPublisherAuthorization'
        controllerId=$ledger.controllerId; ledgerRevision=$ledger.revision
        observedAtUtc=[DateTime]::UtcNow.ToString('o'); readerPid=$PID
        stateMutex='Local\AppScalingStrategies_KanbanState_v1'; readHandlesClosedBeforeRelease=$true
        C001LocalConsent=$ledger.approvals.C001.designAndLocalImplementationApproved
        C015FixtureApproval=$ledger.approvals.C015.approved; cards=@($cards)
        card=[ordered]@{
            id=$card.id; state=$card.state; readiness=$card.readiness; owner=$card.owner
            kano=$card.kano; kanoUnit=$card.kanoUnit; priority=$card.priority; packet=$card.packet
            parents=$card.parents; technicalEntryGate=$card.technicalEntryGate
            authorization=$card.authorization; localScope=$card.localScope; deliver=$card.deliver
        }
        worker=[ordered]@{id=$worker[0].id;cardId=$worker[0].cardId;status=$worker[0].status}
        authorization=$authorization
        ownedPaths=@('capability\C035')
        exactOriginalKanbanRowPresent=(@([IO.File]::ReadAllLines((Join-Path $root '.docs\wiki\kanban.md')) |
            Where-Object { $_ -ceq '| C035 | H001, H007, H012 | D | Classify unsupported, unknown, cancelled, and interrupted results honestly; incomplete evidence cannot become success. | C015, C029 |' }).Count -eq 1)
    } | ConvertTo-Json -Depth 20 -Compress))
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
