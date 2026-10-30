[CmdletBinding()]
param(
    [string]$GameDir = $env:MORTAL_GAME_DIR,
    [string]$Langs = "zh-tw,zh-cn",
    [switch]$Force,
    [switch]$NoBrowser
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
$env:PYTHONIOENCODING = "utf-8"
try {
    Write-Host "== environment ==" -ForegroundColor Cyan
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        throw "python not found on PATH; install Python 3.10+ and add it to PATH"
    }
    python -c "import sys; assert sys.version_info >= (3, 10); import UnityPy" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Python 3.10+ and UnityPy are required; run: python -m pip install -r requirements.txt"
    }
    if (-not $GameDir) {
        throw "game directory not set; pass -GameDir or set the MORTAL_GAME_DIR environment variable"
    }
    $resources = Join-Path $GameDir "Mortal_Data" "resources.assets"
    if (-not (Test-Path $resources)) {
        throw "game assets not found: $resources"
    }
    $defaultLang = ($Langs -split ",")[0].Trim()
    if (-not $defaultLang) { throw "no language selected in -Langs" }
    Write-Host ("python   {0}" -f (python --version))
    Write-Host ("game dir {0}" -f $GameDir)
    Write-Host "`n== extract scripts and locale tables ==" -ForegroundColor Cyan
    $extractArgs = @("extract.py", "--game", $GameDir, "--langs", $Langs)
    if ($Force) { $extractArgs += "--force" }
    python @extractArgs
    if ($LASTEXITCODE -ne 0) { throw "extract.py failed (exit code $LASTEXITCODE)" }
    Write-Host "`n== build reader data ==" -ForegroundColor Cyan
    $buildArgs = @("build.py", "--langs", $Langs, "--lang", $defaultLang)
    if ($Force) { $buildArgs += "--no-cache" }
    python @buildArgs
    if ($LASTEXITCODE -ne 0) { throw "build.py failed (exit code $LASTEXITCODE)" }
    $index = Join-Path $root "docs" "index.html"
    $catalog = Join-Path $root "docs" "data" "catalog.js"
    if (-not (Test-Path $index)) { throw "docs/index.html not found" }
    if (-not (Test-Path $catalog)) { throw "docs/data/catalog.js not found" }
    Write-Host "`n== done ==" -ForegroundColor Green
    Write-Host ("report: {0}" -f (Join-Path $root "data" "report.json"))
    if (-not $NoBrowser) {
        Write-Host "opening the reader..."
        Start-Process $index
    } else {
        Write-Host ("open manually: {0}" -f $index)
    }
} finally {
    Pop-Location
}
