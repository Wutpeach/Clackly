Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'LocalNative.psm1') -Force -DisableNameChecking

# This module contains no elevation, process termination, downloaded-code execution,
# recursive deletion or background registration. Production authority belongs to
# executor.ps1; fixture callers inject process observations, never product CLI flags.
function Stop-Update([string]$Reason) { throw [InvalidOperationException]::new($Reason) }
function Get-UpdateFailureReason($Failure) {
    if ($Failure.Exception.Message -cin @('native-missing','native-invalid','native-incompatible')) {return $Failure.Exception.Message}
    $exception = $Failure.Exception
    while ($exception) {
        if ($exception -is [UnauthorizedAccessException] -or
            ($exception -is [ComponentModel.Win32Exception] -and $exception.NativeErrorCode -eq 5)) { return 'permission-denied' }
        if ($exception -is [ComponentModel.Win32Exception] -and $exception.NativeErrorCode -eq 1223) { return 'permission-cancelled' }
        $exception = $exception.InnerException
    }
    return $Failure.Exception.Message
}

function Assert-NormalPath([string]$Path, [switch]$AllowMissing) {
    $full = [IO.Path]::GetFullPath($Path)
    if ($full -ne $Path -or $full.StartsWith('\\') -or $full.IndexOf(':', 2) -ge 0) { Stop-Update 'target-unverified' }
    $current = [IO.Path]::GetPathRoot($full)
    foreach ($part in $full.Substring($current.Length).Split([char]'\')) {
        if (!$part) { continue }
        # Query this directory entry, not every sibling through a PowerShell
        # pipeline. Keep actual-name comparison: existence/GetAttributes alone
        # would accept 8.3 aliases or trailing-dot spelling. Enumeration returns
        # the entry's own attributes, including a dangling reparse point.
        if ($part.IndexOfAny([char[]]'*?') -ge 0) { Stop-Update 'target-unverified' }
        $item = [IO.DirectoryInfo]::new($current).GetFileSystemInfos($part)
        if ($item.Count -eq 0) { if ($AllowMissing) { return $full }; Stop-Update 'target-unverified' }
        if ($item.Count -ne 1 -or $item[0].Name -ine $part -or
            ($item[0].Attributes -band [IO.FileAttributes]::ReparsePoint)) { Stop-Update 'target-unverified' }
        $current = $item[0].FullName
    }
    return $full
}

function Get-UpdateHash([string]$Path) {
    Assert-NormalPath $Path | Out-Null
    $stream = [IO.File]::Open($Path, 'Open', 'Read', 'Read')
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose(); $stream.Dispose() }
}

