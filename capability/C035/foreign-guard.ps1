$script:C035ForeignCli = Join-Path $PSScriptRoot 'foreign-index.cjs'
function Invoke-C035ForeignPreserved([string]$Repository, [ScriptBlock]$Operation) {
    $ErrorActionPreference = 'Stop'
    $beforeText = (& node $script:C035ForeignCli snapshot $Repository | Out-String).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Foreign staged-index snapshot failed before the operation; no cleanup, restaging or fabricated entry.' }
    $result = & $Operation
    $verifyText = ($beforeText | & node $script:C035ForeignCli verify $Repository | Out-String).Trim()
    $verifyExit = $LASTEXITCODE
    $verified = $verifyText | ConvertFrom-Json -AsHashtable
    if ($verifyExit -ne 0 -or $verified.preserved -isnot [bool] -or $verified.preserved -ne $true) {
        throw "Foreign staged entries or flags changed ($($verified.changed -join ', ')); report honestly without unowned cleanup."
    }
    return [ordered]@{result=$result;preserved=$true;before=$verified.before;after=$verified.after}
}
