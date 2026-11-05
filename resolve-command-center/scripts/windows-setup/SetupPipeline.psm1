Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'SetupBackend.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'SetupQualification.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'LocalNative.psm1') -DisableNameChecking
function New-SetupProductionAdapter {
    return @{Kind='production';Locations=(Get-SetupProductionLocations);Fetch=$null;
        Pair={Get-ResolveHostPair ''};Observe={param($c) Get-CanonicalHostState $c.ResolveExecutable $c.WorkflowExecutable};
        Provision={param($r,$w) Copy-LocalResolveNative $r $w};Access={param($target,$scan)
            # For fresh install the canonical scan exists; the target does not.
            $existing=if (Test-Path -LiteralPath $target) {$target} else {$scan}
            Assert-UpdateWriteAccess $existing $scan
        };Checkpoint={}}
}
function New-SetupContext($Adapter,$Session,$Request) {
    $pair=& $Adapter.Pair;$locations=$Adapter.Locations
    return @{Id=$Session.Id;ScanRoot=$locations.Scan;TransactionRoot=$locations.Transactions;Target=$locations.Target;PackageRoot=(Join-Path $Session.Root 'payload');Version=$Request.version;Digest=$Request.digest;Size=$Request.size;InitialInstall=$true;ResolveExecutable=$pair.ResolveExecutable;WorkflowExecutable=$pair.WorkflowExecutable}
}
function Assert-SetupVerifiedPayload($Adapter,$Session,$Pin,[string]$Archive,$Saved) {
    if ((Get-UpdateHash $Archive) -cne $Pin.digest) {throw 'publisher-unverified'}
    $manifest=Assert-UpdatePackage (Join-Path $Session.Root 'payload') $Pin.version;Assert-PublishedUpdatePackage $manifest
    if ($manifest.source.commit -cne $Pin.commit -or (Get-TreeHash (Join-Path $Session.Root 'payload')) -cne $Saved.payloadHash) {throw 'recovery-required'}
}
function Invoke-SetupOperation([ValidateSet('Verify','Install','Inspect')][string]$Operation,$Session,$Adapter=$null,$ExpectedWitness=$null) {
    $receipt=@{id=$Session.Id;status='failed';reason='publisher-unverified';workerPid=$PID;workerCreated=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o')}
    # A direct caller may round-trip the session through JSON. Keep its existing
    # fields/sequence but own the per-operation observation fields locally.
    if ($Session -isnot [Collections.IDictionary]) {
        $normalized=@{};foreach ($property in $Session.PSObject.Properties) {$normalized[$property.Name]=$property.Value};$Session=$normalized
    }
    $Session.Operation=$Operation;$Session.StartedUtc=[DateTime]::UtcNow
    $context=$null
    try {
        if (!$Adapter) {$Adapter=New-SetupProductionAdapter}
        Assert-SetupExecutionScope $Adapter.Locations -Inspect
        $archive=Join-Path $PSScriptRoot 'Workflow.zip';$pin=Get-SetupPin
        if ($Adapter.Kind -ceq 'inert' -and $Adapter.ContainsKey('SyntheticArchive')) {
            $archive=Assert-NormalPath $Adapter.SyntheticArchive
            if (!$archive.StartsWith($Adapter.Root+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'fixture-root-refused'}
            $pin=$Adapter.SyntheticPin;$receipt.sourceEvidence='synthetic-data'
        } else {$receipt.sourceEvidence='original-official-zip'}
        if ($Operation -ceq 'Inspect') {
            Write-SetupEvent $Session 'inspecting'
            $resultPath=Join-Path $Session.Root 'result.json'
            if (!$ExpectedWitness -or [string]$ExpectedWitness['result'] -cnotmatch '^[a-f0-9]{64}$' -or !(Test-Path -LiteralPath $resultPath)) {throw 'recovery-required'}
            if ((Get-UpdateHash $resultPath) -cne $ExpectedWitness['result']) {throw 'recovery-required'}
            $saved=Read-UpdateJson (Join-Path $Session.Root 'result.json') 65536
            $live=Get-Process -Id $saved.workerPid -ErrorAction SilentlyContinue
            if ($saved.id -cne $Session.Id -or ($live -and $live.StartTime.ToUniversalTime().ToString('o') -ceq $saved.workerCreated)) {throw 'recovery-required'}
            if (Test-Path -LiteralPath (Join-Path $Session.Root 'baseline.json')) {
                $context=New-SetupContext $Adapter $Session $pin
                Assert-SetupInspectionWitness $context $Session.Root $ExpectedWitness
                Assert-SetupVerifiedPayload $Adapter $Session $pin $archive $saved
                Write-SetupEvent $Session 'inspect-transaction'
                $savedContext=Read-UpdateJson (Join-Path $Session.Root 'context.json') 65536
                foreach ($key in @('Id','ScanRoot','TransactionRoot','Target','PackageRoot','Version','Digest','Size','ResolveExecutable','WorkflowExecutable')) {if ([string]$context[$key] -cne [string]$savedContext.$key) {throw 'target-unverified'}}
                $actual=Get-SetupReconciledOutcome $context $Session.Root $Adapter.Locations $ExpectedWitness
                $receipt.status=$actual.status;$receipt.reason=$actual.reason
            } else {
                Assert-SetupInspectionWitness $null $Session.Root $ExpectedWitness
                if ($saved.status -cnotin @('source-verified','production-blocked','failed','cancelled')) {throw 'recovery-required'}
                if ($saved.status -cin @('source-verified','production-blocked')) {Assert-SetupVerifiedPayload $Adapter $Session $pin $archive $saved}
                $receipt.status=$saved.status;$receipt.reason=$saved.reason
            }
        } else {
            Write-SetupEvent $Session 'verifying'
            if (Test-Path -LiteralPath (Join-Path $Session.Root 'cancel.request')) {$receipt.status='cancelled';$receipt.reason=$null}
            else {
                $request=Assert-SetupArchive $archive (Join-Path $Session.Root 'payload') -Pin $pin -Fetch $Adapter.Fetch
                $receipt.payloadHash=Get-TreeHash (Join-Path $Session.Root 'payload');$receipt.official=$request
                Write-SetupEvent $Session 'source-checked'
                if ($Operation -ceq 'Verify') {$receipt.status='source-verified';$receipt.reason='local-candidate-gate'}
                else {
                    # One immutable scope gate, then the same normal core for both providers.
                    Assert-SetupExecutionScope $Adapter.Locations
                    $context=New-SetupContext $Adapter $Session $request
                    Write-ExecutorJson (Join-Path $Session.Root 'context.json') $context
                    $actual=Invoke-SetupTransaction $context $Session $Adapter.Locations -Observe $Adapter.Observe -Provision $Adapter.Provision -Checkpoint $Adapter.Checkpoint -Access $Adapter.Access
                    $receipt.status=$actual.status;$receipt.reason=$actual.reason
                    if ($actual.ContainsKey('newNamespaceHash')) {$receipt.newNamespaceHash=$actual.newNamespaceHash}
                }
            }
        }
    } catch {
        # Local evidence retains the original bounded cause chain, never permission.
        $causes=@();$cause=$_.Exception
        while ($cause -and $causes.Count -lt 12) {
            $causes+=@{type=$cause.GetType().FullName;message=$cause.Message.Substring(0,[Math]::Min(2048,$cause.Message.Length));hresult=$cause.HResult}
            $cause=$cause.InnerException
        }
        $receipt.diagnostic=$causes
        $receipt.reason=Get-UpdateFailureReason $_
        $receipt.status=if ($receipt.reason -ceq 'local-candidate-gate') {'production-blocked'} elseif ($receipt.reason -ceq 'permission-cancelled') {'cancelled'} else {'failed'}
    }
    $name=if ($Operation -ceq 'Inspect') {'inspect.json'} else {'result.json'}
    Write-ExecutorJson (Join-Path $Session.Root $name) $receipt
    if ($Operation -cne 'Inspect') {$receipt.inspectionWitness=Get-SetupInspectionWitness $context $Session.Root}
    return $receipt
}
Export-ModuleMember -Function Invoke-SetupOperation
