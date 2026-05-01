$ErrorActionPreference = "Stop"

Write-Host "Starting ZK-Samvidhan full stack..." -ForegroundColor Cyan

$root = Resolve-Path $PSScriptRoot

function Stop-Port($port) {
  $lines = netstat -ano | Select-String -Pattern (":$port\s+.*LISTENING\s+(\d+)$")
  foreach ($m in $lines.Matches) {
    $procId = [int]$m.Groups[1].Value
    if ($procId -gt 0) {
      try {
        Write-Host "Stopping PID $procId on port $port" -ForegroundColor Yellow
        taskkill /PID $procId /F | Out-Null
      } catch {
        Write-Host "Could not stop PID $procId (port $port): $($_.Exception.Message)" -ForegroundColor DarkYellow
      }
    }
  }
}

function Ensure-NpmInstall($dir) {
  if (!(Test-Path (Join-Path $dir "node_modules"))) {
    Write-Host "Installing deps in $dir" -ForegroundColor Yellow
    Push-Location $dir
    npm i
    Pop-Location
  }
}

Ensure-NpmInstall (Join-Path $root "server")
Ensure-NpmInstall (Join-Path $root "frontend")

Write-Host "Cleaning up old dev servers..." -ForegroundColor Yellow
Stop-Port 8787
Stop-Port 5173
Stop-Port 5174
Stop-Port 5175

Write-Host "Syncing ZK artifacts into frontend/public/zk ..." -ForegroundColor Green
$zkPublic = Join-Path $root "frontend\public\zk"
$zkBuild = Join-Path $root "circuits\build"
New-Item -ItemType Directory -Force -Path $zkPublic | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $zkPublic "incomeEligibility_js") | Out-Null

Copy-Item -Force (Join-Path $zkBuild "circuit_final.zkey") (Join-Path $zkPublic "circuit_final.zkey")
Copy-Item -Force (Join-Path $zkBuild "incomeEligibility_js\incomeEligibility.wasm") (Join-Path $zkPublic "incomeEligibility_js\incomeEligibility.wasm")
Copy-Item -Force (Join-Path $zkBuild "incomeEligibility_js\generate_witness.js") (Join-Path $zkPublic "incomeEligibility_js\generate_witness.js")
Copy-Item -Force (Join-Path $zkBuild "incomeEligibility_js\witness_calculator.js") (Join-Path $zkPublic "incomeEligibility_js\witness_calculator.js")

Write-Host "Launching backend (Pinata proxy) on http://localhost:8787" -ForegroundColor Green
Start-Process powershell -WorkingDirectory (Join-Path $root "server") -ArgumentList "-NoExit","-Command","npm run dev"

Write-Host "Launching frontend on http://localhost:5173" -ForegroundColor Green
Start-Process powershell -WorkingDirectory (Join-Path $root "frontend") -ArgumentList "-NoExit","-Command","npm run dev -- --host --port 5173"

Write-Host ""
Write-Host "Done. Open http://localhost:5173" -ForegroundColor Cyan

