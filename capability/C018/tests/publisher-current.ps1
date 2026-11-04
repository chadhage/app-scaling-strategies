$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    if ($args.Count -ne 0) { throw 'No ledger, card, worker, scope or authorization overrides are accepted.' }
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'Current parent authority mutex timeout.' }
    $ledger = [IO.File]::ReadAllText((Join-Path $root '.docs\wiki\flow-state.json')) |
        ConvertFrom-Json -AsHashtable
    $cards = @($ledger.cards | Where-Object id -eq 'C018')
    $workers = @($ledger.workers | Where-Object id -eq 'worker-C018')
    $prerequisites = @($ledger.cards | Where-Object id -eq 'C015')
    if ($cards.Count -ne 1 -or $workers.Count -ne 1 -or $prerequisites.Count -ne 1) {
        throw 'Original C018 delegation or accepted prerequisite unavailable.'
    }
    [ordered]@{
        schemaVersion = 1
        sourceSelector = 'localPublisherAuthorization'
        controllerId = $ledger.controllerId
        authorization = $ledger.localPublisherAuthorization
        card = ($cards[0] | Select-Object id,kano,kanoUnit,priority,packet,technicalEntryGate,authorization,localScope,state,owner,readiness)
        worker = ($workers[0] | Select-Object id,cardId,status)
        prerequisite = ($prerequisites[0] | Select-Object id,state)
    } | ConvertTo-Json -Depth 20 -Compress
} catch {
    [Console]::Error.WriteLine('Current canonical parent C018 authority unavailable; no fallback or publication.')
    exit 1
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
