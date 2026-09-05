param([switch]$Package)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "activate-environment.ps1")

Push-Location $env:BMD_REPOSITORY_ROOT
try {
    & $env:BMD_PNPM_CMD build
    if ($LASTEXITCODE -ne 0) { throw "Electron build failed" }
    if ($Package) {
        & $env:BMD_PNPM_CMD package:win
        if ($LASTEXITCODE -ne 0) { throw "Windows packaging failed" }
    }
}
finally { Pop-Location }
