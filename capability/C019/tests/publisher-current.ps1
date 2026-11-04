$ErrorActionPreference = 'Stop'
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    if ($args.Count -ne 0) { throw 'No ledger or authorization overrides are accepted.' }
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Controller authorization read timed out.' }
    $ledger = [IO.File]::ReadAllText((Join-Path (Get-Location) '.docs\wiki\flow-state.json')) |
        ConvertFrom-Json -AsHashtable
    $central = $ledger.localPublisherAuthorization
    $revisionNames = @('savedTraceRevision', 'correlationGuardRevision', 'budgetAndGoalRevision')
    $matchingRevisions = @($revisionNames | Where-Object {
        $central[$_] -and $central[$_].publisherSha256 -eq $central.publisherSha256
    })
    if ($matchingRevisions.Count -ne 1) { throw 'No unique known approved current revision.' }
    $revisionName = $matchingRevisions[0]
    $cards = @($ledger.cards | Where-Object id -eq 'C019')
    $workers = @($ledger.workers | Where-Object id -eq 'worker-C019')
    $prerequisites = @($ledger.cards | Where-Object id -eq 'C015')
    if ($cards.Count -ne 1 -or $workers.Count -ne 1 -or $prerequisites.Count -ne 1) {
        throw 'The original C019 delegation or prerequisite is unavailable.'
    }
    [ordered]@{
        schemaVersion = 1
        sourceSelector = "localPublisherAuthorization.$revisionName"
        controllerId = $ledger.controllerId
        central = [ordered]@{
            id = $central.id
            approvedBy = $central.approvedBy
            publisherSha256 = $central.publisherSha256
            c019Class = $central.exactAddedClasses.C019
            mainMustEqualRemoteBeforeStaging = $central.mainMustEqualRemoteBeforeStaging
            namespaceAndFrozenClassGuardsUnchanged = $central.namespaceAndFrozenClassGuardsUnchanged
            cloudAuthorityExpanded = $central.cloudAuthorityExpanded
            originalKanoCredit = $central.originalKanoCredit
            gitWritesDuringGuardTests = $central.gitWritesDuringGuardTests
            approvedRevision = $central[$revisionName]
        }
        delegation = [ordered]@{
            cardId = $cards[0].id
            kano = $cards[0].kano
            priority = $cards[0].priority
            packet = $cards[0].packet
            gate = $cards[0].technicalEntryGate
            state = $cards[0].state
            owner = $cards[0].owner
            workerId = $workers[0].id
            workerCardId = $workers[0].cardId
            workerStatus = $workers[0].status
            prerequisiteState = $prerequisites[0].state
        }
    } | ConvertTo-Json -Depth 14 -Compress
} catch {
    [Console]::Error.WriteLine('Current controller-approved C019 publisher authorization is unavailable; no fallback.')
    exit 1
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
