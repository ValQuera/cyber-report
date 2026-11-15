$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$backend = Join-Path $root "backend"
$frontend = Join-Path $root "frontend"
$powerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python tidak ditemukan di PATH. Install Python lalu buka ulang terminal."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm tidak ditemukan di PATH. Install Node.js LTS lalu buka ulang VS Code."
}

Start-Process -FilePath $powerShell `
    -ArgumentList @("-NoExit", "-Command", "python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000") `
    -WorkingDirectory $backend
Start-Process -FilePath $powerShell `
    -ArgumentList @("-NoExit", "-Command", "npm run dev -- --host 127.0.0.1") `
    -WorkingDirectory $frontend

Write-Host "CYBER REPORT started. API: http://localhost:8000/docs | Web: http://localhost:5173"
