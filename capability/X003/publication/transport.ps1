function Get-GitProcessEntry([string]$Name) {
    $environment=[Environment]::GetEnvironmentVariables('Process')
    $names=@($environment.Keys|Where-Object { [string]$_ -ieq $Name })
    if ($names.Count -gt 1) { throw 'Ambiguous Git process-environment entry; no transport override.' }
    return @{
        name=if($names.Count){[string]$names[0]}else{$Name}
        present=($names.Count -eq 1)
        value=if($names.Count){[string]$environment[$names[0]]}else{$null}
    }
}
function Restore-GitHttp11($Restore) {
    foreach ($entry in @($Restore.key,$Restore.value,$Restore.count)) {
        if ($entry.present) { Set-Item -LiteralPath "Env:$($entry.name)" -Value $entry.value }
        else { Remove-Item -LiteralPath "Env:$($entry.name)" -ErrorAction SilentlyContinue }
    }
    foreach ($entry in @($Restore.key,$Restore.value,$Restore.count)) {
        $current=Get-GitProcessEntry $entry.name
        if ($current.present -ne $entry.present -or ($entry.present -and $current.value -cne $entry.value)) {
            throw 'Git process environment did not restore exactly; no success claim.'
        }
    }
    $null=& git config --get http.version 2>$null
    if ($LASTEXITCODE -notin @(0,1)) {
        throw 'Fresh safe Git configuration inspection failed after restoration; no caller success claim.'
    }
}
function Enable-GitHttp11($Approval,[string]$ActualPublisherSha256) {
    if ($Approval.approvedBy -ne 'parent-controller' -or $Approval.mode -ne 'publisher-process-local HTTP/1.1' -or
        $Approval.privatePublisherSha256Unchanged -ne $ActualPublisherSha256 -or
        $Approval.namespaceClassAdminHeadWhitespaceAndCreditRulesUnchanged -ne $true -or
        $Approval.sourceAndIndexChanges -ne 0 -or $Approval.extraCredits -ne 0) {
        throw 'Explicit current canonical process-local HTTP/1.1 approval is required.'
    }
    $count=Get-GitProcessEntry 'GIT_CONFIG_COUNT'
    $number=0
    if ($count.present) {
        if ($count.value -cnotmatch '^(0|[1-9][0-9]{0,3})$' -or
            -not [int]::TryParse($count.value,[ref]$number) -or $number -ge 1024) {
            throw 'Invalid or unbounded GIT_CONFIG_COUNT; no silent default or environment mutation.'
        }
    }
    for ($index=0;$index -lt $number;$index++) {
        $key=Get-GitProcessEntry "GIT_CONFIG_KEY_$index"
        $value=Get-GitProcessEntry "GIT_CONFIG_VALUE_$index"
        if (-not $key.present -or -not $value.present -or [string]::IsNullOrEmpty($key.value)) {
            throw 'Existing declared Git process entries are incomplete; no override or secret logging.'
        }
    }
    $restore=@{
        count=$count;key=(Get-GitProcessEntry "GIT_CONFIG_KEY_$number")
        value=(Get-GitProcessEntry "GIT_CONFIG_VALUE_$number")
    }
    try {
        Set-Item -LiteralPath "Env:GIT_CONFIG_KEY_$number" -Value 'http.version'
        Set-Item -LiteralPath "Env:GIT_CONFIG_VALUE_$number" -Value 'HTTP/1.1'
        Set-Item -LiteralPath 'Env:GIT_CONFIG_COUNT' -Value ([string]($number+1))
        $visible=(& git config --get http.version 2>$null|Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $visible -cne 'HTTP/1.1') {
            throw 'Safe Git http.version inspection did not confirm HTTP/1.1 before publication.'
        }
        return $restore
    } catch {
        Restore-GitHttp11 $restore
        throw
    }
}
