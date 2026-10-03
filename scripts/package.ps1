$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$items = @('manifest.json', 'background.js', 'content.js', 'lib', 'ui', 'icons', 'README.md', 'demo.html', 'package.json', 'scripts', 'tests')
$paths = $items | ForEach-Object { Join-Path $workspace $_ }
$manifest = Get-Content -LiteralPath (Join-Path $workspace 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$destination = Join-Path $workspace ('WordLens-v' + $manifest.version + '.zip')
Compress-Archive -LiteralPath $paths -DestinationPath $destination -Force
Get-Item -LiteralPath $destination | Select-Object FullName, Length
