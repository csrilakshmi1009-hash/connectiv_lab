# Builds public/index.html from src/index.html with every image embedded inline,
# so the page shows its logos however it is opened (preview links, file viewers, offline).
# Usage:  powershell -ExecutionPolicy Bypass -File tools\build.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$src  = Join-Path $root 'src'
$pub  = Join-Path $root 'public'

# Largest size (px) each image is drawn at on the page, doubled for sharp phone screens.
$maxBox = @{
  'logo-symbol.png'       = @(96, 96)     # header icon + browser tab icon
  'logo-wordmark.png'     = @(360, 48)    # header wordmark
  'logo-symbol-clear.png' = @(1040, 1040) # hero glow (source is smaller, kept as is)
  'logo-full.png'         = @(460, 300)   # footer
}
$brandBox = @(330, 128)                   # brand cards

function Get-DataUri([string]$file) {
  $name = Split-Path $file -Leaf
  if ($name -like '*.svg') {
    return 'data:image/svg+xml;base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes($file))
  }
  $box = if ($maxBox.ContainsKey($name)) { $maxBox[$name] } else { $brandBox }
  $img = [System.Drawing.Image]::FromFile($file)
  try {
    $scale = [Math]::Min(1.0, [Math]::Min($box[0] / $img.Width, $box[1] / $img.Height))
    $w = [Math]::Max(1, [int][Math]::Round($img.Width * $scale)); $h = [Math]::Max(1, [int][Math]::Round($img.Height * $scale))
    $bmp = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'; $g.SmoothingMode = 'HighQuality'
    $g.DrawImage($img, 0, 0, $w, $h); $g.Dispose()
    $ms = New-Object IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    return 'data:image/png;base64,' + [Convert]::ToBase64String($ms.ToArray())
  } finally { $img.Dispose() }
}

$html = [IO.File]::ReadAllText((Join-Path $src 'index.html'), [Text.Encoding]::UTF8)
$cache = @{}
$html = [regex]::Replace($html, 'images/([\w\-\.]+)', {
  param($m)
  $name = $m.Groups[1].Value
  if (-not $cache.ContainsKey($name)) {
    $path = Join-Path $src "images\$name"
    if (-not (Test-Path $path)) { throw "Missing image referenced by page: images/$name" }
    $cache[$name] = Get-DataUri $path
  }
  $cache[$name]
})

if (Test-Path $pub) { Get-ChildItem $pub -Force | Remove-Item -Recurse -Force }
New-Item -ItemType Directory -Force $pub | Out-Null
[IO.File]::WriteAllText((Join-Path $pub 'index.html'), $html, (New-Object Text.UTF8Encoding $false))
"Built public/index.html: {0} KB, {1} images embedded, external image refs left: {2}" -f `
  [int]((Get-Item (Join-Path $pub 'index.html')).Length / 1KB), $cache.Count, ([regex]::Matches($html, 'images/')).Count
