param(
    [switch]$CheckOnly,
    [switch]$UpdateLock
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot "activate-environment.ps1")

$NodeVersion = (Get-Content -Raw -LiteralPath (Join-Path $RepositoryRoot ".node-version")).Trim()
$PnpmVersion = ((Get-Content -Raw -LiteralPath (Join-Path $RepositoryRoot "package.json") | ConvertFrom-Json).packageManager -split "@")[1]
$NodeHome = $env:BMD_NODE_HOME
$NodeExecutable = $env:BMD_NODE_EXE
$PnpmCommand = $env:BMD_PNPM_CMD
$PythonExecutable = $env:BMD_PYTHON_EXE

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) { throw "$FilePath failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path -LiteralPath $NodeExecutable)) {
    if ($CheckOnly) { throw "Node.js $NodeVersion is missing from $NodeHome" }
    $ArchiveName = "node-v$NodeVersion-win-x64.zip"
    $DownloadDirectory = Join-Path $env:BMD_TOOL_ROOT "downloads"
    $ArchivePath = Join-Path $DownloadDirectory $ArchiveName
    $ReleaseUrl = "https://nodejs.org/dist/v$NodeVersion"
    New-Item -ItemType Directory -Force -Path $DownloadDirectory | Out-Null
    if (-not (Test-Path -LiteralPath $ArchivePath)) {
        Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseUrl/$ArchiveName" -OutFile $ArchivePath
    }
    $ChecksumText = (Invoke-WebRequest -UseBasicParsing -Uri "$ReleaseUrl/SHASUMS256.txt").Content
    $ExpectedLine = @($ChecksumText -split "`r?`n" | Where-Object { $_ -match [regex]::Escape($ArchiveName) })[0]
    if (-not $ExpectedLine) { throw "No official SHA-256 entry was found for $ArchiveName" }
    $ExpectedHash = [string](@($ExpectedLine -split "\s+")[0])
    $ActualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ArchivePath).Hash
    if ($ActualHash.ToLowerInvariant() -ne $ExpectedHash.ToLowerInvariant()) {
        throw "Node.js archive checksum mismatch"
    }
    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $env:BMD_TOOL_ROOT -Force
}
Invoke-Checked -FilePath $NodeExecutable -ArgumentList @("--version")

if (-not (Test-Path -LiteralPath $PnpmCommand)) {
    if ($CheckOnly) { throw "pnpm $PnpmVersion is missing from $env:BMD_PNPM_ROOT" }
    $NpmCommand = Join-Path $NodeHome "npm.cmd"
    Invoke-Checked -FilePath $NpmCommand -ArgumentList @(
        "install", "--global", "--prefix", $env:BMD_PNPM_ROOT, "pnpm@$PnpmVersion", "--ignore-scripts"
    )
}
Invoke-Checked -FilePath $PnpmCommand -ArgumentList @("--version")

if (-not (Test-Path -LiteralPath $PythonExecutable)) {
    if ($CheckOnly) { throw "The repository Python environment is missing from $PythonExecutable" }
    if (-not (Test-Path -LiteralPath $env:BMD_PYTHON_SOURCE)) {
        throw "Python 3.11 source runtime is missing from $env:BMD_PYTHON_SOURCE"
    }
    Invoke-Checked -FilePath $env:BMD_PYTHON_SOURCE -ArgumentList @("-m", "venv", (Join-Path $RepositoryRoot ".venv"))
}
$PythonEnvironmentConfig = Join-Path $RepositoryRoot ".venv\pyvenv.cfg"
if ((Get-Content -Raw -LiteralPath $PythonEnvironmentConfig) -match '(?im)^home\s*=\s*C:\\') {
    throw "The Python environment resolves its base runtime from C:. Recreate it from $env:BMD_PYTHON_SOURCE."
}
Invoke-Checked -FilePath $PythonExecutable -ArgumentList @("--version")

$RequirementsInput = Join-Path $RepositoryRoot "workers\python\requirements.in"
$RequirementsLock = Join-Path $RepositoryRoot "workers\python\requirements.lock"
if (-not $CheckOnly) {
    Invoke-Checked -FilePath $PythonExecutable -ArgumentList @(
        "-m", "pip", "install", "--only-binary=:all:", "--upgrade", "pip", "setuptools", "wheel", "pip-tools"
    )
    if ($UpdateLock -or -not (Test-Path -LiteralPath $RequirementsLock)) {
        Invoke-Checked -FilePath $PythonExecutable -ArgumentList @(
            "-m", "piptools", "compile", $RequirementsInput, "--output-file", $RequirementsLock,
            "--resolver", "backtracking", "--strip-extras"
        )
    }
    Invoke-Checked -FilePath $PythonExecutable -ArgumentList @(
        "-m", "pip", "install", "--only-binary=:all:", "--requirement", $RequirementsLock
    )
    Invoke-Checked -FilePath $PythonExecutable -ArgumentList @(
        "-m", "pip", "install", "--no-deps", "--editable", (Join-Path $RepositoryRoot "workers\python")
    )

    Push-Location $RepositoryRoot
    try {
        $env:CI = "true"
        $InstallArguments = if ($UpdateLock) { @("install", "--no-frozen-lockfile") } else { @("install", "--frozen-lockfile") }
        Invoke-Checked -FilePath $PnpmCommand -ArgumentList $InstallArguments
        Invoke-Checked -FilePath $NodeExecutable -ArgumentList @(
            (Join-Path $RepositoryRoot "apps\desktop\node_modules\electron\install.js")
        )
        Invoke-Checked -FilePath "pwsh" -ArgumentList @(
            "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", (Join-Path $PSScriptRoot "install-playwright.ps1")
        )
    }
    finally { Pop-Location }
}
elseif (-not (Test-Path -LiteralPath $RequirementsLock)) {
    throw "Python dependency lock is missing: $RequirementsLock"
}

Write-Host "BiliMonitor Desktop environment is ready on non-system drives."
