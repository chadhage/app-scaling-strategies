$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$request = [Console]::In.ReadLine() | ConvertFrom-Json
if ($request.share -notin @('None', 'ReadWrite')) { throw 'Unsupported share mode' }
$share = if ($request.share -eq 'None') { [IO.FileShare]::None } else { [IO.FileShare]::ReadWrite }
$held = [IO.File]::Open([string]$request.path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, $share)
try {
    [Console]::Out.WriteLine('{"event":"held","share":"' + $request.share + '"}')
    [Console]::Out.Flush()
    while ($null -ne ($command = [Console]::In.ReadLine())) {
        if ($command -eq 'state') {
            [Console]::Out.WriteLine('{"event":"still-held"}')
            [Console]::Out.Flush()
        } elseif ($command -eq 'release') {
            break
        } else { throw 'Unsupported command' }
    }
} finally {
    $held.Dispose()
    [Console]::Out.WriteLine('{"event":"closed"}')
    [Console]::Out.Flush()
}
