$ErrorActionPreference = "Stop"

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$RepositoryRoot = [IO.Path]::GetFullPath($RepositoryRoot)
if ([IO.Path]::GetPathRoot($RepositoryRoot).Equals("C:\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "BiliMonitor Desktop must not be developed from the C drive."
}

$NodeVersion = (Get-Content -Raw -LiteralPath (Join-Path $RepositoryRoot ".node-version")).Trim()
$ToolRoot = Join-Path $RepositoryRoot ".tools"
$NodeHome = Join-Path $ToolRoot "node-v$NodeVersion-win-x64"
$PnpmRoot = Join-Path $ToolRoot "pnpm-runtime"
$VenvRoot = Join-Path $RepositoryRoot ".venv"
$VenvScripts = Join-Path $VenvRoot "Scripts"

$LocalPaths = [ordered]@{
    BMD_TOOL_ROOT = $ToolRoot
    COREPACK_HOME = (Join-Path $ToolRoot "corepack")
    PNPM_HOME = (Join-Path $ToolRoot "pnpm-home")
    npm_config_cache = (Join-Path $ToolRoot "npm-cache")
    npm_config_store_dir = (Join-Path $ToolRoot "pnpm-store")
    npm_config_prefix = $PnpmRoot
    npm_config_userconfig = (Join-Path $ToolRoot "npmrc")
    ELECTRON_CACHE = (Join-Path $ToolRoot "electron-cache")
    electron_config_cache = (Join-Path $ToolRoot "electron-cache\Cache")
    npm_config_electron_cache = (Join-Path $ToolRoot "electron-cache\Cache")
    ELECTRON_BUILDER_CACHE = (Join-Path $ToolRoot "electron-builder-cache")
    PLAYWRIGHT_BROWSERS_PATH = (Join-Path $ToolRoot "playwright-browsers")
    PIP_CACHE_DIR = (Join-Path $ToolRoot "pip-cache")
    PYTHONPYCACHEPREFIX = (Join-Path $ToolRoot "python-cache")
    PYTHONUSERBASE = (Join-Path $ToolRoot "python-userbase")
    XDG_CACHE_HOME = (Join-Path $ToolRoot "xdg-cache")
    HF_HOME = (Join-Path $ToolRoot "huggingface")
    TORCH_HOME = (Join-Path $ToolRoot "torch")
    CRAWLEE_STORAGE_DIR = (Join-Path $RepositoryRoot ".local-data\crawlee")
    HYPOTHESIS_STORAGE_DIRECTORY = (Join-Path $ToolRoot "hypothesis")
    TEMP = (Join-Path $ToolRoot "temp")
    TMP = (Join-Path $ToolRoot "temp")
    BMD_DATA_DIR = (Join-Path $RepositoryRoot ".local-data")
}

foreach ($Entry in $LocalPaths.GetEnumerator()) {
    $FullPath = [IO.Path]::GetFullPath($Entry.Value)
    if ([IO.Path]::GetPathRoot($FullPath).Equals("C:\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "$($Entry.Key) must not use the C drive: $FullPath"
    }
    [Environment]::SetEnvironmentVariable($Entry.Key, $FullPath, "Process")
    $Directory = if ($Entry.Key -in @("npm_config_userconfig")) { Split-Path -Parent $FullPath } else { $FullPath }
    New-Item -ItemType Directory -Force -Path $Directory | Out-Null
}

foreach ($NativeVariable in @("CARGO_HOME", "RUSTUP_HOME", "CARGO_BUILD_TARGET", "BMD_LLVM_MINGW_HOME")) {
    [Environment]::SetEnvironmentVariable($NativeVariable, $null, "Process")
}

$env:BMD_REPOSITORY_ROOT = $RepositoryRoot
$env:BMD_NODE_HOME = $NodeHome
$env:BMD_NODE_EXE = Join-Path $NodeHome "node.exe"
$env:BMD_PNPM_ROOT = $PnpmRoot
$env:BMD_PNPM_CMD = Join-Path $PnpmRoot "pnpm.cmd"
$env:BMD_PYTHON_SOURCE = "E:\python3.11\python.exe"
$env:BMD_PYTHON_EXE = Join-Path $VenvScripts "python.exe"
$env:PIP_DISABLE_PIP_VERSION_CHECK = "1"
$env:PIP_NO_INPUT = "1"
$env:npm_config_update_notifier = "false"
$env:Path = "$NodeHome;$PnpmRoot;$VenvScripts;$env:Path"
