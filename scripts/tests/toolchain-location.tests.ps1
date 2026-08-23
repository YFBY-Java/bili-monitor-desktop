$ErrorActionPreference = "Stop"

$RepositoryRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $RepositoryRoot "scripts/activate-environment.ps1")

$ExpectedToolRoot = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot ".tools"))
$RequiredToolPaths = [ordered]@{
    BMD_TOOL_ROOT = $env:BMD_TOOL_ROOT
    COREPACK_HOME = $env:COREPACK_HOME
    PNPM_HOME = $env:PNPM_HOME
    npm_config_cache = $env:npm_config_cache
    npm_config_store_dir = $env:npm_config_store_dir
    npm_config_prefix = $env:npm_config_prefix
    npm_config_userconfig = $env:npm_config_userconfig
    ELECTRON_CACHE = $env:ELECTRON_CACHE
    electron_config_cache = $env:electron_config_cache
    npm_config_electron_cache = $env:npm_config_electron_cache
    ELECTRON_BUILDER_CACHE = $env:ELECTRON_BUILDER_CACHE
    PLAYWRIGHT_BROWSERS_PATH = $env:PLAYWRIGHT_BROWSERS_PATH
    PIP_CACHE_DIR = $env:PIP_CACHE_DIR
    PYTHONPYCACHEPREFIX = $env:PYTHONPYCACHEPREFIX
    PYTHONUSERBASE = $env:PYTHONUSERBASE
    XDG_CACHE_HOME = $env:XDG_CACHE_HOME
    HF_HOME = $env:HF_HOME
    TORCH_HOME = $env:TORCH_HOME
    TEMP = $env:TEMP
    TMP = $env:TMP
}

foreach ($Entry in $RequiredToolPaths.GetEnumerator()) {
    if ([string]::IsNullOrWhiteSpace($Entry.Value)) { throw "$($Entry.Key) is not configured" }
    $ResolvedValue = [IO.Path]::GetFullPath($Entry.Value)
    $IsToolRoot = $ResolvedValue.Equals($ExpectedToolRoot, [StringComparison]::OrdinalIgnoreCase)
    $IsBelowToolRoot = $ResolvedValue.StartsWith(
        $ExpectedToolRoot + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase
    )
    if (-not ($IsToolRoot -or $IsBelowToolRoot)) {
        throw "$($Entry.Key) must be stored below $ExpectedToolRoot, got $ResolvedValue"
    }
}

foreach ($RemovedVariable in @("CARGO_HOME", "RUSTUP_HOME", "CARGO_BUILD_TARGET", "BMD_LLVM_MINGW_HOME")) {
    if (-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($RemovedVariable, "Process"))) {
        throw "$RemovedVariable must not be configured by this project"
    }
}

foreach ($RemovedProjectFile in @("Cargo.toml", "Cargo.lock", "rust-toolchain.toml")) {
    if (Test-Path -LiteralPath (Join-Path $RepositoryRoot $RemovedProjectFile)) {
        throw "Native-language project file must not be present: $RemovedProjectFile"
    }
}
$LegacyRustSource = Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot "core") -Filter "*.rs" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($LegacyRustSource) { throw "Legacy Rust source must not remain active: $($LegacyRustSource.FullName)" }

$DataDirectory = [IO.Path]::GetFullPath($env:BMD_DATA_DIR)
if ([IO.Path]::GetPathRoot($DataDirectory).Equals("C:\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "BMD_DATA_DIR must not use the C drive"
}
if (-not (Test-Path -LiteralPath $env:BMD_NODE_EXE)) { throw "Project Node.js is missing" }
if (-not (Test-Path -LiteralPath $env:BMD_PNPM_CMD)) { throw "Project pnpm is missing" }
if (-not (Test-Path -LiteralPath $env:BMD_PYTHON_EXE)) { throw "Project Python environment is missing" }
$ElectronExecutable = Join-Path $RepositoryRoot "apps\desktop\node_modules\electron\dist\electron.exe"
if (-not (Test-Path -LiteralPath $ElectronExecutable)) { throw "Project Electron runtime is missing" }
$PythonEnvironmentConfig = Join-Path $RepositoryRoot ".venv\pyvenv.cfg"
if ((Get-Content -Raw -LiteralPath $PythonEnvironmentConfig) -match '(?im)^home\s*=\s*C:\\') {
    throw "Project Python base runtime must not use the C drive"
}
$ChromiumExecutable = Get-ChildItem -LiteralPath $env:PLAYWRIGHT_BROWSERS_PATH -Filter "chrome.exe" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $ChromiumExecutable) { throw "Project Playwright Chromium is missing" }

Write-Host "Project tools, caches, temporary files, browsers and runtime data are outside C:."
