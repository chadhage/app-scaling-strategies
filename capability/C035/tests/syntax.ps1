$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'No syntax path overrides.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$count = 0
foreach ($file in Get-ChildItem -LiteralPath $root -Recurse -File -Filter '*.ps1') {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked syntax input denied.' }
    $tokens = $null
    $parseErrors = $null
    $null = [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw "PowerShell syntax failed in $($file.Name): $parseErrors" }
    $count++
}
[Console]::WriteLine(([ordered]@{syntaxFiles=$count;errors=0;sourceWrites=0}|ConvertTo-Json -Compress))
