param()
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$launcher = Join-Path $root 'launch-theme.ps1'
$link = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 夜城.lnk'
$metadata = Join-Path $root '.runtime/watcher.json'
if (-not (Test-Path -LiteralPath $link)) { throw 'Install the Start Menu shortcut first.' }
# This regression uses a running CDP instance; it never restarts Codex.
$targets = Invoke-RestMethod 'http://127.0.0.1:9335/json/list' -TimeoutSec 3
if (-not ($targets | Where-Object { $_.url -like 'app://-/index.html*' })) { throw 'Open Codex on CDP 9335 before this check.' }
Start-Process -FilePath $link -WindowStyle Hidden
$deadline = (Get-Date).AddSeconds(30)
$owned = @()
do {
    Start-Sleep -Seconds 1
    $owned = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'codedrobe\.mjs.*apply.*interlinked-codex.*--watch' })
} while ($owned.Count -eq 0 -and (Get-Date) -lt $deadline)
if ($owned.Count -ne 1) { throw "Expected one watcher, got $($owned.Count). Check .runtime/launcher.log." }
$watcherPid = $owned[0].ProcessId
Start-Process -FilePath $link -WindowStyle Hidden
Start-Sleep -Seconds 3
$again = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'codedrobe\.mjs.*apply.*interlinked-codex.*--watch' })
if ($again.Count -ne 1 -or $again[0].ProcessId -ne $watcherPid) { throw 'Repeated launch replaced or duplicated the watcher.' }
$state = Get-Content -LiteralPath $metadata -Raw | ConvertFrom-Json
if ($state.WatcherPid -ne $watcherPid) { throw 'Watcher metadata is stale.' }
if ((Get-Content (Join-Path $root '.runtime/launcher.log') -Raw) -match 'Probe does not launch') { throw 'Normal Core probe progress was treated as a fatal error.' }
Write-Output "Passed: real shortcut, normal probe stderr, one watcher ($watcherPid), repeated launch, current metadata."
