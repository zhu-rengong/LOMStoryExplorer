[CmdletBinding()]
param(
    [string]$GameDir = $env:MORTAL_GAME_DIR,
    [string]$Langs = "zh-tw,zh-cn",
    [string]$BuildLangs = "zh-tw",
    [switch]$Force,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
$env:PYTHONIOENCODING = "utf-8"

try {
    Write-Host "== environment ==" -ForegroundColor Cyan
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw "python not found on PATH; install Python 3.10+ and add it to PATH" }
    python -c "import UnityPy" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "UnityPy is missing; run: python -m pip install -r requirements.txt"
    }
    if (-not $GameDir) {
        throw "game directory not set; pass -GameDir or set the MORTAL_GAME_DIR environment variable"
    }
    $resources = Join-Path $GameDir "Mortal_Data" "resources.assets"
    if (-not (Test-Path $resources)) {
        throw "game assets not found: $resources"
    }
    Write-Host ("python   {0}" -f (python --version))
    Write-Host ("game dir {0}" -f $GameDir)

    Write-Host "`n== extract scripts and locale tables ==" -ForegroundColor Cyan
    $extractArgs = @("extract.py", "--game", $GameDir, "--langs", $Langs)
    if ($Force) { $extractArgs += "--force" }
    python @extractArgs
    if ($LASTEXITCODE -ne 0) { throw "extract.py failed (exit code $LASTEXITCODE)" }

    Write-Host "`n== build explorer data ==" -ForegroundColor Cyan
    python "build.py" "--langs" $BuildLangs
    if ($LASTEXITCODE -ne 0) { throw "build.py failed (exit code $LASTEXITCODE)" }

    $index = Join-Path $root "docs" "index.html"
    if (-not (Test-Path $index)) { throw "docs/index.html not found" }

    Write-Host "`n== done ==" -ForegroundColor Green
    Write-Host ("report: {0}" -f (Join-Path $root "data" "report.json"))
    if (-not $NoBrowser) {
        Write-Host "opening the explorer..."
        Start-Process $index
    } else {
        Write-Host ("open manually: {0}" -f $index)
    }
} finally {
    Pop-Location
}
