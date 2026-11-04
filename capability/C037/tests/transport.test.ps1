$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No transport fixture overrides.' }
. (Join-Path $PSScriptRoot 'git-transport.ps1')
$outer=Get-C037GitEnvironment
$checks=[Collections.Generic.List[object]]::new()
function Clear-Fixture {
    foreach($entry in @(Get-ChildItem Env:|Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_[0-9]+|VALUE_[0-9]+)$')){
        Remove-Item -LiteralPath "Env:\$($entry.Name)"
    }
}
try {
    foreach($mode in @('absent','zero','existing','unused-present-empty','operation-throws','malformed-count','incomplete-slot')){
        Clear-Fixture
        if($mode -ne 'absent'){Set-Item Env:\GIT_CONFIG_COUNT -Value '0'}
        if($mode -eq 'existing'){
            Set-Item Env:\GIT_CONFIG_COUNT -Value '1';Set-Item Env:\GIT_CONFIG_KEY_0 -Value 'http.version';Set-Item Env:\GIT_CONFIG_VALUE_0 -Value 'HTTP/2'
        }
        if($mode -eq 'unused-present-empty'){
            Set-Item Env:\GIT_CONFIG_KEY_0 -Value '';Set-Item Env:\GIT_CONFIG_VALUE_0 -Value ''
        }
        if($mode -eq 'malformed-count'){Set-Item Env:\GIT_CONFIG_COUNT -Value '01'}
        if($mode -eq 'incomplete-slot'){Set-Item Env:\GIT_CONFIG_COUNT -Value '1';Set-Item Env:\GIT_CONFIG_KEY_0 -Value 'core.quotepath'}
        $before=Get-C037GitEnvironment
        $proof=[ordered]@{}
        $script:invoked=$false;$failure=''
        try {
            Invoke-C037Http11 {
                $script:invoked=$true
                if($mode -eq 'operation-throws'){throw 'C037_EXPECTED_TEST_OPERATION_FAILURE'}
            } $proof
        } catch { $failure=$_.Exception.Message }
        $after=Get-C037GitEnvironment
        $same=($before|ConvertTo-Json -Compress) -ceq ($after|ConvertTo-Json -Compress)
        $invalid=$mode -in @('malformed-count','incomplete-slot')
        $passed=$same -and ($script:invoked -eq (-not $invalid)) -and
            $(if($invalid -or $mode -eq 'operation-throws'){$failure -ne ''}else{$failure -eq ''}) -and
            $(if($invalid){$proof.Count -eq 0}else{$proof.restoredPresenceAndValueInFinally -eq $true -and $proof.safeGitReadAfterRestorePassed -eq $true})
        $checks.Add([ordered]@{name=$mode;passed=$passed;originalEnvironmentRestored=$same;operationInvoked=$script:invoked;actualGitWrites=0})
        if(-not $passed){throw "Transport control failed: $mode; $failure"}
    }
    [Console]::WriteLine(([ordered]@{checks=$checks.ToArray();actualGitWrites=0}|ConvertTo-Json -Depth 6 -Compress))
} finally {
    Clear-Fixture
    foreach($name in $outer.Keys){Set-Item -LiteralPath "Env:\$name" -Value $outer[$name]}
}
