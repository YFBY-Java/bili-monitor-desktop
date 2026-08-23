$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "activate-environment.ps1")

$DryRunOutput = (& $env:BMD_PNPM_CMD --filter @bmd/browser-worker exec playwright install --dry-run chromium 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0) { throw "Playwright dry-run failed with exit code $LASTEXITCODE" }

$Pattern = '(?ms)^.+?\r?\n\s+Install location:\s+(?<location>.+?)\r?\n\s+Download url:\s+(?<url>\S+)'
$Matches = [regex]::Matches($DryRunOutput, $Pattern)
if ($Matches.Count -eq 0) { throw "Unable to parse Playwright browser manifest.`n$DryRunOutput" }

$BrowserRoot = [IO.Path]::GetFullPath($env:PLAYWRIGHT_BROWSERS_PATH)
$DownloadRoot = [IO.Path]::GetFullPath((Join-Path $env:BMD_TOOL_ROOT "downloads\playwright"))
$QuarantineRoot = [IO.Path]::GetFullPath((Join-Path $env:BMD_TOOL_ROOT "quarantine-playwright"))
New-Item -ItemType Directory -Force -Path $BrowserRoot, $DownloadRoot, $QuarantineRoot | Out-Null

foreach ($Match in $Matches) {
    $InstallLocation = [IO.Path]::GetFullPath($Match.Groups["location"].Value.Trim())
    $DownloadUrl = $Match.Groups["url"].Value.Trim()
    if (-not $InstallLocation.StartsWith($BrowserRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Unsafe Playwright install location: $InstallLocation"
    }

    $Marker = Join-Path $InstallLocation "INSTALLATION_COMPLETE"
    if (Test-Path -LiteralPath $Marker) { continue }

    $InstallName = Split-Path -Leaf $InstallLocation
    $ArchivePath = Join-Path $DownloadRoot "$InstallName.zip"
    if (-not (Test-Path -LiteralPath $ArchivePath)) {
        Write-Host "Downloading Playwright component $InstallName to D:"
        Invoke-WebRequest -UseBasicParsing -Uri $DownloadUrl -OutFile $ArchivePath
    }

    if (Test-Path -LiteralPath $InstallLocation) {
        $QuarantinePath = Join-Path $QuarantineRoot "$InstallName-$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        if (-not $QuarantinePath.StartsWith($QuarantineRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Unsafe Playwright quarantine location: $QuarantinePath"
        }
        Move-Item -LiteralPath $InstallLocation -Destination $QuarantinePath
    }

    Expand-Archive -LiteralPath $ArchivePath -DestinationPath $InstallLocation -Force
    [IO.File]::WriteAllText($Marker, "")
}

& $env:BMD_PNPM_CMD --filter @bmd/browser-worker exec playwright install chromium
if ($LASTEXITCODE -ne 0) { throw "Playwright browser verification failed with exit code $LASTEXITCODE" }

Write-Host "Playwright Chromium is installed below $BrowserRoot"
