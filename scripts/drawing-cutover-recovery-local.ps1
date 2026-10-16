param(
    [ValidateSet('inspect', 'initialize', 'decrypt')][string]$Mode = 'inspect',
    [string]$EnvelopeName,
    [string]$ReviewName
)

# Dot sourcing defines helpers only. The operator CLI has no destination override.
function Assert-RecoveryLocalPath {
    param([Parameter(Mandatory)][string]$Path)
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path -match '[\x00-\x1f]' -or $Path.Substring(2).Contains(':')) { throw 'RECOVERY_LOCAL_PATH_REQUIRED' }
    $absolute = [IO.Path]::GetFullPath($Path)
    if ($absolute -match '(?i)(^|\\)OneDrive[^\\]*(\\|$)') { throw 'RECOVERY_SYNC_PATH_REFUSED' }
    $drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($absolute))
    if ($drive.DriveType -ne [IO.DriveType]::Fixed) { throw 'RECOVERY_FIXED_DRIVE_REQUIRED' }
    $cursor = $absolute
    while ($cursor) {
        if (Test-Path -LiteralPath $cursor) {
            $entry = Get-Item -LiteralPath $cursor -Force -ErrorAction Stop
            if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'RECOVERY_REPARSE_REFUSED' }
            if ($entry.PSIsContainer -and (Test-Path -LiteralPath (Join-Path $cursor '.git'))) { throw 'RECOVERY_REPOSITORY_REFUSED' }
        } else { throw 'RECOVERY_PATH_MISSING' }
        $parent = [IO.Directory]::GetParent($cursor)
        if ($null -eq $parent) { break }
        $cursor = $parent.FullName
    }
}

