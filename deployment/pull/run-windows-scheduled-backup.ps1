[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('StoreCredential', 'Run', 'CheckFreshness')]
    [string]$Action,
    [string]$CaFile = (Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads/prod-ca-2021.crt.crt')
)

$ErrorActionPreference = 'Stop'
$root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MaintFlowProductionBackup'
$credential = Join-Path $root 'production-database-password.dpapi'
$lastSuccess = Join-Path $root 'last-scheduled-success.txt'
$lastArchive = Join-Path $root 'last-scheduled-archive.txt'
$dedicatedConfig = Join-Path $root 'rclone-dedicated.conf'
$recipient = Join-Path $root 'production-recipients.txt'
$driveVerification = Join-Path $root 'dedicated-drive-verified.txt'
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')

$directory = Get-Item -LiteralPath $root -Force
$acl = Get-Acl -LiteralPath $root
if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
    -not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $owner) {
    throw 'Initialize the private MaintFlow backup directory before configuring the scheduled job.'
}
foreach ($path in $root, $credential, $lastSuccess, $lastArchive, $dedicatedConfig, $recipient, $driveVerification) {
    if (-not (Test-Path -LiteralPath $path)) { continue }
    $entry = Get-Item -LiteralPath $path -Force
    $access = (Get-Acl -LiteralPath $path).GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
        @($access | Where-Object { $_.IdentityReference -notin @($owner, $system) }).Count) {
        throw 'An unexpected ACL or link was found in the backup configuration.'
    }
}

if ($Action -eq 'CheckFreshness') {
    $stamp = [datetimeoffset]::Parse((Get-Content -LiteralPath $lastSuccess -Raw).Trim())
    $age = [datetimeoffset]::UtcNow - $stamp
    if ($age.TotalHours -gt 26 -or $age.TotalSeconds -lt 0) { throw 'The latest scheduled backup is overdue.' }
    Write-Output 'A verified scheduled backup completed within the last 26 hours.'
    return
}
if ($Action -eq 'StoreCredential') {
    if (Test-Path -LiteralPath $credential) { throw 'A saved credential already exists.' }
    $secret = Read-Host 'Production PostgreSQL password' -AsSecureString
    try {
        if (-not $secret.Length) { throw 'A database password is required.' }
        $null = New-Item -Path $credential -ItemType File
        $secret | ConvertFrom-SecureString | Set-Content -LiteralPath $credential -Encoding ascii
        Write-Output 'The database password is protected for this Windows user on this PC.'
    } finally {
        $secret.Dispose()
    }
    return
}

foreach ($path in $credential, $dedicatedConfig, $recipient, $driveVerification, $CaFile) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'A verified backup prerequisite is missing.' }
}
$client = (Select-String -LiteralPath $dedicatedConfig -Pattern '^\s*client_id\s*=\s*([A-Za-z0-9-]+\.apps\.googleusercontent\.com)\s*$').Matches.Groups[1].Value
$verifiedDrive = @(Get-Content -LiteralPath $driveVerification)
if (-not $client -or $verifiedDrive.Count -ne 2 -or $verifiedDrive[0] -ne $client -or
    $verifiedDrive[1] -notmatch '^[A-Za-z0-9_-]+$' -or
    -not (Select-String -LiteralPath $dedicatedConfig -Quiet -Pattern '^\s*scope\s*=\s*drive\.file\s*$')) {
    throw 'Verify the dedicated Drive client before enabling the scheduled job.'
}
$wsl = Join-Path $env:SystemRoot 'System32/wsl.exe'
function Convert-ToWslPath([string]$Path) {
    $resolved = (Resolve-Path -LiteralPath $Path).Path
    $converted = & $wsl -d Ubuntu-24.04 --exec wslpath -a $resolved
    if ($LASTEXITCODE -ne 0 -or $converted -notmatch '^/mnt/[a-z]/') { throw 'Unable to resolve a backup path in WSL.' }
    return $converted
}

$child = [Diagnostics.Process]::new()
$child.StartInfo.FileName = $wsl
$child.StartInfo.UseShellExecute = $false
$child.StartInfo.CreateNoWindow = $true
$child.StartInfo.RedirectStandardInput = $true
$child.StartInfo.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
$child.StartInfo.RedirectStandardOutput = $true
$child.StartInfo.RedirectStandardError = $true
foreach ($value in @('-d', 'Ubuntu-24.04', '-u', 'root', '--exec', 'bash',
    '/opt/maintflow-backup/backup-production-wsl.sh', (Convert-ToWslPath $dedicatedConfig),
    (Convert-ToWslPath $CaFile), (Convert-ToWslPath $recipient), $verifiedDrive[1])) {
    $child.StartInfo.ArgumentList.Add($value)
}
$secret = (Get-Content -LiteralPath $credential -Raw).Trim() | ConvertTo-SecureString
try {
    if (-not $child.Start()) { throw 'Unable to launch the WSL backup.' }
    $output = $child.StandardOutput.ReadToEndAsync()
    $errors = $child.StandardError.ReadToEndAsync()
    $child.StandardInput.NewLine = [string][char]10
    $child.StandardInput.WriteLine([Net.NetworkCredential]::new('', $secret).Password)
    $child.StandardInput.Close()
    $child.WaitForExit()
    $null = $errors.GetAwaiter().GetResult()
    $receipt = $output.GetAwaiter().GetResult()
    $completed = [regex]::Match($receipt, '(?m)^Verified offsite MaintFlow backup for project tkofnsyqywhixuotbiet at (?<stamp>[0-9]{8}T[0-9]{6}Z)\r?$')
    if ($child.ExitCode -ne 0 -or -not $completed.Success) {
        throw 'Scheduled export or Drive verification failed. Last success was not advanced.'
    }
    $stamp = $completed.Groups['stamp'].Value
    Set-Content -LiteralPath $lastArchive -Value "maintflow-tkofnsyqywhixuotbiet-$stamp.tar.gz.age" -Encoding ascii
    Set-Content -LiteralPath $lastSuccess -Value ([datetimeoffset]::UtcNow.ToString('o')) -Encoding ascii
    Write-Output 'Scheduled production backup and offsite checksum passed.'
} finally {
    $secret.Dispose()
    $child.Dispose()
}
