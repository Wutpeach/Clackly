Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-ExecutorLocations([string]$RequestId) {
    if ($RequestId -cnotmatch '^[a-f0-9]{32}$') { throw 'target-unverified' }
    $scan = Join-Path ([Environment]::GetFolderPath('CommonApplicationData')) 'Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins'
    $target = Join-Path $scan 'com.wutpeach.clackly'
    $inbox = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'Clackly\Workflow Update Requests'
    return @{Scan=$scan;Target=$target;Transactions=($scan + '.Clackly Updates');
        Scripts=(Join-Path $target 'scripts\workflow-update');Inbox=$inbox;Request=(Join-Path $inbox $RequestId)}
}

function Get-UpdateRequestKey($Request) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hostHash=([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Request.workflowExecutable)))).Replace('-','').ToLowerInvariant() }
    finally { $sha.Dispose() }
    $key = '{0}:{1}:{2}:{3}:{4}:{5}' -f $Request.version,$Request.releaseId,$Request.assetId,$Request.size,$Request.digest,$hostHash
    if ($key -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*):[1-9][0-9]*:[1-9][0-9]*:[1-9][0-9]*:[a-f0-9]{64}:[a-f0-9]{64}$' -or $key.Length -gt 320) { throw 'invalid-package' }
    return $key
}

function Assert-InstalledExecutor([string]$Scripts, $Locations, [string]$Operation = 'Install', [string]$RequestId = '') {
    $root = $Locations.Target
    if ($Scripts -ine $Locations.Scripts) {
        $backup = Join-Path $Locations.Transactions ($RequestId + '.backup')
        if ($Operation -eq 'Install' -or $RequestId -cnotmatch '^[a-f0-9]{32}$' -or
            $Scripts -ine (Join-Path $backup 'scripts\workflow-update')) { throw 'target-unverified' }
        # If activation stopped with no target, the complete previous installed
        # tree contains its fixed recovery entrypoint at this derived location.
        $root = $backup
    }
    foreach ($name in @('executor.ps1','launch.ps1','recover.ps1','WorkflowTransaction.psm1','ExecutorSupport.psm1','LocalNative.psm1')) {
        Assert-NormalPath (Join-Path $Scripts $name) | Out-Null
    }
    $pkg = Read-UpdateJson (Join-Path $root 'package.json') 65536
    [xml]$manifest = [IO.File]::ReadAllText((Join-Path $root 'manifest.xml'))
    if ($pkg.name -cne 'clackly' -or $manifest.BlackmagicDesign.Plugin.Id -cne 'com.wutpeach.clackly' -or
        $manifest.BlackmagicDesign.Plugin.Version -cne $pkg.version) { throw 'target-unverified' }
}

function Assert-ProtectedExecutor([string]$Scripts, [switch]$DirectoryOnly) {
    # Conservative ACL check: only system, administrators and TrustedInstaller
    # may own or write the executable code or any replaceable ancestor. No ACL
    # changes, guessed script pins or user-cache code are used for elevation.
    $trusted = @('S-1-5-18','S-1-5-32-544','S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464')
    $write = [Security.AccessControl.FileSystemRights]::Write -bor [Security.AccessControl.FileSystemRights]::Delete -bor
        [Security.AccessControl.FileSystemRights]::DeleteSubdirectoriesAndFiles -bor [Security.AccessControl.FileSystemRights]::ChangePermissions -bor
        [Security.AccessControl.FileSystemRights]::TakeOwnership
    $paths = @()
    if (!$DirectoryOnly) { $paths = @('executor.ps1','launch.ps1','recover.ps1','WorkflowTransaction.psm1','ExecutorSupport.psm1','LocalNative.psm1') | ForEach-Object { Join-Path $Scripts $_ } }
    $cursor = $Scripts
    while ($cursor) { $paths += $cursor; $cursor = Split-Path -Parent $cursor }
    foreach ($file in $paths) {
        Assert-NormalPath $file | Out-Null
        $acl = Get-Acl -LiteralPath $file -ErrorAction Stop
        if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cnotin $trusted) { throw 'permission-denied' }
        foreach ($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])) {
            if ($rule.AccessControlType -eq 'Allow' -and ($rule.FileSystemRights -band $write) -ne 0 -and
                $rule.IdentityReference.Value -cnotin $trusted) { throw 'permission-denied' }
        }
    }
}

