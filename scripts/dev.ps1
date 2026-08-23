$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "activate-environment.ps1")

Push-Location $env:BMD_REPOSITORY_ROOT
try {
    & $env:BMD_PNPM_CMD --filter @bmd/desktop dev
    if ($LASTEXITCODE -ne 0) { throw "Electron development process failed" }
}
finally { Pop-Location }
