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
$publisherMutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanPublisher_v1')
$held=$false
function True-Boolean($Value) { return $Value -is [bool] -and $Value -eq $true }
function False-Boolean($Value) { return $Value -is [bool] -and $Value -eq $false }
try {
    $held=$publisherMutex.WaitOne([TimeSpan]::FromSeconds(180))
    if(-not $held){throw 'Publisher mutex timed out; no lock removal or bypass'}
    $stateMutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanState_v1')
    $stateHeld=$false
    try {
        $stateHeld=$stateMutex.WaitOne([TimeSpan]::FromSeconds(30))
        if(-not $stateHeld){throw 'Current parent state mutex timed out'}
        $ledger=[IO.File]::ReadAllText((Join-Path $repository '.docs\wiki\flow-state.json'))|ConvertFrom-Json -AsHashtable -Depth 80
        $authorization=$ledger.localPublisherAuthorization
        if($ledger.controllerId -ne '942b9aec-aa3f-4179-b6ed-e2bc57abeed2'){throw 'Current parent controller mismatch'}
        foreach($id in @('C015','C034')){
            $cards=@($ledger.cards|Where-Object{$_.id -eq $id})
            if($cards.Count -ne 1 -or $cards[0].state -ne 'Done' -or
                -not (True-Boolean $cards[0].review.accepted) -or -not (True-Boolean $cards[0].review.focusedTestsPassed) -or
                -not (True-Boolean $cards[0].review.browserObserved) -or -not (True-Boolean $cards[0].review.remoteVerified)){throw 'Independent current C015/C034 Done required'}
        }
        $card=@($ledger.cards|Where-Object{$_.id -eq 'C036'})
        if($card.Count -ne 1 -or $card[0].owner -ne 'worker-C036' -or $card[0].state -ne 'In Progress' -or $card[0].kano -ne 'D'){throw 'Original C036 owner/frozen D state mismatch'}
        $bytes=[IO.File]::ReadAllBytes($publisher)
        $actualSha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        $revision=$authorization.budgetAndGoalRevision
        if($authorization.approvedBy -cne 'parent-controller' -or $actualSha -cne $authorization.publisherSha256 -or
            $authorization.exactAddedClasses.C036 -cne 'D' -or
            -not (True-Boolean $authorization.mainMustEqualRemoteBeforeStaging) -or
            -not (True-Boolean $authorization.namespaceAndFrozenClassGuardsUnchanged) -or
            -not (False-Boolean $authorization.cloudAuthorityExpanded) -or $authorization.focusedGuardChecksPassed -lt 51 -or
            $revision.approvedBy -cne 'parent-controller' -or $revision.publisherSha256 -cne $actualSha -or
            $revision.exactAddedClasses.C029 -cne 'D' -or $revision.exactAddedClasses.X003 -cne 'L' -or
            -not (True-Boolean $revision.onlyTwoExactClassTokensChanged) -or
            -not (True-Boolean $revision.namespaceFrozenClassAdminHeadAndWhitespaceRulesRetained) -or
            -not (False-Boolean $revision.cloudIdentityOrInfrastructureAuthorityExpanded)){throw 'Current explicit canonical parent authorization does not cover actual publisher bytes'}
        $stripped=[Text.Encoding]::UTF8.GetString($bytes).Replace("; C029='D'",'').Replace("; X003='L'",'')
        $priorSha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.UTF8Encoding]::new($false).GetBytes($stripped))).ToLowerInvariant()
        if($priorSha -cne $revision.previousPublisherSha256 -or $priorSha -cne 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22'){throw 'Publisher changed beyond the exact two parent-authorized class tokens'}
        $boundary=[ordered]@{
            cardId='C036';workerId='worker-C036';actualPublisherSha256=$actualSha
            currentCanonicalAuthorizationSource='.docs\wiki\flow-state.json.localPublisherAuthorization.budgetAndGoalRevision'
            currentCanonicalAuthorization=$authorization;currentLedgerRevision=$ledger.revision
            publisherMutexHeld=$true;stateReadMutexHeld=$true;sourceHandlesClosedBeforeRelease=$true
            removingOnlyTwoClassTokensSha256=$priorSha;observedAtUtc=[DateTime]::UtcNow.ToString('o')
        }
    } finally {if($stateHeld){$stateMutex.ReleaseMutex()};$stateMutex.Dispose()}
    [IO.File]::WriteAllText((Join-Path $directory 'publisher-boundary-locked.json'),($boundary|ConvertTo-Json -Depth 20)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
    $output=@(& $publisher -CardId C036 -WorkerId worker-C036 -Paths @('capability\C036') -Message '[C036][D][BDD-TDD-IaC-N/A] guard current fictional attribution; missing correlation HOLD; 103 assertions, 51 publisher guards, 17 signed Edge groups')
    $publication=($output|Out-String)|ConvertFrom-Json -AsHashtable
    if($publication.remoteVerified -ne $true -or $publication.cardId -cne 'C036' -or
        $publication.workerId -cne 'worker-C036' -or $publication.commit -notmatch '^[0-9a-f]{40}$' -or
        $publication.tag -cne "kanban/C036/$($publication.commit.Substring(0,12))"){throw 'Standard publisher did not return a verified exact C036 publication'}
    $publication.publisherBoundary=$boundary
    $target=Join-Path $root 'publication.json'
    $stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $data=[Text.UTF8Encoding]::new($false).GetBytes(($publication|ConvertTo-Json -Depth 30)+[Environment]::NewLine)
        $stream.Write($data,0,$data.Length);$stream.Flush($true)
    } finally {$stream.Dispose()}
    [Console]::WriteLine(($publication|ConvertTo-Json -Depth 30))
} finally {if($held){$publisherMutex.ReleaseMutex()};$publisherMutex.Dispose()}
