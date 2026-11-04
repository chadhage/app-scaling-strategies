$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'Exact deliberate one-original C035 publication only; no overrides.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ((Get-Location).Path -cne $root) { throw 'Publication requires the actual checked-out repository root.' }
. (Join-Path $PSScriptRoot 'git-transport.ps1')
. (Join-Path $PSScriptRoot 'foreign-guard.ps1')
$preflightText = & node (Join-Path $PSScriptRoot 'tests\prepublish.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Read-only original source/evidence preflight failed before staging.' }
$snapshotText = & pwsh.exe -NoLogo -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'read-gates.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Actual current State read failed; no historical authority fallback.' }
$snapshotJson = ($snapshotText | Out-String).Trim()
$snapshot = $snapshotJson | ConvertFrom-Json -AsHashtable
$authorizationText = $snapshotJson | & node (Join-Path $PSScriptRoot 'tests\authorize-publication.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Unknown current canonical source, revision, owner, class or owned path denied before staging.' }
$authorization = ($authorizationText | Out-String) | ConvertFrom-Json -AsHashtable
function Read-C035Git([string[]]$Arguments) {
    $output = & git --no-pager @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Read-only Git failed: $($output -join [Environment]::NewLine)" }
    return $output
}
$transport = Invoke-C035ProcessTransport {
    $publisher = Join-Path $root '.git\kanban-orchestrator\publish.ps1'
    $mutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
    $held = $false
    try {
        $held = $mutex.WaitOne([TimeSpan]::FromSeconds(180))
        if (-not $held) { throw 'Publisher timeout; no lock cleanup or guard bypass.' }
        $actualText = $snapshotJson | & node (Join-Path $PSScriptRoot 'tests\authorize-publication.cjs') actual
        if ($LASTEXITCODE -ne 0) { throw 'Exact current actual private bytes or four-token predecessor link denied under Publisher.' }
        $actual = ($actualText | Out-String) | ConvertFrom-Json -AsHashtable
        $head = (Read-C035Git @('rev-parse','HEAD') | Out-String).Trim()
        $remote = @(Read-C035Git @('ls-remote','origin','refs/heads/main'))
        if ($remote.Count -ne 1 -or ($remote[0] -split '\s+')[0] -cne $head) {
            throw 'Actual HEAD must equal actual remote main under Publisher before stage; no ahead carry/reset/amend/force.'
        }
        $immediateHash = (Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($immediateHash -cne $authorization.currentPublisherSha256) { throw 'Actual private publisher changed immediately before standard delegation.' }
        $message = '[C035][D] Classify local originals without incomplete/cancel-request success; BDD/TDD, retained failures, current read-only context, hermetic foreign-index guard, per-file 85/85/85 coverage and signed Edge proof'
        $guarded = Invoke-C035ForeignPreserved $root {
            $publishedText = & $publisher -CardId C035 -WorkerId worker-C035 -Paths @('capability\C035') -Message $message
            ($publishedText | Out-String) | ConvertFrom-Json -AsHashtable
        }
        $publication = $guarded.result
        if ($publication.cardId -cne 'C035' -or $publication.workerId -cne 'worker-C035' -or
            $publication.remoteVerified -isnot [bool] -or $publication.remoteVerified -ne $true -or
            $publication.remotePeeledTag -cne $publication.commit) { throw 'Exact complete standard publication proof is missing.' }
        if ((Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant() -cne $immediateHash) { throw 'Private publisher bytes changed during delegation.' }
        $proofText = & node (Join-Path $PSScriptRoot 'tests\publication-proof.cjs') $publication.commit $publication.tag
        if ($LASTEXITCODE -ne 0) { throw 'Published own raw/canonical/remote proof failed; no success report inferred.' }
        return [ordered]@{
            publication=$publication;proof=(($proofText | Out-String) | ConvertFrom-Json -AsHashtable)
            currentAuthorizationSnapshot=$snapshot;actualPublisherAssessment=$actual
            actualHashRecheckedUnderPublisher=$true;headEqualActualRemoteBeforeStage=$true
            noStateReadUnderPublisher=$true;foreignStagedBefore=$guarded.before;foreignStagedAfter=$guarded.after
            foreignEntriesAndFlagsUnchanged=$true
        }
    } finally {
        if ($held) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
$result = [ordered]@{
    cardId='C035';workerId='worker-C035';outcome='published'
    commit=$transport.result.publication.commit;tag=$transport.result.publication.tag
    remoteMain=$transport.result.publication.remoteMain;remotePeeledTag=$transport.result.publication.remotePeeledTag
    remoteVerified=$true;publication=$transport.result.publication;proof=$transport.result.proof
    currentAuthority=$transport.result.currentAuthorizationSnapshot
    actualPublisherAssessment=$transport.result.actualPublisherAssessment
    publisherSerialization=[ordered]@{stateReadFirstAndClosedBeforePublisher=$true;actualBytesRecheckedUnderPublisher=$true;headEqualRemoteBeforeStage=$true;noStateReadUnderPublisher=$true}
    foreignIndex=[ordered]@{before=$transport.result.foreignStagedBefore;after=$transport.result.foreignStagedAfter;entriesAndFlagsUnchanged=$true}
    processTransport=$transport.restoration
    focusedTestsPassed=$true;browserObserved=$true;acceptancePending=$true
    originalUnit='C035';originalKano='D';maximumOriginalCredits=1;extraCredits=0
    IaC='N/A';parentsCompleted=$false;nativeCancellationOrAuthLeaseQueueAuthority=$false;productionNode24Validated=$false
    actualUserMutationSuccess=$false;actualCancellationPerformed=$false
}
[Console]::WriteLine(('C035_PUBLICATION_RESULT_JSON=' + ($result | ConvertTo-Json -Depth 50 -Compress)))
