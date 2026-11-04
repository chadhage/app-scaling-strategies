$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'One deliberate exact C029 publication only; no arguments or overrides.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ((Get-Location).Path -ne $root) { throw 'Publication requires this actual checked-out repository root.' }
$ledgerPath = Join-Path $root '.docs\wiki\flow-state.json'
$publisherPath = Join-Path $root '.git\kanban-orchestrator\publish.ps1'
$accepted = ([IO.File]::ReadAllText((Join-Path $PSScriptRoot 'imports.json')) | ConvertFrom-Json -AsHashtable).accepted
$stateMutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanState_v1')
$stateHeld = $false
try {
    $stateHeld = $stateMutex.WaitOne([TimeSpan]::FromSeconds(30))
    if (-not $stateHeld) { throw 'State mutex timeout; no cached authorization fallback.' }
    $ledgerBytes = [IO.File]::ReadAllBytes($ledgerPath)
    $ledger = [Text.Encoding]::UTF8.GetString($ledgerBytes) | ConvertFrom-Json -AsHashtable
    $card = @($ledger.cards | Where-Object id -eq 'C029')
    $worker = @($ledger.workers | Where-Object id -eq 'worker-C029')
    if ($card.Count -ne 1 -or $worker.Count -ne 1 -or $card[0].state -ne 'In Progress' -or
        $card[0].owner -ne 'worker-C029' -or $worker[0].status -ne 'running' -or $worker[0].cardId -ne 'C029' -or
        $card[0].kano -ne 'D' -or $card[0].priority -ne 'P0' -or $card[0].packet -ne 'H001' -or
        ($card[0].parents -join ',') -ne 'H001,H006,H012' -or $card[0].technicalEntryGate -ne 'C020, C023, C033' -or
        $card[0].deliver -ne 'Evaluate journey outcomes against original latency/state budgets; injected failures cannot pass through retries.') {
        throw 'Exactly one freshly claimed original C029 D/P0/H001 is required.'
    }
    $exactRow = '| C029 | H001, H006, H012 | D | Evaluate journey outcomes against original latency/state budgets; injected failures cannot pass through retries. | C020, C023, C033 |'
    if (@([IO.File]::ReadAllLines((Join-Path $root '.docs\wiki\kanban.md')) | Where-Object { $_ -ceq $exactRow }).Count -ne 1) {
        throw 'The exact frozen original kanban C029 row must remain unchanged.'
    }
    foreach ($id in @('C020','C023','C033')) {
        $gate = @($ledger.cards | Where-Object id -eq $id)
        if ($gate.Count -ne 1 -or $gate[0].state -ne 'Done' -or
            $gate[0].publication.commit -cne $accepted[$id].commit -or $gate[0].publication.tag -cne $accepted[$id].tag -or
            $gate[0].review.commit -cne $accepted[$id].commit -or $gate[0].review.tag -cne $accepted[$id].tag) {
            throw 'Original independent Done gates required.'
        }
        foreach ($field in @('accepted','focusedTestsPassed','browserObserved','remoteVerified')) {
            if ($gate[0].review[$field] -isnot [bool] -or $gate[0].review[$field] -ne $true) {
                throw 'Every independent acceptance field must be an actual boolean true.'
            }
        }
    }
    $consent = $ledger.approvals.C001.designAndLocalImplementationApproved
    if ($consent -isnot [bool] -or $consent -ne $true) { throw 'Current literal true local design consent required.' }
    $a = $ledger.localPublisherAuthorization
    $r = $a.budgetAndGoalRevision
    $authorization = [ordered]@{
        id = $a.id; approvedBy = $a.approvedBy; publisherSha256 = $a.publisherSha256
        focusedGuardChecksPassed = $a.focusedGuardChecksPassed
        mainMustEqualRemoteBeforeStaging = $a.mainMustEqualRemoteBeforeStaging
        namespaceAndFrozenClassGuardsUnchanged = $a.namespaceAndFrozenClassGuardsUnchanged
        syntaxPassed = $a.syntaxPassed; originalKanoCredit = $a.originalKanoCredit
        cloudAuthorityExpanded = $a.cloudAuthorityExpanded
        budgetAndGoalRevision = [ordered]@{
            publisherSha256 = $r.publisherSha256; previousPublisherSha256 = $r.previousPublisherSha256
            focusedGuardChecksPassed = $r.focusedGuardChecksPassed
            namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained = $r.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained
            cloudIdentityOrInfrastructureAuthorityExpanded = $r.cloudIdentityOrInfrastructureAuthorityExpanded
            onlyTwoExactClassTokensChanged = $r.onlyTwoExactClassTokensChanged
            approvedBy = $r.approvedBy; exactAddedClasses = $r.exactAddedClasses
            ownedNamespaces = $r.ownedNamespaces; extraCredits = $r.extraCredits
        }
    }
    $authorizationObservedAtUtc = [DateTime]::UtcNow.ToString('o')
    $ledgerRawSha256 = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($ledgerBytes)).ToLowerInvariant()
    $ledgerRevision = $ledger.revision
} finally {
    if ($stateHeld) { $stateMutex.ReleaseMutex() }
    $stateMutex.Dispose()
}
$authorizationJson = $authorization | ConvertTo-Json -Depth 12 -Compress
$allowedText = $authorizationJson | & node (Join-Path $PSScriptRoot 'tests\authorize-publication.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Current canonical parent publication authorization was not recognized; unknown new hash fails closed.' }
$allowed = ($allowedText | Out-String) | ConvertFrom-Json -AsHashtable
if ($allowed.allowed -isnot [bool] -or $allowed.allowed -ne $true) { throw 'No publication authority was granted.' }
function Read-ActualPublisherHash {
    foreach ($file in @((Join-Path $root '.git'), (Join-Path $root '.git\kanban-orchestrator'), $publisherPath)) {
        if (([IO.File]::GetAttributes($file) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked private publisher is not authorized.' }
    }
    $bytes = [IO.File]::ReadAllBytes($publisherPath)
    return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}
function Git-Read([string[]]$Arguments) {
    $output = & git --no-pager @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Read-only git failed: $($output -join [Environment]::NewLine)" }
    return $output
}
$publisherMutex = [Threading.Mutex]::new($false, 'Local\AppScalingStrategies_KanbanPublisher_v1')
$publisherHeld = $false
try {
    $publisherHeld = $publisherMutex.WaitOne([TimeSpan]::FromSeconds(180))
    if (-not $publisherHeld) { throw 'Publisher mutex timeout; no lock cleanup or bypass.' }
    $actualBefore = Read-ActualPublisherHash
    if ($actualBefore -cne $allowed.publisherSha256) { throw 'Actual current private bytes differ from current canonical approved history before delegation.' }
    $head = (Git-Read @('rev-parse','HEAD') | Out-String).Trim()
    $remote = @(Git-Read @('ls-remote','origin','refs/heads/main'))
    if ($remote.Count -ne 1 -or ($remote[0] -split '\s+')[0] -cne $head) {
        throw 'Actual HEAD must equal actual remote main under publisher mutex before any staging. No ahead carry/reset/amend/force.'
    }
    $foreignStagedBefore = @(Git-Read @('diff','--cached','--name-only') | Where-Object { $_ -notmatch '^capability/C029/' })
    $message = '[C029][D] Evaluate original local latency/state budgets without retry laundering; historical sources, pure model, BDD/TDD and signed Edge proof'
    $publishedText = & $publisherPath -CardId C029 -WorkerId worker-C029 -Paths @('capability\C029') -Message $message
    $publication = ($publishedText | Out-String) | ConvertFrom-Json -AsHashtable
    if ($publication.cardId -ne 'C029' -or $publication.workerId -ne 'worker-C029' -or
        $publication.remoteVerified -isnot [bool] -or $publication.remoteVerified -ne $true -or
        $publication.remotePeeledTag -cne $publication.commit) {
        throw 'Standard publisher did not return exact complete original publication proof.'
    }
    $actualAfter = Read-ActualPublisherHash
    if ($actualAfter -cne $actualBefore) { throw 'Private publisher bytes changed during guarded delegation.' }
    $proofText = & node (Join-Path $PSScriptRoot 'tests\publication-proof.cjs') $publication.commit $publication.tag
    if ($LASTEXITCODE -ne 0) { throw 'Published own raw/Git/remote/proof verification failed; no success report inferred.' }
    $proof = ($proofText | Out-String) | ConvertFrom-Json -AsHashtable
    $foreignStagedAfter = @(Git-Read @('diff','--cached','--name-only') | Where-Object { $_ -notmatch '^capability/C029/' })
    [ordered]@{
        cardId = 'C029'; workerId = 'worker-C029'; outcome = 'published'
        kano = 'D'; priority = 'P0'; packet = 'H001'; parents = @('H001','H006','H012')
        commit = $publication.commit; tag = $publication.tag; publication = $publication; proof = $proof
        currentPublicationAuthorization = [ordered]@{
            observedAtUtc = $authorizationObservedAtUtc; ledgerRevision = $ledgerRevision
            ledgerRawSha256 = $ledgerRawSha256; canonicalAuthorization = $authorization
            stateReadHandlesClosedBeforePublisherMutex = $true
            actualPrivateBytesBefore = $actualBefore; actualPrivateBytesAfter = $actualAfter
            checkedInsidePublisherMutex = $true; actualHeadEqualsRemoteBeforeStage = $true; headBefore = $head
            unchangedStandardDelegation = $true; foreignStagedBefore = $foreignStagedBefore; foreignStagedAfter = $foreignStagedAfter
        }
        originalCreditRequested = 1; extraTestRepairRefinementCredits = 0; selfAccepted = $false
        fullParentsCompleted = $false; nativeQualified = $false; productionNode24Validated = $false
        userJourneySuccess = $false; reliabilityCertified = $false
        iac = 'N/A'; liveAzureRuns = 0; authorizedSpend = 0
    } | ConvertTo-Json -Depth 40
} finally {
    if ($publisherHeld) { $publisherMutex.ReleaseMutex() }
    $publisherMutex.Dispose()
}
