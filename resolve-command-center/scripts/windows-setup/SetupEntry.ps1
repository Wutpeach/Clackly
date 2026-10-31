[CmdletBinding()]
param([ValidateSet('Verify','Install','Inspect')][string]$Operation='Verify',[Parameter(Mandatory=$true)][string]$SessionRoot,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{32}$')][string]$Id,[ValidatePattern('^(absent|[a-f0-9]{64})$')][string]$BaselineDigest='absent',[ValidatePattern('^(absent|[a-f0-9]{64})$')][string]$ContextDigest='absent',[ValidatePattern('^(absent|[a-f0-9]{64})$')][string]$ResultDigest='absent',[ValidatePattern('^(absent|[a-f0-9]{64})$')][string]$JournalDigest='absent')
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Import-Module (Join-Path $PSScriptRoot 'SetupPipeline.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -DisableNameChecking
$root=Assert-NormalPath $SessionRoot
if ($root -cne (Split-Path -Parent $PSScriptRoot) -or (Split-Path -Leaf $root) -cne ('Clackly-Setup-'+$Id)) {throw 'target-unverified'}
$expected=@{baseline=$BaselineDigest;context=$ContextDigest;result=$ResultDigest;journal=$JournalDigest}
$result=Invoke-SetupOperation $Operation @{Id=$Id;Root=$root;Sequence=0} -ExpectedWitness $expected
[Console]::Out.WriteLine((@{id=$Id;event='terminal';status=$result.status;reason=$result.reason;pid=$PID;created=$result.workerCreated;witness=$(if ($Operation -cne 'Inspect') {$result.inspectionWitness} else {$null})} | ConvertTo-Json -Depth 5 -Compress))
if ($Operation -ceq 'Inspect' -and $result.reason -ceq 'recovery-required') {exit 2}
if ($result.status -cin @('failed','rolled-back') -and $Operation -cne 'Inspect') {exit 1}
# No target, Native, script, fixture, privilege or production-enable arguments.
