param(
    [ValidateSet('setup', 'frontend', 'backend', 'check')]
    [string]$Task = 'check',
    [string]$Python = 'python'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$projectPython = Join-Path $projectRoot '.venv/Scripts/python.exe'

function Invoke-Checked {
    param([string]$Program, [string[]]$Arguments)
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

Push-Location $projectRoot
try {
    switch ($Task) {
        'setup' {
            if (-not (Test-Path $projectPython)) {
                Invoke-Checked $Python @('-c', 'import sys; assert (3,11) <= sys.version_info[:2] <= (3,12), "Use Python 3.11 or 3.12"')
                Invoke-Checked $Python @('-m', 'venv', '.venv')
            }
            Invoke-Checked $projectPython @('-m', 'pip', 'install', '-r', 'server/requirements.txt')
            Push-Location frontend
            try { Invoke-Checked 'npx.cmd' @('--yes', 'pnpm@10.15.1', 'install', '--frozen-lockfile') }
            finally { Pop-Location }
        }
        'frontend' {
            Push-Location frontend
            try {
                $env:VITE_API_BASE = 'http://localhost:8001'
                Invoke-Checked 'npx.cmd' @('--yes', 'pnpm@10.15.1', 'dev', '--host', '127.0.0.1')
            } finally { Pop-Location }
        }
        'backend' {
            if (-not (Test-Path 'server/.env')) {
                throw 'Configure server/.env with your LOCAL PostgreSQL URL and JWT_SECRET first; see docs/deploy-pipeline.md.'
            }
            Push-Location server
            try { Invoke-Checked $projectPython @('-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8001') }
            finally { Pop-Location }
        }
        'check' {
            Push-Location frontend
            $previousApiBase = $env:VITE_API_BASE
            try {
                $env:VITE_API_BASE = '/api'
                Invoke-Checked 'npx.cmd' @('--yes', 'pnpm@10.15.1', 'build')
            } finally {
                $env:VITE_API_BASE = $previousApiBase
                Pop-Location
            }
            $previousDatabaseUrl = $env:DATABASE_URL
            try {
                $env:DATABASE_URL = 'sqlite+pysqlite:///:memory:'
                New-Item -ItemType Directory -Force '.cache' | Out-Null
                $testTemp = Join-Path $projectRoot ('.cache/pytest-' + [guid]::NewGuid().ToString('N'))
                Push-Location server
                try { Invoke-Checked $projectPython @('-m', 'pytest', '-q', "--basetemp=$testTemp") }
                finally { Pop-Location }
            } finally { $env:DATABASE_URL = $previousDatabaseUrl }
        }
    }
} finally { Pop-Location }
