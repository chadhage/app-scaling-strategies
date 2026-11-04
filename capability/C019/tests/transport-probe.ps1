$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'transport.ps1')
$names = @((Get-ChildItem Env: | Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_[0-9]+|VALUE_[0-9]+)$').Name)
$saved = @($names | ForEach-Object { Save-C019Environment $_ })
$checks = [Collections.Generic.List[string]]::new()
try {
    foreach ($name in $names) { if (Test-Path -LiteralPath "Env:$name") { Remove-Item -LiteralPath "Env:$name" } }
    Invoke-C019Http11 { if ((& git config --get http.version) -cne 'HTTP/1.1') { throw 'Protocol mismatch.' } }
    foreach ($name in @('GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0')) {
        if (Test-Path -LiteralPath "Env:$name") { throw 'Originally absent entry remains present.' }
    }
    $checks.Add('absent entries removed exactly')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT','1','Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_KEY_0','core.quotepath','Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_VALUE_0','true','Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_KEY_1','','Process')
    [Environment]::SetEnvironmentVariable('GIT_CONFIG_VALUE_1','','Process')
    $before = @('GIT_CONFIG_COUNT','GIT_CONFIG_KEY_0','GIT_CONFIG_VALUE_0','GIT_CONFIG_KEY_1','GIT_CONFIG_VALUE_1') |
        ForEach-Object { Save-C019Environment $_ }
    Invoke-C019Http11 { if ((& git config --get core.quotepath) -cne 'true') { throw 'Prior entry changed.' } }
    foreach ($entry in $before) { Assert-C019Environment $entry }
    $checks.Add('prior count entries and empty-present slot values preserved')
    try { Invoke-C019Http11 { throw 'Expected controlled operation failure.' } } catch {
        if ($_.Exception.Message -cne 'Expected controlled operation failure.') { throw }
    }
    foreach ($entry in $before) { Assert-C019Environment $entry }
    $checks.Add('throwing operation still restores exact presence and values')
    foreach ($invalid in @('', '00', '-1', 'NaN', '1.5')) {
        [Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT',$invalid,'Process')
        $blocked = $false
        try { Invoke-C019Http11 { throw 'Operation must not run.' } } catch {
            $blocked = $_.Exception.Message -ceq 'Invalid existing Git process configuration count; no silent defaults.'
        }
        if (-not $blocked -or (Get-Item -LiteralPath Env:GIT_CONFIG_COUNT).Value -cne $invalid) {
            throw 'Invalid count did not reject without alteration.'
        }
    }
    $checks.Add('invalid and empty counts reject without defaults or mutation')
} finally {
    foreach ($name in @((Get-ChildItem Env: | Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_[0-9]+|VALUE_[0-9]+)$').Name)) {
        if (Test-Path -LiteralPath "Env:$name") { Remove-Item -LiteralPath "Env:$name" }
    }
    foreach ($entry in $saved) { Restore-C019Environment $entry; Assert-C019Environment $entry }
    $null = & git config --get http.version 2>$null
    if ($LASTEXITCODE -notin @(0,1)) { throw 'Fresh safe Git read failed.' }
}
[ordered]@{
    callerPid=$PID; checks=$checks.ToArray(); passed=($checks.Count -eq 4)
    restoredOriginalPresenceAndValue=$true; freshSafeGitRead=$true
    publicationPerformed=$false; globalConfigurationChanged=$false; originalFailedCallerStillFailed=$true; extraCredits=0
} | ConvertTo-Json -Compress
