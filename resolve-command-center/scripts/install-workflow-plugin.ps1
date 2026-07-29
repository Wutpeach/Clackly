param(
  [ValidateSet("Junction", "Copy")]
  [string]$Mode = "Junction",
  [string]$PluginRoot = "$env:PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins",
  [string]$WorkflowNodeSource = "$env:PROGRAMDATA\Blackmagic Design\DaVinci Resolve\Support\Developer\Workflow Integrations\Examples\SamplePlugin\WorkflowIntegration.node"
)

$ErrorActionPreference = "Stop"

$AppRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$PluginId = "com.wutpeach.clackly"
$PluginPath = Join-Path $PluginRoot $PluginId
$WorkflowNodeTarget = Join-Path $AppRoot "workflow-plugin\WorkflowIntegration.node"

if (!(Test-Path $WorkflowNodeSource)) {
  throw "WorkflowIntegration.node was not found at '$WorkflowNodeSource'. Check your Resolve Developer Workflow Integrations install path."
}

Copy-Item -LiteralPath $WorkflowNodeSource -Destination $WorkflowNodeTarget -Force
Write-Host "Copied WorkflowIntegration.node to $WorkflowNodeTarget"

if (!(Test-Path (Join-Path $AppRoot "dist\renderer\index.html"))) {
  Write-Warning "dist\renderer\index.html is missing. Run 'npm run build' before loading Clackly from Resolve unless you set RESOLVE_COMMAND_CENTER_USE_DEV_SERVER=1."
}

New-Item -ItemType Directory -Path $PluginRoot -Force | Out-Null

if (Test-Path $PluginPath) {
  $item = Get-Item -LiteralPath $PluginPath -Force
  if ($item.LinkType -or $Mode -eq "Copy") {
    Remove-Item -LiteralPath $PluginPath -Recurse -Force
  } else {
    throw "Plugin path already exists and is not a link: $PluginPath"
  }
}

if ($Mode -eq "Junction") {
  New-Item -ItemType Junction -Path $PluginPath -Target $AppRoot | Out-Null
  Write-Host "Created plugin junction: $PluginPath -> $AppRoot"
} else {
  Copy-Item -LiteralPath $AppRoot -Destination $PluginPath -Recurse -Force
  Write-Host "Copied plugin app to $PluginPath"
}

Write-Host "Restart DaVinci Resolve Studio, then load Clackly from Workspace > Workflow Integrations > Clackly."
