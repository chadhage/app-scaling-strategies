param([Parameter(Mandatory=$true)][string]$Repository)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\foreign-guard.ps1')
$live = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..')).TrimEnd('\')
$target = [IO.Path]::GetFullPath($Repository).TrimEnd('\')
if ($target -ieq $live -or -not (Test-Path -LiteralPath (Join-Path $target '.git'))) { throw 'Only a throwaway fixture repository is accepted; the live repository is denied.' }
$foreign = 'capability/C048/evidence/red/replay.cjs.txt'
function Invoke-C035Fixture([string[]]$Arguments) {
    $output = & git --no-pager -C $target -c 'user.name=C035 fixture' -c 'user.email=fixture@example.invalid' -c core.autocrlf=false -c commit.gpgsign=false @Arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw "Fixture Git failed: $($output -join [Environment]::NewLine)" }
    return $output
}
$checks = @()
$kept = Invoke-C035ForeignPreserved $target {
    $null = Invoke-C035Fixture @('add', '--', 'capability/C035')
    $null = Invoke-C035Fixture @('commit', '-q', '--only', '-m', '[C035][D] guard fixture', '--', 'capability/C035')
    return 'delegated'
}
if ($kept.result -cne 'delegated' -or $kept.preserved -ne $true -or @($kept.before.paths).Count -ne 1 -or
    $kept.before.paths[0] -cne $foreign -or
    ($kept.before | ConvertTo-Json -Depth 8 -Compress) -cne ($kept.after | ConvertTo-Json -Depth 8 -Compress)) {
    throw 'A preserving own-path commit was not accepted with identical before and after snapshots.'
}
$checks += 'preserving own-path commit accepted with identical foreign before/after snapshots'
$caught = $null
try {
    $null = Invoke-C035ForeignPreserved $target {
        $null = Invoke-C035Fixture @('reset', '-q', '--', $foreign)
        return 'clobbered'
    }
} catch { $caught = $_.Exception.Message }
if (-not $caught -or $caught -notmatch 'Foreign staged entries or flags changed') { throw 'An operation that unstages the foreign entry was not rejected.' }
$checks += 'operation that unstages the foreign entry makes the guard throw'
[Console]::WriteLine(('C035_FOREIGN_GUARD_SELFTEST_JSON=' + ([ordered]@{checks=$checks;actualCallerPid=$PID;passed=$true;liveRepositoryTouched=$false}|ConvertTo-Json -Compress)))
