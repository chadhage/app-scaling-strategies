$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No publisher or path overrides accepted.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$publisher = Join-Path $repository '.git\kanban-orchestrator\publish.ps1'
$source = [IO.File]::ReadAllText($publisher)
$script:checks = [Collections.Generic.List[object]]::new()
$global:C036PublisherGuardCalls = [Collections.Generic.List[string]]::new()
$global:C036PublisherGuardMode = 'boundary'
$oldFunction = Get-Item Function:\git -ErrorAction SilentlyContinue
$oldLocation = Get-Location
function global:git {
    $global:C036PublisherGuardCalls.Add(($args -join '|'))
    $global:LASTEXITCODE = 0
    if ($global:C036PublisherGuardMode -eq 'boundary') { throw 'C036_BOUNDARY_INTERCEPTED_BEFORE_GIT' }
    if ($args[0] -eq 'branch') { if ($global:C036PublisherGuardMode -eq 'non-main') { return 'topic/not-main' }; return 'main' }
    if ($args[0] -eq 'rev-parse') { return '0123456789abcdef0123456789abcdef01234567' }
    if ($args[0] -eq 'ls-remote') { return "abcdef0123456789abcdef0123456789abcdef01`trefs/heads/main" }
    throw 'UNEXPECTED_GIT_OPERATION_TEST_REFUSES_ALL_WRITES'
}
function Check([string]$Name, [bool]$Passed, $Observed) {
    $script:checks.Add([ordered]@{name=$Name;passed=$Passed;observed=$Observed})
    if (-not $Passed) { throw "Publisher guard failed: $Name; $($Observed | ConvertTo-Json -Depth 8 -Compress)" }
}
function Boundary([string]$Name, [string[]]$Paths, [bool]$Allowed,
    [string]$Card='C036', [string]$Class='D', [switch]$Admin, [string]$Message) {
    $global:C036PublisherGuardMode = 'boundary'
    $global:C036PublisherGuardCalls.Clear()
    $failure = ''
    if (-not $Message) { $Message = if ($Admin) {'[flow][admin][test] scoped guards'} else {"[$Card][$Class][test] scoped guards"} }
    try { & $publisher -CardId $Card -WorkerId worker-C036 -Paths $Paths -Message $Message -Admin:$Admin | Out-Null }
    catch { $failure = $_.Exception.Message }
    $passed = if ($Allowed) {
        $global:C036PublisherGuardCalls.Count -eq 1 -and $failure -like '*C036_BOUNDARY_INTERCEPTED_BEFORE_GIT*'
    } else {
        $global:C036PublisherGuardCalls.Count -eq 0 -and $failure -ne '' -and $failure -notlike '*C036_BOUNDARY_INTERCEPTED_BEFORE_GIT*'
    }
    Check $Name $passed ([ordered]@{interceptedGitCalls=$global:C036PublisherGuardCalls.Count;error=$failure})
}
$scratch = Join-Path $PSScriptRoot ('io-scratch\publisher-' + [Guid]::NewGuid().ToString('N'))
$created = [Collections.Generic.List[string]]::new()
$createdDirectories = [Collections.Generic.List[string]]::new()
try {
    Set-Location -LiteralPath $repository
    Boundary '1 exact C036 D namespace allowed' @('capability\C036') $true
    Boundary '2 owned descendant allowed' @('capability\C036\tests\current.test.cjs') $true
    Boundary '3 canonical owned path allowed' @('capability\C036\checks\..\attribution.js') $true
    Boundary '4 several exact owned paths allowed' @('capability\C036\index.html','capability\C036\attribution.js') $true
    Boundary '5 frozen S forbidden' @('capability\C036') $false -Class S
    Boundary '6 frozen L forbidden' @('capability\C036') $false -Class L
    Boundary '7 wrong message prefix forbidden' @('capability\C036') $false -Message '[C034][S] wrong identity'
    Boundary '8 unknown card forbidden' @('capability\C000') $false -Card C000
    Boundary '9 similar card name forbidden' @('capability\C036-other') $false -Card C036-other
    Boundary '10 native source card forbidden' @('native\S001') $false -Card B-S001
    $unowned = @('README.md','capability','capability\C015','capability\C034','capability\C016',
        'capability\C018','capability\C019','learning\S001','testing\browser','.docs\wiki\flow-state.json',
        '.git\kanban-orchestrator\publish.ps1','capability\C036-other','capability\C036\..\C015',
        'capability\C036\..\..\README.md')
    for ($i=0; $i -lt $unowned.Count; $i++) {
        Boundary "$($i+11) unowned path rejected: $($unowned[$i])" @($unowned[$i]) $false
    }
    Boundary '25 absolute owned path forbidden' @((Join-Path $repository 'capability\C036\index.html')) $false
    Boundary '26 absolute outside path forbidden' @((Join-Path $repository 'README.md')) $false
    Boundary '27 valid path cannot conceal unowned second path' @('capability\C036','capability\C034') $false
    Boundary '28 Admin cannot publish capability' @('capability\C036') $false -Admin
    Boundary '29 existing Admin ledger boundary allowed' @('.docs\wiki\flow-state.json') $true -Admin
    Boundary '30 existing Admin kanban boundary allowed' @('.docs\wiki\kanban.md') $true -Admin
    Boundary '31 Admin README forbidden' @('README.md') $false -Admin
    Boundary '32 Admin wrong class/message forbidden' @('.docs\wiki\flow-state.json') $false -Admin -Message '[C036][D] admin escape'
    foreach ($mode in @('non-main','head-mismatch')) {
        $global:C036PublisherGuardMode=$mode
        $global:C036PublisherGuardCalls.Clear()
        $failure=''
        try { & $publisher -CardId C036 -WorkerId worker-C036 -Paths @('capability\C036') -Message '[C036][D][test] pre-staging guard' | Out-Null }
        catch { $failure=$_.Exception.Message }
        if ($mode -eq 'non-main') {
            Check '33 non-main fails before staging' ($global:C036PublisherGuardCalls.Count -eq 1 -and $failure -like '*requires checked-out main*') @($global:C036PublisherGuardCalls)
        } else {
            Check '34 HEAD unequal remote fails before staging' ($global:C036PublisherGuardCalls.Count -eq 3 -and $failure -like '*equal remote before staging*') @($global:C036PublisherGuardCalls)
        }
    }
    $tokens=$null; $errors=$null
    $null=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
    $protocol = $errors.Count -eq 0 -and $source -match "C036='D'" -and
        $source -match "'commit','--only'" -and $source -match 'Co-authored-by: Copilot' -and
        $source -match "'tag','-a'" -and $source -match "'push','--atomic'" -and
        $source -match "'merge-base','--is-ancestor'" -and
        $source.IndexOf('Main must already equal remote before staging') -lt $source.IndexOf("'add','--'") -and
        $source -match 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol'
    Check '35 syntax and scoped annotated atomic protocol remain intact' $protocol 'Source AST parsed; only scoped commit, Copilot trailer, annotated tag, atomic push, remote ancestry and command-local whitespace.'
    $base=Split-Path $scratch
    foreach($directory in @($base,$scratch)) {
        if (-not (Test-Path -LiteralPath $directory)) { [IO.Directory]::CreateDirectory($directory)|Out-Null; $createdDirectories.Add($directory) }
        if((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'No linked whitespace fixture directories'}
    }
    $empty=Join-Path $scratch 'empty.txt'
    [IO.File]::WriteAllBytes($empty,[byte[]]@()); $created.Add($empty)
    $cases=@(
        @{name='36 clean raw CRLF accepted';text="first`r`nsecond`r`n";allowed=$true},
        @{name='37 clean canonical LF accepted';text="first`nsecond`n";allowed=$true},
        @{name='38 real trailing space with CRLF rejected';text="first `r`n";allowed=$false},
        @{name='39 real trailing tab with CRLF rejected';text="first`t`r`n";allowed=$false},
        @{name='40 space before tab with CRLF rejected';text=" `tfirst`r`n";allowed=$false},
        @{name='41 blank EOF with CRLF rejected';text="first`r`n`r`n";allowed=$false}
    )
    $i=0
    foreach($case in $cases) {
        $file=Join-Path $scratch "case-$i.txt"; $i++
        $bytes=[Text.UTF8Encoding]::new($false).GetBytes($case.text)
        [IO.File]::WriteAllBytes($file,$bytes); $created.Add($file)
        $gitExe=(Get-Command git.exe).Source
        $output=@(& $gitExe --no-pager -c core.autocrlf=false -c core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol diff --no-index --check -- $empty $file 2>&1)
        $exit=$LASTEXITCODE
        $same=[Convert]::ToBase64String([IO.File]::ReadAllBytes($file)) -eq [Convert]::ToBase64String($bytes)
        $passed=if($case.allowed){$exit -eq 1 -and $output.Count -eq 0 -and $same}else{$exit -gt 1 -and $output.Count -gt 0 -and $same}
        Check $case.name $passed ([ordered]@{exitCode=$exit;noIndexImpliesDifferenceExitOne=$true;testOnlyAutoCrlfDisabledForLiteralByteChecks=$true;originalBytesPreserved=$same;output=($output -join [Environment]::NewLine)})
    }
    Boundary '42 newly parent-authorized C029 frozen D allowed, intercepted only' @('capability\C029') $true -Card C029
    Boundary '43 C029 wrong class remains forbidden' @('capability\C029') $false -Card C029 -Class S
    Boundary '44 only explicitly authorized X003 frozen L allowed, intercepted only' @('capability\X003') $true -Card X003 -Class L
    Boundary '45 X003 wrong class forbidden' @('capability\X003') $false -Card X003 -Class S
    $i=46
    foreach($card in @('X001','X002','X004','X005','X006')){
        Boundary "$i other delighter $card remains denied" @("capability\$card") $false -Card $card -Class L
        $i++
    }
    $removed=$source.Replace("; C029='D'",'').Replace("; X003='L'",'')
    $sha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.UTF8Encoding]::new($false).GetBytes($removed))).ToLowerInvariant()
    Check '51 removing ONLY the two parent-approved class tokens reproduces immutable E6 bytes' ($sha -eq 'e6d9e8bf9c9ff592bf463bd85656ecfec46c4eb33b0ab7f14bb7f317fcc65e22') $sha
    if($script:checks.Count -ne 51){throw 'Exactly 51 current publisher guard groups required'}
    [Console]::WriteLine(([ordered]@{cardId='C036';checks=@($script:checks);count=$script:checks.Count;actualGitWrites=0;mockedPublicationNotClaimed=$true;whitespaceUsedRealGitNoIndex=$true}|ConvertTo-Json -Depth 10 -Compress))
} finally {
    if($oldFunction){Set-Item Function:\git $oldFunction.ScriptBlock}else{Remove-Item Function:\git -ErrorAction SilentlyContinue}
    Set-Location -LiteralPath $oldLocation
    foreach($file in $created){if(Test-Path -LiteralPath $file){[IO.File]::Delete($file)}}
    foreach($directory in @($createdDirectories|Sort-Object Length -Descending)){
        if(Test-Path -LiteralPath $directory){[IO.Directory]::Delete($directory,$false)}
    }
    Remove-Variable C036PublisherGuardCalls,C036PublisherGuardMode -Scope Global -ErrorAction SilentlyContinue
}
