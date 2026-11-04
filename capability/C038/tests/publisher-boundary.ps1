$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No source, identity or path overrides accepted.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$root = Join-Path $repository 'capability\C038'
$boundary = [IO.File]::ReadAllText((Join-Path $root 'publisher-boundary.json')) | ConvertFrom-Json -AsHashtable
if ($boundary.role -cne 'archived-authorized-guard-fixture-not-current-authority' -or
    $boundary.source -notmatch '^evidence\\raw\\archive-[0-9a-f-]{36}\\publisher\.ps1\.snapshot$') { throw 'Only the immutable own archived guard fixture is accepted.' }
$bytes = [IO.File]::ReadAllBytes((Join-Path $root $boundary.source))
$sha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
if ($sha -cne $boundary.sourceSha256 -or $sha -cne '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811') { throw 'Archived publisher fixture changed.' }
$source = [Text.Encoding]::UTF8.GetString($bytes)
$publisher = [ScriptBlock]::Create($source)
$checks = [Collections.Generic.List[object]]::new()
$global:C038GuardCalls = [Collections.Generic.List[string]]::new()
$global:C038GuardMode = 'boundary'
$oldFunction = Get-Item Function:\git -ErrorAction SilentlyContinue
$oldLocation = Get-Location
function global:git {
    $global:C038GuardCalls.Add(($args -join '|'))
    $global:LASTEXITCODE = 0
    if ($global:C038GuardMode -eq 'boundary') { throw 'C038_INTERCEPT_BEFORE_ANY_REAL_GIT' }
    if ($args[0] -eq 'branch') { if ($global:C038GuardMode -eq 'non-main') { return 'topic/not-main' }; return 'main' }
    if ($args[0] -eq 'rev-parse') { return '0123456789abcdef0123456789abcdef01234567' }
    if ($args[0] -eq 'ls-remote') { return "abcdef0123456789abcdef0123456789abcdef01`trefs/heads/main" }
    throw 'UNEXPECTED_OPERATION_TEST_REFUSES_EVERY_GIT_WRITE'
}
function Check([string]$Name,[bool]$Passed,$Observed) {
    $checks.Add([ordered]@{name=$Name;passed=$Passed;observed=$Observed})
    if (-not $Passed) { throw "Archived publisher guard failed: $Name; $($Observed|ConvertTo-Json -Depth 6 -Compress)" }
}
function Boundary([string]$Name,[string[]]$Paths,[bool]$Allowed,
    [string]$Card='C038',[string]$Class='S',[switch]$Admin,[string]$Message) {
    $global:C038GuardMode='boundary'
    $global:C038GuardCalls.Clear()
    $failure=''
    if (-not $Message) { $Message=if($Admin){'[flow][admin][test] scoped guards'}else{"[$Card][$Class][test] scoped guards"} }
    try { & $publisher -CardId $Card -WorkerId worker-C038 -Paths $Paths -Message $Message -Admin:$Admin | Out-Null }
    catch { $failure=$_.Exception.Message }
    $passed=if($Allowed){
        $global:C038GuardCalls.Count -eq 1 -and $failure -like '*C038_INTERCEPT_BEFORE_ANY_REAL_GIT*'
    }else{
        $global:C038GuardCalls.Count -eq 0 -and $failure -ne '' -and $failure -notlike '*C038_INTERCEPT_BEFORE_ANY_REAL_GIT*'
    }
    Check $Name $passed ([ordered]@{interceptedGitCalls=$global:C038GuardCalls.Count;error=$failure})
}
$scratch=Join-Path $PSScriptRoot ('scratch\publisher-'+[Guid]::NewGuid().ToString('N'))
$created=[Collections.Generic.Dictionary[string,string]]::new()
$directories=[Collections.Generic.List[string]]::new()
function Create-Bytes([string]$Path,[byte[]]$Bytes) {
    $stream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$stream.Write($Bytes,0,$Bytes.Length)}finally{$stream.Dispose()}
    $created.Add($Path,[Convert]::ToBase64String($Bytes))
}
try {
    Set-Location -LiteralPath $repository
    Boundary '1 exact C038 frozen S namespace allowed' @('capability\C038') $true
    Boundary '2 owned descendant allowed' @('capability\C038\tests\readiness.test.cjs') $true
    Boundary '3 canonical owned path allowed' @('capability\C038\checks\..\readiness.js') $true
    Boundary '4 multiple owned paths allowed' @('capability\C038\index.html','capability\C038\model.js') $true
    Boundary '5 wrong frozen D forbidden' @('capability\C038') $false -Class D
    Boundary '6 wrong frozen L forbidden' @('capability\C038') $false -Class L
    Boundary '7 wrong message identity forbidden' @('capability\C038') $false -Message '[C036][D] wrong identity'
    Boundary '8 unknown card forbidden' @('capability\C000') $false -Card C000
    Boundary '9 similar ID forbidden' @('capability\C038-other') $false -Card C038-other
    Boundary '10 native source card forbidden' @('native\S001') $false -Card B-S001
    $unowned=@('README.md','capability','capability\C015','capability\C034','capability\C036',
        'capability\C018','capability\C019','learning\S001','testing\browser','.docs\wiki\flow-state.json',
        '.git\kanban-orchestrator\publish.ps1','capability\C038-other','capability\C038\..\C015',
        'capability\C038\..\..\README.md')
    for($i=0;$i -lt $unowned.Count;$i++){Boundary "$($i+11) unowned rejected: $($unowned[$i])" @($unowned[$i]) $false}
    Boundary '25 absolute owned path forbidden' @((Join-Path $root 'index.html')) $false
    Boundary '26 absolute outside path forbidden' @((Join-Path $repository 'README.md')) $false
    Boundary '27 owned first path cannot conceal unowned second path' @('capability\C038','capability\C048') $false
    Boundary '28 Admin cannot publish capability' @('capability\C038') $false -Admin
    Boundary '29 Admin ledger boundary unchanged' @('.docs\wiki\flow-state.json') $true -Admin
    Boundary '30 Admin kanban boundary unchanged' @('.docs\wiki\kanban.md') $true -Admin
    Boundary '31 Admin README forbidden' @('README.md') $false -Admin
    Boundary '32 Admin wrong message forbidden' @('.docs\wiki\flow-state.json') $false -Admin -Message '[C038][S] escape'
    foreach($mode in @('non-main','head-mismatch')){
        $global:C038GuardMode=$mode;$global:C038GuardCalls.Clear();$failure=''
        try{& $publisher -CardId C038 -WorkerId worker-C038 -Paths @('capability\C038') -Message '[C038][S][test] pre-stage'|Out-Null}
        catch{$failure=$_.Exception.Message}
        if($mode -eq 'non-main'){
            Check '33 non-main fails before staging' ($global:C038GuardCalls.Count -eq 1 -and $failure -like '*requires checked-out main*') @($global:C038GuardCalls)
        }else{
            Check '34 HEAD unequal remote fails before staging' ($global:C038GuardCalls.Count -eq 3 -and $failure -like '*equal remote before staging*') @($global:C038GuardCalls)
        }
    }
    $tokens=$null;$errors=$null
    $null=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
    $protocol=$errors.Count -eq 0 -and $source -match "C038='S'" -and
        $source -match "'commit','--only'" -and $source -match 'Co-authored-by: Copilot' -and
        $source -match "'tag','-a'" -and $source -match "'push','--atomic'" -and
        $source -match "'merge-base','--is-ancestor'" -and
        $source.IndexOf('Main must already equal remote before staging') -lt $source.IndexOf("'add','--'") -and
        $source -match 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol'
    Check '35 syntax and unchanged scoped annotated atomic protocol' $protocol 'Actual archived AST; scoped --only, Copilot, annotated tag, atomic push, remote ancestry, local whitespace.'
    foreach($directory in @((Split-Path $scratch),$scratch)){
        if(-not(Test-Path -LiteralPath $directory)){[IO.Directory]::CreateDirectory($directory)|Out-Null;$directories.Add($directory)}
        if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No linked scratch'}
    }
    $empty=Join-Path $scratch 'empty.txt';Create-Bytes $empty ([byte[]]@())
    $cases=@(
        @{name='36 clean raw CRLF accepted';text="first`r`nsecond`r`n";allowed=$true},
        @{name='37 canonical LF accepted';text="first`nsecond`n";allowed=$true},
        @{name='38 real trailing space CRLF rejected';text="first `r`n";allowed=$false},
        @{name='39 real trailing tab CRLF rejected';text="first`t`r`n";allowed=$false},
        @{name='40 space-before-tab CRLF rejected';text=" `tfirst`r`n";allowed=$false},
        @{name='41 blank EOF CRLF rejected';text="first`r`n`r`n";allowed=$false}
    )
    $gitExe=(Get-Command git.exe).Source;$i=0
    foreach($case in $cases){
        $file=Join-Path $scratch "case-$i.txt";$i++
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes($case.text);Create-Bytes $file $bytes
        $output=@(& $gitExe --no-pager -c core.autocrlf=false -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --no-index --check -- $empty $file 2>&1)
        $exit=$LASTEXITCODE
        $same=[Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) -ceq [Convert]::ToBase64String($bytes)
        $passed=if($case.allowed){$exit -eq 1 -and $output.Count -eq 0 -and $same}else{$exit -gt 1 -and $output.Count -gt 0 -and $same}
        Check $case.name $passed ([ordered]@{exitCode=$exit;literalBytesPreserved=$same;output=($output -join [Environment]::NewLine)})
    }
    Boundary '42 accepted C029 D allowed' @('capability\C029') $true -Card C029 -Class D
    Boundary '43 C029 wrong S forbidden' @('capability\C029') $false -Card C029 -Class S
    Boundary '44 accepted X003 L allowed' @('capability\X003') $true -Card X003 -Class L
    Boundary '45 X003 wrong S forbidden' @('capability\X003') $false -Card X003 -Class S
    $i=46
    foreach($card in @('X001','X002','X004','X005','X006')){
        Boundary "$i unapproved delighter $card denied" @("capability\$card") $false -Card $card -Class L;$i++
    }
    $stripped=$source
    foreach($token in $boundary.exactFourClassTokens){$stripped=$stripped.Replace($token,'')}
    $predecessor=[IO.File]::ReadAllBytes((Join-Path $root $boundary.predecessor))
    $strippedBytes=[Text.UTF8Encoding]::new($false).GetBytes($stripped)
    $strippedSha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($strippedBytes)).ToLowerInvariant()
    Check '51 only four class-token removal reproduces exact historical 60AE' ($strippedSha -ceq $boundary.predecessorSha256 -and
        [Convert]::ToBase64String($strippedBytes) -ceq [Convert]::ToBase64String($predecessor)) $strippedSha
    Boundary '52 C030 frozen D admitted' @('capability\C030') $true -Card C030 -Class D
    Boundary '53 C030 wrong S denied' @('capability\C030') $false -Card C030 -Class S
    Boundary '54 C035 frozen D admitted' @('capability\C035') $true -Card C035 -Class D
    Boundary '55 C035 wrong S denied' @('capability\C035') $false -Card C035 -Class S
    Boundary '56 C037 frozen S admitted' @('capability\C037') $true -Card C037 -Class S
    Boundary '57 C037 wrong D denied' @('capability\C037') $false -Card C037 -Class D
    Boundary '58 C038 frozen S admitted' @('capability\C038') $true -Card C038 -Class S
    Boundary '59 C038 wrong D denied' @('capability\C038') $false -Card C038 -Class D
    Boundary '60 unapproved C039 denied' @('capability\C039') $false -Card C039 -Class S
    Boundary '61 class-shaped override prefix denied' @('capability\C038') $false -Message '[C038][S-override][test] forbidden'
    if($checks.Count -ne 61){throw 'Exactly 61 archived guard groups required'}
    [Console]::WriteLine(([ordered]@{
        cardId='C038';role=$boundary.role;historicalPublisherSha256=$sha
        count=$checks.Count;checks=@($checks);actualGitWrites=0
        whitespaceUsedRealGitNoIndex=$true;mutablePrivateSourceRead=$false
        mockedPublicationNotClaimed=$true
    }|ConvertTo-Json -Depth 10 -Compress))
} finally {
    if($oldFunction){Set-Item Function:\git $oldFunction.ScriptBlock}else{Remove-Item Function:\git -ErrorAction SilentlyContinue}
    Set-Location -LiteralPath $oldLocation
    foreach($entry in $created.GetEnumerator()){
        if(Test-Path -LiteralPath $entry.Key){
            if([Convert]::ToBase64String([IO.File]::ReadAllBytes($entry.Key)) -cne $entry.Value){throw 'Created scratch changed; refuse cleanup'}
            [IO.File]::Delete($entry.Key)
        }
    }
    foreach($directory in @($directories|Sort-Object Length -Descending)){
        if(Test-Path -LiteralPath $directory){[IO.Directory]::Delete($directory,$false)}
    }
    Remove-Variable C038GuardCalls,C038GuardMode -Scope Global -ErrorAction SilentlyContinue
}
