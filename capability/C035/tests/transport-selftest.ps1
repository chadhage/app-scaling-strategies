$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No transport self-test overrides.' }
. (Join-Path $PSScriptRoot '..\git-transport.ps1')
$names = @('GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0', 'GIT_CONFIG_KEY_1', 'GIT_CONFIG_VALUE_1')
$outer = [ordered]@{}
foreach ($name in $names) { $outer[$name] = Get-C035EnvironmentEntry $name }
$checks = @()
try {
    foreach ($name in $names) { Remove-Item -LiteralPath "Env:\$name" -ErrorAction SilentlyContinue }
    $absent = Invoke-C035ProcessTransport {
        $value = & git --no-pager config --get http.version
        if ($LASTEXITCODE -ne 0 -or $value -cne 'HTTP/1.1') { throw 'Process-local HTTP/1.1 append was not used.' }
        return 'absent-case'
    }
    if ((Test-Path Env:\GIT_CONFIG_COUNT) -or (Test-Path Env:\GIT_CONFIG_KEY_0) -or
        (Test-Path Env:\GIT_CONFIG_VALUE_0)) { throw 'Absent keys were not removed.' }
    $checks += 'absent count/key/value restored as absent using Remove-Item Env provider'
    Set-Item Env:\GIT_CONFIG_COUNT -Value '1'
    Set-Item Env:\GIT_CONFIG_KEY_0 -Value 'c035.preexisting'
    Set-Item Env:\GIT_CONFIG_VALUE_0 -Value 'fixed nonsecret test value'
    Set-Item Env:\GIT_CONFIG_KEY_1 -Value 'orphan-key-preserved'
    Set-Item Env:\GIT_CONFIG_VALUE_1 -Value 'orphan-value-preserved'
    $present = Invoke-C035ProcessTransport {
        $old = & git --no-pager config --get c035.preexisting
        if ($LASTEXITCODE -ne 0 -or $old -cne 'fixed nonsecret test value') { throw 'Existing Git configuration slot was lost.' }
        $value = & git --no-pager config --get http.version
        if ($LASTEXITCODE -ne 0 -or $value -cne 'HTTP/1.1' -or $env:GIT_CONFIG_COUNT -cne '2') { throw 'HTTP version did not append after the existing slot.' }
        return 'present-case'
    }
    if ($env:GIT_CONFIG_COUNT -cne '1' -or $env:GIT_CONFIG_KEY_0 -cne 'c035.preexisting' -or
        $env:GIT_CONFIG_VALUE_0 -cne 'fixed nonsecret test value' -or
        $env:GIT_CONFIG_KEY_1 -cne 'orphan-key-preserved' -or $env:GIT_CONFIG_VALUE_1 -cne 'orphan-value-preserved') {
        throw 'Present count/slots or preexisting append-slot values were not exactly restored.'
    }
    $checks += 'existing configured slot and preexisting orphan append slot preserved exactly'
    $caught = $false
    try { $null = Invoke-C035ProcessTransport { throw 'EXPECTED_C035_TRANSPORT_OPERATION_FAILURE' } }
    catch {
        if ($_.Exception.Message -notmatch 'EXPECTED_C035_TRANSPORT_OPERATION_FAILURE') { throw }
        $caught = $true
    }
    if (-not $caught -or $env:GIT_CONFIG_COUNT -cne '1' -or $env:GIT_CONFIG_KEY_1 -cne 'orphan-key-preserved') {
        throw 'Failure path did not restore actual caller environment.'
    }
    $checks += 'throwing operation still restores exact environment and performs working Git read in finally'
} finally {
    foreach ($name in $names) { Restore-C035EnvironmentEntry $name $outer[$name] }
    foreach ($name in $names) {
        $actual = Get-C035EnvironmentEntry $name
        if ($actual.present -ne $outer[$name].present -or $actual.value -cne $outer[$name].value) { throw 'Self-test outer environment restoration failed.' }
    }
}
[Console]::WriteLine(('C035_TRANSPORT_SELFTEST_JSON=' + ([ordered]@{checks=$checks;actualCallerPid=$PID;passed=$true;gitWrites=0;globalConfigurationWrites=0}|ConvertTo-Json -Compress)))
