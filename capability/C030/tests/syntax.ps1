$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No parser overrides.' }
$files = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..') -Recurse -File -Filter '*.ps1')
foreach ($file in $files) {
    $tokens = $null
    $errors = $null
    [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count -ne 0) { throw ($errors | Out-String) }
}
[Console]::WriteLine((@{ powerShellScripts = $files.Count; parserPassed = $true } | ConvertTo-Json -Compress))
