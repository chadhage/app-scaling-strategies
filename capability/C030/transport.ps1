$ErrorActionPreference = 'Stop'
function Get-C030ConfigEnvironment {
    $snapshot = [ordered]@{}
    foreach ($entry in @(Get-ChildItem Env: | Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$' | Sort-Object Name)) {
        $snapshot[$entry.Name] = [string]$entry.Value
    }
    return $snapshot
}
function Assert-C030ConfigEnvironment($Expected) {
    $actual = Get-C030ConfigEnvironment
    if (($actual.Keys -join "`n") -cne ($Expected.Keys -join "`n")) { throw 'Git environment provider presence was not exactly restored.' }
    foreach ($key in $Expected.Keys) {
        if ($actual[$key] -cne $Expected[$key]) { throw 'Git environment value was not exactly restored.' }
    }
}
function Invoke-C030Http11([scriptblock]$Work) {
    $before = Get-C030ConfigEnvironment
    $countPresent = Test-Path -LiteralPath 'Env:\GIT_CONFIG_COUNT'
    $countValue = if ($countPresent) { (Get-Item -LiteralPath 'Env:\GIT_CONFIG_COUNT').Value } else { $null }
    if ($countPresent -and ($countValue -cnotmatch '^(0|[1-9][0-9]?)$' -or [int]$countValue -gt 64)) {
        throw 'Existing process Git configuration count is unsupported; nothing changed.'
    }
    $count = if ($countPresent) { [int]$countValue } else { 0 }
    $names = @('GIT_CONFIG_COUNT', "GIT_CONFIG_KEY_$count", "GIT_CONFIG_VALUE_$count")
    $saved = foreach ($name in $names) {
        $present = Test-Path -LiteralPath "Env:\$name"
        [ordered]@{ name = $name; present = $present; value = if ($present) { (Get-Item -LiteralPath "Env:\$name").Value } else { $null } }
    }
    $output = $null
    $restored = $false
    try {
        Set-Item -LiteralPath "Env:\GIT_CONFIG_KEY_$count" -Value 'http.version'
        Set-Item -LiteralPath "Env:\GIT_CONFIG_VALUE_$count" -Value 'HTTP/1.1'
        Set-Item -LiteralPath 'Env:\GIT_CONFIG_COUNT' -Value ([string]($count + 1))
        $output = @(& $Work)
    } finally {
        foreach ($entry in $saved) {
            if ($entry.present) { Set-Item -LiteralPath "Env:\$($entry.name)" -Value $entry.value }
            else { Remove-Item -LiteralPath "Env:\$($entry.name)" -ErrorAction SilentlyContinue }
        }
        Assert-C030ConfigEnvironment $before
        $restored = $true
        $freshHead = & git --no-pager rev-parse --verify HEAD 2>&1
        if ($LASTEXITCODE -ne 0 -or ($freshHead | Out-String).Trim() -cnotmatch '^[0-9a-f]{40}$') {
            throw 'Restored environment did not permit a fresh safe read-only Git command.'
        }
    }
    return [ordered]@{
        output = $output
        transportProof = [ordered]@{
            processOnlyHttpVersion = 'HTTP/1.1'; callingProcessId = $PID
            existingActiveEntriesPreserved = $true; originalConfigEntryCount = $count
            providerPresenceAndValuesRestored = $restored; freshSafeGitReadAfterRestore = $true
            changedNames = $names; secretsOrPriorValuesRecorded = $false
            absentRestorationUsesRemoveItemEnvProvider = $true
            tlsGlobalProxyOrAuthenticationChanged = $false
        }
    }
}
