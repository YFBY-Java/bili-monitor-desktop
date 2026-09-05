$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "activate-environment.ps1")

$RepositoryRoot = $env:BMD_REPOSITORY_ROOT
$DistributionRoot = Join-Path $env:BMD_TOOL_ROOT "python-worker-dist"
$BuildRoot = Join-Path $env:BMD_TOOL_ROOT "python-worker-build"
$SpecRoot = Join-Path $env:BMD_TOOL_ROOT "python-worker-spec"
$WorkerSource = Join-Path $RepositoryRoot "workers\python\src"
$EntryPoint = Join-Path $RepositoryRoot "workers\python\worker_entry.py"
$Executable = Join-Path $DistributionRoot "bmd-python-worker\bmd-python-worker.exe"

& $env:BMD_PYTHON_EXE -m pip install --only-binary=:all: --requirement (Join-Path $RepositoryRoot "workers\python\requirements-packaging.txt")
if ($LASTEXITCODE -ne 0) { throw "PyInstaller dependency installation failed" }

& $env:BMD_PYTHON_EXE -m PyInstaller `
    --noconfirm `
    --clean `
    --onedir `
    --name bmd-python-worker `
    --distpath $DistributionRoot `
    --workpath $BuildRoot `
    --specpath $SpecRoot `
    --paths $WorkerSource `
    --collect-data certifi `
    $EntryPoint
if ($LASTEXITCODE -ne 0) { throw "Standalone Python Worker packaging failed" }
if (-not (Test-Path -LiteralPath $Executable)) { throw "Packaged Python Worker is missing: $Executable" }

$Ping = '{"id":"018f0f39-7b5e-4cc1-862d-9a208b3d3000","type":"worker.ping","timestamp":"2026-08-30T01:00:00.000Z","correlationId":"018f0f39-7b5e-4cc1-862d-9a208b3d3000","traceId":"018f0f39-7b5e-4cc1-862d-9a208b3d3001","payload":{}}'
$Response = $Ping | & $Executable --role crawler
if ($LASTEXITCODE -ne 0 -or $Response -notmatch '"state":"ready"') {
    throw "Packaged Python Worker smoke test failed"
}
Write-Host "Standalone Python Worker is ready at $Executable"
