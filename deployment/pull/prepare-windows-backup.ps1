[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('Initialize', 'ConnectDrive', 'TestDrive', 'TestTokenRefresh')]
    [string]$Action,
    [Parameter(Mandatory)]
    [string]$AgeDirectory,
    [Parameter(Mandatory)]
    [string]$RcloneExe,
    [switch]$DedicatedClient
)

$ErrorActionPreference = 'Stop'
$root = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'MaintFlowProductionBackup'
$configName = if ($DedicatedClient) { 'rclone-dedicated.conf' } else { 'rclone.conf' }
$config = Join-Path $root $configName
$sharedConfig = Join-Path $root 'rclone.conf'
$driveVerification = Join-Path $root 'dedicated-drive-verified.txt'
$identity = Join-Path $root 'production.agekey'
$recipient = Join-Path $root 'production-recipients.txt'
$remote = 'maintflow_gdrive:MaintFlow-Production-Backups'
$age = Join-Path $AgeDirectory 'age.exe'
$keygen = Join-Path $AgeDirectory 'age-keygen.exe'

function Assert-Exit([string]$Operation) {
    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed (exit $LASTEXITCODE)."
    }
}

if ($Action -eq 'Initialize') {
    if (-not (Test-Path -LiteralPath $root)) {
        $null = New-Item -Path $root -ItemType Directory
    }
}
$directory = Get-Item -LiteralPath $root -Force
if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'The backup settings directory must be a physical private directory.'
}
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
$acl = Get-Acl -LiteralPath $root
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $owner) {
    throw 'The backup settings directory must be owned by the current Windows user.'
}
if ($Action -eq 'Initialize') {
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { $acl.RemoveAccessRuleSpecific($rule) }
    foreach ($sid in $owner, $system) {
        $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
            $sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
    }
    Set-Acl -LiteralPath $root -AclObject $acl
}
$acl = Get-Acl -LiteralPath $root
if (-not $acl.AreAccessRulesProtected -or
    @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) |
        Where-Object { $_.IdentityReference -notin @($owner, $system) }).Count) {
    throw 'The backup settings directory grants unexpected access.'
}
foreach ($file in ($config, $sharedConfig, $identity, $recipient, $driveVerification | Select-Object -Unique)) {
    if (Test-Path -LiteralPath $file) {
        $info = Get-Item -LiteralPath $file -Force
        $fileAcl = Get-Acl -LiteralPath $file
        if ($info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
            @($fileAcl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]) |
                Where-Object { $_.IdentityReference -notin @($owner, $system) }).Count) {
            throw 'An existing backup settings file grants unexpected access or is a link.'
        }
    }
}

if ($Action -eq 'ConnectDrive') {
    if ($DedicatedClient) {
        if (-not (Test-Path -LiteralPath $config)) {
            $clientId = (Read-Host 'Google Desktop OAuth client ID').Trim()
            if ($clientId -notmatch '^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$') {
                throw 'The expected value is a Google Desktop OAuth client ID.'
            }
            $secret = Read-Host 'Google Desktop OAuth client secret' -AsSecureString
            if (-not $secret.Length) { throw 'The OAuth client secret is required.' }
            try {
                # rclone reads OAuth client_secret verbatim. The private directory ACL
                # protects both this setting and the refresh token rclone saves beside it.
                $clientSecret = [Net.NetworkCredential]::new('', $secret).Password
                if ($clientSecret -notmatch '^[A-Za-z0-9_-]{16,256}$') {
                    throw 'The expected value is the Google Desktop OAuth client secret.'
                }
                $null = New-Item -Path $config -ItemType File
                Set-Content -LiteralPath $config -Encoding ascii -Value @(
                    '[maintflow_gdrive]', 'type = drive', 'scope = drive.file',
                    "client_id = $clientId", "client_secret = $clientSecret")
            } finally {
                $secret.Dispose()
                Remove-Variable clientSecret -ErrorAction SilentlyContinue
            }
        }
        $isDedicated = Select-String -LiteralPath $config -Quiet -Pattern '^\s*client_id\s*=\s*[A-Za-z0-9-]+\.apps\.googleusercontent\.com\s*$'
        $isScoped = Select-String -LiteralPath $config -Quiet -Pattern '^\s*scope\s*=\s*drive\.file\s*$'
        if (-not $isDedicated -or -not $isScoped) { throw 'The candidate config must use a dedicated Desktop client and drive.file.' }
        if (Get-NetTCPConnection -LocalPort 53682 -State Listen -ErrorAction SilentlyContinue) {
            throw 'The local OAuth callback port is already in use. Finish the existing consent window before starting another.'
        }
        Write-Host 'Complete the dedicated Google consent prompt in your browser.'
        $diagnostic = & $RcloneExe --config $config config reconnect 'maintflow_gdrive:' --auto-confirm 2>&1
        if ($LASTEXITCODE -ne 0) {
            $status = $LASTEXITCODE
            $knownError = [regex]::Match(($diagnostic -join [Environment]::NewLine),
                '(?i)\b(access_denied|invalid_client|unauthorized_client|invalid_grant|redirect_uri_mismatch)\b|address already in use|only one usage of each socket address')
            $category = if ($knownError.Success) { $knownError.Value } else { 'unclassified OAuth error' }
            throw "Dedicated Google Drive authorization failed (exit $status, $category)."
        }
        Write-Host 'Dedicated Drive authorization completed. Run TestDrive with -DedicatedClient.'
        return
    }
    if (Test-Path -LiteralPath $config) {
        throw 'A dedicated rclone configuration already exists. Run TestDrive before changing it.'
    }
    Write-Host 'Complete the Google consent prompt in your browser. Wait for the local callback.'
    & $RcloneExe --config $config config create maintflow_gdrive drive scope drive.file --auto-confirm *> $null
    Assert-Exit 'Google Drive authorization'
    Write-Host 'Drive authorization completed. Run TestDrive to verify it.'
    return
}

