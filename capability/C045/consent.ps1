$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(5))
    if (-not $held) { throw 'Current consent mutex timed out.' }
    $state = Get-Content -LiteralPath (Join-Path $root '.docs\wiki\flow-state.json') -Raw | ConvertFrom-Json -AsHashtable
    $gates = @()
    foreach ($id in @('C020', 'C041')) {
        $cards = @($state.cards | Where-Object { $_.id -eq $id })
        if ($cards.Count -ne 1) { throw 'Accepted prerequisite is unavailable.' }
        $card = $cards[0]
        $gates += [ordered]@{
            id = $id
            state = $card.state
            accepted = $card.review.accepted
            focusedTestsPassed = $card.review.focusedTestsPassed
            browserObserved = $card.review.browserObserved
            remoteVerified = $card.review.remoteVerified
            commit = $card.publication.commit
            tag = $card.publication.tag
        }
    }
    [ordered]@{ approval = $state.approvals.C001; gates = $gates } | ConvertTo-Json -Depth 12 -Compress
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
