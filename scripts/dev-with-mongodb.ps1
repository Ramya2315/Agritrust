$ErrorActionPreference = "Stop"

$mongoExe = "C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe"
$workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
$dbPath = Join-Path $workspace ".mongodb\data"
$logDir = Join-Path $workspace ".mongodb\log"
$logPath = Join-Path $logDir "mongod.log"
$startedMongo = $null

if ($env:PRESERVE_VSCODE_DEBUG -ne "true") {
  Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue
  Remove-Item Env:VSCODE_INSPECTOR_OPTIONS -ErrorAction SilentlyContinue
}

if (-not $env:PORT) {
  $env:PORT = "3000"
}

if (-not $env:ALLOW_PORT_FALLBACK) {
  $env:ALLOW_PORT_FALLBACK = "true"
}

function Get-LanIPv4Address {
  try {
    $address = Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -notlike "127.*" -and
        $_.IPAddress -notlike "169.254.*" -and
        $_.PrefixOrigin -ne "WellKnown"
      } |
      Sort-Object InterfaceMetric |
      Select-Object -First 1 -ExpandProperty IPAddress

    if ($address) {
      return $address
    }
  } catch {
    return $null
  }

  return $null
}

if (-not $env:APP_URL) {
  $lanAddress = Get-LanIPv4Address
  if ($lanAddress) {
    $env:APP_URL = "http://$($lanAddress):$($env:PORT)"
    $env:APP_URL_AUTO = "true"
    Write-Host "[AgriTrustra] QR certificates will use network URL $($env:APP_URL)."
  } else {
    Write-Host "[AgriTrustra] No LAN IPv4 address found; QR certificates will use localhost."
  }
}

function Test-MongoPort {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect("127.0.0.1", 27017, $null, $null)
    if (-not $async.AsyncWaitHandle.WaitOne(500)) {
      return $false
    }
    $client.EndConnect($async)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

if (-not (Test-Path $mongoExe)) {
  throw "MongoDB executable was not found at $mongoExe. Install MongoDB Server or update scripts/dev-with-mongodb.ps1."
}

New-Item -ItemType Directory -Force -Path $dbPath, $logDir | Out-Null

if (Test-MongoPort) {
  Write-Host "[AgriTrustra] MongoDB is already listening on 127.0.0.1:27017."
} else {
  $mongoArgs = "--dbpath `"$dbPath`" --logpath `"$logPath`" --logappend --bind_ip 127.0.0.1 --port 27017 --wiredTigerCacheSizeGB 0.25 --setParameter diagnosticDataCollectionEnabled=false --setParameter wiredTigerConcurrentReadTransactions=32 --setParameter wiredTigerConcurrentWriteTransactions=32"
  $startedMongo = Start-Process -FilePath $mongoExe -ArgumentList $mongoArgs -WindowStyle Hidden -PassThru
  Write-Host "[AgriTrustra] Starting local MongoDB on 127.0.0.1:27017 (PID $($startedMongo.Id))."

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if ($startedMongo.HasExited) {
      throw "MongoDB exited during startup. Check $logPath for details."
    }
    if (Test-MongoPort) {
      $ready = $true
      break
    }
    $startedMongo.Refresh()
  }

  if (-not $ready) {
    throw "MongoDB did not start listening on 127.0.0.1:27017. Check $logPath for details."
  }
}

try {
  npx tsx server.ts
} finally {
  if ($startedMongo -and -not $startedMongo.HasExited) {
    Write-Host "[AgriTrustra] Stopping local MongoDB (PID $($startedMongo.Id))."
    Stop-Process -Id $startedMongo.Id -Force -ErrorAction SilentlyContinue
  }
}
