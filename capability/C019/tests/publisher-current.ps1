$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    if ($args.Count -ne 0) { throw 'No ledger, source selector, card, scope or approval overrides are accepted.' }
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Controller state read timeout.' }
    $ledger = [IO.File]::ReadAllText((Join-Path $repository '.docs\wiki\flow-state.json')) |
        ConvertFrom-Json -AsHashtable
    $cards = @($ledger.cards | Where-Object id -eq 'C019')
    $workers = @($ledger.workers | Where-Object id -eq 'worker-C019')
    $prerequisites = @($ledger.cards | Where-Object id -eq 'C015')
    if ($cards.Count -ne 1 -or $workers.Count -ne 1 -or $prerequisites.Count -ne 1) {
        throw 'Original C019 delegation or prerequisite unavailable.'
    }
    [ordered]@{
        schemaVersion = 2
        sourceSelector = 'localPublisherAuthorization'
        controllerId = $ledger.controllerId
        authorization = $ledger.localPublisherAuthorization
        card = ($cards[0] | Select-Object id,kano,kanoUnit,priority,packet,technicalEntryGate,authorization,localScope,state,owner,readiness)
        worker = ($workers[0] | Select-Object id,cardId,status)
        prerequisite = ($prerequisites[0] | Select-Object id,state)
        transportApproval = $ledger.publicationTransportApproval
        stateMutexReleasedBeforeReturn = $true
    } | ConvertTo-Json -Depth 24 -Compress
} catch {
    [Console]::Error.WriteLine('Current canonical C019 authority unavailable; no historical fallback or publication.')
    exit 1
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
