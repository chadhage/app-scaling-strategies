$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No source overrides accepted.' }
$repository = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
$root = Join-Path $repository 'capability\C037'
$history = [IO.File]::ReadAllText((Join-Path $root 'authority-history.json')) | ConvertFrom-Json -AsHashtable
if ($history.snapshot -notmatch '^evidence\\raw\\authority-[0-9a-f-]{36}\\publisher\.ps1\.snapshot$') { throw 'Only the initial own archived fixture is allowed.' }
$bytes = [IO.File]::ReadAllBytes((Join-Path $root $history.snapshot))
$sha = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
if ($sha -cne '2caba63847b9428cb17620fb9c588e7c64d2f27689be065c5e6a9a1c95570811' -or $sha -cne $history.publisherSha256) { throw 'Archived actual-approved fixture changed.' }
$source = [Text.Encoding]::UTF8.GetString($bytes)
$publisher = [ScriptBlock]::Create($source)
$checks = [Collections.Generic.List[object]]::new()
$global:C037GuardCalls = [Collections.Generic.List[string]]::new()
$global:C037GuardMode = 'boundary'
$priorFunction = Get-Item Function:\git -ErrorAction SilentlyContinue
function global:git {
    $global:C037GuardCalls.Add(($args -join '|'))
    $global:LASTEXITCODE = 0
    if ($global:C037GuardMode -eq 'boundary') { throw 'C037_TEST_INTERCEPT_BEFORE_ANY_REAL_GIT' }
    if ($args[0] -eq 'branch') { if ($global:C037GuardMode -eq 'non-main') { return 'topic' }; return 'main' }
    if ($args[0] -eq 'rev-parse') { return '0123456789abcdef0123456789abcdef01234567' }
    if ($args[0] -eq 'ls-remote') { return "abcdef0123456789abcdef0123456789abcdef01`trefs/heads/main" }
    throw 'Test refuses any staging or publication.'
}
function Check([string]$Name,[bool]$Passed) {
    $checks.Add([ordered]@{name=$Name;passed=$Passed})
    if (-not $Passed) { throw "Guard failed: $Name" }
}
function Boundary([string]$Name,[string[]]$Paths,[bool]$Allowed,[string]$Card='C037',[string]$Class='S',[switch]$Admin,[string]$Message) {
    $global:C037GuardMode='boundary'
    $global:C037GuardCalls.Clear()
    if (-not $Message) { $Message=if($Admin){'[flow][admin][test] bounded'}else{"[$Card][$Class][test] bounded"} }
    $errorText=''
    try { & $publisher -CardId $Card -WorkerId worker-C037 -Paths $Paths -Message $Message -Admin:$Admin | Out-Null }
    catch { $errorText=$_.Exception.Message }
    $passed=if($Allowed){$global:C037GuardCalls.Count -eq 1 -and $errorText -like '*C037_TEST_INTERCEPT*'}else{
        $global:C037GuardCalls.Count -eq 0 -and $errorText -ne '' -and $errorText -notlike '*C037_TEST_INTERCEPT*'}
    Check $Name $passed
}
try {
    Boundary 'exact C037 S' @('capability\C037') $true
    Boundary 'owned descendant' @('capability\C037\tests\routing.test.cjs') $true
    Boundary 'canonical owned path' @('capability\C037\checks\..\routing.js') $true
    Boundary 'several owned paths' @('capability\C037\index.html','capability\C037\routing.js') $true
    Boundary 'wrong D rejected' @('capability\C037') $false -Class D
    Boundary 'wrong L rejected' @('capability\C037') $false -Class L
    Boundary 'wrong card message rejected' @('capability\C037') $false -Message '[C036][D] wrong'
    Boundary 'unknown card rejected' @('capability\C000') $false -Card C000
    Boundary 'similar ID rejected' @('capability\C037-other') $false -Card C037-other
    Boundary 'native lesson rejected' @('native\S001') $false -Card B-S001
    foreach($path in @('README.md','capability','capability\C015','capability\C034','capability\C036',
        'capability\C038','capability\C048','learning\S001','testing\browser','.docs\wiki\flow-state.json',
        '.git\kanban-orchestrator\publish.ps1','capability\C037-other','capability\C037\..\C036',
        'capability\C037\..\..\README.md')){
        Boundary "unowned rejected $path" @($path) $false
    }
    Boundary 'absolute owned rejected' @((Join-Path $repository 'capability\C037\index.html')) $false
    Boundary 'absolute foreign rejected' @((Join-Path $repository 'README.md')) $false
    Boundary 'mixed ownership rejected' @('capability\C037','capability\C036') $false
    Boundary 'Admin capability rejected' @('capability\C037') $false -Admin
    Boundary 'existing Admin ledger boundary' @('.docs\wiki\flow-state.json') $true -Admin
    Boundary 'existing Admin kanban boundary' @('.docs\wiki\kanban.md') $true -Admin
    Boundary 'Admin README rejected' @('README.md') $false -Admin
    Boundary 'Admin wrong message rejected' @('.docs\wiki\flow-state.json') $false -Admin -Message '[C037][S] invalid'
    foreach($mode in @('non-main','head-mismatch')){
        $global:C037GuardMode=$mode;$global:C037GuardCalls.Clear();$errorText=''
        try{& $publisher -CardId C037 -WorkerId worker-C037 -Paths @('capability\C037') -Message '[C037][S][test] pre-stage'|Out-Null}
        catch{$errorText=$_.Exception.Message}
        Check "$mode rejected before staging" ($errorText -ne '' -and @($global:C037GuardCalls|Where-Object {$_ -match '^(add|commit|push|tag)\|'}).Count -eq 0)
    }
    $tokens=$null;$errors=$null
    $null=[Management.Automation.Language.Parser]::ParseInput($source,[ref]$tokens,[ref]$errors)
    Check 'PowerShell AST syntax' ($errors.Count -eq 0)
    Check 'scoped commit only' ($source -match "'commit','--only'")
    Check 'Copilot trailer retained' ($source -match 'Co-authored-by: Copilot')
    Check 'annotated tag retained' ($source -match "'tag','-a'")
    Check 'atomic push retained' ($source -match "'push','--atomic'")
    Check 'remote ancestry retained' ($source -match "'merge-base','--is-ancestor'")
    Check 'HEAD gate before staging' ($source.IndexOf('Main must already equal remote before staging') -lt $source.IndexOf("'add','--'"))
    Check 'CRLF-aware command-local whitespace' ($source -match 'core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol')
    Check 'real frozen tag namespace' ($source.Contains('kanban/$CardId/$short'))
    foreach($pair in @(@('C030','D'),@('C035','D'),@('C037','S'),@('C038','S'))){
        Boundary "new exact $($pair[0]) class" @("capability\$($pair[0])") $true -Card $pair[0] -Class $pair[1]
        $wrong=if($pair[1] -eq 'S'){'D'}else{'S'}
        Boundary "new exact $($pair[0]) wrong class" @("capability\$($pair[0])") $false -Card $pair[0] -Class $wrong
    }
    foreach($id in @('X001','X002','X004','X005','X006')){
        Boundary "unadmitted $id rejected" @("capability\$id") $false -Card $id -Class L
    }
    $stripped=$source.Replace("; C030='D'",'').Replace("; C035='D'",'').Replace("; C037='S'",'').Replace("; C038='S'",'')
    $strippedSha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($stripped))).ToLowerInvariant()
    Check 'only four tokens reproduce historical 60AE' ($strippedSha -ceq '60ae100b96622c8ca828d7db2f8000780476e7c7411a9f3d26f0959fd182aeea')
    Check 'staging is only caller-owned Paths' ($source.Contains("Run-Git (@('add','--')+`$Paths)"))
    Check 'no destructive reset amend force cleanup' ($source -notmatch "'reset'|'clean'|'--amend'|'--force'")
    Check 'frozen C036 original retained' ($source.Contains("C036='D'"))
    Check 'publisher fixture bytes immutable' ([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([IO.File]::ReadAllBytes((Join-Path $root $history.snapshot)))).ToLowerInvariant() -ceq $sha)
    if($checks.Count -ne 61){throw "Expected exactly 61 groups, found $($checks.Count)"}
    [Console]::WriteLine(([ordered]@{checks=$checks.ToArray();actualGitWrites=0;archivedNotMutablePrivateSource=$true;publisherSha256=$sha}|ConvertTo-Json -Depth 6 -Compress))
} finally {
    Remove-Item Function:\git -ErrorAction SilentlyContinue
    if($priorFunction){Set-Item Function:\git -Value $priorFunction.ScriptBlock}
    Remove-Variable C037GuardCalls,C037GuardMode -Scope Global -ErrorAction SilentlyContinue
}
