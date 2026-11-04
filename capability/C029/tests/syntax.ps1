$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No syntax file overrides.' }
$files = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot '..') -Recurse -File -Filter '*.ps1')
foreach ($file in $files) {
    $tokens = $null
    $errors = $null
    [System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors) | Out-Null
    if ($errors.Count) { throw ($errors | Out-String) }
}
[Console]::WriteLine("PowerShell syntax: $($files.Count) own scripts; no execution or publisher byte comparison.")
