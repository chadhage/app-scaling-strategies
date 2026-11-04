param(
    [ValidateSet('Inspect','Publish')][string]$Action='Publish',
    [string]$Message='[X003][L] deterministic goal recommendation; genuine RED, focused GREEN and actual isolated Edge evidence'
)
$ErrorActionPreference='Stop'
if ($env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'Only exact CAPTURE_BROWSER_EVIDENCE=1 permits this deliberate publication/evidence action.' }
if (-not $Message.StartsWith('[X003][L]')) { throw 'Only original X003 with frozen L class may be published.' }
$root=(Get-Location).Path
$owned=Join-Path $root 'capability\X003'
$ledgerPath=Join-Path $root '.docs\wiki\flow-state.json'
$publisher=Join-Path $root '.git\kanban-orchestrator\publish.ps1'
$validator=Join-Path $owned 'publication\authorization.cjs'
$indexValidator=Join-Path $owned 'publication\index.cjs'
. (Join-Path $owned 'publication\transport.ps1')
function Git-Read([string[]]$Arguments) {
    $output=& git --no-pager @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Read-only git check failed: $($output -join [Environment]::NewLine)" }
    return $output
}
function Get-Hash([byte[]]$Bytes) {
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}
function Write-NewJson([string]$Path,$Value) {
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 50)+"`n")
        $stream.Write($bytes,0,$bytes.Length)
    } finally { $stream.Dispose() }
}
function Write-NewGzip([string]$Path,[byte[]]$Bytes) {
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    $gzip=[IO.Compression.GZipStream]::new($stream,[IO.Compression.CompressionLevel]::Optimal)
    try { $gzip.Write($Bytes,0,$Bytes.Length) } finally { $gzip.Dispose();$stream.Dispose() }
}
function Verify-Current {
    $output=& node $validator --verify-live $ledgerPath $publisher 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Current canonical permission or actual private bytes rejected before staging: $($output -join [Environment]::NewLine)" }
    return (($output|Out-String).Trim()|ConvertFrom-Json -AsHashtable)
}
function Capture-Index([string]$Label) {
    $output=& node $indexValidator capture $directory $Label 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Unmerged entries or index metadata rejected at '$Label'; no unowned path is repaired: $($output -join [Environment]::NewLine)" }
    return (Join-Path $directory "index-$Label.snapshot.json")
}
function Verify-ForeignIndex([string]$Before,[string]$After) {
    $output=& node $indexValidator verify $Before $After 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Unowned entries or flags were not preserved: $($output -join [Environment]::NewLine)" }
    return (($output|Out-String).Trim()|ConvertFrom-Json -AsHashtable)
}
$stateMutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanState_v1')
$publisherMutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanPublisher_v1')
$stateHeld=$false;$publisherHeld=$false;$directory=$null;$transportRestore=$null
try {
    $stateHeld=$stateMutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $stateHeld) { throw 'State mutex timed out; no fallback or lock cleanup.' }
    $publisherHeld=$publisherMutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $publisherHeld) { throw 'Publisher mutex timed out; no fallback or lock cleanup.' }
    $proof=Verify-Current
    $ledgerBytes=[IO.File]::ReadAllBytes($ledgerPath)
    $ledger=[Text.Encoding]::UTF8.GetString($ledgerBytes)|ConvertFrom-Json -AsHashtable
    $transportRestore=Enable-GitHttp11 $ledger.publicationTransportApproval $proof.actualRawSha256
    $publisherBytes=[IO.File]::ReadAllBytes($publisher)
    if ((Get-Hash $publisherBytes) -ne $proof.approvedRawSha256) { throw 'Actual private source changed after current approval verification.' }
    $id=[DateTime]::UtcNow.ToString('yyyy-MM-ddTHH-mm-ss-fffffffZ')+'-'+[Guid]::NewGuid().ToString('D')+'-'+$Action.ToLowerInvariant()
    $directory=Join-Path $owned "evidence\publication\$id"
    [IO.Directory]::CreateDirectory($directory)|Out-Null
    $publisherSnapshot=Join-Path $directory 'publisher.source.raw.gz'
    Write-NewGzip $publisherSnapshot $publisherBytes
    $authoritySnapshot=[ordered]@{
        localPublisherAuthorization=$ledger.localPublisherAuthorization
        publicationTransportApproval=$ledger.publicationTransportApproval
        cards=@($ledger.cards|Where-Object { $_.id -in @('X003','C005','C006','C007','C008','A-S001','A-S010') })
        workers=@($ledger.workers|Where-Object { $_.id -eq 'worker-X003' })
        packets=@($ledger.packets|Where-Object { $_.id -eq 'LP-LEARN' })
        kanoDone=$ledger.kanoDone;reservations=$ledger.reservations
    }
    Write-NewJson (Join-Path $directory 'canonical-authorization.snapshot.json') $authoritySnapshot
    $capture=[ordered]@{
        schema='X003/immutable-authority-capture/1';cardId='X003';workerId='worker-X003'
        capturedAtUtc=[DateTime]::UtcNow.ToString('o')
        captureKind=if($Action -eq 'Inspect'){'authorized-preflight-not-a-publication'}else{'authorized-before-standard-delegation-not-yet-published'}
        usedForCommit=$null;approvalId=$proof.approvalId;approvedRawSha256=$proof.approvedRawSha256
        privatePublisherPath='.git\kanban-orchestrator\publish.ps1'
        publisherSnapshot=[IO.Path]::GetRelativePath($root,$publisherSnapshot)
        authorizationSnapshot=[IO.Path]::GetRelativePath($root,(Join-Path $directory 'canonical-authorization.snapshot.json'))
        rawCRLF=([regex]::Matches([Text.Encoding]::UTF8.GetString($publisherBytes),"`r`n")).Count
        gitCanonicalSha256=Get-Hash ([Text.Encoding]::UTF8.GetBytes([Text.Encoding]::UTF8.GetString($publisherBytes).Replace("`r`n","`n")))
        ledgerRawSha256=Get-Hash $ledgerBytes
        canonicalAuthorityReadUnderStateMutex=$stateHeld;actualSourceReverifiedUnderPublisherMutex=$publisherHeld
        delegatedToUnchangedStandardPublisher=$false;additionalCompanionCredit=0
        gitTransport='publisher-process-local HTTP/1.1';safeHttpVersionCheckBeforeDelegation='HTTP/1.1'
    }
    Write-NewJson (Join-Path $directory 'capture.json') $capture
    if ($Action -eq 'Inspect') {
        Write-Output "X003_AUTHORITY_CAPTURE $([IO.Path]::GetRelativePath($root,(Join-Path $directory 'capture.json')))"
        return
    }
    $indexBefore=Capture-Index 'before'
    $branch=(Git-Read @('branch','--show-current')|Out-String).Trim()
    if ($branch -ne 'main') { throw "Publication requires main, found $branch." }
    $head=(Git-Read @('rev-parse','HEAD')|Out-String).Trim()
    $remote=@(Git-Read @('ls-remote','origin','refs/heads/main'))
    if ($remote.Count -ne 1 -or ("$($remote[0])" -split '\s+')[0] -ne $head) { throw 'Actual HEAD must already equal remote main before staging; no ancestor carrying or repair bypass.' }
    $fresh=Verify-Current
    if ($fresh.actualRawSha256 -ne $proof.actualRawSha256) { throw 'Current private source changed inside publisher boundary.' }
    $indexReady=Capture-Index 'pre-delegation'
    $indexPrecheck=Verify-ForeignIndex $indexBefore $indexReady
    Write-NewJson (Join-Path $directory 'index-preservation-pre-delegation.json') $indexPrecheck
    & $publisher -CardId X003 -WorkerId worker-X003 -Paths @('capability\X003') -Message $Message | Out-Host
    $after=Verify-Current
    if ($after.actualRawSha256 -ne $fresh.actualRawSha256) { throw 'Actual publisher bytes changed during unchanged standard delegation.' }
    $indexAfter=Capture-Index 'after'
    $indexPreservation=Verify-ForeignIndex $indexBefore $indexAfter
    Write-NewJson (Join-Path $directory 'index-preservation-after.json') $indexPreservation
    $receipt=Get-Content (Join-Path $root '.git\kanban-orchestrator\published\X003.json') -Raw|ConvertFrom-Json -AsHashtable
    if ($receipt.cardId -ne 'X003' -or $receipt.workerId -ne 'worker-X003' -or -not $receipt.remoteVerified -or
        $receipt.paths.Count -ne 1 -or $receipt.paths[0] -ne 'capability\X003' -or
        $receipt.commit -ne $receipt.remotePeeledTag) { throw 'Standard receipt identity, owned path or remote peeled tag mismatch.' }
    Restore-GitHttp11 $transportRestore
    $transportRestore=$null
    $result=[ordered]@{
        schema='X003/actual-publication/1';cardId='X003';workerId='worker-X003';outcome='published'
        commit=$receipt.commit;tag=$receipt.tag;remoteMain=$receipt.remoteMain;remotePeeledTag=$receipt.remotePeeledTag
        remoteVerified=$true;usedActualPublisherRawSha256=$after.actualRawSha256;approvalId=$after.approvalId
        sourceCapture=[IO.Path]::GetRelativePath($root,(Join-Path $directory 'capture.json'))
        indexBefore=[IO.Path]::GetRelativePath($root,$indexBefore);indexAfter=[IO.Path]::GetRelativePath($root,$indexAfter)
        foreignIndexPreserved=$indexPreservation.preserved;foreignIndexEntryCount=$indexPreservation.foreignEntryCount
        foreignIndexMetadataSha256=$indexPreservation.foreignMetadataSha256;unmergedEntries=0
        gitTransport='publisher-process-local HTTP/1.1';safeHttpVersionBeforeStandard='HTTP/1.1'
        priorGitProcessEnvironmentRestored=$true;freshSafeGitConfigAfterRestoreValidated=$true
        privatePublisherBytesUnchanged=$true;globalGitConfigurationChanged=$false
        delegatedToUnchangedStandardPublisher=$true;stateThenPublisherLockOrder=$true
        stateReportAfterBothLocksReleased=$true;additionalCompanionCredit=0;parentAcceptancePending=$true
    }
    Write-NewJson (Join-Path $directory 'published-result.json') $result
    Write-Output "X003_PUBLICATION_RESULT $([IO.Path]::GetRelativePath($root,(Join-Path $directory 'published-result.json')))"
} catch {
    if ($directory) {
        Write-NewJson (Join-Path $directory 'failure.json') ([ordered]@{
            cardId='X003';workerId='worker-X003';outcome='blocked';message=$_.Exception.Message
            failurePreserved=$true;parentAcceptanceClaimed=$false;observedAtUtc=[DateTime]::UtcNow.ToString('o')
        })
    }
    throw
} finally {
    try { if ($transportRestore) { Restore-GitHttp11 $transportRestore } }
    finally {
        if ($publisherHeld) { $publisherMutex.ReleaseMutex() }
        $publisherMutex.Dispose()
        if ($stateHeld) { $stateMutex.ReleaseMutex() }
        $stateMutex.Dispose()
    }
}
