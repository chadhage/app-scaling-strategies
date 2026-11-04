param(
    [ValidateSet('installed','profile','closed')][string]$Action='installed',
    [int]$CallerNodePid,
    [int]$BrowserPid
)
$ErrorActionPreference='Stop'
if($args.Count -ne 0){throw 'No executable or ownership overrides'}
if($CallerNodePid -gt 0){
    $self=Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PID"
    if($self.ParentProcessId -ne $CallerNodePid){throw 'Only the actual caller-owned Node may inspect its child'}
}
if($Action -eq 'closed'){
    if($CallerNodePid -le 0 -or $BrowserPid -le 0){throw 'Exact observed own process required'}
    $process=@(Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $BrowserPid")
    [Console]::WriteLine(([ordered]@{actualBrowserPid=$BrowserPid;processGone=($process.Count -eq 0)}|ConvertTo-Json -Compress))
    return
}
$candidates=@(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$exe=@($candidates|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1)
if($exe.Count -ne 1){throw 'Already-installed signed Edge unavailable; no download or fallback'}
$signature=Get-AuthenticodeSignature -LiteralPath $exe[0]
$version=(Get-Item -LiteralPath $exe[0]).VersionInfo.FileVersion
if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation' -or $version -notmatch '^156\.'){
    throw 'Only the approved installed Microsoft-signed Edge 156 is admitted'
}
$actualPid=$null;$profile=$null
if($Action -eq 'profile'){
    if($CallerNodePid -le 0){throw 'Exact caller ownership required'}
    $owned=@(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'msedge.exe' AND ParentProcessId = $CallerNodePid")
    if($owned.Count -ne 1 -or $owned[0].ExecutablePath -ne $exe[0]){throw 'Exactly one actual caller-owned installed Edge child required'}
    if($owned[0].CommandLine -match '--no-sandbox|--disable-web-security|--ignore-certificate-errors'){throw 'Unsafe flags forbidden'}
    $actualPid=$owned[0].ProcessId
    $match=[regex]::Match($owned[0].CommandLine,'--user-data-dir=(?:"([^"]+)"|(\S+))')
    if(-not $match.Success){throw 'Actual owned isolated profile unobserved; no guessed ownership'}
    $profile=if($match.Groups[1].Success){$match.Groups[1].Value}else{$match.Groups[2].Value}
    $profile=[IO.Path]::GetFullPath($profile)
    $runtime=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..\.git\kanban-orchestrator\browser-runtime'))
    if(-not $profile.StartsWith("$runtime\",[StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($profile) -notmatch '^playwright_chromiumdev_profile-[A-Za-z0-9_-]+$'){
        throw 'Not the actual owned approved-helper isolated profile'
    }
}
[Console]::WriteLine(([ordered]@{
    executable=$exe[0];authenticodeStatus=[string]$signature.Status
    signer=$signature.SignerCertificate.Subject;thumbprint=$signature.SignerCertificate.Thumbprint
    fileVersion=$version;actualCallerNodePid=$CallerNodePid;actualOwnedBrowserPid=$actualPid
    actualIsolatedProfile=$profile;unsafeFlagsObserved=$false
    inspectedAtUtc=[DateTime]::UtcNow.ToString('o')
}|ConvertTo-Json -Compress))
