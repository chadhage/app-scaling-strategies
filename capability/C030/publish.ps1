$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'Exact deliberate one-original publication only; no overrides.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ((Get-Location).Path -cne $root) { throw 'Actual checked-out repository root is required.' }
. (Join-Path $PSScriptRoot 'transport.ps1')
& node -e "require('.\\capability\\C030\\source.cjs').preflight();"
if ($LASTEXITCODE -ne 0) { throw 'Read-only source/gate preflight failed before any Publisher acquisition.' }
$accepted = ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'imports.json')) | ConvertFrom-Json -AsHashtable).accepted
$stateMutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$stateHeld = $false
try {
    $stateHeld = $stateMutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $stateHeld) { throw 'State timeout; no cached authority.' }
    $ledgerBytes = [IO.File]::ReadAllBytes((Join-Path $root '.docs\wiki\flow-state.json'))
    $ledger = [Text.Encoding]::UTF8.GetString($ledgerBytes) | ConvertFrom-Json -AsHashtable
    $card = @($ledger.cards | Where-Object id -eq 'C030')
    $worker = @($ledger.workers | Where-Object id -eq 'worker-C030')
    if ($card.Count -ne 1 -or $worker.Count -ne 1 -or $card[0].state -cne 'In Progress' -or
        $card[0].owner -cne 'worker-C030' -or $worker[0].status -cne 'running' -or $worker[0].cardId -cne 'C030' -or
        $card[0].kano -cne 'D' -or $card[0].kanoUnit -cne 'C030' -or $card[0].priority -cne 'P0' -or
        $card[0].packet -cne 'H006' -or ($card[0].parents -join ',') -cne 'H006,H012' -or
        $card[0].technicalEntryGate -cne 'C023, C029' -or
        $card[0].deliver -cne 'Detect missing/duplicate business effects; verify one intended effect remains distinct from delivery retries.') {
        throw 'Current exact original claimed owner/class/path identity required before staging.'
    }
    $row = '| C030 | H006, H012 | D | Detect missing/duplicate business effects; verify one intended effect remains distinct from delivery retries. | C023, C029 |'
    if (@([IO.File]::ReadAllLines((Join-Path $root '.docs\wiki\kanban.md')) | Where-Object { $_ -ceq $row }).Count -ne 1) {
        throw 'Exact frozen original kanban row required.'
    }
    foreach ($id in @('C023', 'C029')) {
        $gate = @($ledger.cards | Where-Object id -eq $id)
        if ($gate.Count -ne 1 -or $gate[0].state -cne 'Done' -or
            $gate[0].publication.commit -cne $accepted[$id].commit -or $gate[0].publication.tag -cne $accepted[$id].tag -or
            $gate[0].review.commit -cne $accepted[$id].commit -or $gate[0].review.tag -cne $accepted[$id].tag) { throw 'Exact independent Done gates required.' }
        foreach ($field in @('accepted','focusedTestsPassed','browserObserved','remoteVerified')) {
            if ($gate[0].review[$field] -isnot [bool] -or $gate[0].review[$field] -ne $true) { throw 'Actual boolean independent acceptance required.' }
        }
    }
    $a = $ledger.localPublisherAuthorization
    $authorization = [ordered]@{}
    foreach ($key in @('id','approvedBy','publisherSha256','focusedGuardChecksPassed','mainMustEqualRemoteBeforeStaging',
        'namespaceAndFrozenClassGuardsUnchanged','syntaxPassed','originalKanoCredit','cloudAuthorityExpanded')) { $authorization[$key] = $a[$key] }
    $revision = [ordered]@{}
    foreach ($key in @('publisherSha256','previousPublisherSha256','focusedGuardChecksPassed','extraCredits',
        'cloudIdentityOrInfrastructureAuthorityExpanded','ownedNamespaces','exactAddedClasses','approvedBy',
        'onlyFourExactClassTokensChanged','namespaceFrozenClassAdminHeadWhitespaceAndTransportRulesUnchanged')) {
        $revision[$key] = $a.classificationAndInspectionRevision[$key]
    }
    $authorization.classificationAndInspectionRevision = $revision
    $observedAtUtc = [DateTime]::UtcNow.ToString('o')
    $ledgerRevision = $ledger.revision
    $ledgerRawWorkingSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($ledgerBytes)).ToLowerInvariant()
} finally {
    if ($stateHeld) { $stateMutex.ReleaseMutex() }
    $stateMutex.Dispose()
}
$authorizationText = $authorization | ConvertTo-Json -Depth 12 -Compress
$allowedText = $authorizationText | & node (Join-Path $PSScriptRoot 'tests\authorize-publication.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Unknown or unauthorized current canonical publisher revision denied before staging.' }
$allowed = ($allowedText | Out-String) | ConvertFrom-Json -AsHashtable
if ($allowed.allowed -isnot [bool] -or $allowed.allowed -ne $true -or $allowed.cardId -cne 'C030' -or
    $allowed.workerId -cne 'worker-C030' -or $allowed.frozenClass -cne 'D' -or $allowed.ownedNamespace -cne 'capability\C030') {
    throw 'No exact original publication authority.'
}
function Read-C030PrivatePublisherHash {
    foreach ($relative in @('.git', '.git\kanban-orchestrator', '.git\kanban-orchestrator\publish.ps1', 'capability', 'capability\C030')) {
        if (([IO.File]::GetAttributes((Join-Path $root $relative)) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked publisher or owned namespace denied.' }
    }
    $bytes = [IO.File]::ReadAllBytes((Join-Path $root '.git\kanban-orchestrator\publish.ps1'))
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}
function Read-C030Git([string[]]$Arguments) {
    $output = & git --no-pager @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Read-only Git failed: $($output -join [Environment]::NewLine)" }
    return $output
}
function Read-C030ForeignIndex {
    $json = & node (Join-Path $PSScriptRoot 'tests\index-snapshot.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot qualify exact foreign index entries and flags; nothing cleaned.' }
    return (($json | Out-String) | ConvertFrom-Json -AsHashtable)
}
$publisherMutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$publisherHeld = $false
try {
    $publisherHeld = $publisherMutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $publisherHeld) { throw 'Publisher timeout; no lock cleanup or guard bypass.' }
    $actualBefore = Read-C030PrivatePublisherHash
    if ($actualBefore -cne $allowed.publisherSha256) { throw 'Actual CURRENT private bytes disagree with CURRENT canonical approved hash before any staging.' }
    $transport = Invoke-C030Http11 {
        if ((Read-C030Git @('branch','--show-current') | Out-String).Trim() -cne 'main') { throw 'Checked-out main required.' }
        $head = (Read-C030Git @('rev-parse','HEAD') | Out-String).Trim()
        $remote = @(Read-C030Git @('ls-remote','origin','refs/heads/main'))
        if ($remote.Count -ne 1 -or ($remote[0] -split '\s+')[0] -cne $head) {
            throw 'Actual HEAD must equal actual remote main under Publisher BEFORE staging. No unqualified ancestor carry/reset/amend/force.'
        }
        if (@(Read-C030Git @('ls-files','--unmerged')).Count -ne 0) { throw 'Actual unmerged entries block publication; ordinary staged C048 M does not.' }
        $before = Read-C030ForeignIndex
        $message = '[C030][D] Detect scoped missing and duplicate effects without delivery retry success; pure-model, fictional-negative, BDD/TDD and signed Edge proof'
        $text = & (Join-Path $root '.git\kanban-orchestrator\publish.ps1') -CardId C030 -WorkerId worker-C030 -Paths @('capability\C030') -Message $message
        $publication = ($text | Out-String) | ConvertFrom-Json -AsHashtable
        if ($publication.cardId -cne 'C030' -or $publication.workerId -cne 'worker-C030' -or
            $publication.remoteVerified -isnot [bool] -or $publication.remoteVerified -ne $true -or
            $publication.commit -cnotmatch '^[0-9a-f]{40}$' -or $publication.remotePeeledTag -cne $publication.commit -or
            $publication.tag -cne "kanban/C030/$($publication.commit.Substring(0,12))") { throw 'Unchanged standard publisher did not return exact full publication proof.' }
        if ((Read-C030PrivatePublisherHash) -cne $actualBefore) { throw 'Private publisher bytes changed during unchanged delegation.' }
        $after = Read-C030ForeignIndex
        if ($after.sha256 -cne $before.sha256 -or $after.entryCount -ne $before.entryCount) {
            throw 'Foreign entries or flags differ. No cleanup or unowned restoration is authorized.'
        }
        $proofText = & node (Join-Path $PSScriptRoot 'tests\publication-proof.cjs') $publication.commit $publication.tag
        if ($LASTEXITCODE -ne 0) { throw 'Actual raw/canonical/remote qualification failed; do not infer success.' }
        $proof = ($proofText | Out-String) | ConvertFrom-Json -AsHashtable
        return [ordered]@{
            publication = $publication; proof = $proof; headEqualRemoteBeforeStaging = $head
            foreignIndex = [ordered]@{ beforeSha256 = $before.sha256; afterSha256 = $after.sha256; entryCount = $before.entryCount
                entriesAndAllObservedFlagsPreserved = $true; flagsCovered = $before.flagsCovered; ordinaryStagedModificationIsNotUnmerged = $true }
        }
    }
    if ($transport.output.Count -ne 1) { throw 'Unexpected publication output; no synthetic report.' }
    $transaction = $transport.output[0]
    $result = [ordered]@{
        cardId = 'C030'; workerId = 'worker-C030'; outcome = 'published'; kano = 'D'; originalUnits = 1; extraCredits = 0
        commit = $transaction.publication.commit; tag = $transaction.publication.tag; remoteVerified = $true
        publication = $transaction.publication; rawCanonicalQualification = $transaction.proof
        currentAuthorization = [ordered]@{ observedAtUtc = $observedAtUtc; ledgerRevision = $ledgerRevision
            ledgerRawWorkingSha256 = $ledgerRawWorkingSha256; actualPrivateSha256 = $actualBefore; canonicalApproval = $authorization
            stateReleasedBeforePublisher = $true; unknownHashDeniedBeforeStaging = $true }
        headEqualRemoteBeforeStaging = $transaction.headEqualRemoteBeforeStaging; foreignIndex = $transaction.foreignIndex
        transportProof = $transport.transportProof; stateAcquiredUnderPublisher = $false
        parentAcceptanceRequired = $true; parentsH006H012Complete = $false; nativeProof = $false; productionNode24Validated = $false
    }
} finally {
    if ($publisherHeld) { $publisherMutex.ReleaseMutex() }
    $publisherMutex.Dispose()
}
[Console]::WriteLine('C030_PUBLICATION_RESULT ' + ($result | ConvertTo-Json -Depth 35 -Compress))
