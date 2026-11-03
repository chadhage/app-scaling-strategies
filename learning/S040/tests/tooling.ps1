$ErrorActionPreference = 'Stop'
$owned = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent (Split-Path -Parent $owned)
$browser = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'
$helper = Join-Path $root 'testing\browser\isolated.cjs'
$nodeVersion = (& node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v22\.') { throw 'Existing Node 22 test tooling is required.' }
$playwright = (Get-Content -LiteralPath (Join-Path $root 'testing\browser\node_modules\playwright\package.json') -Raw | ConvertFrom-Json).version
if ($playwright -ne '1.56.1') { throw 'Only the existing offline Playwright 1.56.1 is approved.' }
$helperHash = (Get-FileHash -LiteralPath $helper -Algorithm SHA256).Hash.ToLowerInvariant()
if ($helperHash -ne '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055') { throw 'Published browser helper bytes differ.' }
$signature = Get-AuthenticodeSignature -LiteralPath $browser
$version = (Get-Item -LiteralPath $browser).VersionInfo.ProductVersion
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation' -or $version -notmatch '^156\.') { throw 'The installed signed Microsoft Edge 156 is required.' }
$proof = [ordered]@{
    cardId = 'A-S040'
    observedAtUtc = [DateTime]::UtcNow.ToString('o')
    nodeVersion = $nodeVersion
    nodeRole = 'Existing test tooling only; not production Node 24 validation.'
    playwrightVersion = $playwright
    browserExecutable = $browser
    browserVersion = $version
    browserSha256 = (Get-FileHash -LiteralPath $browser -Algorithm SHA256).Hash.ToLowerInvariant()
    signatureStatus = [string]$signature.Status
    signer = $signature.SignerCertificate.Subject
    helper = 'testing\browser\isolated.cjs'
    helperPublishedRevision = '53c0c0d'
    helperSha256 = $helperHash
    downloads = $false
    packagesInstalled = $false
    unsafeFlags = $false
    foregroundLease = $false
}
$json = ($proof | ConvertTo-Json -Depth 10) + [Environment]::NewLine
if ($env:CAPTURE_TOOL_EVIDENCE -eq '1') {
    $destination = Join-Path $owned 'evidence\runtime-provenance.json'
    $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
}
$json
