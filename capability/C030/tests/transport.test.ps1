$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No test overrides.' }
. (Join-Path $PSScriptRoot '..\transport.ps1')
$outer = Get-C030ConfigEnvironment
$checks = 0
try {
    foreach ($entry in @(Get-ChildItem Env: | Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$')) {
        Remove-Item -LiteralPath "Env:\$($entry.Name)"
    }
    $absent = Invoke-C030Http11 {
        if ($env:GIT_CONFIG_COUNT -cne '1' -or $env:GIT_CONFIG_KEY_0 -cne 'http.version' -or $env:GIT_CONFIG_VALUE_0 -cne 'HTTP/1.1') { throw 'HTTP/1.1 not set.' }
        'success'
    }
    if ($absent.output[0] -cne 'success' -or (Get-C030ConfigEnvironment).Count -ne 0 -or (Test-Path Env:\GIT_CONFIG_COUNT) -or
        (Test-Path Env:\GIT_CONFIG_KEY_0) -or (Test-Path Env:\GIT_CONFIG_VALUE_0)) { throw 'Initially absent entries must be absent, not null-valued.' }
    $checks++
    Set-Item Env:\GIT_CONFIG_COUNT '1'
    Set-Item Env:\GIT_CONFIG_KEY_0 'core.abbrev'
    Set-Item Env:\GIT_CONFIG_VALUE_0 '12'
    Set-Item Env:\GIT_CONFIG_KEY_1 'core.quotePath'
    Set-Item Env:\GIT_CONFIG_VALUE_1 'false'
    $presentBefore = Get-C030ConfigEnvironment
    $present = Invoke-C030Http11 {
        if ($env:GIT_CONFIG_COUNT -cne '2' -or $env:GIT_CONFIG_KEY_0 -cne 'core.abbrev' -or
            $env:GIT_CONFIG_VALUE_0 -cne '12' -or $env:GIT_CONFIG_KEY_1 -cne 'http.version' -or $env:GIT_CONFIG_VALUE_1 -cne 'HTTP/1.1') { throw 'Existing active settings changed.' }
        'present'
    }
    Assert-C030ConfigEnvironment $presentBefore
    if (-not $present.transportProof.providerPresenceAndValuesRestored -or -not $present.transportProof.freshSafeGitReadAfterRestore) { throw 'Missing actual restoration proof.' }
    $checks++
    $caught = $false
    try { Invoke-C030Http11 { throw 'intentional-owned-caller-failure' } | Out-Null }
    catch {
        if ($_.Exception.Message -cne 'intentional-owned-caller-failure') { throw }
        $caught = $true
    }
    if (-not $caught) { throw 'Failure was swallowed.' }
    Assert-C030ConfigEnvironment $presentBefore
    $checks++
    Set-Item Env:\GIT_CONFIG_COUNT 'unusable'
    $invalidBefore = Get-C030ConfigEnvironment
    $caught = $false
    try { Invoke-C030Http11 { throw 'Must not execute' } | Out-Null }
    catch { if ($_.Exception.Message -notmatch 'unsupported; nothing changed') { throw }; $caught = $true }
    if (-not $caught) { throw 'Invalid original configuration accepted.' }
    Assert-C030ConfigEnvironment $invalidBefore
    $checks++
} finally {
    foreach ($entry in @(Get-ChildItem Env: | Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_\d+|VALUE_\d+)$')) {
        Remove-Item -LiteralPath "Env:\$($entry.Name)"
    }
    foreach ($key in $outer.Keys) { Set-Item -LiteralPath "Env:\$key" -Value $outer[$key] }
    Assert-C030ConfigEnvironment $outer
    & git --no-pager rev-parse --verify HEAD | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Outer environment fresh Git read failed.' }
}
[Console]::WriteLine((@{ checks = $checks; restoration = $true; freshSafeGitRead = $true; noPrivatePublisherRead = $true } | ConvertTo-Json -Compress))
