param(
    [switch]$InstallShortcut,
    [switch]$Check,
    [switch]$RestartExisting
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$theme = Join-Path $root 'dist/interlinked-codex.codedrobe-theme'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$modules = (& $npm root -g).Trim()
$core = Join-Path $modules '@codedrobe/core/bin/codedrobe.mjs'
foreach ($file in @($theme, $core)) {
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing file: $file. Run install.mjs and pack.mjs first." }
}
$runtime = Join-Path $root '.runtime'
$scriptPath = Join-Path $root 'launch-theme.ps1'
if ($Check) {
    [pscustomobject]@{Theme=$theme;Core=$core;Port=9335;StartupOnLogin=$false;Script=$scriptPath} | ConvertTo-Json
    exit 0
}
if ($InstallShortcut) {
    $linkPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 夜城.lnk'
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($linkPath)
    if ((Test-Path -LiteralPath $linkPath) -and $link.Arguments -notlike "*$scriptPath*") {
        throw "A different shortcut already exists: $linkPath"
    }
    $link.TargetPath = Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $link.Arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy RemoteSigned -File "' + $scriptPath + '"'
    $link.WorkingDirectory = $root
    $link.Description = '開啟 Codex 並套用夜城主題（不隨 Windows 登入啟動）'
    $link.WindowStyle = 7
    $app = (& $node $core detect --app codex --json | Out-String | ConvertFrom-Json)
    if ($app.executable) { $link.IconLocation = $app.executable + ',0' }
    $link.Save()
    Write-Output $linkPath
    exit 0
}
function Test-CodexEndpoint {
    try {
        $targets = Invoke-RestMethod 'http://127.0.0.1:9335/json/list' -TimeoutSec 2
        return [bool]($targets | Where-Object { $_.type -eq 'page' -and $_.url -like 'app://-/index.html*' })
    } catch { return $false }
}
function Get-CodexMain {
    Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" |
        Where-Object { $_.ExecutablePath -like '*OpenAI.Codex_*' -and $_.CommandLine -notmatch '--type=' }
}
$mutex = New-Object System.Threading.Mutex($false, 'Local\InterlinkedCodexTheme')
$ownsMutex = $false
$launcher = $null
$watcher = $null
try {
    try { $ownsMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsMutex = $true }
    if (-not $ownsMutex) { exit 0 }
    New-Item -ItemType Directory -Path $runtime -Force | Out-Null
    $log = Join-Path $runtime 'launcher.log'
    "$(Get-Date -Format o) Launch requested" | Set-Content -LiteralPath $log -Encoding UTF8
    # Only replace a watcher for this exact theme. Other themes/apps are not stopped.
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $_.CommandLine -match 'codedrobe\.mjs.*apply' -and $_.CommandLine -match '--watch' -and
        $_.CommandLine.Replace('\','/').Contains($theme.Replace('\','/'))
    } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
    if (-not (Test-CodexEndpoint)) {
        if ((Get-CodexMain) -and -not $RestartExisting) {
            throw 'Codex 已由原生入口開啟。請先完整關閉 Codex，再開「Codex 夜城」。'
        }
        $launchArgs = '"' + $core + '" launch --app codex --port 9335'
        if ($RestartExisting) { $launchArgs += ' --restart-existing' }
        # Launch and attach separately: the attach watcher survives Codex cold-start reloads.
        $launcher = Start-Process -FilePath $node -ArgumentList $launchArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'launch.log') -RedirectStandardError (Join-Path $runtime 'launch.err.log')
    }
    $deadline = (Get-Date).AddSeconds(60)
    $stable = 0
    while ((Get-Date) -lt $deadline -and $stable -lt 2) {
        if (Test-CodexEndpoint) {
            # Windows PowerShell 5.1 turns native stderr progress into ErrorRecords.
            # Core reports progress there even on success; only its exit code is a verdict.
            try {
                $ErrorActionPreference = 'Continue'
                & $node $core probe --app codex --port 9335 --theme $theme --timeout-ms 2000 > (Join-Path $runtime 'probe.log') 2> (Join-Path $runtime 'probe.err.log')
                $probeExit = $LASTEXITCODE
            } finally { $ErrorActionPreference = 'Stop' }
            if ($probeExit -eq 0) { $stable++ } else { $stable = 0 }
        }
        if ($stable -lt 2) { Start-Sleep -Seconds 1 }
    }
    if ($stable -lt 2) { throw "Codex 未在 60 秒內提供相容介面。請查看 $runtime 的 launch/probe 記錄。" }
    if ($launcher -and -not $launcher.HasExited) { Stop-Process -Id $launcher.Id -ErrorAction SilentlyContinue }
    $watchArgs = '"' + $core + '" apply --app codex --port 9335 --theme "' + $theme + '" --watch --no-launch'
    $watcher = Start-Process -FilePath $node -ArgumentList $watchArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'watcher.log') -RedirectStandardError (Join-Path $runtime 'watcher.err.log')
    [pscustomobject]@{LauncherPid=$PID;WatcherPid=$watcher.Id;Theme=$theme;StartedAt=(Get-Date -Format o)} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtime 'watcher.json') -Encoding UTF8
    "$(Get-Date -Format o) Watcher $($watcher.Id) started" | Add-Content -LiteralPath $log -Encoding UTF8
    while (-not $watcher.HasExited) {
        Start-Sleep -Seconds 3
        if (-not (Get-CodexMain)) { break }
    }
    if ($watcher.HasExited -and (Get-CodexMain)) { throw "主題 watcher 已退出。請查看 $runtime/watcher.err.log。" }
    "$(Get-Date -Format o) Codex closed; stopping owned watcher" | Add-Content -LiteralPath $log -Encoding UTF8
} catch {
    $message = $_.Exception.Message
    if (Test-Path -LiteralPath $runtime) { "$(Get-Date -Format o) $message" | Add-Content -LiteralPath (Join-Path $runtime 'launcher.log') -Encoding UTF8 }
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($message, 'Codex 夜城') | Out-Null
    exit 1
} finally {
    if ($watcher -and -not $watcher.HasExited) { Stop-Process -Id $watcher.Id -ErrorAction SilentlyContinue }
    if ($launcher -and -not $launcher.HasExited) { Stop-Process -Id $launcher.Id -ErrorAction SilentlyContinue }
    if ($ownsMutex) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
