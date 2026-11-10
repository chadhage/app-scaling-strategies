param(
    [Parameter(Mandatory)][string]$Source,
    [Parameter(Mandatory)][string]$Output
)
$ErrorActionPreference = 'Stop'
$sourceFile = (Resolve-Path -LiteralPath $Source).Path
$outputFile = [IO.Path]::GetFullPath($Output)
if (Test-Path -LiteralPath $outputFile) { throw 'New immutable coverage output required.' }
$tokens = $null
$parseErrors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($sourceFile, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Production parser errors.' }
$statements = @($ast.FindAll({ param($node)
    $node -is [Management.Automation.Language.StatementAst] -and
    $node -isnot [Management.Automation.Language.StatementBlockAst] -and
    $node -isnot [Management.Automation.Language.TryStatementAst]
}, $true))
$executableLines = @($statements | ForEach-Object { $_.Extent.StartLineNumber } | Sort-Object -Unique)
$ifs = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.IfStatementAst] }, $true))
$loops = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.ForEachStatementAst] }, $true))
$functions = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] }, $true))
$scriptBlocks = @($ast.FindAll({ param($node) $node -is [Management.Automation.Language.ScriptBlockExpressionAst] }, $true))
if ($ifs.Count -ne 3 -or $loops.Count -ne 1 -or $functions.Count -ne 0 -or $scriptBlocks.Count -ne 1) {
    throw 'Complete branch/entry inventory changed; manual review required.'
}
$global:U071Coverage = @{
    lines = @{}
    branches = @{}
    entries = @{ 'top-level-script' = 0; 'Where-Object-predicate' = 0 }
    trace = [Collections.Generic.List[object]]::new()
    scenario = ''
    replacementMutex = $null
    originalMutex = $null
    finalMutex = $null
    target = ''
    values = [Collections.Generic.List[object]]::new()
}
foreach ($node in $ifs) {
    foreach ($side in 'true','false') { $global:U071Coverage.branches["if:$($node.Extent.StartLineNumber):$side"] = 0 }
}
foreach ($side in 'enter','exit') { $global:U071Coverage.branches["foreach:11:$side"] = 0 }
foreach ($side in 'true','false') { $global:U071Coverage.branches["predicate:12:$side"] = 0 }
foreach ($side in 'normal','exception') { $global:U071Coverage.branches["try:$side"] = 0 }
$fixtures = Join-Path (Split-Path -Parent $outputFile) ([IO.Path]::GetFileNameWithoutExtension($outputFile) + '-fixtures')
[IO.Directory]::CreateDirectory($fixtures) | Out-Null
$cases = @(
    @{ name = 'minimal-valid-mixed'; mode = 'valid' },
    @{ name = 'full-current-mixed'; mode = 'full' },
    @{ name = 'missing-prerequisite'; mode = 'missing' },
    @{ name = 'duplicate-prerequisite'; mode = 'duplicate' },
    @{ name = 'malformed-json'; mode = 'malformed' },
    @{ name = 'owned-mutex-refusal'; mode = 'mutex' }
)
$results = [Collections.Generic.List[object]]::new()
foreach ($case in $cases) {
    $fixture = Join-Path $fixtures $case.name
    $target = Join-Path $fixture 'capability\C045\consent.ps1'
    $ledger = Join-Path $fixture '.docs\wiki\flow-state.json'
    [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
    [IO.Directory]::CreateDirectory((Split-Path -Parent $ledger)) | Out-Null
    [IO.File]::WriteAllBytes($target, [IO.File]::ReadAllBytes($sourceFile))
    $state = [ordered]@{
        approvals = @{ C001 = ('{"approved":true,"M1":"upper","m1":"lower"}' | ConvertFrom-Json -AsHashtable) }
        cards = @(
            @{ id = 'unrelated'; state = 'Done'; review = @{}; publication = @{} },
            @{ id = 'C020'; state = 'Done'; review = @{ accepted = $true; focusedTestsPassed = $true; browserObserved = $true; remoteVerified = $true }; publication = @{ commit = 'old-C020'; tag = 'tag-C020' } },
            @{ id = 'C041'; state = 'Done'; review = @{ accepted = $true; focusedTestsPassed = $true; browserObserved = $true; remoteVerified = $true }; publication = @{ commit = 'old-C041'; tag = 'tag-C041' } }
        )
    }
    if ($case.mode -eq 'missing') { $state.cards = @($state.cards | Where-Object id -ne 'C041') }
    if ($case.mode -eq 'duplicate') { $state.cards += $state.cards[1] }
    $json = $state | ConvertTo-Json -Depth 20 -Compress
    if ($case.mode -eq 'malformed') { $json = '{"cards":[' }
    if ($case.mode -eq 'full') {
        $actualLedger = Join-Path ([IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $sourceFile) '..\..'))) '.docs\wiki\flow-state.json'
        $json = [IO.File]::ReadAllText($actualLedger)
    }
    [IO.File]::WriteAllText($ledger, $json, [Text.UTF8Encoding]::new($false))
    $global:U071Coverage.scenario = $case.name
    $global:U071Coverage.target = $target
    $global:U071Coverage.finalMutex = $null
    $global:U071Coverage.originalMutex = $null
    $global:U071Coverage.replacementMutex = $null
    $holder = $null
    $holderPowerShell = $null
    $ready = $null
    $release = $null
    if ($case.mode -eq 'mutex') {
        $ownedName = 'Local\U071_' + [Guid]::NewGuid().ToString('N')
        $ready = [Threading.ManualResetEventSlim]::new($false)
        $release = [Threading.ManualResetEventSlim]::new($false)
        $holderPowerShell = [PowerShell]::Create()
        $null = $holderPowerShell.AddScript({
            param($name, $ready, $release)
            $owned = [Threading.Mutex]::new($false, $name)
            $ownedHeld = $false
            try {
                $ownedHeld = $owned.WaitOne()
                $ready.Set()
                $release.Wait()
            } finally {
                if ($ownedHeld) { $owned.ReleaseMutex() }
                $owned.Dispose()
            }
        }).AddArgument($ownedName).AddArgument($ready).AddArgument($release)
        $holder = $holderPowerShell.BeginInvoke()
        if (-not $ready.Wait([TimeSpan]::FromSeconds(15))) { throw 'Owned mutex holder did not become ready.' }
        $global:U071Coverage.replacementMutex = [Threading.Mutex]::new($false, $ownedName)
    }
    $breakpoints = @()
    try {
        foreach ($line in $executableLines) {
            $breakpoints += Set-PSBreakpoint -Script $target -Line $line -Action {
                $frame = @(Get-PSCallStack | Where-Object ScriptName -eq $global:U071Coverage.target)[0]
                $lineNumber = $frame.ScriptLineNumber
                $key = [string]$lineNumber
                if (-not $global:U071Coverage.lines.ContainsKey($key)) { $global:U071Coverage.lines[$key] = 0 }
                $global:U071Coverage.lines[$key]++
                $global:U071Coverage.trace.Add(@{ scenario = $global:U071Coverage.scenario; line = $lineNumber })
                switch ($lineNumber) {
                    1 { $global:U071Coverage.entries['top-level-script']++ }
                    7 {
                        if ($global:U071Coverage.replacementMutex -and -not $global:U071Coverage.originalMutex) {
                            $global:U071Coverage.originalMutex = $mutex
                            $mutex.Dispose()
                            Set-Variable -Name mutex -Value $global:U071Coverage.replacementMutex -Scope 1
                        }
                        $global:U071Coverage.finalMutex = Get-Variable -Name mutex -Scope 1 -ValueOnly
                    }
                    8 { $global:U071Coverage.branches["if:8:$((-not $held).ToString().ToLowerInvariant())"]++ }
                    12 { $global:U071Coverage.branches['foreach:11:enter']++ }
                    13 {
                        $global:U071Coverage.branches["if:13:$(($cards.Count -ne 1).ToString().ToLowerInvariant())"]++
                    }
                    26 {
                        $global:U071Coverage.branches['foreach:11:exit']++
                        foreach ($observedGate in $gates) {
                            $sourceCard = @($state.cards | Where-Object id -eq $observedGate.id)[0]
                            $fields = @(
                                @(16, 'id', $sourceCard.id), @(17, 'state', $sourceCard.state),
                                @(18, 'accepted', $sourceCard.review.accepted),
                                @(19, 'focusedTestsPassed', $sourceCard.review.focusedTestsPassed),
                                @(20, 'browserObserved', $sourceCard.review.browserObserved),
                                @(21, 'remoteVerified', $sourceCard.review.remoteVerified),
                                @(22, 'commit', $sourceCard.publication.commit),
                                @(23, 'tag', $sourceCard.publication.tag)
                            )
                            foreach ($field in $fields) {
                                if (-not $observedGate.Contains($field[1]) -or $observedGate[$field[1]] -cne $field[2]) {
                                    throw "Whole AST dictionary field observation disagreed: $($field[1])"
                                }
                                $global:U071Coverage.values.Add(@{
                                    line = $field[0]; field = $field[1]; gate = $observedGate.id
                                    actual = $observedGate[$field[1]]; expected = $field[2]
                                    scenario = $global:U071Coverage.scenario
                                    method = 'Actual completed dictionary value at the next debugger sequence point; PowerShell attributes these AST property expressions to the enclosing line 15 sequence point.'
                                })
                            }
                        }
                    }
                    28 { $global:U071Coverage.branches["if:28:$($held.ToString().ToLowerInvariant())"]++ }
                }
            }
        }
        $predicateColumn = $scriptBlocks[0].ScriptBlock.EndBlock.Statements[0].Extent.StartColumnNumber
        $breakpoints += Set-PSBreakpoint -Script $target -Line 12 -Column $predicateColumn -Action {
            $global:U071Coverage.entries['Where-Object-predicate']++
            $predicateItem = Get-Variable -Name _ -Scope 1 -ValueOnly
            $global:U071Coverage.branches["predicate:12:$(($predicateItem.id -eq $id).ToString().ToLowerInvariant())"]++
        }
        $caught = $null
        $value = $null
        try {
            $value = & $target
            $global:U071Coverage.branches['try:normal']++
        } catch {
            $caught = $_
            $global:U071Coverage.branches['try:exception']++
        }
        $shouldPass = $case.mode -in 'valid','full'
        if ($shouldPass) {
            if ($caught) { throw $caught }
            $parsed = $value | ConvertFrom-Json -AsHashtable
            if (($parsed.gates.id -join ',') -ne 'C020,C041') { throw 'Original ordered gate output changed.' }
            if ($case.mode -eq 'valid' -and ($parsed.approval.M1 -ne 'upper' -or $parsed.approval.m1 -ne 'lower')) {
                throw 'Case-distinct values were lost.'
            }
        } else {
            if (-not $caught) { throw "Required refusal missing: $($case.name)" }
            $expected = switch ($case.mode) {
                'missing' { 'Accepted prerequisite is unavailable.' }
                'duplicate' { 'Accepted prerequisite is unavailable.' }
                'mutex' { 'Current consent mutex timed out.' }
                'malformed' { 'JSON' }
            }
            if (-not $caught.ToString().Contains($expected)) { throw "Wrong refusal: $caught" }
        }
        if (-not $global:U071Coverage.finalMutex.SafeWaitHandle.IsClosed) { throw 'Finally did not dispose the exact executed mutex.' }
        $results.Add(@{ name = $case.name; passed = $true; refusal = if ($caught) { $caught.ToString() } else { $null };
            mutexDisposed = $global:U071Coverage.finalMutex.SafeWaitHandle.IsClosed
            fixtureSourceSha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() })
    } finally {
        $breakpoints | Remove-PSBreakpoint
        if ($release) { $release.Set() }
        if ($holder) { $null = $holderPowerShell.EndInvoke($holder) }
        if ($holderPowerShell) { $holderPowerShell.Dispose() }
        if ($ready) { $ready.Dispose() }
        if ($release) { $release.Dispose() }
    }
}
$lineRows = @($executableLines | ForEach-Object {
    $lineNumber = $_
    $direct = [int]$global:U071Coverage.lines[[string]$lineNumber]
    $valueHits = @($global:U071Coverage.values | Where-Object line -eq $lineNumber).Count
    @{ line = $lineNumber; debuggerHits = $direct; completedAstValueObservations = $valueHits; hits = $direct + $valueHits }
})
$branchRows = @($global:U071Coverage.branches.Keys | Sort-Object | ForEach-Object {
    @{ branch = $_; hits = $global:U071Coverage.branches[$_] }
})
$entryRows = @($global:U071Coverage.entries.Keys | Sort-Object | ForEach-Object {
    @{ entry = $_; hits = $global:U071Coverage.entries[$_] }
})
function Metric($rows) {
    if (-not $rows.Count) { throw 'Unloaded/empty denominator is not coverage.' }
    return [Math]::Round(100.0 * @($rows | Where-Object hits -gt 0).Count / $rows.Count, 4)
}
$report = [ordered]@{
    schema = 'U071-actual-whole-powershell-debugger-AST-coverage/1'
    sourceSha256 = (Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant()
    sourceBytes = ([IO.File]::ReadAllBytes($sourceFile)).Length
    powershell = $PSVersionTable.PSVersion.ToString()
    method = 'Exact whole production source in isolated owned ledger fixtures; actual debugger line/predicate hits plus complete AST if/loop/predicate/try branch and top-level/predicate entry inventory. No source instrumentation or excluded ranges.'
    mutexRefusal = 'Only at line 7, dispose the unacquired shared-name handle and replace it with a genuinely contended randomly named owned Mutex; no shared lock is held, released or disposed by another owner.'
    declaredFunctions = $functions.Count
    executableAstStatements = @($statements | ForEach-Object { @{ kind = $_.GetType().Name; line = $_.Extent.StartLineNumber; column = $_.Extent.StartColumnNumber; text = $_.Extent.Text } })
    lineRows = $lineRows
    branchRows = $branchRows
    entryRows = $entryRows
    lines = Metric $lineRows
    branches = Metric $branchRows
    functionsOrScriptEntries = Metric $entryRows
    cases = @($results)
    actualTrace = @($global:U071Coverage.trace)
    completedDictionaryValueObservations = @($global:U071Coverage.values)
    unloadedIsZero = $true
}
[IO.File]::WriteAllText($outputFile, ($report | ConvertTo-Json -Depth 30), [Text.UTF8Encoding]::new($false))
@{ sourceSha256 = $report['sourceSha256']; lines = $report['lines']; branches = $report['branches']; functionsOrScriptEntries = $report['functionsOrScriptEntries'] } | ConvertTo-Json -Compress
if ($report['lines'] -lt 85 -or $report['branches'] -lt 85 -or $report['functionsOrScriptEntries'] -lt 85) { throw 'Whole source coverage below 85/85/85; immutable report retained.' }
