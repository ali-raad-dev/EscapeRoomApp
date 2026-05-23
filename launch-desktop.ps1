$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$devPort = 5199
$devUrl = "http://localhost:$devPort/"

function Test-AppReady {
  param([string]$Url)

  try {
    Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 | Out-Null
    return $true
  } catch {
    return $false
  }
}

if (-not (Test-AppReady -Url $devUrl)) {
  Write-Host 'Starting dev server in the background...'
  $npmCommand = Get-Command npm.cmd -ErrorAction Stop
  $serverStdOut = Join-Path $projectRoot 'dev-server.out.log'
  $serverStdErr = Join-Path $projectRoot 'dev-server.err.log'
  Start-Process -FilePath $npmCommand.Source -ArgumentList 'run', 'dev', '--', '--port', $devPort, '--strictPort' -WorkingDirectory $projectRoot -RedirectStandardOutput $serverStdOut -RedirectStandardError $serverStdErr
}

Write-Host "Waiting for http://localhost:$devPort/ ..."
for ($attempt = 0; $attempt -lt 60; $attempt++) {
  if (Test-AppReady -Url $devUrl) {
    break
  }

  Start-Sleep -Milliseconds 500
}

if (-not (Test-AppReady -Url $devUrl)) {
  if (Test-Path (Join-Path $projectRoot 'dev-server.out.log')) {
    Write-Host '--- dev-server.out.log ---'
    Get-Content (Join-Path $projectRoot 'dev-server.out.log') | Write-Host
  }

  if (Test-Path (Join-Path $projectRoot 'dev-server.err.log')) {
    Write-Host '--- dev-server.err.log ---'
    Get-Content (Join-Path $projectRoot 'dev-server.err.log') | Write-Host
  }

  throw "Timed out waiting for the escape room app to start on port $devPort."
}

Write-Host 'Dev server is ready.'

$edgeCommand = Get-Command msedge.exe -ErrorAction SilentlyContinue
if ($edgeCommand) {
  $edgePath = $edgeCommand.Source
  Write-Host 'Opening app windows in Microsoft Edge...'
  Start-Process -FilePath $edgePath -ArgumentList "--app=$devUrl", '--new-window'
  Start-Process -FilePath $edgePath -ArgumentList "--app=$devUrl#/display", '--new-window'
} else {
  Write-Host 'Microsoft Edge not found; opening the default browser.'
  Start-Process -FilePath $devUrl
}