function Assert-RecoveryPrivatePath {
    param([Parameter(Mandatory)][string]$Path)
    Assert-RecoveryLocalPath $Path
    $entry = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = Get-Acl -LiteralPath $Path -ErrorAction Stop
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { throw 'RECOVERY_OWNER_REQUIRED' }
    if ($entry.PSIsContainer -and -not $acl.AreAccessRulesProtected) { throw 'RECOVERY_PROTECTED_DACL_REQUIRED' }
    $ownerFullControl = $false
    $rules = $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    if ($rules.Count -eq 0) { throw 'RECOVERY_DACL_REQUIRED' }
    foreach ($rule in $rules) {
        if ($rule.IdentityReference.Value -notin @($sid.Value, 'S-1-5-18') -or $rule.AccessControlType -ne 'Allow') { throw 'RECOVERY_BROAD_ACL_REFUSED' }
        if ($rule.IdentityReference.Value -eq $sid.Value -and ($rule.PropagationFlags -band [Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 -and
            ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl) { $ownerFullControl = $true }
    }
    if (-not $ownerFullControl) { throw 'RECOVERY_OWNER_ACCESS_REQUIRED' }
}

function Protect-RecoveryLeaf {
    param([Parameter(Mandatory)][string]$Path)
    Assert-RecoveryLocalPath $Path
    $entry = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $existing = Get-Acl -LiteralPath $Path -ErrorAction Stop
    if (-not $entry.PSIsContainer -or $existing.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value -or
        @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction Stop).Count -ne 0) { throw 'RECOVERY_EMPTY_OWNED_LEAF_REQUIRED' }
    $acl = [Security.AccessControl.DirectorySecurity]::new()
    $acl.SetOwner($sid)
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($allowed in @($sid, [Security.Principal.SecurityIdentifier]::new('S-1-5-18'))) {
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($allowed, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $Path -AclObject $acl -ErrorAction Stop
    Assert-RecoveryPrivatePath $Path
}

function Invoke-RecoveryOperator {
    param([string]$Action, [string]$Ciphertext, [string]$Review)
    $custody = 'C:\Users\nlort\AppData\Local\SteelBuildPro\DrawingCutoverRecovery\2026-10-16'
    if ($Action -eq 'initialize') {
        if (Test-Path -LiteralPath $custody) { throw 'RECOVERY_INITIALIZE_EXISTING_REFUSED' }
        $existingParent = [IO.Directory]::GetParent($custody).FullName
        $missing = [Collections.Generic.List[string]]::new()
        while (-not (Test-Path -LiteralPath $existingParent)) {
            $missing.Add($existingParent)
            $existingParent = [IO.Directory]::GetParent($existingParent).FullName
        }
        Assert-RecoveryLocalPath $existingParent
        for ($i = $missing.Count - 1; $i -ge 0; $i--) {
            $null = New-Item -ItemType Directory -Path $missing[$i] -ErrorAction Stop
            Assert-RecoveryLocalPath $missing[$i]
        }
        $null = New-Item -ItemType Directory -Path $custody -ErrorAction Stop
        Protect-RecoveryLeaf $custody
    }
    Assert-RecoveryPrivatePath $custody
    foreach ($entry in Get-ChildItem -LiteralPath $custody -Force -ErrorAction Stop) {
        if ($entry.PSIsContainer -or $entry.Name -notmatch '^(recovery-key\.json|review-[A-Za-z0-9_-]+\.json|[A-Za-z0-9_-]+\.enc\.json|[a-f0-9-]+-setup-(bootstrap|complete)-[0-9]+-[0-9]+-[0-9]{9}-(initial|intent|result)\.json)$') { throw 'RECOVERY_UNEXPECTED_FILE' }
        Assert-RecoveryPrivatePath $entry.FullName
    }
    if ($Action -eq 'inspect') { Write-Output 'RECOVERY_CUSTODY_VERIFIED'; return }
    if ($Action -eq 'decrypt' -and ($Ciphertext -notmatch '^[A-Za-z0-9_-]+\.enc\.json$' -or $Review -notmatch '^review-[A-Za-z0-9_-]+\.json$')) { throw 'RECOVERY_INPUT_NAMES_REQUIRED' }
    $modulePath = Join-Path $PSScriptRoot 'drawing-cutover-recovery.ts'
    # Code and paths only in argv; all private values stay within private files/memory.
    $nodeProgram = @'
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
try {
  const [modulePath, root, action, envelopeName, reviewName] = process.argv.slice(1);
  const recovery = await import(pathToFileURL(modulePath).href);
  if (action === 'initialize') {
    const pair = generateKeyPairSync('rsa', { modulusLength: 3072, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
    await recovery.writePrivateJson(join(root, 'recovery-key.json'), pair);
  } else {
    const key = await recovery.readPrivateJson(join(root, 'recovery-key.json'));
    if (!key || Object.keys(key).sort().join(',') !== 'privateKey,publicKey') throw new Error();
    const review = await recovery.readPrivateJson(join(root, reviewName));
    if (!review || Object.keys(review).sort().join(',') !== 'artifact,context,independentlyVerifiedExpected') throw new Error();
    const raw = await recovery.readPrivateText(join(root, envelopeName), recovery.RECOVERY_ENVELOPE_LIMIT);
    const payload = recovery.decryptVerifiedRecovery(raw, key.privateKey, review.context, review.artifact, review.independentlyVerifiedExpected);
    const kind = payload.receipt.operations.at(-1)?.kind ?? 'initial';
    await recovery.writePrivateJson(join(root, recovery.checkpointFilename(review.context, kind)), payload);
  }
  process.stdout.write('RECOVERY_LOCAL_OPERATION_COMPLETE\n');
} catch { process.stderr.write('RECOVERY_LOCAL_OPERATION_REFUSED\n'); process.exitCode = 1; }
'@
    & node --input-type=module -e $nodeProgram $modulePath $custody $Action $Ciphertext $Review
    if ($LASTEXITCODE -ne 0) { throw 'RECOVERY_LOCAL_OPERATION_REFUSED' }
    Assert-RecoveryPrivatePath $custody
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try { Invoke-RecoveryOperator $Mode $EnvelopeName $ReviewName }
    catch { Write-Error 'RECOVERY_LOCAL_OPERATION_REFUSED'; exit 1 }
}
