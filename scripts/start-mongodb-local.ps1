$ErrorActionPreference = "Stop"

$mongoExe = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
$workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$dbPath = Join-Path $workspace ".mongodb\data"
$logDir = Join-Path $workspace ".mongodb\log"
$logPath = Join-Path $logDir "mongod.log"

if (-not (Test-Path $mongoExe)) {
  throw "MongoDB executable was not found at $mongoExe. Install MongoDB Server or update scripts/start-mongodb-local.ps1."
}

New-Item -ItemType Directory -Force -Path $dbPath, $logDir | Out-Null

$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 27017 -State Listen -ErrorAction SilentlyContinue
if ($listener) {
  Write-Host "MongoDB is already listening on 127.0.0.1:27017 (PID $($listener.OwningProcess))."
  exit 0
}

$argsLine = "--dbpath `"$dbPath`" --logpath `"$logPath`" --logappend --bind_ip 127.0.0.1 --port 27017 --wiredTigerCacheSizeGB 0.25 --setParameter diagnosticDataCollectionEnabled=false --setParameter wiredTigerConcurrentReadTransactions=32 --setParameter wiredTigerConcurrentWriteTransactions=32"
$process = Start-Process -FilePath $mongoExe -ArgumentList $argsLine -WindowStyle Hidden -PassThru

Start-Sleep -Seconds 3
$process.Refresh()
if ($process.HasExited) {
  Write-Error "MongoDB exited with code $($process.ExitCode). Check $logPath for details."
  exit 1
}

Write-Host "MongoDB started on 127.0.0.1:27017 (PID $($process.Id))."
