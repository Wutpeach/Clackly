param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$RequestId, [switch]$RestorePrevious)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# Run the retained fixed executor beside this script; no Settings, archive code,
# user-selected path, elevation switch, service or scheduled task is needed.
$operation = if ($RestorePrevious) { 'Restore' } else { 'Recover' }
& (Join-Path $PSScriptRoot 'executor.ps1') -RequestId $RequestId -Operation $operation
exit $LASTEXITCODE
