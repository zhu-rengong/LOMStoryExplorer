[CmdletBinding()]
param(
    [string]$OutFile = "",
    [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $OutFile) { $OutFile = Join-Path (Split-Path -Parent $here) "docs" "data" "fonts.js" }

$blocked = 'Wingdings|Webdings|Marlett|Symbol|Segoe MDL2|Segoe Fluent|Segoe UI Emoji|Segoe UI Symbol|Bookshelf Symbol|MS Reference|MT Extra|MS Outlook|Marlett|Webdings'

$keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts',
    'HKCU:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts'
)

$rawNames = New-Object System.Collections.Generic.List[string]
foreach ($key in $keys) {
    if (-not (Test-Path $key)) { continue }
    try {
        $item = Get-ItemProperty -Path $key -ErrorAction Stop
        foreach ($prop in $item.PSObject.Properties) {
            if ($prop.Name -like 'PS*') { continue }
            $rawNames.Add($prop.Name)
        }
    } catch {
        if (-not $Quiet) { Write-Warning "failed to read font registry: $key ($($_.Exception.Message))" }
    }
}

if ($rawNames.Count -eq 0) {
    if (-not $Quiet) { Write-Warning "no font entries found (not Windows or insufficient permissions), keeping the existing list" }
    exit 0
}

$families = New-Object System.Collections.Generic.List[string]
foreach ($name in $rawNames) {
    $clean = $name
    $clean = $clean -replace '\s*\((TrueType|OpenType|All res|PostScript|Type 1|Variable)[^)]*\)\s*$', ''
    $clean = $clean -replace '\s*\([^)]*\)\s*$', ''
    $clean = $clean.Trim()
    if (-not $clean) { continue }
    if ($clean -match $blocked) { continue }
    foreach ($part in ($clean -split '\s*&\s*')) {
        $family = $part.Trim()
        if (-not $family) { continue }
        if ($family.StartsWith('@')) { continue }
        if ($family -match '^(TrueType|OpenType|Regular|Bold|Italic)$') { continue }
        $family = $family -replace '\s+(Bold Italic|SemiBold|Semibold|ExtraLight|UltraLight|ExtraBold|UltraBold|Bold|Italic|Oblique|Light|Medium|Black|Thin|Heavy|Regular|Book)$', ''
        $family = $family.Trim()
        if ($family.Length -lt 2) { continue }
        if (-not $families.Contains($family)) { $families.Add($family) }
    }
}

$cjkHints = 'YaHei|JhengHei|SimSun|SimHei|KaiTi|FangSong|DengXian|YouYuan|LiSu|MingLiU|Kaiti|Songti|Yuanti|Heiti|PingFang|Hiragino|Noto|Source Han|Sarasa|LXGW|STKaiti|STSong|STXihei|STZhongsong|DFKai|BiauKai|Fang|方正|思源|华文|微软雅黑|宋体|黑体|楷体|仿宋|等线|幼圆|隶书'
$familyList = $families | Sort-Object -Unique
$cjk = @($familyList | Where-Object { $_ -match $cjkHints })
$rest = @($familyList | Where-Object { $_ -notmatch $cjkHints } | Sort-Object)
$ordered = @($cjk) + @($rest)

$payload = [ordered]@{
    generated = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    os        = 'Windows'
    count     = $ordered.Count
    families  = $ordered
}

$json = $payload | ConvertTo-Json -Compress -Depth 4
$content = "window.__FONT_LIST__=$json;`n"

$dir = Split-Path -Parent $OutFile
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText($OutFile, $content, (New-Object System.Text.UTF8Encoding($false)))

if (-not $Quiet) {
    Write-Host ("font list: {0} families -> {1}" -f $ordered.Count, $OutFile) -ForegroundColor Cyan
}
