$ErrorActionPreference='Stop'
if($args.Count -ne 0 -or $env:CAPTURE_BROWSER_EVIDENCE -cne '1'){throw 'Exact explicit own publication only.'}
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$directory=[IO.Path]::GetFullPath($env:C037_CAPTURE_DIR)
if([IO.Path]::GetDirectoryName($directory) -cne (Join-Path $root 'evidence\raw') -or
    [IO.Path]::GetFileName($directory) -notmatch '^publication-[0-9a-f-]{36}$'){throw 'Exact unique own publication directory required.'}
. (Join-Path $PSScriptRoot 'git-transport.ps1')
$proof=[ordered]@{cardId='C037';ownedPublicationBoundaryInvoked=$false;unchangedStandardPublisherInvoked=$null}
$status=1
try{
    Invoke-C037Http11 {
        $proof.ownedPublicationBoundaryInvoked=$true
        & (Join-Path $PSScriptRoot 'publish-owned.ps1')
    } $proof
    $status=0
}catch{[Console]::Error.WriteLine($_.Exception.ToString())}
finally{
    if(Test-Path -LiteralPath (Join-Path $directory 'receipt.json')){$proof.unchangedStandardPublisherInvoked=$true}
    $proof.exitCode=$status
    $proof.observedAtUtc=[DateTime]::UtcNow.ToString('o')
    $stream=[IO.File]::Open((Join-Path $directory 'transport.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try{$bytes=[Text.UTF8Encoding]::new($false).GetBytes(($proof|ConvertTo-Json -Depth 8)+[Environment]::NewLine);$stream.Write($bytes,0,$bytes.Length);$stream.Flush($true)}finally{$stream.Dispose()}
}
exit $status
