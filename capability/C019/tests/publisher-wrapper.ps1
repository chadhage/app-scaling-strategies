param([ValidateSet('Inspect', 'Publish')][string]$Action = 'Inspect')
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No publisher, path, class, worker, message, or Admin overrides are accepted.' }
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$held = $false
function Read-ApprovedSource {
    $json = & node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C019\\tests\\authorization.cjs').assessCurrent()));"
    if ($LASTEXITCODE -ne 0) { throw 'Controller authorization assessment failed.' }
    return ($json | ConvertFrom-Json -AsHashtable)
}
function Read-Git([string[]]$Arguments) {
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'A bounded read-only Git inspection failed.' }
    return $output
}
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $held) { throw 'Publisher mutex timeout; no lock removal or fallback.' }
    $authority = Read-ApprovedSource
    $head = (Read-Git @('rev-parse', 'HEAD') | Out-String).Trim()
    $branch = (Read-Git @('branch', '--show-current') | Out-String).Trim()
    $refs = @(Read-Git @('ls-remote', 'origin', 'refs/heads/main', 'refs/tags/kanban/C019/*'))
    $main = @($refs | Where-Object { "$_" -match '\srefs/heads/main$' })
    if ($main.Count -ne 1) { throw 'Expected exactly one remote main reference.' }
    $remoteMain = ("$($main[0])" -split '\s+')[0]
    $actualSha = (Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
    $ready = $authority.approved -eq $true -and $authority.delegationReady -eq $true -and
        $actualSha -eq $authority.authorizedSha256 -and $branch -eq 'main' -and $head -eq $remoteMain
    $inspection = [ordered]@{
        schemaVersion = 1
        cardId = 'C019'
        workerId = 'worker-C019'
        capturedAtUtc = [DateTime]::UtcNow.ToString('o')
        authority = $authority
        publisherSha256 = $actualSha
        branch = $branch
        head = $head
        remoteMain = $remoteMain
        headEqualsRemote = ($head -eq $remoteMain)
        ownedStagedFiles = @(Read-Git @('diff', '--cached', '--name-only', '--', 'capability\C019'))
        ownedLocalTags = @(Read-Git @('for-each-ref', '--format=%(refname)', 'refs/tags/kanban/C019'))
        ownedRemoteTags = @($refs | Where-Object { "$_" -notmatch '\srefs/heads/main$' })
        publicationReady = $ready
        publicationAttempted = $false
        code = if (-not $authority.approved) { $authority.code } elseif (-not $authority.delegationReady) {
            'C019_DELEGATION_NOT_READY'
        } elseif ($head -ne $remoteMain) { 'WAIT_FOR_PARENT_MAIN_RECONCILIATION' } elseif ($branch -ne 'main') {
            'MAIN_REQUIRED'
        } elseif ($actualSha -ne $authority.authorizedSha256) {
            'PUBLISHER_SCRIPT_CHANGED'
        } else { 'READY_FOR_STANDARD_PUBLICATION' }
        originalUnitCredits = 0
    }
    if ($Action -eq 'Inspect') {
        $inspection | ConvertTo-Json -Depth 12 -Compress
        return
    }
    if (-not $ready) { throw "C019 publication held: $($inspection.code). No staging occurred." }
    $rechecked = Read-ApprovedSource
    $shaBeforeInvocation = (Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
    if (-not $rechecked.approved -or -not $rechecked.delegationReady -or
        $rechecked.authorizedSha256 -ne $authority.authorizedSha256 -or $shaBeforeInvocation -ne $rechecked.authorizedSha256) {
        throw 'Controller-approved source or actual guard changed before invocation; no staging.'
    }
    & '.\.git\kanban-orchestrator\publish.ps1' -CardId C019 -WorkerId worker-C019 -Paths @('capability\C019') `
        -Message '[C019][S] Present real typed C015 failures and bounded read-only recovery; preserve RED/GREEN/signed Edge proof'
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
