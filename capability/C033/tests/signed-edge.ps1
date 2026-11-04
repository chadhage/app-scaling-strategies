param([int]$CallerNodePid)
$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No configurable browser executable is supported.' }
$candidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
)
$exe = @($candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)
if ($exe.Count -ne 1) { throw 'The already-installed signed Microsoft Edge executable is unavailable.' }
$signature = Get-AuthenticodeSignature -LiteralPath $exe[0]
$version = (Get-Item -LiteralPath $exe[0]).VersionInfo.FileVersion
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') {
    throw 'The installed Edge signature is not verifiably valid Microsoft Corporation.'
}
if ($version -notmatch '^156\.') { throw 'Only the approved offline signed Edge 156 tooling is admitted.' }
$browserPid = $null
if ($CallerNodePid -gt 0) {
    $self = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $PID"
    if ($self.ParentProcessId -ne $CallerNodePid) { throw 'Browser inspection requires this script actual caller-owned Node PID.' }
    $owned = @(Get-CimInstance -ClassName Win32_Process -Filter "Name = 'msedge.exe' AND ParentProcessId = $CallerNodePid")
    if ($owned.Count -ne 1 -or $owned[0].ExecutablePath -ne $exe[0]) {
        throw 'Exactly one actual caller-owned installed Edge process must be observable.'
    }
    if ($owned[0].CommandLine -match '--no-sandbox|--disable-web-security|--ignore-certificate-errors') {
        throw 'Unsafe browser flags are not admitted.'
    }
    $browserPid = $owned[0].ProcessId
}
[Console]::WriteLine(([ordered]@{
    executable = $exe[0]
    authenticodeStatus = [string]$signature.Status
    signer = $signature.SignerCertificate.Subject
    thumbprint = $signature.SignerCertificate.Thumbprint
    fileVersion = $version
    actualCallerNodePid = if ($CallerNodePid -gt 0) { $CallerNodePid } else { $null }
    actualOwnedBrowserPid = $browserPid
    unsafeFlagsObserved = $false
    inspectedAtUtc = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json -Compress))