if ($Action -eq 'TestTokenRefresh') {
    if (-not $DedicatedClient -or -not (Test-Path -LiteralPath $config)) {
        throw 'Connect the dedicated OAuth client before testing its refresh token.'
    }
    $probeConfig = Join-Path $root "refresh-probe-$([guid]::NewGuid().ToString('N')).conf"
    $tokenLine = [regex]'(?m)^\s*token\s*=\s*(\{[^\r\n]+\})[^\S\r\n]*'
    $contents = Get-Content -LiteralPath $config -Raw
    $match = $tokenLine.Match($contents)
    if (-not $match.Success) { throw 'Dedicated OAuth authorization has not saved a token.' }
    $token = $match.Groups[1].Value | ConvertFrom-Json
    if (-not $token.refresh_token) { throw 'The Google grant did not provide a refresh token.' }
    $token.expiry = '2000-01-01T00:00:00Z'
    try {
        $null = New-Item -Path $probeConfig -ItemType File
        $fixture = $tokenLine.Replace($contents, [Text.RegularExpressions.MatchEvaluator]{
            param($m)
            'token = ' + ($token | ConvertTo-Json -Compress)
        }, 1)
        Set-Content -LiteralPath $probeConfig -Value $fixture -Encoding utf8
        if (Test-Path -LiteralPath $driveVerification) {
            $verified = @(Get-Content -LiteralPath $driveVerification)
            $currentClient = (Select-String -LiteralPath $config -Pattern '^\s*client_id\s*=\s*([A-Za-z0-9-]+\.apps\.googleusercontent\.com)\s*$').Matches.Groups[1].Value
            if ($verified.Count -ne 2 -or $verified[0] -ne $currentClient) {
                throw 'The folder verification belongs to a different OAuth client.'
            }
            $folders = & $RcloneExe --config $probeConfig lsjson --dirs-only 'maintflow_gdrive:' |
                ConvertFrom-Json | Where-Object Name -eq 'MaintFlow-Production-Backups'
            Assert-Exit 'Dedicated Google refresh and folder lookup'
            if (@($folders).Count -ne 1 -or $folders.ID -ne $verified[1]) {
                throw 'The refreshed token could not verify the original backup folder.'
            }
        } else {
            & $RcloneExe --config $probeConfig lsjson --stat 'maintflow_gdrive:' *> $null
            Assert-Exit 'Dedicated Google refresh and read-only authorization'
        }
        $reloaded = $tokenLine.Match((Get-Content -LiteralPath $probeConfig -Raw))
        if (-not $reloaded.Success) { throw 'rclone did not save the refreshed token.' }
        $updated = $reloaded.Groups[1].Value | ConvertFrom-Json
        if (-not $updated.refresh_token -or ([datetimeoffset]$updated.expiry) -le [datetimeoffset]::UtcNow) {
            throw 'rclone did not persist a usable refreshed token.'
        }
        if ($updated.refresh_token -cne $token.refresh_token) {
            throw 'Google returned a different refresh token. Reconnect the dedicated client before scheduling.'
        }
        Write-Host 'Google refreshed an expired access token and the unattended read-only Drive check passed.'
    } finally {
        if (Test-Path -LiteralPath $probeConfig) { Remove-Item -LiteralPath $probeConfig }
    }
    return
}