function Get-TreeFiles([string]$Root) {
    Assert-NormalPath $Root | Out-Null
    $pending = [Collections.Generic.Stack[string]]::new()
    $pending.Push($Root)
    $files = [Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
    while ($pending.Count) {
        foreach ($item in @(Get-ChildItem -LiteralPath $pending.Pop() -Force)) {
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { Stop-Update 'target-unverified' }
            if ($item.PSIsContainer) { $pending.Push($item.FullName) }
            else {
                $relative = $item.FullName.Substring($Root.Length + 1).Replace('\', '/')
                $files.Add($relative,[pscustomobject]@{path=$relative; size=$item.Length; sha256=(Get-UpdateHash $item.FullName)})
            }
        }
    }
    $sorted = [string[]]@($files.Keys)
    [Array]::Sort($sorted, [StringComparer]::Ordinal)
    foreach ($name in $sorted) { $files[$name] }
}

function Get-TreeHash([string]$Root) {
    $text = (@(Get-TreeFiles $Root) | ForEach-Object { '{0}:{1}:{2}' -f $_.path, $_.size, $_.sha256 }) -join "`n"
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-', '').ToLowerInvariant() }
    finally { $hash.Dispose() }
}

function Read-UpdateJson([string]$Path, [int]$Limit = 8388608) {
    Assert-NormalPath $Path | Out-Null
    if ((Get-Item -LiteralPath $Path).Length -gt $Limit) { Stop-Update 'invalid-package' }
    return [IO.File]::ReadAllText($Path) | ConvertFrom-Json
}

function Assert-InstalledUpdateTarget([string]$Root, [string]$CandidateVersion) {
    # Older installed releases predate clackly-release.json. Validate their
    # established package/Workflow identity, then retain a hash of every byte.
    $pkg = Read-UpdateJson (Join-Path $Root 'package.json') 65536
    $manifestFile = Join-Path $Root 'manifest.xml'
    Assert-NormalPath $manifestFile | Out-Null
    if ((Get-Item -LiteralPath $manifestFile).Length -gt 65536) { Stop-Update 'invalid-package' }
    [xml]$xml = [IO.File]::ReadAllText($manifestFile)
    if ($pkg.name -cne 'clackly' -or $pkg.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
        $xml.BlackmagicDesign.Plugin.Id -cne 'com.wutpeach.clackly' -or $xml.BlackmagicDesign.Plugin.Version -cne $pkg.version -or
        $xml.BlackmagicDesign.Plugin.FilePath -cne 'workflow-plugin/main.js') { Stop-Update 'invalid-package' }
    # Compare decimal SemVer components without overflowing .NET Version/Int32.
    if ($CandidateVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { Stop-Update 'invalid-package' }
    $old = $pkg.version.Split('.'); $next = $CandidateVersion.Split('.')
    for ($i=0; $i -lt 3; $i++) {
        if ($next[$i].Length -gt $old[$i].Length) { return }
        if ($next[$i].Length -lt $old[$i].Length) { Stop-Update 'invalid-package' }
        $comparison = [StringComparer]::Ordinal.Compare($next[$i], $old[$i])
        if ($comparison -gt 0) { return }
        if ($comparison -lt 0) { Stop-Update 'invalid-package' }
    }
    Stop-Update 'invalid-package'
}

function Assert-UpdatePackage([string]$Root, [string]$Version, $NativeIdentity = $null) {
    $manifest = Read-UpdateJson (Join-Path $Root 'clackly-release.json')
    if ($manifest.schemaVersion -ne 2 -or $manifest.package.id -cne 'com.wutpeach.clackly' -or
        $manifest.package.name -cne 'clackly' -or $manifest.package.version -cne $Version -or
        $manifest.package.platform -cne 'win32' -or $manifest.package.arch -cne 'x64' -or
        $manifest.package.entrypoint -cne 'workflow-plugin/main.js' -or
        $manifest.source.repository -cne 'Wutpeach/Clackly' -or $manifest.source.tag -cne ('v' + $Version) -or
        !($manifest.source.workflowPath -ceq '.github/workflows/workflow-release.yml' -or
            ($manifest.build.publishable -is [bool] -and !$manifest.build.publishable -and
                ($null -eq $manifest.source.workflowPath -or $manifest.source.workflowPath -ceq '.github/workflows/main.yml'))) -or
        $manifest.source.commit -cnotmatch '^[0-9a-f]{40}$' -or $manifest.source.dirty -isnot [bool] -or
        $manifest.build.publishable -isnot [bool] -or ($manifest.build.publishable -and $manifest.source.dirty) -or
        $Version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') { Stop-Update 'invalid-package' }
    $all = @(Get-TreeFiles $Root)
    $nativePath = 'workflow-plugin/WorkflowIntegration.node'
    $nativeFiles = @($all | Where-Object { $_.path -imatch '(^|/)WorkflowIntegration\.node(/|$)' })
    if ($null -eq $NativeIdentity) {
        if ($nativeFiles.Count) { Stop-Update 'invalid-package' }
    } elseif ($NativeIdentity.path -cne $nativePath -or $NativeIdentity.sha256 -cnotmatch '^[a-f0-9]{64}$' -or
        $NativeIdentity.size -le 0 -or $nativeFiles.Count -ne 1 -or $nativeFiles[0].path -cne $nativePath -or
        $nativeFiles[0].size -ne $NativeIdentity.size -or $nativeFiles[0].sha256 -cne $NativeIdentity.sha256) { Stop-Update 'native-invalid' }
    $actual = @($all | Where-Object { $_.path -cne 'clackly-release.json' -and $_.path -cne $nativePath })
    $expected = @($manifest.files)
    if (!$actual.Count -or $expected.Count -gt 20000 -or $actual.Count -ne $expected.Count) { Stop-Update 'invalid-package' }
    $names=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    for ($i=0; $i -lt $actual.Count; $i++) {
        $name=$expected[$i].path
        if (!$name -or $name.Length -gt 233 -or $name -match '[\x00-\x1f\x7f\\:]' -or
            $name -match '(^|/)(\.\.?|[^/]*[ .]|(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^/]*)?)(/|$)' -or
            $name.StartsWith('/') -or $name.EndsWith('/') -or $name.Contains('//') -or $name.IndexOfAny([char[]]'<>"|?*') -ge 0 -or
            !$names.Add($name) -or $name -imatch '(^|/)WorkflowIntegration\.node(/|$)' -or $name -ceq 'clackly-release.json' -or
            $name -imatch '^(electron\.exe|Clackly\.exe|payload/|tools/|resources/app/)' -or
            $name -cmatch '(^|/)node_modules/(electron|electron-builder|vite|playwright)/' -or
            $expected[$i].size -lt 0 -or $expected[$i].sha256 -cnotmatch '^[a-f0-9]{64}$') {Stop-Update 'invalid-package'}
        if ($actual[$i].path -cne $expected[$i].path -or $actual[$i].size -ne $expected[$i].size -or
            $actual[$i].sha256 -cne $expected[$i].sha256) { Stop-Update 'invalid-package' }
    }
    $pkg = Read-UpdateJson (Join-Path $Root 'package.json')
    [xml]$xml = [IO.File]::ReadAllText((Join-Path $Root 'manifest.xml'))
    if ($pkg.name -cne 'clackly' -or $pkg.version -cne $Version -or
        $xml.BlackmagicDesign.Plugin.Id -cne 'com.wutpeach.clackly' -or $xml.BlackmagicDesign.Plugin.Version -cne $Version -or
        $xml.BlackmagicDesign.Plugin.FilePath -cne 'workflow-plugin/main.js') { Stop-Update 'invalid-package' }
    $mainFile=Join-Path $Root 'workflow-plugin/main.js'
    if ((Get-Item -LiteralPath $mainFile).Length -gt 1048576) {Stop-Update 'invalid-package'}
    $ids=[regex]::Matches([IO.File]::ReadAllText($mainFile),'\bconst\s+PLUGIN_ID\s*=\s*["'']([^"'']+)["'']\s*;')
    if ($ids.Count -ne 1 -or $ids[0].Groups[1].Value -cne 'com.wutpeach.clackly') {Stop-Update 'invalid-package'}
    foreach ($required in @('package.json','manifest.xml','workflow-plugin/main.js','dist/renderer/index.html','resources/runtimes/manifest.json',
        'electron/main/update/UpdateService.js','scripts/workflow-update/WorkflowTransaction.psm1','scripts/workflow-update/executor.ps1',
        'scripts/workflow-update/launch.ps1','scripts/workflow-update/recover.ps1')) {
        if ($actual.path -cnotcontains $required -or (Get-Item -LiteralPath (Join-Path $Root $required)).Length -lt 1) { Stop-Update 'invalid-package' }
    }
    if ($manifest.runtime.manifestPath -cne 'resources/runtimes/manifest.json' -or
        (Get-UpdateHash (Join-Path $Root $manifest.runtime.manifestPath)) -cne $manifest.runtime.manifestSha256 -or
        $manifest.native.path -cne 'workflow-plugin/WorkflowIntegration.node' -or
        $manifest.native.provisioning -cne 'local-resolve' -or $manifest.native.source -cne 'programdata-sampleplugin' -or
        $manifest.native.platform -cne 'win32' -or $manifest.native.arch -cne 'x64' -or @($manifest.native.PSObject.Properties).Count -ne 5) { Stop-Update 'invalid-package' }
    $runtime = Read-UpdateJson (Join-Path $Root $manifest.runtime.manifestPath)
    if ($runtime.schemaVersion -ne 1 -or @($runtime.profiles).Count -eq 0 -or
        @($runtime.profiles).Count -ne @($manifest.runtime.profiles).Count) { Stop-Update 'invalid-package' }
    foreach ($profile in @($runtime.profiles)) {
        $record = @($manifest.runtime.profiles | Where-Object { $_.id -ceq $profile.id })
        if (!$profile.id -or $profile.runtimeVersion -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$') {Stop-Update 'invalid-package'}
        if ($record.Count -ne 1 -or $profile.platform -cne 'win32' -or $profile.architecture -cne 'x64' -or
            $record[0].version -cne $profile.runtimeVersion -or $actual.path -cnotcontains $record[0].lockPath -or
            $actual.path -cnotcontains ('resources/runtimes/' + $profile.executable) -or
            (Get-UpdateHash (Join-Path $Root $record[0].lockPath)) -cne $record[0].lockSha256) { Stop-Update 'invalid-package' }
        $lock=Read-UpdateJson (Join-Path $Root $record[0].lockPath)
        $base=([IO.Path]::GetDirectoryName($profile.executable)).Replace('\','/')
        $prefix='resources/runtimes/'+$base+'/'
        $stem='python'+(($profile.runtimeVersion.Split('.')[0..1]) -join '')
        foreach ($name in @('python.exe',($stem+'.dll'),($stem+'.zip'),($stem+'._pth'),'runtime.json','LICENSE.txt','THIRD_PARTY_NOTICES.md',
            'python-embed.sigstore','python-embed.spdx.json','application.spdx.json','clackly/bootstrap.py','clackly/persistent_bootstrap.py','clackly/python_runner.py')) {
            $required=$prefix+$name
            if ($actual.path -cnotcontains $required -or (Get-Item -LiteralPath (Join-Path $Root $required)).Length -lt 1) {Stop-Update 'invalid-package'}
        }
        $metadata=Read-UpdateJson (Join-Path $Root ($prefix+'runtime.json'))
        if ($lock.profileId -cne $profile.id -or $lock.version -cne $profile.runtimeVersion -or $metadata.runtimeVersion -cne $lock.version -or
            $metadata.source.sha256 -cne $lock.asset.sha256 -or $metadata.build.lockSha256 -cne $record[0].lockSha256) {Stop-Update 'invalid-package'}
        foreach ($source in @($metadata.build.applicationSources)) {
            $required=$prefix+$source.path
            if ($actual.path -cnotcontains $required -or (Get-UpdateHash (Join-Path $Root $required)) -cne $source.sha256) {Stop-Update 'invalid-package'}
        }
    }
    return $manifest
}

function Expand-UpdateArchive([string]$Archive, [string]$Destination, [string]$Digest, [long]$Size) {
    Assert-NormalPath $Archive | Out-Null
    Assert-NormalPath $Destination -AllowMissing | Out-Null
    if ((Get-Item -LiteralPath $Archive).Length -ne $Size -or (Get-UpdateHash $Archive) -cne $Digest -or
        (Test-Path -LiteralPath $Destination)) { Stop-Update 'invalid-package' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        if ($zip.Entries.Count -gt 20000) { Stop-Update 'invalid-package' }
        $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
        $spelling = [Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
        $total = 0L
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName
            $mode = ($entry.ExternalAttributes -shr 16) -band 61440
            if ($name.Length -gt 240 -or $name -match '[\x00-\x1f\x7f]' -or
                !$name.StartsWith('plugin/', [StringComparison]::Ordinal) -or $name.Contains('\') -or $name.Contains(':') -or
                $name -match '(^|/)(\.\.?|[^/]*[ .]|(?i:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.[^/]*)?)(/|$)' -or
                $name.Contains('//') -or $name.IndexOfAny([char[]]'<>"|?*') -ge 0 -or
                ($entry.ExternalAttributes -band 1024) -ne 0 -or
                ($mode -ne 0 -and $mode -ne 32768 -and $mode -ne 16384) -or
                ($mode -eq 16384 -and !$name.EndsWith('/')) -or ($mode -eq 32768 -and $name.EndsWith('/')) -or
                ($name.EndsWith('/') -and $entry.Length -ne 0) -or $name -imatch '(^|/)WorkflowIntegration\.node(/|$)' -or !$seen.Add($name.TrimEnd('/'))) { Stop-Update 'invalid-package' }
            $prefix = ''
            foreach ($segment in $name.TrimEnd('/').Split('/')) {
                $prefix = if ($prefix) { $prefix + '/' + $segment } else { $segment }
                if ($spelling.ContainsKey($prefix) -and $spelling[$prefix] -cne $prefix) { Stop-Update 'invalid-package' }
                $spelling[$prefix] = $prefix
            }
            $total += $entry.Length
            if ($entry.Length -gt 1073741824 -or $total -gt 4294967296 -or
                $entry.Length -gt [Math]::Max(1048576, $entry.CompressedLength * 200)) { Stop-Update 'invalid-package' }
        }
        [IO.Directory]::CreateDirectory($Destination) | Out-Null
        foreach ($entry in $zip.Entries) {
            if ($entry.FullName -ceq 'plugin/') { continue }
            $relative = $entry.FullName.Substring(7).TrimEnd('/')
            if (!$relative) { Stop-Update 'invalid-package' }
            $target = Join-Path $Destination $relative.Replace('/', '\')
            Assert-NormalPath $target -AllowMissing | Out-Null
            if ($entry.FullName.EndsWith('/')) { [IO.Directory]::CreateDirectory($target) | Out-Null; continue }
            [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
            $inputStream = $entry.Open()
            $output = [IO.File]::Open($target, 'CreateNew', 'Write', 'None')
            try {
                $buffer = [byte[]]::new(65536); $written = 0L
                while (($count = $inputStream.Read($buffer,0,$buffer.Length)) -gt 0) {
                    $written += $count
                    if ($written -gt $entry.Length -or $written -gt 1073741824) { Stop-Update 'invalid-package' }
                    $output.Write($buffer,0,$count)
                }
                $output.Flush($true)
            } finally { $inputStream.Dispose(); $output.Dispose() }
            if ((Get-Item -LiteralPath $target).Length -ne $entry.Length) { Stop-Update 'invalid-package' }
        }
    } finally { $zip.Dispose() }
}

function Get-CanonicalHostState([string]$ResolveExecutable, [string]$WorkflowExecutable) {
    try {
        Assert-NormalPath $ResolveExecutable | Out-Null
        Assert-NormalPath $WorkflowExecutable | Out-Null
        $resolveRoot = Split-Path -Parent $ResolveExecutable
        if ((Split-Path -Leaf $ResolveExecutable) -ine 'Resolve.exe' -or
            $WorkflowExecutable -ine (Join-Path $resolveRoot 'Electron\electron.exe')) { return 'process-unknown' }
        # Query all matching names and reject unreadable or foreign images. Empty
        # successful enumeration is evidence only under qualified host policy.
        $rows = @(Get-CimInstance Win32_Process -Filter "Name='Resolve.exe' OR Name='electron.exe'" -ErrorAction Stop)
        $running = $false
        foreach ($row in $rows) {
            if (!$row.ExecutablePath -or !$row.CreationDate -or !$row.ProcessId) { return 'process-unknown' }
            $image = [IO.Path]::GetFullPath($row.ExecutablePath)
            if ($image -ieq $ResolveExecutable -or $image -ieq $WorkflowExecutable) { $running = $true }
            elseif ($row.Name -ieq 'Resolve.exe') { return 'process-unknown' }
        }
        if ($running) { return 'host-running' }; return 'closed'
    } catch { return 'process-unknown' }
}

function Get-TransactionPaths($Context) {
    if ($Context.Id -cnotmatch '^[0-9a-f]{32}$') { Stop-Update 'target-unverified' }
    $scan = Assert-NormalPath $Context.ScanRoot
    $root = Assert-NormalPath $Context.TransactionRoot
    if ($root -ine ($scan + '.Clackly Updates') -or $Context.Target -ine (Join-Path $scan 'com.wutpeach.clackly') -or
        [IO.Path]::GetPathRoot($root) -ine [IO.Path]::GetPathRoot($scan)) { Stop-Update 'target-unverified' }
    return @{ Root=$root; Target=$Context.Target; Stage=(Join-Path $root ($Context.Id + '.stage'));
        Backup=(Join-Path $root ($Context.Id + '.backup')); Failed=(Join-Path $root ($Context.Id + '.failed'));
        Journal=(Join-Path $root ($Context.Id + '.json')); Lock=(Join-Path $root 'install.lock') }
}

function Open-TransactionLock($Paths, [switch]$Existing) {
    Assert-NormalPath $Paths.Lock -AllowMissing | Out-Null
    try {
        $mode = if ($Existing) { 'Open' } else { 'OpenOrCreate' }
        return [IO.File]::Open($Paths.Lock, $mode, 'ReadWrite', 'None')
    }
    catch [IO.IOException] { Stop-Update 'concurrent-install' }
    catch [UnauthorizedAccessException] { Stop-Update 'permission-denied' }
}

function Write-TransactionJournal($Paths, $Record, [string]$State) {
    $Record.state = $State
    $temp = $Paths.Journal + '.next'
    Assert-NormalPath $Paths.Journal -AllowMissing | Out-Null
    Assert-NormalPath $temp -AllowMissing | Out-Null
    # A previous .next is not overwritten: interrupted writes require inspection.
    $bytes = [Text.Encoding]::UTF8.GetBytes(($Record | ConvertTo-Json -Depth 8 -Compress))
    $file = [IO.File]::Open($temp, 'CreateNew', 'Write', 'None')
    try { $file.Write($bytes, 0, $bytes.Length); $file.Flush($true) } finally { $file.Dispose() }
    if (Test-Path -LiteralPath $Paths.Journal) {
        $previous = $Paths.Journal + '.previous'
        Assert-NormalPath $previous -AllowMissing | Out-Null
        [IO.File]::Replace($temp, $Paths.Journal, $previous)
    }
    else { [IO.File]::Move($temp, $Paths.Journal) }
}

function Complete-TransactionJournal($Paths, $Record, [string]$State, [string]$Status, $Reason) {
    if ($Record -is [Collections.IDictionary]) {
        $Record.outcomeStatus = $Status
        $Record.outcomeReason = $Reason
    } else {
        $Record | Add-Member -NotePropertyName outcomeStatus -NotePropertyValue $Status -Force
        $Record | Add-Member -NotePropertyName outcomeReason -NotePropertyValue $Reason -Force
    }
    Write-TransactionJournal $Paths $Record $State
}

function Assert-SwitchSafe($Context, $Paths, [scriptblock]$Observe) {
    $again = Get-TransactionPaths $Context
    foreach ($key in $Paths.Keys) { if ($again[$key] -cne $Paths[$key]) { Stop-Update 'target-unverified' } }
    foreach ($path in @($Paths.Target, $Paths.Stage, $Paths.Backup, $Paths.Failed)) { Assert-NormalPath $path -AllowMissing | Out-Null }
    $state = & $Observe $Context
    if ($state -cne 'closed') { if ($state -ceq 'host-running') { Stop-Update 'host-running' }; Stop-Update 'process-unknown' }
}

function Get-TargetTreeHash([string]$Path) {
    Assert-NormalPath $Path -AllowMissing | Out-Null
    if (!(Test-Path -LiteralPath $Path)) { return 'absent' }
    return Get-TreeHash $Path
}

function Assert-TransactionRecord($Context, $Paths, $Record) {
    if ($Record.schemaVersion -ne 1 -or $Record.id -cne $Context.Id -or $Record.target -cne $Paths.Target -or
        $Record.backup -cne $Paths.Backup -or $Record.stage -cne $Paths.Stage -or
        $Record.version -cne $Context.Version -or $Record.candidateDigest -cne $Context.Digest -or
        $Record.candidateSize -ne $Context.Size -or $Record.candidateDigest -cnotmatch '^[0-9a-f]{64}$' -or
        $Record.candidateSize -le 0 -or $Record.candidateSize -gt 4294967296 -or
        ($Record.oldHash -cne 'absent' -and $Record.oldHash -cnotmatch '^[0-9a-f]{64}$') -or $Record.newHash -cnotmatch '^[0-9a-f]{64}$') { Stop-Update 'recovery-required' }
}

function Invoke-UpdateRecoveryLocked($Context, $Paths, [scriptblock]$Observe) {
    if (Test-Path -LiteralPath ($Paths.Journal + '.next')) { Stop-Update 'recovery-required' }
    $record = Read-UpdateJson $Paths.Journal 65536
    Assert-TransactionRecord $Context $Paths $record
    if ($record.state -cnotin @('staging','prepared','backup-intent','activate-intent','verified','rollback-intent','rolled-back')) { Stop-Update 'recovery-required' }
    Assert-SwitchSafe $Context $Paths $Observe
    if ($record.oldHash -ceq 'absent') {
        if (Test-Path -LiteralPath $Paths.Backup) { Stop-Update 'recovery-required' }
        $current=Get-TargetTreeHash $Paths.Target
        if ($current -ceq $record.newHash -and $record.state -cne 'rollback-intent') {
            Assert-UpdatePackage $Paths.Target $Context.Version $record.native | Out-Null
            Complete-TransactionJournal $Paths $record 'verified' 'installed' $null
            return @{status='installed';reason=$null}
        }
        if ($current -ceq $record.newHash -and $record.state -ceq 'rollback-intent') {
            Assert-SwitchSafe $Context $Paths $Observe
            [IO.Directory]::Move($Paths.Target,$Paths.Failed)
        } elseif ($current -cne 'absent') { Stop-Update 'recovery-required' }
        Complete-TransactionJournal $Paths $record 'rolled-back' 'rolled-back' $null
        return @{status='rolled-back';reason=$null}
    }
    if (Test-Path -LiteralPath $Paths.Target) {
        $activeHash = Get-TargetTreeHash $Paths.Target
        if ($activeHash -ceq $record.oldHash) {
            Complete-TransactionJournal $Paths $record 'rolled-back' 'rolled-back' $null
            return @{status='rolled-back'; reason=$null}
        }
        if ($activeHash -ceq $record.newHash -and (Test-Path -LiteralPath $Paths.Backup) -and
            (Get-TreeHash $Paths.Backup) -ceq $record.oldHash -and $record.state -cne 'rollback-intent') {
            Complete-TransactionJournal $Paths $record 'verified' 'installed' $null
            return @{status='installed'; reason=$null}
        }
        if ($activeHash -ceq $record.newHash -and $record.state -ceq 'rollback-intent' -and
            (Test-Path -LiteralPath $Paths.Backup) -and (Get-TreeHash $Paths.Backup) -ceq $record.oldHash) {
            Assert-SwitchSafe $Context $Paths $Observe
            [IO.Directory]::Move($Paths.Target, $Paths.Failed)
        } else { Stop-Update 'recovery-required' }
    }
    if (!(Test-Path -LiteralPath $Paths.Backup) -or (Get-TreeHash $Paths.Backup) -cne $record.oldHash) { Stop-Update 'recovery-required' }
    Write-TransactionJournal $Paths $record 'rollback-intent'
    Assert-SwitchSafe $Context $Paths $Observe
    [IO.Directory]::Move($Paths.Backup, $Paths.Target)
    if ((Get-TargetTreeHash $Paths.Target) -cne $record.oldHash) { Stop-Update 'recovery-required' }
    Complete-TransactionJournal $Paths $record 'rolled-back' 'rolled-back' $null
    return @{status='rolled-back'; reason=$null}
}

function Invoke-UpdateRecovery($Context, [scriptblock]$Observe = { param($c) Get-CanonicalHostState $c.ResolveExecutable $c.WorkflowExecutable }) {
    $paths = Get-TransactionPaths $Context
    $lock = Open-TransactionLock $paths
    try { return Invoke-UpdateRecoveryLocked $Context $paths $Observe } finally { $lock.Dispose() }
}

function Get-UpdateTransactionState($Context) {
    $paths = Get-TransactionPaths $Context
    $lock = Open-TransactionLock $paths -Existing
    try {
        if (Test-Path -LiteralPath ($paths.Journal + '.next')) { Stop-Update 'recovery-required' }
        $record = Read-UpdateJson $paths.Journal 65536
        Assert-TransactionRecord $Context $paths $record
        # Merely seeing a live PID, pending journal or outcome string never proves
        # an executor is healthy. Interrupted and unfinished cases require recovery.
        if ($record.state -cnotin @('verified','rolled-back')) { Stop-Update 'recovery-required' }
        $activeHash = Get-TargetTreeHash $paths.Target
        if ($record.state -ceq 'verified') {
            if ($activeHash -cne $record.newHash -or ($record.oldHash -cne 'absent' -and (Get-TreeHash $paths.Backup) -cne $record.oldHash) -or
                ($record.oldHash -ceq 'absent' -and (Test-Path -LiteralPath $paths.Backup))) { Stop-Update 'recovery-required' }
            Assert-UpdatePackage $paths.Target $Context.Version $record.native | Out-Null
            return @{status='installed';reason=$null}
        }
        if ($activeHash -cne $record.oldHash) { Stop-Update 'recovery-required' }
        if ($record.outcomeStatus -cnotin @('failed','cancelled','rolled-back') -or
            ($null -ne $record.outcomeReason -and $record.outcomeReason -cnotin @('host-running','process-unknown','permission-denied',
                'permission-cancelled','invalid-package','native-missing','native-invalid','native-incompatible','recovery-required','install-failed'))) { Stop-Update 'recovery-required' }
        return @{status=$record.outcomeStatus;reason=$record.outcomeReason}
    } finally { $lock.Dispose() }
}

function Restore-PreviousUpdate($Context, [scriptblock]$Observe = {param($c) Get-CanonicalHostState $c.ResolveExecutable $c.WorkflowExecutable}) {
    $paths = Get-TransactionPaths $Context
    $lock = Open-TransactionLock $paths -Existing
    try {
        if (Test-Path -LiteralPath ($paths.Journal + '.next')) { Stop-Update 'recovery-required' }
        $record = Read-UpdateJson $paths.Journal 65536
        Assert-TransactionRecord $Context $paths $record
        if ($record.oldHash -ceq 'absent' -or $record.state -cne 'verified' -or (Get-TargetTreeHash $paths.Target) -cne $record.newHash -or
            (Get-TreeHash $paths.Backup) -cne $record.oldHash) { Stop-Update 'recovery-required' }
        Assert-SwitchSafe $Context $paths $Observe
        Write-TransactionJournal $paths $record 'rollback-intent'
        return Invoke-UpdateRecoveryLocked $Context $paths $Observe
    } finally { $lock.Dispose() }
}

function Invoke-UpdateTransaction($Context, [scriptblock]$Observe = { param($c) Get-CanonicalHostState $c.ResolveExecutable $c.WorkflowExecutable },
    [scriptblock]$Checkpoint = {}, [scriptblock]$Cancelled = { $false },
    [scriptblock]$Provision = {param($root,$workflow) Copy-LocalResolveNative $root $workflow}) {
    $paths = Get-TransactionPaths $Context
    $lock = Open-TransactionLock $paths
    $record = $null
    try {
        if (Test-Path -LiteralPath $paths.Journal) { Stop-Update 'recovery-required' }
        if (@(Get-ChildItem -LiteralPath $paths.Root -Filter '*.json.next' -File -Force).Count) { Stop-Update 'recovery-required' }
        # A prior transaction must be reconciled before a fresh install.
        foreach ($journal in @(Get-ChildItem -LiteralPath $paths.Root -Filter '*.json' -File)) {
            $previous = Read-UpdateJson $journal.FullName 65536
            if ($previous.state -cnotin @('verified','rolled-back')) { Stop-Update 'recovery-required' }
        }
        Assert-SwitchSafe $Context $paths $Observe
        if (& $Cancelled) { return @{status='cancelled';reason=$null} }
        Assert-UpdatePackage $Context.PackageRoot $Context.Version | Out-Null
        if (Test-Path -LiteralPath $paths.Target) { Assert-InstalledUpdateTarget $paths.Target $Context.Version }
        elseif (!$Context.ContainsKey('InitialInstall') -or !$Context.InitialInstall) { Stop-Update 'target-unverified' }
        $oldHash = Get-TargetTreeHash $paths.Target
        $newHash = Get-TreeHash $Context.PackageRoot
        $record = @{schemaVersion=1;id=$Context.Id;target=$paths.Target;backup=$paths.Backup;stage=$paths.Stage;
            version=$Context.Version;candidateDigest=$Context.Digest;candidateSize=$Context.Size;
            oldHash=$oldHash;newHash=$newHash;native=$null;state='staging';ownerPid=$PID;ownerCreated=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o')}
        Assert-TransactionRecord $Context $paths $record
        Write-TransactionJournal $paths $record 'staging'
        & $Checkpoint 'before-stage'
        foreach ($p in @($paths.Stage, $paths.Backup, $paths.Failed)) { if (Test-Path -LiteralPath $p) { Stop-Update 'recovery-required' } }
        Copy-Item -LiteralPath $Context.PackageRoot -Destination $paths.Stage -Recurse -ErrorAction Stop
        Assert-UpdatePackage $paths.Stage $Context.Version | Out-Null
        if ((Get-TreeHash $paths.Stage) -cne $newHash) { Stop-Update 'invalid-package' }
        $record.native = & $Provision $paths.Stage $Context.WorkflowExecutable
        Assert-UpdatePackage $paths.Stage $Context.Version $record.native | Out-Null
        $newHash = Get-TreeHash $paths.Stage
        $record.newHash = $newHash
        Write-TransactionJournal $paths $record 'prepared'
        & $Checkpoint 'after-stage'
        if (& $Cancelled) {
            Complete-TransactionJournal $paths $record 'rolled-back' 'cancelled' $null
            return @{status='cancelled';reason=$null}
        }
        Write-TransactionJournal $paths $record 'backup-intent'
        # This durable boundary precedes the first old-tree move. Cancellation
        # is intent only after this point and cannot trigger a rollback.
        & $Checkpoint 'backup-intent'
        if ((Get-TargetTreeHash $paths.Target) -cne $oldHash) { Stop-Update 'recovery-required' }
        Assert-SwitchSafe $Context $paths $Observe
        if ($oldHash -cne 'absent') { [IO.Directory]::Move($paths.Target, $paths.Backup) }
        & $Checkpoint 'after-backup'
        Write-TransactionJournal $paths $record 'activate-intent'
        if ((Get-TreeHash $paths.Stage) -cne $newHash) { Stop-Update 'invalid-package' }
        Assert-SwitchSafe $Context $paths $Observe
        [IO.Directory]::Move($paths.Stage, $paths.Target)
        & $Checkpoint 'after-activation'
        Assert-UpdatePackage $paths.Target $Context.Version $record.native | Out-Null
        if ((Get-TargetTreeHash $paths.Target) -cne $newHash) { Stop-Update 'invalid-package' }
        Complete-TransactionJournal $paths $record 'verified' 'installed' $null
        & $Checkpoint 'after-verification'
        return @{status='installed';reason=$null}
    } catch {
        $reason = Get-UpdateFailureReason $_
        if ($null -eq $record) { throw }
        try {
            if (Test-Path -LiteralPath $paths.Backup) {
                if ((Get-TreeHash $paths.Backup) -cne $record.oldHash) { Stop-Update 'recovery-required' }
                Write-TransactionJournal $paths $record 'rollback-intent'
                if (Test-Path -LiteralPath $paths.Target) {
                    if ((Get-TargetTreeHash $paths.Target) -cne $record.newHash) { Stop-Update 'recovery-required' }
                    Assert-SwitchSafe $Context $paths $Observe
                    [IO.Directory]::Move($paths.Target, $paths.Failed)
                }
                Assert-SwitchSafe $Context $paths $Observe
                [IO.Directory]::Move($paths.Backup, $paths.Target)
                if ((Get-TargetTreeHash $paths.Target) -cne $record.oldHash) { Stop-Update 'recovery-required' }
                Complete-TransactionJournal $paths $record 'rolled-back' 'rolled-back' 'install-failed'
                return @{status='rolled-back';reason='install-failed'}
            }
            if ($record.oldHash -ceq 'absent' -and (Test-Path -LiteralPath $paths.Target)) {
                Write-TransactionJournal $paths $record 'rollback-intent'
                if ((Get-TreeHash $paths.Target) -cne $record.newHash) { Stop-Update 'recovery-required' }
                Assert-SwitchSafe $Context $paths $Observe
                [IO.Directory]::Move($paths.Target,$paths.Failed)
            }
            if ((Get-TargetTreeHash $paths.Target) -cne $record.oldHash) { Stop-Update 'recovery-required' }
            if ($reason -cnotin @('host-running','process-unknown','permission-denied','permission-cancelled','invalid-package','native-missing','native-invalid','native-incompatible','recovery-required')) { $reason='install-failed' }
            Complete-TransactionJournal $paths $record 'rolled-back' 'failed' $reason
        } catch { return @{status='failed';reason='recovery-required'} }
        if ($reason -cnotin @('host-running','process-unknown','permission-denied','permission-cancelled','invalid-package','native-missing','native-invalid','native-incompatible','recovery-required')) { $reason='install-failed' }
        return @{status='failed';reason=$reason}
    } finally { $lock.Dispose() }
}

Export-ModuleMember -Function Assert-NormalPath, Get-UpdateHash, Get-TreeFiles, Get-TreeHash, Read-UpdateJson, Assert-UpdatePackage, Expand-UpdateArchive, Get-CanonicalHostState, Get-TransactionPaths, Invoke-UpdateTransaction, Invoke-UpdateRecovery, Get-UpdateTransactionState, Restore-PreviousUpdate, Get-UpdateFailureReason
