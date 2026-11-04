$ErrorActionPreference = 'Stop'
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    if ($args.Count -ne 0) { throw 'No ledger, card, worker or authorization overrides are accepted.' }
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current parent authorization read timed out.' }
    $ledger = [IO.File]::ReadAllText((Join-Path (Get-Location) '.docs\wiki\flow-state.json')) |
        ConvertFrom-Json -AsHashtable
    $cards = @($ledger.cards | Where-Object id -eq 'C016')
    $workers = @($ledger.workers | Where-Object id -eq 'worker-C016')
    $prerequisites = @($ledger.cards | Where-Object id -eq 'C015')
    if ($cards.Count -ne 1 -or $workers.Count -ne 1 -or $prerequisites.Count -ne 1) {
        throw 'The exact original C016 delegation or C015 prerequisite is unavailable.'
    }
    [ordered]@{
        schemaVersion = 1
        sourceSelector = 'localPublisherAuthorization'
        controllerId = $ledger.controllerId
        central = $ledger.localPublisherAuthorization
        delegation = [ordered]@{
            cardId = $cards[0].id; kano = $cards[0].kano; kanoUnit = $cards[0].kanoUnit
            priority = $cards[0].priority; packet = $cards[0].packet; gate = $cards[0].technicalEntryGate
            state = $cards[0].state; owner = $cards[0].owner; readiness = $cards[0].readiness
            authorization = $cards[0].authorization; localScope = $cards[0].localScope
            workerId = $workers[0].id; workerCardId = $workers[0].cardId
            workerStatus = $workers[0].status; prerequisiteState = $prerequisites[0].state
        }
    } | ConvertTo-Json -Depth 20 -Compress
} catch {
    [Console]::Error.WriteLine('Current canonical C016 parent authorization is unavailable; no source or scope fallback.')
    exit 1
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
