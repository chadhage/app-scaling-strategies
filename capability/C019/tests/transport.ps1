$ErrorActionPreference = 'Stop'
function Save-C019Environment([string]$Name) {
    $item = Get-Item -LiteralPath "Env:$Name" -ErrorAction SilentlyContinue
    return [ordered]@{ name=$Name; present=($null -ne $item); value=if($null -ne $item){[string]$item.Value}else{$null} }
}
function Restore-C019Environment($Saved) {
    if ($Saved.present) {
        [Environment]::SetEnvironmentVariable($Saved.name, [string]$Saved.value, 'Process')
    } elseif (Test-Path -LiteralPath "Env:$($Saved.name)") {
        Remove-Item -LiteralPath "Env:$($Saved.name)"
    }
}
function Assert-C019Environment($Saved) {
    $actual = Save-C019Environment $Saved.name
    if ($actual.present -ne $Saved.present -or ($Saved.present -and $actual.value -cne $Saved.value)) {
        throw 'Exact process environment presence/value was not restored.'
    }
}
function Invoke-C019Http11([scriptblock]$Operation) {
    $countSaved = Save-C019Environment 'GIT_CONFIG_COUNT'
    $count = 0
    if ($countSaved.present -and ($countSaved.value -cnotmatch '^(0|[1-9][0-9]*)$' -or
        -not [int]::TryParse($countSaved.value,[ref]$count) -or $count -gt 1024)) {
        throw 'Invalid existing Git process configuration count; no silent defaults.'
    }
    $keySaved = Save-C019Environment "GIT_CONFIG_KEY_$count"
    $valueSaved = Save-C019Environment "GIT_CONFIG_VALUE_$count"
    try {
        [Environment]::SetEnvironmentVariable($keySaved.name, 'http.version', 'Process')
        [Environment]::SetEnvironmentVariable($valueSaved.name, 'HTTP/1.1', 'Process')
        [Environment]::SetEnvironmentVariable('GIT_CONFIG_COUNT', [string]($count+1), 'Process')
        $version = (& git config --get http.version | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $version -cne 'HTTP/1.1') { throw 'Safe process-local HTTP/1.1 verification failed.' }
        & $Operation
    } finally {
        Restore-C019Environment $keySaved
        Restore-C019Environment $valueSaved
        Restore-C019Environment $countSaved
        Assert-C019Environment $keySaved
        Assert-C019Environment $valueSaved
        Assert-C019Environment $countSaved
        $null = & git config --get http.version 2>$null
        if ($LASTEXITCODE -notin @(0,1)) { throw 'Fresh safe Git read failed after environment restoration.' }
    }
}