function Invoke-OfficialReleaseJson([string]$url) {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $client = [Net.HttpWebRequest]::Create($url)
    $client.AllowAutoRedirect = $false; $client.Timeout = 30000; $client.ReadWriteTimeout = 30000
    $client.UserAgent = 'Clackly-Workflow-Updater'; $client.Accept = 'application/vnd.github+json'
    $response = $client.GetResponse()
    try {
        if ([int]$response.StatusCode -ne 200 -or $response.ContentLength -gt 2097152) { throw 'publisher-unverified' }
        $reader = [IO.StreamReader]::new($response.GetResponseStream())
        try {
            $buffer = [char[]]::new(4096); $text = [Text.StringBuilder]::new()
            while (($count=$reader.Read($buffer,0,$buffer.Length)) -gt 0) {
                if ($text.Length + $count -gt 2097152) { throw 'publisher-unverified' }
                [void]$text.Append($buffer,0,$count)
            }
            return $text.ToString() | ConvertFrom-Json
        } finally { $reader.Dispose() }
    } finally { $response.Dispose() }
}

function Assert-OfficialRelease($Request, [scriptblock]$Fetch = { param($url) Invoke-OfficialReleaseJson $url }) {
    # The API's TLS identity and exact official release asset are V1 authority.
    # Its digest is byte integrity, not an independent publisher signature.
    if ($Request.version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or
        $Request.digest -cnotmatch '^[a-f0-9]{64}$' -or $Request.size -le 0 -or $Request.size -gt 1073741824 -or
        $Request.releaseId -le 0 -or $Request.assetId -le 0) { throw 'invalid-package' }
    $name = 'Clackly-Workflow-' + $Request.version + '-win-x64.zip'
    $release = & $Fetch ('https://api.github.com/repos/Wutpeach/Clackly/releases/' + $Request.releaseId)
    if ($release.id -ne $Request.releaseId -or $release.draft -ne $false -or $release.prerelease -ne $false -or
        $release.tag_name -cnotin @($Request.version,('v' + $Request.version))) { throw 'publisher-unverified' }
    $assets = @($release.assets | Where-Object { $_.name -ceq $name })
    if ($assets.Count -ne 1) { throw 'publisher-unverified' }
    $asset = $assets[0]
    $url = 'https://github.com/Wutpeach/Clackly/releases/download/' + $release.tag_name + '/' + $name
    if ($asset.id -ne $Request.assetId -or $asset.state -cne 'uploaded' -or $asset.size -ne $Request.size -or
        $asset.content_type -cnotin @('application/zip','application/x-zip-compressed','application/octet-stream') -or
        $asset.digest -ine ('sha256:' + $Request.digest) -or $asset.browser_download_url -cne $url) { throw 'publisher-unverified' }
}

