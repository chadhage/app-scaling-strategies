param([ValidateSet('Inspect', 'Publish')][string]$Action = 'Inspect')
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No card, worker, publisher, scope, class, message or approval overrides are accepted.' }
function Read-CanonicalParent {
    $json = & node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C018\\tests\\publisher-authority.cjs').readCurrentAuthority()));"
    if ($LASTEXITCODE -ne 0) { throw 'Canonical parent assessment unavailable; no publication.' }
    return ($json | ConvertFrom-Json -AsHashtable)
}
function Read-UnownedIndex {
    $lines = @(& git -c core.quotepath=false ls-files --stage --debug)
    if ($LASTEXITCODE -ne 0) { throw 'Read-only index metadata unavailable.' }
    $entries = [Collections.Generic.List[object]]::new()
    $pending = $null
    foreach ($line in $lines) {
        if ($line -match '^([0-7]{6}) ([0-9a-f]{40}) ([0-3])\t(.+)$') {
            if ($pending) { throw 'Incomplete index metadata.' }
            $pending = [ordered]@{ mode=$Matches[1]; blob=$Matches[2]; stage=$Matches[3]; path=$Matches[4] }
        } elseif ($line -match '^\s*size:\s+\d+\s+flags:\s+([0-9a-fA-F]+)\s*$') {
            if (-not $pending) { throw 'Index flags without an entry.' }
            $pending['flags'] = $Matches[1].ToLowerInvariant()
            if (-not $pending.path.StartsWith('capability/C018/', [StringComparison]::Ordinal)) { $entries.Add($pending) }
            $pending = $null
        }
    }
    if ($pending) { throw 'Unfinished index metadata.' }
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($entries.ToArray() | ConvertTo-Json -Depth 4 -Compress))
    return [ordered]@{ entries=$entries.Count; sha256=([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes))).ToLowerInvariant() }
}
$canonical = Read-CanonicalParent
$authority = $canonical.assessment
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$held = $false
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $held) { throw 'Publisher mutex timeout; no fallback.' }
    $actual = (Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant()
    $head = (& git rev-parse HEAD | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'HEAD unavailable.' }
    $branch = (& git branch --show-current | Out-String).Trim()
    $remote = @(& git ls-remote origin refs/heads/main)
    if ($LASTEXITCODE -ne 0 -or $remote.Count -ne 1) { throw 'Exact current remote main unavailable.' }
    $remoteMain = ("$($remote[0])" -split '\s+')[0]
    $ready = $authority.approved -eq $true -and $authority.delegationReady -eq $true -and
        $actual -eq $authority.authorizedSha256 -and $branch -eq 'main' -and $head -eq $remoteMain
    $inspection = [ordered]@{
        cardId = 'C018'; workerId = 'worker-C018'; authority = $authority
        currentParentSnapshot = $canonical.snapshot
        actualPublisherSha256 = $actual; head = $head; remoteMain = $remoteMain
        publicationReady = $ready; publicationPerformed = $false
        normalVerificationAuthorizesPublication = $false
        code = if (-not $authority.approved) { $authority.code } elseif (-not $authority.delegationReady) {
            'HOLD_ORIGINAL_C018_DELEGATION'
        } elseif ($actual -ne $authority.authorizedSha256) { 'HOLD_UNAPPROVED_PUBLISHER'
        } elseif ($branch -ne 'main') { 'MAIN_REQUIRED'
        } elseif ($head -ne $remoteMain) { 'HEAD_REMOTE_MISMATCH'
        } else { 'READY_FOR_UNCHANGED_STANDARD_DELEGATION' }
    }
    if ($Action -eq 'Inspect') { $inspection | ConvertTo-Json -Depth 24 -Compress; return }
    if (-not $ready) { throw "C018 publication held: $($inspection.code); no staging." }
    if ((Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant() -ne $authority.authorizedSha256) {
        throw 'Actual private bytes changed before standard delegation; no staging.'
    }
    $indexBefore = Read-UnownedIndex
    $standardOutput = @(& '.\.git\kanban-orchestrator\publish.ps1' -CardId C018 -WorkerId worker-C018 -Paths @('capability\C018') `
        -Message '[C018][S][provenance-correction] Separate immutable F6 history from current canonical authority; preserve runtime and authentic proof' *>&1)
    $indexAfter = Read-UnownedIndex
    if ($indexBefore.entries -ne $indexAfter.entries -or $indexBefore.sha256 -ne $indexAfter.sha256) {
        throw 'Unowned index entries or flags changed; stop without repair.'
    }
    if ((Get-FileHash -LiteralPath '.git\kanban-orchestrator\publish.ps1' -Algorithm SHA256).Hash.ToLowerInvariant() -ne $authority.authorizedSha256) {
        throw 'Private publisher changed during standard delegation.'
    }
    $result = [IO.File]::ReadAllText((Join-Path (Get-Location) '.git\kanban-orchestrator\published\C018.json')) |
        ConvertFrom-Json -AsHashtable
    [ordered]@{
        standardPublication = $result
        authorityAtInvocation = $canonical.snapshot
        publisherSha256UsedForThisPublication = $actual
        preStagingHead = $head
        preStagingActualRemote = $remoteMain
        unownedIndex = $indexBefore
        unownedIndexEntriesAndFlagsUnchanged = $true
        historical845079PublisherSha256 = 'f6df80bdafc028538813330fe810bd81a69a50822a4a862e0bf42f59b2b0b2a4'
        publicationPerformed = $true
        extraCredits = 0
    } | ConvertTo-Json -Depth 24 -Compress
} finally {
    if ($held) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
