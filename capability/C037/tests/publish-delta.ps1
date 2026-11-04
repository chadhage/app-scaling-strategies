param(
    [Parameter(Mandatory=$true)][string[]]$Paths,
    [Parameter(Mandatory=$true)][string]$Message,
    [switch]$DryRun
)
# Delta publication through the same boundary as publish-owned.ps1, with explicit owned paths and a caller message.
# It writes nothing into the repository, so the published tree never holds half-written proof directories.
$ErrorActionPreference = 'Stop'
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if ((Get-Location).Path -cne $repository) { throw 'Exact main workspace required.' }
if ($Message -cnotmatch '^\[C037\]\[S\] \S') { throw 'An owned [C037][S] message is required.' }
$owned = Join-Path $repository 'capability\C037\'
foreach ($path in $Paths) {
    $full = [IO.Path]::GetFullPath((Join-Path $repository $path))
    if (-not $full.StartsWith($owned, [StringComparison]::Ordinal) -or -not (Test-Path -LiteralPath $full)) { throw "Existing path inside capability\C037 required: $path" }
}
. (Join-Path $PSScriptRoot 'git-transport.ps1')
function Unowned-Index {
    $lines = @(& git --no-pager -c core.quotepath=false ls-files --stage --debug)
    if ($LASTEXITCODE -ne 0) { throw 'Read-only unowned index entries/flags unavailable.' }
    $entries = [Collections.Generic.List[object]]::new(); $pending = $null
    foreach ($line in $lines) {
        if ($line -match '^([0-7]{6}) ([0-9a-f]{40}) ([0-3])\t(.+)$') {
            if ($pending) { throw 'Incomplete index entry.' }
            $pending = [ordered]@{ mode = $Matches[1]; blob = $Matches[2]; stage = $Matches[3]; path = $Matches[4] }
        } elseif ($line -match '^\s*size:\s+\d+\s+flags:\s+([0-9a-fA-F]+)\s*$') {
            if (-not $pending) { throw 'Index flags without entry.' }
            $pending.flags = $Matches[1].ToLowerInvariant()
            if (-not $pending.path.StartsWith('capability/C037/', [StringComparison]::Ordinal)) { $entries.Add($pending) }
            $pending = $null
        }
    }
    if ($pending) { throw 'Unfinished index entry.' }
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($entries.ToArray() | ConvertTo-Json -Depth 5 -Compress))
    return [ordered]@{ entries = $entries.Count; sha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant() }
}
$canonicalJson = & node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C037\\authority.cjs').readCurrent()));"
if ($LASTEXITCODE -ne 0) { throw 'Current top canonical State approval unavailable; no staging.' }
$canonical = ($canonicalJson | Out-String) | ConvertFrom-Json -AsHashtable
if ($canonical.assessment.approved -ne $true -or $canonical.assessment.delegationReady -ne $true) { throw 'Current exact original C037 delegation is not approved/ready; no staging.' }
$publisher = Join-Path $repository '.git\kanban-orchestrator\publish.ps1'
$mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$held = $false
$proof = [ordered]@{ cardId = 'C037'; ownedPublicationBoundaryInvoked = $false; dryRun = [bool]$DryRun }
$script:receipt = $null
try {
    $held = $mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $held) { throw 'Publisher timed out; no lock removal or guard bypass.' }
    Invoke-C037Http11 {
        $proof.ownedPublicationBoundaryInvoked = $true
        $actual = (Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -cne $canonical.assessment.authorizedSha256) { throw 'Actual private CURRENT publisher bytes lack exact current approval; no staging.' }
        $head = (& git --no-pager rev-parse HEAD | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Actual HEAD unavailable.' }
        $branch = (& git --no-pager branch --show-current | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { throw 'Branch unavailable.' }
        $remote = @(& git --no-pager ls-remote origin refs/heads/main)
        if ($LASTEXITCODE -ne 0 -or $remote.Count -ne 1) { throw 'Exact actual remote main unavailable.' }
        $remoteMain = ("$($remote[0])" -split '\s+')[0]
        if ($branch -cne 'main' -or $head -cne $remoteMain) { throw 'Actual HEAD must equal remote under Publisher before staging; no carry/reset/amend/force.' }
        $before = Unowned-Index
        $boundary = [ordered]@{ cardId = 'C037'; workerId = 'worker-C037'; actualPublisherSha256 = $actual
            currentCanonicalSource = '.docs\wiki\flow-state.json.localPublisherAuthorization'
            currentApprovalLedgerRevision = $canonical.snapshot.ledgerRevision; publisherMutexHeld = $true
            stateReleasedBeforePublisher = $true; stateAcquiredUnderPublisher = $false
            preStagingHead = $head; preStagingRemoteMain = $remoteMain; unownedIndexBefore = $before
            paths = $Paths; message = $Message; observedAtUtc = [DateTime]::UtcNow.ToString('o') }
        if ($DryRun) { $script:receipt = [ordered]@{ publisherBoundary = $boundary; dryRun = $true }; return }
        if ((Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant() -cne $canonical.assessment.authorizedSha256) {
            throw 'Private bytes changed immediately before standard delegation; no staging.'
        }
        $output = @(& $publisher -CardId C037 -WorkerId worker-C037 -Paths $Paths -Message $Message)
        $after = Unowned-Index
        if ($before.entries -ne $after.entries -or $before.sha256 -cne $after.sha256) { throw 'Foreign index entries or flags changed; stop without cleanup or repair.' }
        $publication = ($output | Out-String) | ConvertFrom-Json -AsHashtable
        if ($publication.cardId -cne 'C037' -or $publication.workerId -cne 'worker-C037' -or $publication.remoteVerified -ne $true -or
            $publication.commit -notmatch '^[0-9a-f]{40}$' -or $publication.tag -cne "kanban/C037/$($publication.commit.Substring(0,12))") {
            throw 'Exact standard annotated remote publication receipt missing.'
        }
        $qualificationJson = & node (Join-Path $PSScriptRoot 'qualify.cjs') $publication.commit $publication.tag
        if ($LASTEXITCODE -ne 0) { throw 'Actual current raw/Git canonical or remote qualification failed; do not report Done.' }
        $publication.publisherBoundary = $boundary
        $publication.unownedIndexAfter = $after
        $publication.unownedIndexEntriesAndFlagsUnchanged = $true
        $publication.qualification = ($qualificationJson | Out-String) | ConvertFrom-Json -AsHashtable
        $script:receipt = $publication
    } $proof
} finally { if ($held) { $mutex.ReleaseMutex() }; $mutex.Dispose() }
$script:receipt.transport = $proof
[Console]::WriteLine(($script:receipt | ConvertTo-Json -Depth 40))
