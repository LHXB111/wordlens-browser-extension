$ErrorActionPreference = 'Stop'
$workspace = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$items = @('manifest.json', 'background.js', 'content.js', 'lib', 'ui', 'icons', 'README.md', 'demo.html', 'package.json', 'scripts', 'tests')
$paths = $items | ForEach-Object { Join-Path $workspace $_ }
$destination = Join-Path $workspace 'WordLens-v1.0.0.zip'
Compress-Archive -LiteralPath $paths -DestinationPath $destination -Force
Get-Item -LiteralPath $destination | Select-Object FullName, Length
