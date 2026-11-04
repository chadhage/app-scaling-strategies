function Get-C035EnvironmentEntry([string]$Name) {
    $present = Test-Path -LiteralPath "Env:\$Name"
    return [ordered]@{present=$present;value=if($present){(Get-Item -LiteralPath "Env:\$Name").Value}else{$null}}
}
function Restore-C035EnvironmentEntry([string]$Name, $Entry) {
    if ($Entry.present) { Set-Item -LiteralPath "Env:\$Name" -Value $Entry.value }
    else { Remove-Item -LiteralPath "Env:\$Name" -ErrorAction SilentlyContinue }
}
function Invoke-C035ProcessTransport([ScriptBlock]$Operation) {
    $ErrorActionPreference = 'Stop'
    $before = [ordered]@{}
    $before.GIT_CONFIG_COUNT = Get-C035EnvironmentEntry 'GIT_CONFIG_COUNT'
    $count = 0
    if ($before.GIT_CONFIG_COUNT.present) {
        if ($before.GIT_CONFIG_COUNT.value -cnotmatch '^(0|[1-9][0-9]*)$' -or
            -not [int]::TryParse($before.GIT_CONFIG_COUNT.value, [ref]$count) -or $count -gt 128) {
            throw 'Existing process Git configuration count is invalid or unbounded; no transport override.'
        }
    }
    for ($index = 0; $index -le $count; $index++) {
        foreach ($kind in @('KEY', 'VALUE')) {
            $name = "GIT_CONFIG_${kind}_$index"
            $before[$name] = Get-C035EnvironmentEntry $name
            if ($index -lt $count -and -not $before[$name].present) { throw 'Existing configured Git slots are incomplete; no silent defaults.' }
        }
    }
    $result = $null
    $operationError = $null
    $restoration = $null
    try {
        Set-Item -LiteralPath "Env:\GIT_CONFIG_KEY_$count" -Value 'http.version'
        Set-Item -LiteralPath "Env:\GIT_CONFIG_VALUE_$count" -Value 'HTTP/1.1'
        Set-Item -LiteralPath 'Env:\GIT_CONFIG_COUNT' -Value ([string]($count + 1))
        foreach ($name in $before.Keys | Where-Object { $_ -ne 'GIT_CONFIG_COUNT' -and $_ -notin @("GIT_CONFIG_KEY_$count", "GIT_CONFIG_VALUE_$count") }) {
            $actual = Get-C035EnvironmentEntry $name
            if ($actual.present -ne $before[$name].present -or $actual.value -cne $before[$name].value) { throw 'An existing Git slot changed during append.' }
        }
        $result = & $Operation
    } catch { $operationError = $_ }
    finally {
        foreach ($name in $before.Keys) { Restore-C035EnvironmentEntry $name $before[$name] }
        $entries = foreach ($name in $before.Keys) {
            $actual = Get-C035EnvironmentEntry $name
            $exact = $actual.present -eq $before[$name].present -and $actual.value -ceq $before[$name].value
            if (-not $exact) { throw "Exact Presence+Value restoration failed for $name in this actual caller." }
            [ordered]@{name=$name;beforePresent=$before[$name].present;afterPresent=$actual.present;exactPresenceAndValueRestored=$exact}
        }
        $workingRead = & git --no-pager rev-parse --show-toplevel 2>&1
        if ($LASTEXITCODE -ne 0 -or @($workingRead).Count -ne 1) { throw 'Restored environment does not support a working Git read in the actual caller.' }
        $restoration = [ordered]@{
            actualCallerPid=$PID;appendedAtSlot=$count;existingCountAndSlotsPreserved=$true
            appendedKey='http.version';appendedValue='HTTP/1.1';processLocalOnly=$true
            exactPresenceAndValueRestored=$true;entries=@($entries)
            absentKeysRemovedThroughEnvironmentProvider=$true
            workingGitReadAfterFinally=$true;tlsProxyAuthOrGlobalConfigurationChanges=$false
        }
        Write-Host ('C035_TRANSPORT_FINALLY_JSON=' + ($restoration | ConvertTo-Json -Depth 8 -Compress))
    }
    if ($operationError) { throw $operationError }
    return [ordered]@{result=$result;restoration=$restoration}
}
