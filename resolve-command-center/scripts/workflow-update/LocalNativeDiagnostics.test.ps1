Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'LocalNative.psm1') -Force -DisableNameChecking
$diagnosticModule=Get-Module LocalNative
$diagnosticRoot=Join-Path ([IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../build/test-evidence/native-diagnostics'))) ([Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($diagnosticRoot) | Out-Null
[IO.File]::WriteAllText((Join-Path $diagnosticRoot '.test-owner'),'INERT FIXTURE ONLY; NEVER QUALIFIED FOR PRODUCTION')

function Assert-Diagnostic($Value,[string]$Message) { if (!$Value) { throw ('ASSERT '+$Message) } }
function New-DiagnosticFixture([string]$Name) {
    $case=Join-Path $diagnosticRoot $Name
    $stage=Join-Path $case 'stage'
    [IO.Directory]::CreateDirectory((Join-Path $stage 'workflow-plugin')) | Out-Null
    $source=Join-Path $case 'inert.node'
    $bytes=[byte[]]::new(128); $bytes[0]=77; $bytes[1]=90; $bytes[60]=64
    $bytes[64]=80; $bytes[65]=69; $bytes[68]=100; $bytes[69]=134; $bytes[86]=2; $bytes[87]=32; $bytes[88]=11; $bytes[89]=2
    [IO.File]::WriteAllBytes($source,$bytes)
    return @{Source=$source;Stage=$stage;Workflow=(Join-Path $case 'unpaired-host.exe')}
}
function Get-DiagnosticRejection([scriptblock]$Action,[string]$Reason) {
    $record=$null
    try { $null=& $Action } catch { $record=$_ }
    Assert-Diagnostic ($null -ne $record) 'expected rejection'
    Assert-Diagnostic ($record.Exception.Message -ceq $Reason) 'public reason changed or leaked raw detail'
    $outcome=& (Get-Module WorkflowTransaction) {param($r) Get-UpdateFailureReason $r} $record
    Assert-Diagnostic ($outcome -ceq $Reason) 'transaction public outcome changed'
    return $record
}
function Find-DiagnosticContext($Exception) {
    for ($depth=0; $Exception -and $depth -lt 32; $depth++) {
        if ($Exception.Data.Contains('Clackly.LocalNative.FirstFailure')) { return $Exception.Data['Clackly.LocalNative.FirstFailure'] }
        $Exception=$Exception.InnerException
    }
    return $null
}
function Assert-DiagnosticContext($Context,[string]$Checkpoint) {
    Assert-Diagnostic ($null -ne $Context -and $Context.schemaVersion -eq 1) 'first context missing'
    Assert-Diagnostic ($Context.checkpoint -ceq $Checkpoint) 'first checkpoint changed'
    Assert-Diagnostic ($Context.exceptionType -and $Context.fullyQualifiedErrorId) 'type or error id missing'
    Assert-Diagnostic ($Context.invocation -and $Context.invocation.scriptLineNumber -gt 0 -and $Context.invocation.line) 'original invocation missing'
    Assert-Diagnostic ($Context.exceptions.Count -gt 0 -and $Context.exceptions.Count -le 8) 'exception projection unbounded'
}

# Only fixed PASS/FAIL labels leave this test. Raw errors and local paths remain
# in memory; retained fixtures contain inert bytes, never a vendor native.
try {
    $f=New-DiagnosticFixture 'sharing'
    $held=[IO.File]::Open($f.Source,'Open','ReadWrite','None')
    try { $sharing=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} } 'native-invalid' }
    finally { $held.Dispose() }
    $sharingContext=Find-DiagnosticContext $sharing.Exception
    Assert-DiagnosticContext $sharingContext 'read-lock.open'
    $sharingIo=@($sharingContext.exceptions | Where-Object {$_.type -ceq 'System.IO.IOException'})
    Assert-Diagnostic ($sharingIo.Count -eq 1 -and $sharingIo[0].hResult -eq -2147024864) 'actual sharing HRESULT missing'
    Assert-Diagnostic ($sharing.Exception.InnerException -and $sharing.Exception.InnerException.InnerException -is [IO.IOException]) 'original sharing exception chain flattened'
    Assert-Diagnostic ($sharingContext.message -match [regex]::Escape($f.Source)) 'original private sharing detail missing'
    Write-Output 'PASS diagnostics-actual-sharing-first-error-through-copy'

    $f=New-DiagnosticFixture 'corrupt-pe'
    [IO.File]::WriteAllText($f.Source,'INERT CORRUPT PE')
    $corrupt=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} } 'native-invalid'
    $corruptContext=Find-DiagnosticContext $corrupt.Exception
    Assert-DiagnosticContext $corruptContext 'copy.source-pe'
    Assert-Diagnostic ($corruptContext.exceptionType -ceq 'System.Management.Automation.RuntimeException' -and $corruptContext.fullyQualifiedErrorId -ceq 'native-invalid') 'PE original runtime error lost'
    Assert-Diagnostic ($corruptContext.hResult -ne $sharingIo[0].hResult -and $corruptContext.message -cne $sharingContext.message) 'raw causes or HRESULTs collapsed'
    Write-Output 'PASS diagnostics-corrupt-pe-distinct-type-code-and-checkpoint'

    $f=New-DiagnosticFixture 'unsigned'
    $unsigned=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} } 'native-invalid'
    $unsignedContext=Find-DiagnosticContext $unsigned.Exception
    Assert-DiagnosticContext $unsignedContext 'copy.signature'
    Assert-Diagnostic ($unsignedContext.exceptionType -ceq 'System.Management.Automation.RuntimeException') 'signature original runtime error lost'
    Write-Output 'PASS diagnostics-real-inert-signature-refusal'

    $f=New-DiagnosticFixture 'destination-exists'
    [IO.File]::WriteAllText((Join-Path $f.Stage 'workflow-plugin/WorkflowIntegration.node'),'INERT EXISTING DESTINATION')
    $occupied=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} } 'native-invalid'
    $occupiedContext=Find-DiagnosticContext $occupied.Exception
    Assert-DiagnosticContext $occupiedContext 'copy.destination-create'
    $occupiedIo=@($occupiedContext.exceptions | Where-Object {$_.type -ceq 'System.IO.IOException'})
    Assert-Diagnostic ($occupiedIo.Count -eq 1 -and $occupiedIo[0].hResult -ne $sharingIo[0].hResult) 'different IO failures collapsed'
    Assert-Diagnostic ([IO.File]::ReadAllText((Join-Path $f.Stage 'workflow-plugin/WorkflowIntegration.node')) -ceq 'INERT EXISTING DESTINATION') 'occupied destination modified'
    Write-Output 'PASS diagnostics-different-io-checkpoint-and-hresult'

    $f=New-DiagnosticFixture 'win32-bounds'
    $script:diagnosticOriginal=[ComponentModel.Win32Exception]::new(5,('PRIVATE-DIAGNOSTIC-MARKER'+('x'*6000)))
    $win32=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} -Signature {throw $script:diagnosticOriginal} } 'native-invalid'
    $win32Context=Find-DiagnosticContext $win32.Exception
    Assert-DiagnosticContext $win32Context 'copy.signature'
    Assert-Diagnostic ($win32Context.nativeErrorCode -eq 5 -and $win32Context.exceptions[0].nativeErrorCode -eq 5) 'available Win32 code lost'
    Assert-Diagnostic ([object]::ReferenceEquals($win32.Exception.InnerException,$script:diagnosticOriginal)) 'original exception identity lost'
    Assert-Diagnostic ($win32Context.message.Length -eq 2048 -and $win32Context.fullyQualifiedErrorId.Length -le 512) 'raw text not bounded'
    $wrapped=[InvalidOperationException]::new('native-incompatible',$win32.Exception)
    $wrappedRecord=[Management.Automation.ErrorRecord]::new($wrapped,'outer-error',[Management.Automation.ErrorCategory]::NotSpecified,$null)
    & $diagnosticModule {param($r) Add-NativeFailureContext $r 'later.wrapper'} $wrappedRecord
    Assert-Diagnostic ([object]::ReferenceEquals((Find-DiagnosticContext $wrapped),$win32Context)) 'later wrapper replaced first context'
    Write-Output 'PASS diagnostics-win32-bounded-context-and-first-error-wins'

    $f=New-DiagnosticFixture 'deep-chain'
    $script:diagnosticOriginal=[InvalidOperationException]::new('PRIVATE-INNER-CAUSE')
    for ($i=0; $i -lt 12; $i++) { $script:diagnosticOriginal=[InvalidOperationException]::new(('PRIVATE-CHAIN-'+('x'*6000)),$script:diagnosticOriginal) }
    $deep=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} -Signature {throw $script:diagnosticOriginal} } 'native-invalid'
    $deepContext=Find-DiagnosticContext $deep.Exception
    Assert-DiagnosticContext $deepContext 'copy.signature'
    Assert-Diagnostic ($deepContext.exceptions.Count -eq 8) 'deep projection exceeded eight causes'
    foreach ($cause in $deepContext.exceptions) { Assert-Diagnostic ($cause.message.Length -eq 2048 -and $cause.type.Length -le 256) 'inner cause text not bounded' }
    Assert-Diagnostic ([object]::ReferenceEquals($deep.Exception.InnerException,$script:diagnosticOriginal)) 'deep original chain not retained'
    Write-Output 'PASS diagnostics-deep-inner-chain-projection-bounded'

    $f=New-DiagnosticFixture 'missing'
    [IO.File]::Delete($f.Source)
    $missing=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} } 'native-missing'
    Assert-DiagnosticContext (Find-DiagnosticContext $missing.Exception) 'copy.source-present'
    Assert-Diagnostic (!(Test-Path -LiteralPath (Join-Path $f.Stage 'workflow-plugin/WorkflowIntegration.node'))) 'missing source staged a file'
    Write-Output 'PASS diagnostics-missing-public-outcome-preserved'

    $f=New-DiagnosticFixture 'incompatible'
    # This production host-pair refusal occurs before host access or execution.
    $incompatible=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} -Signature {} } 'native-incompatible'
    $incompatibleContext=Find-DiagnosticContext $incompatible.Exception
    Assert-DiagnosticContext $incompatibleContext 'compatibility.host-pair'
    Assert-Diagnostic ($incompatible.Exception.InnerException -and $incompatibleContext.fullyQualifiedErrorId -ceq 'native-incompatible') 'compatibility wrapping flattened first error'
    Write-Output 'PASS diagnostics-default-host-pair-refusal-through-copy'

    if (!('Clackly.Tests.UnreadableDiagnosticException' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Collections;
namespace Clackly.Tests {
 public class UnreadableDiagnosticException : Exception {
  public UnreadableDiagnosticException() : base("PRIVATE-DIAGNOSTIC-UNREADABLE") {}
  public override IDictionary Data { get { throw new InvalidOperationException("PRIVATE-DIAGNOSTIC-DATA"); } }
 }
}
'@
    }
    $f=New-DiagnosticFixture 'capture-failure'
    $script:diagnosticOriginal=[Clackly.Tests.UnreadableDiagnosticException]::new()
    $uncaptured=Get-DiagnosticRejection { Copy-LocalResolveNative $f.Stage $f.Workflow -Source {$f.Source} -Signature {throw $script:diagnosticOriginal} } 'native-invalid'
    Assert-Diagnostic ([object]::ReferenceEquals($uncaptured.Exception.InnerException,$script:diagnosticOriginal)) 'capture failure changed original rejection'
    Write-Output 'PASS diagnostics-capture-failure-keeps-public-rejection'

    $privateNames=@('ConvertTo-NativeDiagnosticText','Add-NativeFailureContext')
    foreach ($name in $privateNames) { Assert-Diagnostic (!$diagnosticModule.ExportedFunctions.ContainsKey($name)) 'diagnostic helper publicly exported' }
    Write-Output 'PASS diagnostics-helpers-remain-private'
    Write-Output 'PASS native-diagnostics 10 cases; fixtures retained under build/test-evidence/native-diagnostics'
    exit 0
} catch {
    if ($_.Exception.Message.StartsWith('ASSERT ')) { Write-Output ('FAIL native-diagnostics '+$_.Exception.Message) }
    else { Write-Output 'FAIL native-diagnostics unexpected test failure; no raw error emitted' }
    exit 1
}
