$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'Only explicit exact own publication capture is supported.' }
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if((Get-Location).Path -ne $repository){throw 'Exact repository main workspace required'}
$root=Join-Path $repository 'capability\C036'
$directory=[IO.Path]::GetFullPath($env:C036_CAPTURE_DIR)
if([IO.Path]::GetDirectoryName($directory) -ne (Join-Path $root 'evidence\raw') -or
    [IO.Path]::GetFileName($directory) -notmatch '^publication-[0-9a-f-]{36}$'){throw 'Only a unique exact own publication capture directory is supported'}
if((Get-ChildItem -LiteralPath $directory -Force).Count -ne 0){throw 'Publication capture directory must be newly empty'}
$publisher=Join-Path $repository '.git\kanban-orchestrator\publish.ps1'
$canonicalJson = & node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C036\\publisher-provenance.cjs').readCurrentAuthority()));"
if ($LASTEXITCODE -ne 0) { throw 'Current canonical parent observation unavailable; no publication.' }
$canonical = ($canonicalJson | Out-String) | ConvertFrom-Json -AsHashtable
$assessment = $canonical.assessment
if ($assessment.approved -ne $true -or $assessment.delegationReady -ne $true) { throw 'Original current C036 delegation is held by parent qualification or current scope; no staging.' }
$publisherMutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanPublisher_v1')
$held=$false
function Unowned-Index {
    $lines = @(& git -c core.quotepath=false ls-files --stage --debug)
    if ($LASTEXITCODE -ne 0) { throw 'Read-only unowned index metadata unavailable.' }
    $entries = [Collections.Generic.List[object]]::new()
    $pending = $null
    foreach ($line in $lines) {
        if ($line -match '^([0-7]{6}) ([0-9a-f]{40}) ([0-3])\t(.+)$') {
            if ($pending) { throw 'Incomplete index entry.' }
            $pending = [ordered]@{mode=$Matches[1];blob=$Matches[2];stage=$Matches[3];path=$Matches[4]}
        } elseif ($line -match '^\s*size:\s+\d+\s+flags:\s+([0-9a-fA-F]+)\s*$') {
            if (-not $pending) { throw 'Index flags without entry.' }
            $pending.flags=$Matches[1].ToLowerInvariant()
            if (-not $pending.path.StartsWith('capability/C036/',[StringComparison]::Ordinal)) { $entries.Add($pending) }
            $pending=$null
        }
    }
    if ($pending) { throw 'Unfinished index entry.' }
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($entries.ToArray()|ConvertTo-Json -Depth 5 -Compress))
    return [ordered]@{entries=$entries.Count;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()}
}
try {
    $held=$publisherMutex.WaitOne([TimeSpan]::FromSeconds(180))
    if(-not $held){throw 'Publisher mutex timed out; no lock removal or bypass'}
    $actualSha=(Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha -cne $assessment.authorizedSha256) { throw 'Current private publisher bytes lack current top canonical approval; no staging.' }
    $head=(& git rev-parse HEAD | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'HEAD unavailable.' }
    $branch=(& git branch --show-current | Out-String).Trim()
    $remote=@(& git ls-remote origin refs/heads/main)
    if ($LASTEXITCODE -ne 0 -or $remote.Count -ne 1) { throw 'Exact remote main unavailable.' }
    $remoteMain=("$($remote[0])" -split '\s+')[0]
    if ($branch -cne 'main' -or $head -cne $remoteMain) { throw 'Parent-qualified main must equal remote before any staging; never carry a failed C016 candidate.' }
    $boundary=[ordered]@{
        cardId='C036';workerId='worker-C036';actualPublisherSha256=$actualSha
        currentCanonicalAuthorizationSource='.docs\wiki\flow-state.json.localPublisherAuthorization'
        currentCanonicalSnapshot=$canonical.snapshot;assessment=$assessment
        publisherMutexHeld=$true;stateMutexReleasedBeforePublisher=$true;stateAcquiredUnderPublisher=$false
        historical4bUsedPublisherSha256='60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea'
        historicalNestedRevisionsAreNotCurrentAuthority=$true
        preStagingHead=$head;preStagingRemoteMain=$remoteMain;observedAtUtc=[DateTime]::UtcNow.ToString('o')
    }
    [IO.File]::WriteAllText((Join-Path $directory 'publisher-boundary-locked.json'),($boundary|ConvertTo-Json -Depth 20)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
    $unownedBefore=Unowned-Index
    if ((Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant() -cne $assessment.authorizedSha256) { throw 'Private bytes changed immediately before unchanged standard delegation.' }
    $output=@(& $publisher -CardId C036 -WorkerId worker-C036 -Paths @('capability\C036') -Message '[C036][D][provenance-correction] Separate immutable actually-used 60AE history from current top canonical authority; preserve attribution and authentic proof; zero extra units')
    $unownedAfter=Unowned-Index
    if ($unownedBefore.entries -ne $unownedAfter.entries -or $unownedBefore.sha256 -cne $unownedAfter.sha256) { throw 'Unowned staged entries/flags changed; stop without repair.' }
    $publication=($output|Out-String)|ConvertFrom-Json -AsHashtable
    if($publication.remoteVerified -ne $true -or $publication.cardId -cne 'C036' -or
        $publication.workerId -cne 'worker-C036' -or $publication.commit -notmatch '^[0-9a-f]{40}$' -or
        $publication.tag -cne "kanban/C036/$($publication.commit.Substring(0,12))"){throw 'Standard publisher did not return a verified exact C036 publication'}
    $publication.publisherBoundary=$boundary
    $publication.recoveryForCommit='4b2339f77704c79449270598b0896704ce7533c8'
    $publication.unownedIndexEntriesAndFlagsUnchanged=$true
    $publication.extraCredits=0
    $target=Join-Path $directory 'receipt.json'
    $stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $data=[Text.UTF8Encoding]::new($false).GetBytes(($publication|ConvertTo-Json -Depth 30)+[Environment]::NewLine)
        $stream.Write($data,0,$data.Length);$stream.Flush($true)
    } finally {$stream.Dispose()}
    [Console]::WriteLine(($publication|ConvertTo-Json -Depth 30))
} finally {if($held){$publisherMutex.ReleaseMutex()};$publisherMutex.Dispose()}
