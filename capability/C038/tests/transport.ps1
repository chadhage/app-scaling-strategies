param([ValidateSet('Probe','Publish')][string]$Mode='Probe')
$ErrorActionPreference='Stop'
if($args.Count -ne 0){throw 'Only the closed probe or owned publication is supported'}
function Save-Entry([string]$Name){
    $present=Test-Path -LiteralPath "Env:\$Name"
    [ordered]@{present=$present;value=if($present){[string](Get-Item -LiteralPath "Env:\$Name").Value}else{''}}
}
function Restore-Entry([string]$Name,$Entry){
    if($Entry.present){Set-Item -LiteralPath "Env:\$Name" -Value ([string]$Entry.value)}
    else{Remove-Item -LiteralPath "Env:\$Name" -ErrorAction SilentlyContinue}
}
function Same-Entry([string]$Name,$Entry){
    $current=Save-Entry $Name
    return ($current.present -eq $Entry.present -and (-not $Entry.present -or $current.value -ceq $Entry.value))
}
function All-ConfigEntries {
    $entries=@{}
    foreach($item in Get-ChildItem Env:){
        if($item.Name -match '^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$'){$entries[$item.Name]=[string]$item.Value}
    }
    return $entries
}
$before=All-ConfigEntries
$oldCount=Save-Entry 'GIT_CONFIG_COUNT'
$count=0
if($oldCount.present){
    if($oldCount.value -notmatch '^(0|[1-9][0-9]*)$' -or
        -not [int]::TryParse($oldCount.value,[ref]$count) -or $count -gt 4096){
        throw 'Invalid existing Git process configuration count; no mutation'
    }
}
for($i=0;$i -lt $count;$i++){
    $key=Save-Entry "GIT_CONFIG_KEY_$i";$value=Save-Entry "GIT_CONFIG_VALUE_$i"
    if(-not $key.present -or [string]::IsNullOrWhiteSpace($key.value) -or -not $value.present){
        throw 'Incomplete existing Git process configuration entries; no mutation'
    }
}
$keyName="GIT_CONFIG_KEY_$count";$valueName="GIT_CONFIG_VALUE_$count"
$oldKey=Save-Entry $keyName;$oldValue=Save-Entry $valueName
$status=1;$failure=$null;$restored=$false;$safeRead=$false;$effective=$null;$invoked=$false;$existingPreserved=$false
try{
    Set-Item -LiteralPath "Env:\$keyName" -Value 'http.version'
    Set-Item -LiteralPath "Env:\$valueName" -Value 'HTTP/1.1'
    Set-Item -LiteralPath Env:\GIT_CONFIG_COUNT -Value ([string]($count+1))
    $effective=(& git --no-pager config --get http.version|Out-String).Trim()
    if($LASTEXITCODE -ne 0 -or $effective -cne 'HTTP/1.1'){throw 'Safe effective process-local HTTP/1.1 read failed'}
    foreach($entry in $before.GetEnumerator()){
        if($entry.Key -in @('GIT_CONFIG_COUNT',$keyName,$valueName)){continue}
        $actual=Save-Entry $entry.Key
        if(-not $actual.present -or $actual.value -cne $entry.Value){throw 'An existing Git process entry changed'}
    }
    $existingPreserved=$true
    if($Mode -eq 'Publish'){
        if($env:CAPTURE_BROWSER_EVIDENCE -cne '1'){throw 'Exact explicit publication capture required'}
        $invoked=$true
        & (Join-Path $PSScriptRoot 'publish-owned.ps1')
        if(-not $?){throw 'Owned standard publisher delegation failed'}
    }
    $status=0
}catch{$failure=$_.Exception.Message;$status=1}
finally{
    Restore-Entry $keyName $oldKey
    Restore-Entry $valueName $oldValue
    Restore-Entry 'GIT_CONFIG_COUNT' $oldCount
    $restored=(Same-Entry $keyName $oldKey) -and (Same-Entry $valueName $oldValue) -and
        (Same-Entry 'GIT_CONFIG_COUNT' $oldCount)
    $after=All-ConfigEntries
    $restored=$restored -and $after.Count -eq $before.Count
    foreach($entry in $before.GetEnumerator()){
        if(-not $after.ContainsKey($entry.Key) -or $after[$entry.Key] -cne $entry.Value){$restored=$false}
    }
    if(-not $restored){$status=1;$failure='Exact existing Git environment presence/value restoration failed'}
    $read=(& git --no-pager rev-parse --verify HEAD|Out-String).Trim()
    $safeRead=$LASTEXITCODE -eq 0 -and $read -match '^[0-9a-f]{40}$'
    if(-not $safeRead){$status=1;$failure='Safe Git read after exact environment restoration failed'}
    $proof=[ordered]@{
        cardId='C038';mode=$Mode;scope='publisher-process-local-only'
        httpVersion=$effective;initialCountPresent=$oldCount.present
        appendedSlot=$count;initialAppendedKeyPresent=$oldKey.present;initialAppendedValuePresent=$oldValue.present
        originalActiveEntriesValidated=$count;allExistingEntriesPreserved=$existingPreserved
        allPresenceAndValuesRestoredInFinally=$restored;initialAbsentKeysRemovedWithEnvProvider=$true
        safeGitReadAfterRestoration=$safeRead;standardPublisherDelegated=$invoked
        globalConfigChanged=$false;tlsProxyOrAuthConfigurationChanged=$false
        transportRootCauseClaimed=$false;exitCode=$status;failure=$failure
        observedAtUtc=[DateTime]::UtcNow.ToString('o')
    }
    if($Mode -eq 'Publish'){
        $root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
        $directory=[IO.Path]::GetFullPath($env:C038_CAPTURE_DIR)
        if([IO.Path]::GetDirectoryName($directory) -cne (Join-Path $root 'evidence\raw') -or
            [IO.Path]::GetFileName($directory) -notmatch '^publication-[0-9a-f-]{36}$'){throw 'Exact own publication directory required'}
        $target=Join-Path $directory 'transport.json'
        $stream=[IO.File]::Open($target,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
        try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($proof|ConvertTo-Json -Depth 8)+"`n");$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}
        finally{$stream.Dispose()}
    }
    [Console]::WriteLine(($proof|ConvertTo-Json -Depth 8 -Compress))
}
if($status -ne 0){throw $failure}
