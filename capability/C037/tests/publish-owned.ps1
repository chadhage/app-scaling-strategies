$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1') { throw 'Exact explicit own publication capture only.' }
$repository=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
if((Get-Location).Path -cne $repository){throw 'Exact main workspace required.'}
$root=Join-Path $repository 'capability\C037'
$directory=[IO.Path]::GetFullPath($env:C037_CAPTURE_DIR)
if([IO.Path]::GetDirectoryName($directory) -cne (Join-Path $root 'evidence\raw') -or
    [IO.Path]::GetFileName($directory) -notmatch '^publication-[0-9a-f-]{36}$' -or
    (Get-ChildItem -LiteralPath $directory -Force).Count -ne 0){throw 'Unique newly empty own publication raw directory required.'}
function Write-NewJson([string]$Name,$Value){
    if($Name -notmatch '^[a-z-]+\.json$'){throw 'Closed own proof name required.'}
    $stream=[IO.File]::Open((Join-Path $directory $Name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($Value|ConvertTo-Json -Depth 40)+[Environment]::NewLine);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
function Unowned-Index {
    $lines=@(& git --no-pager -c core.quotepath=false ls-files --stage --debug)
    if($LASTEXITCODE -ne 0){throw 'Read-only unowned index entries/flags unavailable.'}
    $entries=[Collections.Generic.List[object]]::new();$pending=$null
    foreach($line in $lines){
        if($line -match '^([0-7]{6}) ([0-9a-f]{40}) ([0-3])\t(.+)$'){
            if($pending){throw 'Incomplete index entry.'}
            $pending=[ordered]@{mode=$Matches[1];blob=$Matches[2];stage=$Matches[3];path=$Matches[4]}
        }elseif($line -match '^\s*size:\s+\d+\s+flags:\s+([0-9a-fA-F]+)\s*$'){
            if(-not $pending){throw 'Index flags without entry.'}
            $pending.flags=$Matches[1].ToLowerInvariant()
            if(-not $pending.path.StartsWith('capability/C037/',[StringComparison]::Ordinal)){$entries.Add($pending)}
            $pending=$null
        }
    }
    if($pending){throw 'Unfinished index entry.'}
    $bytes=[Text.UTF8Encoding]::new($false).GetBytes(($entries.ToArray()|ConvertTo-Json -Depth 5 -Compress))
    return [ordered]@{entries=$entries.Count;sha256=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
        ordinaryForeignC048=@($entries|Where-Object {$_.path -ceq 'capability/C048/evidence/red/replay.cjs.txt'})}
}
$canonicalJson=& node -e "process.stdout.write(JSON.stringify(require('.\\capability\\C037\\authority.cjs').readCurrent()));"
if($LASTEXITCODE -ne 0){throw 'Current top canonical State approval unavailable; no staging.'}
$canonical=($canonicalJson|Out-String)|ConvertFrom-Json -AsHashtable
if($canonical.assessment.approved -ne $true -or $canonical.assessment.delegationReady -ne $true){throw 'Current exact original C037 delegation is not approved/ready; no staging.'}
$publisher=Join-Path $repository '.git\kanban-orchestrator\publish.ps1'
$mutex=[Threading.Mutex]::new($false,'Local\AppScalingStrategies_KanbanPublisher_v1')
$held=$false
try{
    $held=$mutex.WaitOne([TimeSpan]::FromSeconds(180))
    if(-not $held){throw 'Publisher timed out; no lock removal or guard bypass.'}
    $actual=(Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -cne $canonical.assessment.authorizedSha256){throw 'Actual private CURRENT publisher bytes lack exact current approval; no staging.'}
    $head=(& git --no-pager rev-parse HEAD|Out-String).Trim()
    if($LASTEXITCODE -ne 0){throw 'Actual HEAD unavailable.'}
    $branch=(& git --no-pager branch --show-current|Out-String).Trim()
    if($LASTEXITCODE -ne 0){throw 'Branch unavailable.'}
    $remote=@(& git --no-pager ls-remote origin refs/heads/main)
    if($LASTEXITCODE -ne 0 -or $remote.Count -ne 1){throw 'Exact actual remote main unavailable.'}
    $remoteMain=("$($remote[0])" -split '\s+')[0]
    if($branch -cne 'main' -or $head -cne $remoteMain){throw 'Actual HEAD must equal remote under Publisher before staging; no carry/reset/amend/force.'}
    $before=Unowned-Index
    $boundary=[ordered]@{cardId='C037';workerId='worker-C037';actualPublisherSha256=$actual
        currentCanonicalSource='.docs\wiki\flow-state.json.localPublisherAuthorization';currentCanonicalSnapshot=$canonical.snapshot
        publisherMutexHeld=$true;stateReleasedBeforePublisher=$true;stateAcquiredUnderPublisher=$false
        nestedRevisionsAreHistoricalNotCurrentAuthority=$true;preStagingHead=$head;preStagingRemoteMain=$remoteMain
        unownedIndexBefore=$before;observedAtUtc=[DateTime]::UtcNow.ToString('o')}
    Write-NewJson 'publisher-boundary.json' $boundary
    if((Get-FileHash -LiteralPath $publisher -Algorithm SHA256).Hash.ToLowerInvariant() -cne $canonical.assessment.authorizedSha256){
        throw 'Private bytes changed immediately before standard delegation; no staging.'
    }
    $output=@(& $publisher -CardId C037 -WorkerId worker-C037 -Paths @('capability\C037') -Message '[C037][S][BDD-TDD-IaC-N/A] Compare requested policy with measured destinations; historical unlinked HOLD and fictional controls; retained denominators, identity/replay guards and signed Edge proof')
    $after=Unowned-Index
    if($before.entries -ne $after.entries -or $before.sha256 -cne $after.sha256){throw 'Foreign index entries or flags changed; stop without cleanup or repair.'}
    $publication=($output|Out-String)|ConvertFrom-Json -AsHashtable
    if($publication.cardId -cne 'C037' -or $publication.workerId -cne 'worker-C037' -or
        $publication.remoteVerified -ne $true -or $publication.commit -notmatch '^[0-9a-f]{40}$' -or
        $publication.tag -cne "kanban/C037/$($publication.commit.Substring(0,12))"){throw 'Exact standard annotated remote publication receipt missing.'}
    $qualificationJson=& node (Join-Path $PSScriptRoot 'qualify.cjs') $publication.commit $publication.tag
    if($LASTEXITCODE -ne 0){throw 'Actual current raw/Git canonical or remote qualification failed; do not report Done.'}
    $qualification=($qualificationJson|Out-String)|ConvertFrom-Json -AsHashtable
    Write-NewJson 'qualification.json' $qualification
    $publication.publisherBoundary=$boundary
    $publication.unownedIndexAfter=$after
    $publication.unownedIndexEntriesAndFlagsUnchanged=$true
    $publication.qualification=$qualification
    $publication.parentOnlyAcceptance=$true
    $publication.originalSProposed=1
    $publication.extraTestRepairCredits=0
    Write-NewJson 'receipt.json' $publication
    [Console]::WriteLine(($publication|Select-Object cardId,workerId,commit,tag,remoteMain,remotePeeledTag,remoteVerified,unownedIndexEntriesAndFlagsUnchanged|ConvertTo-Json -Depth 5 -Compress))
}finally{if($held){$mutex.ReleaseMutex()};$mutex.Dispose()}