function Get-OfficialArchiveRequest([string]$Archive, [scriptblock]$Fetch = {param($url) Invoke-OfficialReleaseJson $url}) {
    Assert-NormalPath $Archive | Out-Null
    $size=(Get-Item -LiteralPath $Archive).Length
    if ($size -le 0 -or $size -gt 1073741824) { throw 'invalid-package' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip=[IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        $entries=@($zip.Entries | Where-Object { $_.FullName -ceq 'plugin/clackly-release.json' })
        if ($entries.Count -ne 1 -or $entries[0].Length -gt 8388608) { throw 'invalid-package' }
        $stream=$entries[0].Open();$buffer=[byte[]]::new(65536);$bytes=[IO.MemoryStream]::new()
        try {
            while (($count=$stream.Read($buffer,0,$buffer.Length)) -gt 0) {
                if ($bytes.Length+$count -gt 8388608 -or $bytes.Length+$count -gt $entries[0].Length) {throw 'invalid-package'}
                $bytes.Write($buffer,0,$count)
            }
            if ($bytes.Length -ne $entries[0].Length) {throw 'invalid-package'}
            $manifest=[Text.Encoding]::UTF8.GetString($bytes.ToArray()) | ConvertFrom-Json
        } finally {$stream.Dispose();$bytes.Dispose()}
        $version=$manifest.package.version
        if ($version -cnotmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -or $version.Length -gt 64) { throw 'invalid-package' }
    } finally { $zip.Dispose() }
    $release=& $Fetch ('https://api.github.com/repos/Wutpeach/Clackly/releases/tags/v'+$version)
    $name='Clackly-Workflow-'+$version+'-win-x64.zip'
    $assets=@($release.assets | Where-Object { $_.name -ceq $name })
    if ($assets.Count -ne 1) { throw 'publisher-unverified' }
    $request=@{version=$version;releaseId=$release.id;assetId=$assets[0].id;size=$size;digest=(Get-UpdateHash $Archive)}
    Assert-OfficialRelease $request -Fetch $Fetch
    return $request
}

function Write-ExecutorJson([string]$Path,$Value) {
    Assert-NormalPath $Path -AllowMissing | Out-Null
    $file = [IO.File]::Open($Path,'CreateNew','Write','None')
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress))
        $file.Write($bytes,0,$bytes.Length); $file.Flush($true)
    } finally { $file.Dispose() }
}

function Assert-PublishedUpdatePackage($Manifest) {
    # Consistency with the official published payload, not publisher proof.
    # SDK version/host-matrix/attestation remain optional metadata.
    if ($Manifest.schemaVersion -ne 2 -or $Manifest.build.publishable -isnot [bool] -or $Manifest.source.dirty -isnot [bool] -or
        $Manifest.build.publishable -ne $true -or $Manifest.source.dirty -ne $false) { throw 'invalid-package' }
}

function Get-UpdatePermissionOutcome($Failure, [string]$OldHash) {
    $cancelled = (Get-UpdateFailureReason $Failure) -ceq 'permission-cancelled'
    return @{status=$(if ($cancelled) {'cancelled'} else {'failed'});
        reason=$(if ($cancelled) {'permission-cancelled'} else {'permission-denied'});oldHash=$OldHash}
}

function Wait-UpdateHostExit($Context, [scriptblock]$Cancelled, [scriptblock]$Observe = {param($c) Get-CanonicalHostState $c.ResolveExecutable $c.WorkflowExecutable},
    [int]$TimeoutSeconds = 1200) {
    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        if (& $Cancelled) { return $false }
        $state = & $Observe $Context
        if ($state -ceq 'process-unknown') { throw 'process-unknown' }
        if ($state -ceq 'closed') { return $true }
        if ($state -cne 'host-running') { throw 'process-unknown' }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'host-running' }
        Start-Sleep -Milliseconds 150
    } while ($true)
}

function Assert-UpdateWriteAccess([string]$Target,[string]$Scan) {
    # Obtain actual DELETE/create-directory rights without changing anything.
    # Denial reaches UAC before staging; no partial-journal retry is needed.
    if (!('Clackly.UpdateAccess' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
namespace Clackly { public static class UpdateAccess {
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint creation, uint flags, IntPtr template);
}}
'@
    }
    foreach ($entry in @(@{path=$Target;access=65536},@{path=$Scan;access=4})) {
        Assert-NormalPath $entry.path | Out-Null
        $handle = [Clackly.UpdateAccess]::CreateFile($entry.path,$entry.access,7,[IntPtr]::Zero,3,33554432,[IntPtr]::Zero)
        $errorCode = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        try { if ($handle.IsInvalid) { throw [ComponentModel.Win32Exception]::new($errorCode) } } finally { $handle.Dispose() }
    }
}

Export-ModuleMember -Function Get-OfficialArchiveRequest, Get-ExecutorLocations, Get-UpdateRequestKey, Assert-InstalledExecutor, Assert-ProtectedExecutor, Assert-OfficialRelease, Write-ExecutorJson, Wait-UpdateHostExit, Assert-UpdateWriteAccess, Assert-PublishedUpdatePackage, Get-UpdatePermissionOutcome
