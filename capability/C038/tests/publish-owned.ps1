$ErrorActionPreference='Stop'
if($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1'){throw 'Exact explicit owned publication required; no overrides'}
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$root=Join-Path $repository 'capability\C038'
if((Get-Location).Path -cne $repository){throw 'Publication requires the actual repository root'}
$directory=[IO.Path]::GetFullPath($env:C038_CAPTURE_DIR)
if([IO.Path]::GetDirectoryName($directory) -cne (Join-Path $root 'evidence\raw') -or
    [IO.Path]::GetFileName($directory) -notmatch '^publication-[0-9a-f-]{36}$' -or
    ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint)){
    throw 'Only this unique regular owned publication directory is accepted'
}
function Write-NewJson([string]$Name,$Value){
    $stream=[IO.File]::Open((Join-Path $directory $Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 30)+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}
    finally{$stream.Dispose()}
}
& node (Join-Path $PSScriptRoot 'audit.cjs')
if($LASTEXITCODE -ne 0){throw 'Exact qualified source and retained raw proof must pass before any publisher acquisition'}
$currentText=(& node (Join-Path $PSScriptRoot 'current-authority.cjs')|Out-String)
if($LASTEXITCODE -ne 0){throw 'Current top canonical State authority unavailable; no historical fallback'}
$current=$currentText|ConvertFrom-Json -AsHashtable
if($current.stateReleasedBeforePublisherRead -ne $true -or
    $current.assessment.exactAuthorizedBytes -ne $true -or $current.assessment.delegationReady -ne $true){
    throw 'Current original class/scope/owner or exact approved publisher denied before staging'
}
Write-NewJson 'current-authority.json' $current
$mutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanPublisher_v1')
$held=$false;$publisherHandle=$null
try{
    $held=$mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if(-not $held){throw 'Publisher mutex timed out; no lock cleanup or bypass'}
    $age=[DateTime]::UtcNow-[DateTime]::Parse($current.snapshot.observedAtUtc).ToUniversalTime()
    if($age.TotalSeconds -lt 0 -or $age.TotalSeconds -gt 60){throw 'State snapshot expired; release Publisher before any new State read'}
    $publisher=Join-Path $repository '.git\kanban-orchestrator\publish.ps1'
    if((Get-Item -LiteralPath $publisher).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Linked private publisher denied'}
    $publisherHandle=[IO.File]::Open($publisher,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    if($publisherHandle.Length -gt 131072){throw 'Unexpected unbounded private publisher denied'}
    $actual=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($publisherHandle)).ToLowerInvariant()
    if($actual -cne $current.snapshot.authorization.publisherSha256 -or $actual -cne $current.assessment.authorizedSha256){
        throw 'Unknown unapproved actual private publisher bytes denied before staging'
    }
    $branch=(& git --no-pager branch --show-current|Out-String).Trim()
    if($LASTEXITCODE -ne 0 -or $branch -cne 'main'){throw 'Actual main required before staging'}
    $head=(& git --no-pager rev-parse --verify HEAD|Out-String).Trim()
    if($LASTEXITCODE -ne 0 -or $head -notmatch '^[0-9a-f]{40}$'){throw 'Actual full HEAD required'}
    $remote=@(& git --no-pager ls-remote origin refs/heads/main)
    if($LASTEXITCODE -ne 0 -or $remote.Count -ne 1){throw 'Exactly one actual remote main required before staging'}
    $remoteHead=("$($remote[0])" -split '\s+')[0]
    if($head -cne $remoteHead){throw 'Actual HEAD must equal remote under Publisher BEFORE staging; no ahead carry/reset/amend/force'}
    Write-NewJson 'before-stage.json' ([ordered]@{
        cardId='C038';workerId='worker-C038';actualHead=$head;actualRemoteMain=$remoteHead
        actualPublisherSha256=$actual;authorizedTopSha256=$current.snapshot.authorization.publisherSha256
        stateSnapshotObservedAtUtc=$current.snapshot.observedAtUtc;stateReleasedBeforePublisher=$true
        stateAcquisitionsUnderPublisher=0;actualHeadEqualsRemoteBeforeAnyStage=$true
        originalKano='S';ownedPaths=@('capability\C038');observedAtUtc=[DateTime]::UtcNow.ToString('o')
    })
    & node (Join-Path $PSScriptRoot 'index-proof.cjs') before
    if($LASTEXITCODE -ne 0){throw 'All foreign index entries and flags must be captured before the standard publisher'}
    $publisherHandle.Position=0
    $immediate=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($publisherHandle)).ToLowerInvariant()
    if($immediate -cne $current.snapshot.authorization.publisherSha256){throw 'Actual approved private bytes changed under Publisher'}
    if(([DateTime]::UtcNow-[DateTime]::Parse($current.snapshot.observedAtUtc).ToUniversalTime()).TotalSeconds -gt 60){
        throw 'Authority expired before standard delegation; release Publisher before any new State read'
    }
    & $publisher -CardId C038 -WorkerId worker-C038 -Paths @('capability\C038') `
        -Message '[C038][S][BDD,TDD,IaC-N/A,Node,Edge,evidence] Inspect explicit synthetic instance/dependency readiness and freshness'
    if(-not $?){throw 'Unchanged standard publisher failed; never infer publication or carry an ahead commit'}
    $receipt=[IO.File]::ReadAllText((Join-Path $repository '.git\kanban-orchestrator\published\C038.json'))|ConvertFrom-Json -AsHashtable
    if($receipt.cardId -cne 'C038' -or $receipt.workerId -cne 'worker-C038' -or
        $receipt.commit -notmatch '^[0-9a-f]{40}$' -or $receipt.tag -cne "kanban/C038/$($receipt.commit.Substring(0,12))" -or
        $receipt.remoteVerified -ne $true){throw 'Exact actual standard C038 publication receipt required'}
    Write-NewJson 'receipt.json' $receipt
    & node (Join-Path $PSScriptRoot 'index-proof.cjs') after
    if($LASTEXITCODE -ne 0){throw 'Foreign index entry/flag changed; never clean up C048 or conceal the failure'}
    & node (Join-Path $PSScriptRoot 'published-proof.cjs') $receipt.commit
    if($LASTEXITCODE -ne 0){throw 'Actual full-SHA annotated-tag/remote/raw-vs-Git proof failed'}
}finally{
    if($publisherHandle){$publisherHandle.Dispose()}
    if($held){$mutex.ReleaseMutex()}
    $mutex.Dispose()
}
