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
if ($version -notmatch '^156\.') { throw 'Only the qualified signed Edge 156 tooling is admitted.' }
[Console]::WriteLine(([ordered]@{
    executable = $exe[0]
    authenticodeStatus = [string]$signature.Status
    signer = $signature.SignerCertificate.Subject
    thumbprint = $signature.SignerCertificate.Thumbprint
    fileVersion = $version
} | ConvertTo-Json -Compress))
