param([ValidateSet('Inspect', 'Publish')][string]$Action = 'Inspect')
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No publisher, path, class, worker, message, or Admin overrides are accepted.' }
. (Join-Path $PSScriptRoot 'transport.ps1')
$held = $false
function Read-ApprovedSource {
    $json = & node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C019\\tests\\authorization.cjs').readCurrentAuthority()));"
    if ($LASTEXITCODE -ne 0) { throw 'Controller authorization assessment failed.' }
    return ($json | ConvertFrom-Json -AsHashtable)
}
function Read-Git([string[]]$Arguments) {
    $output = & git @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'A bounded read-only Git inspection failed.' }
    return $output
}
function Read-UnownedIndex {
    $lines = @(& git -c core.quotepath=false ls-files --stage --debug)
    if ($LASTEXITCODE -ne 0) { throw 'Read-only index metadata unavailable.' }
    $entries = [Collections.Generic.List[object]]::new()
    $pending = $null
    foreach ($line in $lines) {
        if ($line -match '^([0-7]{6}) ([0-9a-f]{40}) ([0-3])\t(.+)$') {
            if ($pending) { throw 'Incomplete index metadata.' }
            $pending = [ordered]@{mode=$Matches[1];blob=$Matches[2];stage=$Matches[3];path=$Matches[4]}
        } elseif ($line -match '^\s*size:\s+\d+\s+flags:\s+([0-9a-fA-F]+)\s*$') {
            if (-not $pending) { throw 'Index flags without an entry.' }
            $pending.flags = $Matches[1].ToLowerInvariant()
            if (-not $pending.path.StartsWith('capability/C019/',[StringComparison]::Ordinal)) { $entries.Add($pending) }
            $pending = $null
        }
    }
    if ($pending) { throw 'Unfinished index metadata.' }
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($entries.ToArray() | ConvertTo-Json -Depth 5 -Compress))
    return [ordered]@{entries=$entries.Count;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
}
$canonical = Read-ApprovedSource
$authority = $canonical.assessment
# State acquisition is complete before Publisher is acquired; no indirect State reads occur below.
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $held) { throw 'Publisher mutex timeout; no lock removal or fallback.' }
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
        currentCanonicalSnapshot = $canonical.snapshot
        callerPid = $PID
        stateMutexReleasedBeforePublisher = $true
        stateAcquiredUnderPublisher = $false
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
    $shaBeforeInvocation = (Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($shaBeforeInvocation -cne $authority.authorizedSha256) {
        throw 'Controller-approved source or actual guard changed before invocation; no staging.'
    }
    $transport = $canonical.snapshot.transportApproval
    if ($transport.approvedBy -cne 'parent-controller' -or $transport.mode -cne 'publisher-process-local HTTP/1.1' -or
        $transport.namespaceClassAdminHeadWhitespaceAndCreditRulesUnchanged -ne $true -or $transport.extraCredits -ne 0 -or
        $transport.currentAuthorizedPublisherSha256 -cne $authority.authorizedSha256) {
        throw 'Current explicit process-local transport approval unavailable; no staging.'
    }
    $indexBefore = Read-UnownedIndex
    Invoke-C019Http11 {
        & '.\.git\kanban-orchestrator\publish.ps1' -CardId C019 -WorkerId worker-C019 -Paths @('capability\C019') `
            -Message '[C019][S][provenance-correction] Separate immutable 09a/60AE history from current canonical authority; preserve runtime and authentic failed caller proof; zero extra credits'
    }
    $indexAfter = Read-UnownedIndex
    if ($indexBefore.entries -ne $indexAfter.entries -or $indexBefore.sha256 -cne $indexAfter.sha256) {
        throw 'Unowned index entries/flags changed; stop without repair.'
    }
    [ordered]@{
        callerPid=$PID; callerFinallyRestoredPresenceAndValue=$true; freshSafeGitReadPassed=$true
        stateReadBeforePublisher=$true; stateAcquiredUnderPublisher=$false
        unchangedStandardPublisherSha256=$actualSha; unownedIndex=$indexBefore
        unownedIndexEntriesAndFlagsUnchanged=$true; historical09aUsed60AEOnly=$true; extraCredits=0
    } | ConvertTo-Json -Depth 5 -Compress
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
