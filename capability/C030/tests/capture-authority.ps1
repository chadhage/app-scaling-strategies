$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'Exact deliberate historical fixture capture only.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$own = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (Test-Path -LiteralPath (Join-Path $own 'publisher-history.json')) { throw 'Historical fixture pointer already exists; no replacement.' }
$state = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$held = $false
try {
    $held = $state.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $held) { throw 'State timeout.' }
    $bytes = [IO.File]::ReadAllBytes((Join-Path $root '.docs\wiki\flow-state.json'))
    $ledger = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json -AsHashtable
    $a = $ledger.localPublisherAuthorization
    $approval = [ordered]@{}
    foreach ($key in @('id','approvedBy','publisherSha256','focusedGuardChecksPassed','mainMustEqualRemoteBeforeStaging',
        'namespaceAndFrozenClassGuardsUnchanged','syntaxPassed','originalKanoCredit','cloudAuthorityExpanded',
        'classificationAndInspectionRevision')) { $approval[$key] = $a[$key] }
    $observation = [ordered]@{
        observedAtUtc = [DateTime]::UtcNow.ToString('o'); ledgerRevision = $ledger.revision
        ledgerRawWorkingSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        readUnderStateMutex = $true; handlesClosedBeforePublisher = $true; approval = $approval
        meaning = 'Historical immutable fixture only. Normal tests do not read a live private publisher or require historical nested revisions.'
    }
} finally {
    if ($held) { $state.ReleaseMutex() }
    $state.Dispose()
}
$publisher = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$held = $false
try {
    $held = $publisher.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $held) { throw 'Publisher timeout.' }
    $private = Join-Path $root '.git\kanban-orchestrator\publish.ps1'
    $bytes = [IO.File]::ReadAllBytes($private)
    $hash = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
    if ($hash -cne $approval.publisherSha256 -or $hash -cne '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811') {
        throw 'Unknown actual private bytes cannot become a historical authorized fixture.'
    }
    $directory = Join-Path $own "evidence\raw\historical-publisher-$([Guid]::NewGuid())"
    [IO.Directory]::CreateDirectory($directory) | Out-Null
    $stream = [IO.File]::Open((Join-Path $directory 'publisher.ps1.snapshot'), [IO.FileMode]::CreateNew)
    try { $stream.Write($bytes) } finally { $stream.Dispose() }
    foreach ($pair in @(@((Join-Path $directory 'approval.historical.json'), $observation),
        @((Join-Path $own 'publisher-history.json'), [ordered]@{ directory = [IO.Path]::GetRelativePath($own, $directory); publisherSha256 = $hash; historicalOnly = $true }))) {
        $stream = [IO.File]::Open($pair[0], [IO.FileMode]::CreateNew)
        try {
            $encoded = [Text.Encoding]::UTF8.GetBytes(($pair[1] | ConvertTo-Json -Depth 15) + "`n")
            $stream.Write($encoded)
        } finally { $stream.Dispose() }
    }
    [Console]::WriteLine("C030 immutable historical publisher fixture: $hash")
} finally {
    if ($held) { $publisher.ReleaseMutex() }
    $publisher.Dispose()
}
