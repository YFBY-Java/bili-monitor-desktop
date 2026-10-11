$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "activate-environment.ps1")

function Invoke-Checked {
    param([Parameter(Mandatory = $true)][string]$FilePath, [string[]]$ArgumentList, [string]$Name)
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) { throw "$Name failed with exit code $LASTEXITCODE" }
}

Push-Location $env:BMD_REPOSITORY_ROOT
try {
    Invoke-Checked -FilePath "pwsh" -ArgumentList @(
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/tests/toolchain-location.tests.ps1"
    ) -Name "Environment location test"
    Invoke-Checked -FilePath $env:BMD_NODE_EXE -ArgumentList @(
        "--test", "scripts/tests/installer-configuration.test.mjs"
    ) -Name "Offline installer configuration"
    Invoke-Checked -FilePath $env:BMD_PNPM_CMD -ArgumentList @("test") -Name "Node tests"
    Invoke-Checked -FilePath $env:BMD_PNPM_CMD -ArgumentList @("typecheck") -Name "TypeScript typecheck"
    Invoke-Checked -FilePath $env:BMD_PYTHON_EXE -ArgumentList @(
        "-m", "black", "--check", "workers/python/src", "workers/python/tests"
    ) -Name "Python Black"
    Invoke-Checked -FilePath $env:BMD_PYTHON_EXE -ArgumentList @(
        "-m", "isort", "--check-only", "workers/python/src", "workers/python/tests"
    ) -Name "Python import order"
    Invoke-Checked -FilePath $env:BMD_PYTHON_EXE -ArgumentList @(
        "-m", "mypy", "--config-file", "workers/python/pyproject.toml"
    ) -Name "Python typecheck"
    Invoke-Checked -FilePath $env:BMD_PYTHON_EXE -ArgumentList @(
        "-m", "pytest", "workers/python/tests"
    ) -Name "Python tests"
    Invoke-Checked -FilePath $env:BMD_PNPM_CMD -ArgumentList @("build") -Name "Electron build"

    foreach ($Bundle in @("apps/desktop/out/main/index.js", "apps/desktop/out/main/core-process.js")) {
        if (-not (Test-Path -LiteralPath $Bundle)) { throw "Expected Electron bundle is missing: $Bundle" }
        if ((Get-Content -Raw -LiteralPath $Bundle) -match 'from "@bmd/') {
            throw "Electron bundle externalized a source-only workspace package: $Bundle"
        }
    }
    if (-not (Test-Path -LiteralPath "apps/desktop/out/preload/index.cjs")) {
        throw "Expected sandbox-compatible CommonJS preload bundle is missing"
    }
}
finally { Pop-Location }
