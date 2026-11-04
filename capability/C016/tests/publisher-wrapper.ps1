param([ValidateSet('Inspect', 'Publish')][string]$Action = 'Inspect')
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No card, class, worker, path, message, publisher or Admin overrides are accepted.' }
function Read-Current {
    $json = & node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C016\\tests\\authorization.cjs').assessCurrent()));"
    if ($LASTEXITCODE -ne 0) { throw 'Current canonical parent authorization or private source did not validate; no staging.' }
    return ($json | ConvertFrom-Json -AsHashtable)
}
function Read-Git([string[]]$Arguments) {
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Bounded read-only Git inspection failed; no staging.' }
    return $output
}
$initial = Read-Current
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $held) { throw 'Publisher mutex unavailable; no lock removal or fallback.' }
    $current = Read-Current
    $head = (Read-Git @('rev-parse', 'HEAD') | Out-String).Trim()
    $branch = (Read-Git @('branch', '--show-current') | Out-String).Trim()
    $refs = @(Read-Git @('ls-remote', 'origin', 'refs/heads/main'))
    if ($refs.Count -ne 1) { throw 'Exactly one actual remote main is required.' }
    $remoteMain = ("$($refs[0])" -split '\s+')[0]
    $actualSha = (Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
    $ready = $current.approved -eq $true -and $current.delegationReady -eq $true -and
        $actualSha -eq $current.authorizedSha256 -and $branch -eq 'main' -and $head -eq $remoteMain
    if ($Action -eq 'Inspect') {
        [ordered]@{ schemaVersion = 1; cardId = 'C016'; workerId = 'worker-C016'
            authority = $current; observedSha256 = $actualSha; branch = $branch; head = $head
            remoteMain = $remoteMain; headEqualsRemote = ($head -eq $remoteMain)
            publicationReady = $ready; publicationAttempted = $false; originalUnitCredits = 0 } |
            ConvertTo-Json -Depth 22 -Compress
        return
    }
    if (-not $ready) { throw 'Current original admission, approved source, main and remote must all match before staging.' }
    $rechecked = Read-Current
    $shaBeforeDelegation = (Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not $rechecked.approved -or -not $rechecked.delegationReady -or
        $rechecked.authorizedSha256 -ne $current.authorizedSha256 -or
        $rechecked.canonicalParentRecordSha256 -ne $current.canonicalParentRecordSha256 -or
        $shaBeforeDelegation -ne $rechecked.authorizedSha256) {
        throw 'Current canonical approval, original scope or actual source changed before delegation; no staging.'
    }
    [ordered]@{ schemaVersion = 1; kind = 'actual-current-transaction-authorization'
        cardId = 'C016'; workerId = 'worker-C016'; authorizedSha256 = $shaBeforeDelegation
        canonicalParentRecordSha256 = $rechecked.canonicalParentRecordSha256
        sourceSelector = 'localPublisherAuthorization'; head = $head; remoteMain = $remoteMain
        fixedClass = 'D'; fixedPaths = @('capability\C016'); admin = $false } |
        ConvertTo-Json -Depth 4 -Compress | Write-Output
    if ((Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant() -ne $shaBeforeDelegation) {
        throw 'Actual approved publisher changed immediately before delegation; no staging.'
    }
    & '.\.git\kanban-orchestrator\publish.ps1' -CardId C016 -WorkerId worker-C016 -Paths @('capability\C016') `
        -Message '[C016][D] Separate immutable F6 provenance from current canonical parent transaction authorization; preserved failures and GREEN'
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
