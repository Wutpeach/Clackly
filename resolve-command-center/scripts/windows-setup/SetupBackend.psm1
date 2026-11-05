Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -Force -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'LocalNative.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'SetupQualification.psm1') -Force -DisableNameChecking

# Fixed adapter only. WorkflowTransaction owns every activation/rollback move.
# Fetch/Observe/Provision are direct-module test seams, never production CLI data.
function Get-SetupPin {
    return @{version='0.1.3';releaseId=428867234;assetId=691653752;size=32601075L;
        digest='425ea8981965c998530e0aa3f8416032c17172c136e6f92f14f577f26621a640';
        commit='a2315fb20225beb919f1c6c4d1a80d04dc7e9cd9'}
}
function Get-SetupProductionLocations {
    # Canonical locations only; normal builds cannot enable mutation.
    $scan=Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins'
    $local=[Environment]::GetFolderPath('LocalApplicationData')
    $roaming=[Environment]::GetFolderPath('ApplicationData')
    return @{Scan=$scan;Target=(Join-Path $scan 'com.wutpeach.clackly');Transactions=($scan+'.Clackly Updates');
        Inbox=(Join-Path $local 'Clackly\Workflow Update Requests');LegacyTransactions=($scan+'.Clackly Transactions');
        HistoricalBackups=(Join-Path (Split-Path -Parent $scan) 'Clackly Install Backups');
        DataRoots=@((Join-Path $roaming 'Clackly'),(Join-Path $roaming 'Clackly Workflow Plugin'));Pointers=@(
            (Join-Path $roaming 'Clackly\workflow-updates\installation.json'),
            (Join-Path $roaming 'Clackly Workflow Plugin\workflow-updates\installation.json'),
            (Join-Path $local 'Clackly Workflow Plugin\workflow-updates\installation.json'),
            (Join-Path $local 'Clackly\workflow-updates\installation.json'))}
}
function Assert-SetupArchive([string]$Archive,[string]$Payload,$Pin=(Get-SetupPin),[scriptblock]$Fetch=$null) {
    Assert-NormalPath $Archive | Out-Null
    if ((Get-Item -LiteralPath $Archive).Length -ne $Pin.size -or (Get-UpdateHash $Archive) -cne $Pin.digest) {throw 'publisher-unverified'}
    # Setup already pins the exact Release; one official GET is sufficient.
    $request=@{};foreach ($key in @('version','releaseId','assetId','size','digest')) {$request[$key]=$Pin[$key]}
    if ($Fetch) {Assert-OfficialRelease $request -Fetch $Fetch} else {Assert-OfficialRelease $request}
    Expand-UpdateArchive $Archive $Payload $request.digest $request.size
    $manifest=Assert-UpdatePackage $Payload $Pin.version
    Assert-PublishedUpdatePackage $manifest
    if ($manifest.source.commit -cne $Pin.commit) {throw 'publisher-unverified'}
    return $request
}
function Get-SetupTreeHash([string]$Target) {
    Assert-NormalPath $Target -AllowMissing | Out-Null
    if (!(Test-Path -LiteralPath $Target)) {return 'absent'}
    return Get-TreeHash $Target
}
function Write-SetupEvent($Session,[string]$State,[string]$Current='未知',[string]$Reason='') {
    $Session.Sequence++
    $event=@{id=$Session.Id;event=$State;sequence=$Session.Sequence;pid=$PID;
        created=[Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o');
        current=$Current;reason=$Reason;observedUtc=[DateTime]::UtcNow.ToString('o')}
    if ($Session.ContainsKey('StartedUtc')) {$event.elapsedSeconds=([DateTime]::UtcNow-$Session.StartedUtc).TotalSeconds}
    $prefix=if ($Session.ContainsKey('Operation') -and $Session.Operation -ceq 'Inspect') {'inspect-event-'} else {'event-'}
    Write-ExecutorJson (Join-Path $Session.Root ($prefix+$Session.Sequence.ToString('D4')+'.json')) $event
    [Console]::Out.WriteLine(($event | ConvertTo-Json -Compress));[Console]::Out.Flush()
}
# The only future production compilation gate. No runtime enable input exists.
$script:ProductionMutationEnabled=$false
$script:TrialLease=$null
$script:TrialNamespaceLease=$null
function Assert-SetupTrialWorker {
    if (!$script:ProductionMutationEnabled) {throw 'local-candidate-gate'}
    if (!$script:TrialLease) {
        $fixed=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Clackly Setup R29\Clackly-Setup-0.1.3-win-x64-CONTROLLED-TRIAL.dll'
        # Fixed protected assembly, never a parameter, cache or JSON authority.
        [Reflection.Assembly]::LoadFrom($fixed) | Out-Null
        $script:TrialLease=[TrialBoundary]::OpenWorker($PSScriptRoot)
    }
    if (!$script:TrialNamespaceLease) {$script:TrialNamespaceLease=[TrialBoundary]::OpenInstallationNamespace()}
}
function Assert-SetupExecutionScope($Locations,[switch]$Inspect) {
    $production=Get-SetupProductionLocations
    if ($Locations.Scan -ceq $production.Scan) {
        foreach ($key in @('Scan','Target','Transactions','Inbox','LegacyTransactions','HistoricalBackups')) {if ($Locations[$key] -cne $production[$key]) {throw 'target-unverified'}}
        foreach ($key in @('Pointers','DataRoots')) {if ((Get-SetupEvidenceHash @($Locations[$key])) -cne (Get-SetupEvidenceHash @($production[$key]))) {throw 'target-unverified'}}
        if (!$Inspect -and !$script:ProductionMutationEnabled) {throw 'local-candidate-gate'}
        if ($script:ProductionMutationEnabled) {Assert-SetupTrialWorker}
        return
    }
    $root=Assert-NormalPath (Split-Path -Parent $Locations.Scan)
    $allowed=Join-Path ([IO.Path]::GetTempPath()) 'Clackly-R24-Fixtures'
    if (!$root.StartsWith($allowed+'\',[StringComparison]::OrdinalIgnoreCase) -or [IO.File]::ReadAllText((Join-Path $root '.clackly-r24-fixture')) -cne 'INERT R24 ONLY') {throw 'fixture-root-refused'}
    foreach ($path in @($Locations.Scan,$Locations.Target,$Locations.Transactions,$Locations.Inbox,$Locations.LegacyTransactions,$Locations.HistoricalBackups)+@($Locations.Pointers)+@($Locations.DataRoots)) {
        Assert-NormalPath $path -AllowMissing | Out-Null
        if (!$path.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)) {throw 'fixture-root-refused'}
    }
}
function Assert-SetupEngineCheckpoint($Context,$Locations,$Baseline,[string]$Point) {
    $paths=Get-TransactionPaths $Context
    $record=Read-UpdateJson $paths.Journal 65536
    $state=if ($Point -ceq 'before-stage') {'staging'} elseif ($Point -ceq 'after-stage') {'prepared'} else {'backup-intent'}
    foreach ($pair in @(@('id',$Context.Id),@('target',$Context.Target),@('backup',$paths.Backup),@('stage',$paths.Stage),@('version',$Context.Version),@('candidateDigest',$Context.Digest),@('oldHash',$Baseline.oldHash),@('state',$state))) {
        if ([string]$record.($pair[0]) -cne [string]$pair[1]) {throw 'recovery-required'}
    }
    if ($record.ownerPid -ne $PID -or $record.ownerCreated -cne [Diagnostics.Process]::GetCurrentProcess().StartTime.ToUniversalTime().ToString('o') -or $record.candidateSize -ne $Context.Size) {throw 'recovery-required'}
    if ((Test-Path -LiteralPath $paths.Backup) -or (Test-Path -LiteralPath $paths.Failed) -or (Test-Path -LiteralPath ($paths.Journal+'.next'))) {throw 'recovery-required'}
    if ((Test-Path -LiteralPath $paths.Stage) -ne ($Point -cne 'before-stage')) {throw 'recovery-required'}
    if ((Test-Path -LiteralPath ($paths.Journal+'.previous')) -ne ($Point -cne 'before-stage')) {throw 'recovery-required'}
    Assert-SetupNormalUnchanged $Locations $Baseline $Context.Id | Out-Null
}
function Invoke-SetupTransaction($Context,$Session,$Locations,
    [scriptblock]$Observe={param($c) Get-CanonicalHostState $c.ResolveExecutable $c.WorkflowExecutable},
    [scriptblock]$Provision={param($root,$workflow) Copy-LocalResolveNative $root $workflow},
    [scriptblock]$Checkpoint={},[scriptblock]$Access={param($target,$scan) Assert-UpdateWriteAccess $target $scan}) {
    Assert-SetupExecutionScope $Locations
    if ($Context.ScanRoot -cne $Locations.Scan -or $Context.Target -cne (Join-Path $Locations.Scan 'com.wutpeach.clackly') -or $Context.TransactionRoot -cne ($Locations.Scan+'.Clackly Updates') -or $Context.Id -cne $Session.Id) {throw 'target-unverified'}
    Write-SetupEvent $Session 'preparing'
    Get-SetupNormalObservation $Locations | Out-Null
    [IO.Directory]::CreateDirectory($Locations.Scan) | Out-Null
    $adapterPath=Join-Path $Locations.Scan '.clackly-setup.lock';Assert-NormalPath $adapterPath -AllowMissing | Out-Null
    try {$adapterLock=[IO.File]::Open($adapterPath,'OpenOrCreate','ReadWrite','None')} catch [IO.IOException] {throw 'concurrent-install'}
    try {
        Assert-SetupLockFile $adapterLock
        [IO.Directory]::CreateDirectory($Locations.Transactions) | Out-Null
        $paths=Get-TransactionPaths $Context;Assert-NormalPath $paths.Lock -AllowMissing | Out-Null
        try {$prepared=[IO.File]::Open($paths.Lock,'OpenOrCreate','ReadWrite','None')} catch [IO.IOException] {throw 'concurrent-install'}
        try {
            Assert-SetupLockFile $prepared
            $baseline=Get-SetupNormalObservation $Locations
            $baseline.id=$Context.Id;$baseline.context=$Context
            Write-ExecutorJson (Join-Path $Session.Root 'baseline.json') $baseline
        } finally {$prepared.Dispose()}
        $cancel={Test-Path -LiteralPath (Join-Path $Session.Root 'cancel.request')}
        Write-SetupEvent $Session 'waiting' $baseline.current
        $deadline=[DateTime]::UtcNow.AddMinutes(20)
        while (!(Test-Path -LiteralPath (Join-Path $Session.Root 'continue.request'))) {
            if (& $cancel) {return @{status='cancelled';reason=$null}}
            if ([DateTime]::UtcNow -gt $deadline) {throw 'host-running'}
            Start-Sleep -Milliseconds 100
        }
        if (!(Wait-UpdateHostExit $Context $cancel -Observe $Observe)) {return @{status='cancelled';reason=$null}}
        Assert-SetupNormalUnchanged $Locations $baseline | Out-Null
        if ($baseline.oldHash -ceq 'absent') {& $Access $Locations.Scan $Locations.Scan} else {& $Access $Context.Target $Locations.Scan}
        $namespace=@{prepared=$null}
        $progress={param($point)
            if ($point -cin @('before-stage','after-stage','backup-intent')) {Assert-SetupEngineCheckpoint $Context $Locations $baseline $point}
            if ($point -ceq 'after-stage') {$namespace.prepared=Get-SetupEvidenceHash @(Get-SetupFullNamespace $paths.Stage)}
            if ($point -ceq 'backup-intent' -and (Get-SetupEvidenceHash @(Get-SetupFullNamespace $paths.Stage)) -cne $namespace.prepared) {throw 'recovery-required'}
            if ($point -ceq 'before-stage') {Write-SetupEvent $Session 'staging' $baseline.current}
            if ($point -ceq 'after-stage') {Write-SetupEvent $Session 'prepared' $baseline.current}
            if ($point -ceq 'backup-intent') {Write-SetupEvent $Session 'installing' $baseline.current}
            if ($point -ceq 'after-activation') {Write-SetupEvent $Session 'checking' $baseline.current}
            & $Checkpoint $point
        }
        $outcome=Invoke-UpdateTransaction $Context -Observe $Observe -Provision $Provision -Checkpoint $progress -Cancelled $cancel
        Write-SetupEvent $Session 'transaction-checked' $baseline.current
        if ($outcome.status -ceq 'installed') {
            if ((Get-SetupEvidenceHash @(Get-SetupFullNamespace $Context.Target)) -cne $namespace.prepared) {throw 'recovery-required'}
            $outcome.newNamespaceHash=$namespace.prepared
        }
        return $outcome
    } finally {$adapterLock.Dispose()}
}
function Assert-SetupOwnGlobal($Context,$Locations,[string]$ExpectedStatus) {
    $history=Get-SetupCompletedHistory $Locations $Context.Id
    foreach ($entry in @(Get-ChildItem -LiteralPath $Context.TransactionRoot -Force)) {
        if ($entry.Name -ceq 'install.lock' -and !$entry.PSIsContainer) {Get-SetupPathIdentity $entry.FullName | Out-Null;continue}
        if ($entry.Name -cin @($history.names)) {continue}
        if ($ExpectedStatus -ceq 'installed' -and $entry.Name -cin @(($Context.Id+'.stage'),($Context.Id+'.failed'))) {throw 'recovery-required'}
        if ($entry.Name -cnotin @(($Context.Id+'.json'),($Context.Id+'.json.previous'),($Context.Id+'.stage'),($Context.Id+'.backup'),($Context.Id+'.failed'),($Context.Id+'.completed'))) {throw 'recovery-required'}
        Get-SetupArtifact $entry.FullName | Out-Null
    }
}
function Get-SetupInspectionWitness($Context,[string]$SessionRoot) {
    $witness=@{}
    foreach ($name in @('baseline','context','result')) {$path=Join-Path $SessionRoot ($name+'.json');$witness[$name]=if (Test-Path -LiteralPath $path) {Get-UpdateHash $path} else {'absent'}}
    $journal=if ($Context) {Join-Path $Context.TransactionRoot ($Context.Id+'.json')} else {$null}
    $witness.journal=if ($journal -and (Test-Path -LiteralPath $journal)) {Get-UpdateHash $journal} else {'absent'}
    return $witness
}
function Assert-SetupInspectionWitness($Context,[string]$SessionRoot,$Witness) {
    if (!$Witness) {throw 'recovery-required'}
    $actual=Get-SetupInspectionWitness $Context $SessionRoot
    foreach ($key in @('baseline','context','result','journal')) {if ([string]$Witness[$key] -cnotmatch '^(absent|[a-f0-9]{64})$' -or $actual[$key] -cne $Witness[$key]) {throw 'recovery-required'}}
}
function Get-SetupReconciledOutcome($Context,[string]$SessionRoot,$Locations,$Witness) {
    Assert-SetupExecutionScope $Locations -Inspect
    Assert-SetupInspectionWitness $Context $SessionRoot $Witness
    $receipt=Read-UpdateJson (Join-Path $SessionRoot 'result.json') 65536
    if ($receipt.id -cne $Context.Id -or $receipt.workerPid -le 0 -or !$receipt.workerCreated) {throw 'recovery-required'}
    $live=Get-Process -Id $receipt.workerPid -ErrorAction SilentlyContinue
    if ($live -and $live.StartTime.ToUniversalTime().ToString('o') -ceq $receipt.workerCreated) {throw 'recovery-required'}
    $baseline=Read-UpdateJson (Join-Path $SessionRoot 'baseline.json') 65536
    if ($baseline.id -cne $Context.Id) {throw 'recovery-required'}
    $paths=Get-TransactionPaths $Context
    $adapterPath=Assert-NormalPath (Join-Path $Context.ScanRoot '.clackly-setup.lock')
    try {$adapterLock=[IO.File]::Open($adapterPath,'Open','ReadWrite','None')} catch [IO.IOException] {throw 'concurrent-install'}
    try {
        Assert-SetupLockFile $adapterLock
        # Existing engine obtains its own lock and validates actual full trees.
        if ($Witness.journal -cne 'absent') {$actual=Get-UpdateTransactionState $Context}
        else {$actual=@{status=$receipt.status;reason=$receipt.reason}}
        # Reacquire and repeat final facts together; no stale unlocked success.
        if (!(Test-Path -LiteralPath $paths.Lock)) {throw 'recovery-required'}
        try {$engineLock=[IO.File]::Open($paths.Lock,'Open','ReadWrite','None')} catch [IO.IOException] {throw 'concurrent-install'}
        try {
            Assert-SetupLockFile $engineLock
            Assert-SetupInspectionWitness $Context $SessionRoot $Witness
            Assert-SetupNormalUnchanged $Locations $baseline $Context.Id -AfterTransaction | Out-Null
            Assert-SetupOwnGlobal $Context $Locations $actual.status
            if ($Witness.journal -ceq 'absent') {
                $history=Get-SetupCompletedHistory $Locations $Context.Id
                if ($actual.status -cnotin @('failed','cancelled') -or (Get-SetupTreeHash $Context.Target) -cne $baseline.oldHash -or (Get-SetupEvidenceHash @(Get-SetupFullNamespace $Context.Target)) -cne $baseline.oldNamespaceHash -or @(Get-ChildItem -LiteralPath $paths.Root -Force).Count -ne (1+@($history.names).Count)) {throw 'recovery-required'}
            } else {
                $record=Read-UpdateJson $paths.Journal 65536
                if ($record.oldHash -cne $baseline.oldHash -or $record.ownerPid -ne $receipt.workerPid -or $record.ownerCreated -cne $receipt.workerCreated) {throw 'recovery-required'}
                $expected=if ($actual.status -ceq 'installed') {$record.newHash} else {$record.oldHash}
                if ((Get-SetupTreeHash $Context.Target) -cne $expected) {throw 'recovery-required'}
                if ($actual.status -ceq 'installed') {
                    Assert-UpdatePackage $Context.Target $Context.Version $record.native | Out-Null
                    if (!$receipt.PSObject.Properties['newNamespaceHash'] -or (Get-SetupEvidenceHash @(Get-SetupFullNamespace $Context.Target)) -cne $receipt.newNamespaceHash) {throw 'recovery-required'}
                    if ($record.oldHash -ceq 'absent') {if (Test-Path -LiteralPath $paths.Backup) {throw 'recovery-required'}}
                    elseif ((Get-TreeHash $paths.Backup) -cne $baseline.oldHash -or (Get-SetupEvidenceHash @(Get-SetupFullNamespace $paths.Backup)) -cne $baseline.oldNamespaceHash) {throw 'recovery-required'}
                }
                elseif ((Get-SetupEvidenceHash @(Get-SetupFullNamespace $Context.Target)) -cne $baseline.oldNamespaceHash) {throw 'recovery-required'}
            }
            if ($actual.status -cne $receipt.status -or $actual.reason -cne $receipt.reason) {throw 'recovery-required'}
            Assert-SetupInspectionWitness $Context $SessionRoot $Witness
            if ($actual.status -ceq 'installed') {
                # Only the independent post-exit Inspector creates this receipt.
                # A torn write remains evidence and blocks a later normal install.
                $completion=@{schemaVersion=1;kind='clackly-setup-verified';id=$Context.Id;journalHash=(Get-UpdateHash $paths.Journal);previousHash=(Get-UpdateHash ($paths.Journal+'.previous'));oldVersion=$baseline.current;oldNamespaceHash=$baseline.oldNamespaceHash;newNamespaceHash=$receipt.newNamespaceHash}
                $path=Join-Path $paths.Root ($Context.Id+'.completed')
                if (Test-Path -LiteralPath $path) {
                    if ((Get-SetupArtifact $path).kind -cne 'file') {throw 'recovery-required'}
                    $savedCompletion=Read-UpdateJson $path 65536
                    if (@($savedCompletion.PSObject.Properties).Count -ne $completion.Count) {throw 'recovery-required'}
                    foreach ($key in $completion.Keys) {if ([string]$savedCompletion.$key -cne [string]$completion[$key]) {throw 'recovery-required'}}
                } else {
                    $temp=$path+'.next';Assert-NormalPath $temp -AllowMissing | Out-Null
                    $bytes=[Text.Encoding]::UTF8.GetBytes(($completion | ConvertTo-Json -Depth 4 -Compress))
                    $file=[IO.File]::Open($temp,'CreateNew','Write','None')
                    try {$file.Write($bytes,0,$bytes.Length);$file.Flush($true)} finally {$file.Dispose()}
                    [IO.File]::Move($temp,$path)
                }
            } elseif (Test-Path -LiteralPath (Join-Path $paths.Root ($Context.Id+'.completed'))) {throw 'recovery-required'}
            return $actual
        } finally {$engineLock.Dispose()}
    } finally {$adapterLock.Dispose()}
}
Export-ModuleMember -Function Get-SetupPin,Get-SetupProductionLocations,Assert-SetupArchive,Get-SetupTreeHash,Get-SetupCurrentVersion,Write-SetupEvent,Assert-SetupExecutionScope,Invoke-SetupTransaction,Get-SetupReconciledOutcome,Get-SetupInspectionWitness,Assert-SetupInspectionWitness
