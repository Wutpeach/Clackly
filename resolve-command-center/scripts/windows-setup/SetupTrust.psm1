Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'WorkflowTransaction.psm1') -DisableNameChecking
Import-Module (Join-Path $PSScriptRoot 'ExecutorSupport.psm1') -DisableNameChecking

# Read-only preparation; this never launches RunAs or authorizes mutation. The
# expected identity must come from a separately approved trusted build receipt.
function Get-SetupElevationReadiness([string]$Executable,[string]$ApprovedPath,[string]$ApprovedSha256,[string]$ApprovedSigner='') {
    $result=@{status='blocked';reason='target-unverified';canElevate=$false;productionMutationEnabled=$false}
    try {
        $path=Assert-NormalPath $Executable
        if ($path -cne $ApprovedPath -or [IO.Path]::GetExtension($path) -cne '.exe') {return $result}
        if ($ApprovedSha256 -cnotmatch '^[a-f0-9]{64}$' -or (Get-UpdateHash $path) -cne $ApprovedSha256) {$result.reason='build-identity-mismatch';return $result}
        $held=[IO.File]::Open($path,'Open','Read','Read')
        try {
            $result.reason='publisher-unverified'
            if (!$ApprovedSigner) {return $result}
            $signature=Get-AuthenticodeSignature -LiteralPath $path
            if ($signature.Status -ne 'Valid' -or !$signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -cne $ApprovedSigner) {return $result}
            $result.reason='permission-denied'
            # Includes the executable itself and every replaceable ancestor.
            Assert-ProtectedExecutor $path -DirectoryOnly
            $result.reason='trusted-broker-not-implemented'
            return $result
        } finally {$held.Dispose()}
    } catch {$result.reason='target-unverified';return $result}
}
Export-ModuleMember -Function Get-SetupElevationReadiness
