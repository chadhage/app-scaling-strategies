$ErrorActionPreference = 'Stop'
function Get-C037GitEnvironment {
    $snapshot = [ordered]@{}
    foreach ($entry in @(Get-ChildItem Env: | Where-Object Name -Match '^GIT_CONFIG_(COUNT|KEY_[0-9]+|VALUE_[0-9]+)$' | Sort-Object Name)) {
        $snapshot[$entry.Name] = [string]$entry.Value
    }
    return ,$snapshot
}
function Restore-C037Environment([string]$Name,[bool]$Present,[string]$Value) {
    if ($Present) { Set-Item -LiteralPath "Env:\$Name" -Value $Value }
    else { Remove-Item -LiteralPath "Env:\$Name" -ErrorAction SilentlyContinue }
}
function Invoke-C037Http11([scriptblock]$Operation,[System.Collections.IDictionary]$Proof) {
    $before = Get-C037GitEnvironment
    $countPresent = Test-Path Env:\GIT_CONFIG_COUNT
    $oldCount = if ($countPresent) { [string](Get-Item Env:\GIT_CONFIG_COUNT).Value } else { '' }
    $count = 0
    if ($countPresent -and ($oldCount -notmatch '^(0|[1-9][0-9]*)$' -or
        -not [int]::TryParse($oldCount,[ref]$count) -or $count -gt 4096)) { throw 'Invalid original process Git configuration count; no mutation.' }
    for ($i=0;$i -lt $count;$i++) {
        if (-not (Test-Path "Env:\GIT_CONFIG_KEY_$i") -or -not (Test-Path "Env:\GIT_CONFIG_VALUE_$i") -or
            [string]::IsNullOrWhiteSpace((Get-Item "Env:\GIT_CONFIG_KEY_$i").Value)) { throw 'Incomplete original process Git configuration slots; no mutation.' }
    }
    $keyName="GIT_CONFIG_KEY_$count";$valueName="GIT_CONFIG_VALUE_$count"
    $keyPresent=Test-Path "Env:\$keyName";$valuePresent=Test-Path "Env:\$valueName"
    $oldKey=if($keyPresent){[string](Get-Item "Env:\$keyName").Value}else{''}
    $oldValue=if($valuePresent){[string](Get-Item "Env:\$valueName").Value}else{''}
    $priorEffective=@(& git --no-pager config --get-all http.version)
    $priorExit=$LASTEXITCODE
    if ($priorExit -notin @(0,1)) { throw 'Safe original Git HTTP configuration read failed; no mutation.' }
    $Proof.priorCountPresenceValidated=$true
    $Proof.priorCount=$count
    $Proof.scope='process-local HTTP/1.1 only'
    $Proof.globalTlsProxyOrAuthChanges=$false
    try {
        Set-Item -LiteralPath "Env:\$keyName" -Value 'http.version'
        Set-Item -LiteralPath "Env:\$valueName" -Value 'HTTP/1.1'
        Set-Item Env:\GIT_CONFIG_COUNT -Value ([string]($count+1))
        $effective=(& git --no-pager config --get http.version | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or $effective -cne 'HTTP/1.1') { throw 'Safe effective process-local Git HTTP/1.1 read failed.' }
        $Proof.effectiveHttpVersion=$effective
        & $Operation
    } finally {
        Restore-C037Environment $keyName $keyPresent $oldKey
        Restore-C037Environment $valueName $valuePresent $oldValue
        Restore-C037Environment 'GIT_CONFIG_COUNT' $countPresent $oldCount
        $after=Get-C037GitEnvironment
        $same=($before|ConvertTo-Json -Compress) -ceq ($after|ConvertTo-Json -Compress)
        $afterEffective=@(& git --no-pager config --get-all http.version)
        $afterExit=$LASTEXITCODE
        $safeRead=($afterExit -eq $priorExit) -and (($afterEffective|ConvertTo-Json -Compress) -ceq ($priorEffective|ConvertTo-Json -Compress))
        $Proof.restoredPresenceAndValueInFinally=$same
        $Proof.safeGitReadAfterRestorePassed=$safeRead
        $Proof.absentKeysRemovedNotSetNull=$true
        $Proof.existingCountAndAllSlotsPreserved=$same
        if (-not $same -or -not $safeRead) { throw 'Original process Git environment presence/value or safe Git read restoration failed.' }
    }
}
