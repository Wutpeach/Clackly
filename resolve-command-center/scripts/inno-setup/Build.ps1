[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Archive,
    [string]$Output,
    [string]$Compiler='C:/Program Files (x86)/Inno Setup 6/ISCC.exe'
)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
if(!$Output){$Output=Join-Path $PSScriptRoot '../../release/setup'}
$output=[IO.Path]::GetFullPath($Output)
$archive=[IO.Path]::GetFullPath($Archive)
$metadata=& node (Join-Path $PSScriptRoot 'verify-input.js') $archive
if($LASTEXITCODE -ne 0){throw 'setup-input-verification-failed'}
$metadata=($metadata -join [Environment]::NewLine)|ConvertFrom-Json
$version=$metadata.version
# Preserve earlier artifacts; each build gets an unused output directory.
if(Test-Path -LiteralPath $output){throw 'Setup output exists; choose a new -Output directory.'}
[IO.Directory]::CreateDirectory($output)|Out-Null
Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $output 'payload')
$payload=Join-Path $output 'payload/plugin'
& node -e "const p=require(process.argv[1]);p.validatePlugin(process.argv[2],process.argv[3]);" (Join-Path $PSScriptRoot '../workflow-release/package.js') $payload $version
if($LASTEXITCODE -ne 0){throw 'payload-verification-failed'}
& $Compiler /Qp ('/DPayloadDir='+$payload) ('/DAppVersion='+$version) ('/O'+$output) (Join-Path $PSScriptRoot 'Clackly.iss')
if($LASTEXITCODE -ne 0){throw 'inno-compile-failed'}
$exe=Join-Path $output "Clackly-Setup-$version-win-x64.exe"
& node (Join-Path $PSScriptRoot '../verify-windows-icon.js') $exe (Join-Path $payload 'resources/icons/clackly.ico')
if($LASTEXITCODE -ne 0){throw 'setup-icon-verification-failed'}
$report=@{version=$version;exe=$exe;size=(Get-Item -LiteralPath $exe).Length;sha256=(Get-FileHash -LiteralPath $exe).Hash.ToLowerInvariant();zipSha256=$metadata.sha256;source=$metadata.source;publishable=$metadata.publishable;compilerVersion=(Get-Item -LiteralPath $Compiler).VersionInfo.FileVersion;compilerSha256=(Get-FileHash -LiteralPath $Compiler).Hash.ToLowerInvariant();sources=@(Get-ChildItem -LiteralPath $PSScriptRoot -File|ForEach-Object{@{name=$_.Name;sha256=(Get-FileHash -LiteralPath $_.FullName).Hash.ToLowerInvariant()}});unsigned=$true;networkRequired=$false}
$report|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $output 'build-report.json') -Encoding UTF8
$report|ConvertTo-Json -Depth 6