if ($Action -eq 'Initialize' -and -not (Test-Path -LiteralPath $identity)) {
    & $keygen -o $identity *> $null
    Assert-Exit 'Recovery identity generation'
}
$publicKey = & $keygen -y $identity
Assert-Exit 'Public recipient derivation'
if ($publicKey -notmatch '^age1[0-9a-z]+$') { throw 'Invalid age recipient.' }
if (Test-Path -LiteralPath $recipient) {
    if ((Get-Content -LiteralPath $recipient -Raw).Trim() -ne $publicKey) {
        throw 'The saved recipient does not match the recovery identity.'
    }
} elseif ($Action -eq 'Initialize') {
    Set-Content -LiteralPath $recipient -Value $publicKey -Encoding ascii
} else {
    throw 'Initialize the recovery recipient before testing Drive.'
}

$name = "probe-$([guid]::NewGuid().ToString('N'))"
$work = Join-Path $root $name
$null = New-Item -Path $work -ItemType Directory
$plain = Join-Path $work 'synthetic.txt'
$encrypted = Join-Path $work "$name.age"
$download = Join-Path $work 'readback.age'
$restored = Join-Path $work 'restored.txt'
try {
    Set-Content -LiteralPath $plain -Value "MaintFlow synthetic test $name" -Encoding ascii
    & $age --recipients-file $recipient --output $encrypted $plain
    Assert-Exit 'Synthetic encryption'
    $cipherHash = (Get-FileHash -LiteralPath $encrypted -Algorithm SHA256).Hash
    $decryptInput = $encrypted
    if ($Action -eq 'TestDrive') {
        if (-not (Test-Path -LiteralPath $config)) { throw 'Run ConnectDrive first.' }
        if ($DedicatedClient) {
            $originalFolders = & $RcloneExe --config $sharedConfig lsjson --dirs-only 'maintflow_gdrive:' |
                ConvertFrom-Json | Where-Object Name -eq 'MaintFlow-Production-Backups'
            Assert-Exit 'Original Drive folder listing'
            $candidateFolders = & $RcloneExe --config $config lsjson --dirs-only 'maintflow_gdrive:' |
                ConvertFrom-Json | Where-Object Name -eq 'MaintFlow-Production-Backups'
            Assert-Exit 'Dedicated Drive folder listing'
            if (@($originalFolders).Count -ne 1 -or @($candidateFolders).Count -ne 1 -or
                -not $originalFolders.ID -or $originalFolders.ID -ne $candidateFolders.ID) {
                throw 'The dedicated client has not verified access to the original backup folder. No test object was uploaded.'
            }
        }
        $target = "$remote/$name.age"
        & $RcloneExe --config $config copyto --immutable $encrypted $target
        Assert-Exit 'Encrypted probe upload'
        & $RcloneExe --config $config copyto --immutable $target $download
        Assert-Exit 'Independent encrypted readback'
        if ((Get-FileHash -LiteralPath $download -Algorithm SHA256).Hash -ne $cipherHash) {
            throw 'The downloaded encrypted probe checksum did not match.'
        }
        $decryptInput = $download
    }
    & $age --decrypt -i $identity --output $restored $decryptInput
    Assert-Exit 'Synthetic decryption'
    if ((Get-FileHash -LiteralPath $plain -Algorithm SHA256).Hash -ne
        (Get-FileHash -LiteralPath $restored -Algorithm SHA256).Hash) {
        throw 'The decrypted probe checksum did not match.'
    }
    if ($Action -eq 'TestDrive') {
        & $RcloneExe --config $config deletefile $target
        Assert-Exit 'Removal of the verified synthetic probe'
        if ($DedicatedClient) {
            $clientId = (Select-String -LiteralPath $config -Pattern '^\s*client_id\s*=\s*([A-Za-z0-9-]+\.apps\.googleusercontent\.com)\s*$').Matches.Groups[1].Value
            if (-not $clientId) { throw 'The dedicated config is missing its OAuth client ID.' }
            Set-Content -LiteralPath $driveVerification -Encoding ascii -Value @($clientId, $candidateFolders.ID)
        }
        Write-Host 'Drive upload, independent checksum, decryption and probe cleanup passed.'
    } else {
        Write-Host 'Recovery identity prepared. Synthetic encryption and decryption passed.'
    }
} finally {
    foreach ($file in $plain, $encrypted, $download, $restored) {
        if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file }
    }
    Remove-Item -LiteralPath $work
}
