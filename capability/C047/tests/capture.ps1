param(
  [Parameter(Mandatory=$true)][string]$Output,
  [Parameter(Mandatory=$true)][string]$DeadlineUtc,
  [Parameter(Mandatory=$true)][string[]]$NodeArgs,
  [string]$WorkingDirectory = (Get-Location).Path,
  [string]$HeavyScript = '',
  [string]$LockDir = '',
  [string]$Owner = 'worker-C047',
  [int]$TimeoutSeconds = 1200
)
$ErrorActionPreference = 'Stop'
$deadline = [DateTime]::Parse($DeadlineUtc).ToUniversalTime()
if ([DateTime]::UtcNow -ge $deadline) { throw 'C047 fixed deadline reached before capture' }
if (Test-Path -LiteralPath $Output) { throw 'Capture output already exists; never overwrite an attempt' }
[IO.Directory]::CreateDirectory($Output) | Out-Null
function Identity($Process) {
  $birth = $Process.StartTime.ToUniversalTime()
  [ordered]@{ pid=$Process.Id; birthUtc7=$birth.ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ'); birthFileTime=$birth.ToFileTimeUtc().ToString() }
}
function Save($Name, $Value) {
  $text = $Value | ConvertTo-Json -Depth 40
  [IO.File]::WriteAllText((Join-Path $Output $Name), $text + "`n", [Text.UTF8Encoding]::new($false))
}
$self = Identity (Get-Process -Id $PID)
Save 'owner.json' ([ordered]@{ owner=$Owner; process=$self; startedUtc=[DateTime]::UtcNow.ToString('o'); deadlineUtc=$deadline.ToString('o'); protectedPids=@(31036,35440) })
$namespace = Split-Path $PSScriptRoot -Parent
$sources = @()
foreach ($file in (Get-ChildItem -LiteralPath $namespace -File -Recurse | Sort-Object FullName)) {
  $rel = [IO.Path]::GetRelativePath($namespace, $file.FullName)
  $destination = Join-Path (Join-Path $Output 'sources') ($rel + '.source.txt')
  [IO.Directory]::CreateDirectory((Split-Path $destination -Parent)) | Out-Null
  [IO.File]::Copy($file.FullName, $destination, $false)
  $sources += [ordered]@{ path=$rel; sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=$file.Length }
}
Save 'inputs.json' ([ordered]@{ sources=$sources; workingDirectory=$WorkingDirectory; executable='node'; arguments=$NodeArgs; importedManifestSha256=(Get-FileHash -LiteralPath (Join-Path $namespace 'imports.json') -Algorithm SHA256).Hash.ToLowerInvariant() })
$lease = $null; $child = $null; $failure = $null; $exit = $null
try {
  if ($HeavyScript) {
    foreach ($item in (Get-ChildItem -LiteralPath $LockDir -File -ErrorAction SilentlyContinue)) {
      if ($item.LastWriteTimeUtc -lt [DateTime]::UtcNow.AddMinutes(-45)) { throw "Refuse legacy cleanup exposure to existing foreign lease: $($item.Name)" }
    }
    $queue = Join-Path $LockDir 'queue'
    foreach ($ticket in (Get-ChildItem -LiteralPath $queue -File -ErrorAction SilentlyContinue)) {
      $ticketPid = [int](($ticket.BaseName -split '-')[-1])
      if (-not (Get-Process -Id $ticketPid -ErrorAction SilentlyContinue)) { throw "Refuse legacy cleanup exposure to foreign ticket: $($ticket.Name)" }
    }
    $lease = & $HeavyScript -Action Acquire -Owner $Owner -Slots 3 -MaxWaitMinutes 1 -LockDir $LockDir
    Save 'lease-acquired.json' ([ordered]@{ slot=$lease; owner=$Owner; directory=$LockDir; process=$self; atUtc=[DateTime]::UtcNow.ToString('o') })
  }
  if ([DateTime]::UtcNow -ge $deadline) { throw 'Fixed deadline reached after admission' }
  $env:C047_WORKER_DEADLINE = $deadline.ToString('o')
  $env:C047_ADMISSION = Join-Path $Output 'admission.json'
  $env:C047_CAPTURE_DIR = $Output
  $env:NODE_V8_COVERAGE = ''
  Remove-Item Env:NODE_TEST_CONTEXT -ErrorAction SilentlyContinue
  $preload = Join-Path $PSScriptRoot 'admission.cjs'
  $arguments = @('--require', $preload) + $NodeArgs
  $quoted = @($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' })
  $child = Start-Process -FilePath (Get-Command node).Source -ArgumentList $quoted -WorkingDirectory $WorkingDirectory -RedirectStandardOutput (Join-Path $Output 'stdout.raw') -RedirectStandardError (Join-Path $Output 'stderr.raw') -PassThru -NoNewWindow
  $childIdentity = Identity $child
  Save 'admission.json' ([ordered]@{ pid=$child.Id; birth=$childIdentity; admittedAtUtc=[DateTime]::UtcNow.ToString('o') })
  $cap = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  if ($cap -gt $deadline) { $cap = $deadline }
  while (-not $child.WaitForExit(200)) {
    if ([DateTime]::UtcNow -ge $cap) {
      $current = Get-Process -Id $child.Id -ErrorAction SilentlyContinue
      if ($current -and (Identity $current).birthFileTime -ceq $childIdentity.birthFileTime) { Stop-Process -Id $child.Id -Force }
      $failure = 'WATCHDOG_NON_KILL'
      break
    }
  }
  $child.WaitForExit(); $exit = $child.ExitCode
} catch { $failure = $_.Exception.ToString() }
finally {
  if ($lease) {
    & $HeavyScript -Action Release -Owner $Owner -Slots 3 -LockDir $LockDir | Out-Null
    Save 'lease-released.json' ([ordered]@{ slot=$lease; owner=$Owner; atUtc=[DateTime]::UtcNow.ToString('o') })
  }
  $streams = @{}
  foreach ($name in @('stdout.raw','stderr.raw')) {
    $file = Join-Path $Output $name
    if (Test-Path -LiteralPath $file) { $streams[$name] = [ordered]@{ sha256=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant(); bytes=(Get-Item -LiteralPath $file).Length } }
  }
  Save 'result.json' ([ordered]@{ exitCode=$exit; infrastructureFailure=$failure; finishedAtUtc=[DateTime]::UtcNow.ToString('o'); streams=$streams; ownChildFullyReaped=$null -ne $exit; futureKillAuthority=$false; sourceManifestSha256=(Get-FileHash -LiteralPath (Join-Path $Output 'inputs.json') -Algorithm SHA256).Hash.ToLowerInvariant() })
}
if ($failure) { Write-Output "C047 capture failed infrastructure: $failure"; exit 2 }
Write-Output "C047 capture exit=$exit output=$Output"
exit $exit
