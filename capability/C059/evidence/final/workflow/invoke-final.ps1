param(
    [Parameter(Mandatory=$true)][string]$Stage,
    [Parameter(Mandatory=$true)][string]$Recorder,
    [ValidateSet('none','heavy','mutation')][string]$Slot = 'none',
    [int]$TimeoutSeconds = 6000
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$repo = (Get-Location).Path
$run = Join-Path $repo '.git\kanban-orchestrator\execution-20261108-64927fc0'
$helper = Join-Path (Split-Path -Parent $Recorder) 'heavy-slot.ps1'
$owner = 'worker-C059-final-45a6ed05'
$slots = if ($Slot -eq 'mutation') { 4 } else { 3 }
$lockDir = if ($Slot -eq 'mutation') { Join-Path $run 'mutation-locks' } else { Join-Path $run 'heavy-locks' }
if (-not (Test-Path -LiteralPath 'Q:\live-snapshot-before-copy.json')) { throw 'Owned neutral mapping is missing' }
$env:C059_ACTUAL_REPO = $repo
$env:C059_RECORDER = $Recorder
$env:C059_NEUTRAL_ROOT = 'Q:\'
$env:GIT_DIR = Join-Path $repo '.git'
$env:NODE_PATH = Join-Path $repo 'testing\browser\node_modules'
foreach ($key in @('NODE_TEST_CONTEXT','NODE_V8_COVERAGE','CAPTURE_BROWSER_EVIDENCE')) {
    Remove-Item "Env:$key" -ErrorAction SilentlyContinue
}
$logs = Join-Path $root 'stage-output'
[IO.Directory]::CreateDirectory($logs) | Out-Null
$stdout = Join-Path $logs "$Stage.stdout.txt"
$stderr = Join-Path $logs "$Stage.stderr.txt"
if ((Test-Path -LiteralPath $stdout) -or (Test-Path -LiteralPath $stderr)) { throw 'Stage logs are immutable; use a new phase, never overwrite' }
$held = $false
$process = $null
$started = [DateTime]::UtcNow
try {
    if ($Slot -ne 'none') {
        $stale = @(Get-ChildItem -LiteralPath $lockDir -Filter '*.lock' -File |
            Where-Object LastWriteTimeUtc -LT ([DateTime]::UtcNow.AddMinutes(-58)))
        if ($stale.Count) { throw 'Foreign lock would approach legacy stale deletion; parent reconciliation required' }
        $queue = Join-Path $lockDir 'queue'
        if (Test-Path -LiteralPath $queue) {
            foreach ($ticket in Get-ChildItem -LiteralPath $queue -Filter '*.q' -File) {
                $ticketPid = [int](($ticket.BaseName -split '-')[-1])
                if (-not (Get-Process -Id $ticketPid -ErrorAction SilentlyContinue)) {
                    throw 'Foreign abandoned queue ticket requires parent reconciliation, not worker deletion'
                }
            }
        }
        & $helper -Action Acquire -Owner $owner -Slots $slots -LockDir $lockDir -MaxWaitMinutes 1
        $held = $true
    }
    $exe = (Get-Command node).Source
    $process = Start-Process -FilePath $exe -ArgumentList @("`"$(Join-Path $root 'stage-final.cjs')`"", $Stage) `
        -WorkingDirectory $root -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    $process.PriorityClass = 'Normal'
    Write-Output "START $Stage ownedPID=$($process.Id) priority=$($process.PriorityClass) slot=$Slot"
    $deadline = $started.AddSeconds($TimeoutSeconds)
    while (-not $process.WaitForExit(15000)) {
        [IO.File]::WriteAllText((Join-Path $root 'heartbeat.txt'), "$([DateTime]::UtcNow.ToString('o')) $Stage running ownedPID=$($process.Id); return-by 2026-11-10T08:00:08-05:00")
        if ($held) {
            foreach ($lock in Get-ChildItem -LiteralPath $lockDir -Filter '*.lock' -File) {
                if ((Get-Content -LiteralPath $lock.FullName -Raw).StartsWith("$owner ")) {
                    $lock.LastWriteTimeUtc = [DateTime]::UtcNow
                }
            }
        }
        if ([DateTime]::UtcNow -gt $deadline) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
            throw "Bounded stage deadline exceeded: $Stage; not a pass"
        }
    }
    $process.WaitForExit()
    $process.Refresh()
    Get-Content -LiteralPath $stdout -Tail 28
    if ((Get-Item -LiteralPath $stderr).Length) { Get-Content -LiteralPath $stderr -Tail 28 }
    if ($process.ExitCode -ne 0) { throw "$Stage exited $($process.ExitCode); preserve the failed capture" }
    [IO.File]::WriteAllText((Join-Path $root 'heartbeat.txt'), "$([DateTime]::UtcNow.ToString('o')) $Stage complete exit=0; not self-acceptance; return-by 2026-11-10T08:00:08-05:00")
    Write-Output "END $Stage exit=0 elapsed=$([int]([DateTime]::UtcNow-$started).TotalSeconds)s"
} finally {
    if ($process) {
        $process.Refresh()
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
    }
    if ($held) { & $helper -Action Release -Owner $owner -Slots $slots -LockDir $lockDir }
}
