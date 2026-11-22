[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$PsqlExe,
    [string]$PoolerHost,
    [string]$CaFile
)

$ErrorActionPreference = 'Stop'
if (-not $PoolerHost) {
    $PoolerHost = (Read-Host 'Production Session pooler hostname from Supabase Connect').Trim()
}
if ($PoolerHost -notmatch '^[a-z0-9-]+(\.[a-z0-9-]+)?\.pooler\.supabase\.com$') {
    throw 'Enter only the Session Pooler hostname shown in the production dashboard.'
}
if (-not $CaFile) {
    $CaFile = Join-Path ([Environment]::GetFolderPath('UserProfile')) 'Downloads/prod-ca-2021.crt'
}
if (-not (Test-Path -LiteralPath $CaFile -PathType Leaf)) {
    throw 'Download the production Supabase CA from Database Settings > SSL Configuration. Save it as Downloads/prod-ca-2021.crt or pass its path with -CaFile.'
}
$rootCertificate = (Resolve-Path -LiteralPath $CaFile).Path
$previous = @{}
$settings = @{
    PGSSLMODE = 'verify-full'
    PGSSLROOTCERT = $rootCertificate
    PGCONNECT_TIMEOUT = '10'
    PGPASSWORD = $null
    PGHOSTADDR = $null
    PGSERVICE = $null
    PGSERVICEFILE = $null
    PGOPTIONS = $null
}
try {
    foreach ($name in $settings.Keys) {
        $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        if ($null -eq $settings[$name]) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item -LiteralPath "Env:$name" -Value $settings[$name]
        }
    }
    $sql = Join-Path $PSScriptRoot 'backup-verification.sql'
    $arguments = @('-X', '-W', '-A', '-t', '-q', '-P', 'pager=off', '-h', $PoolerHost, '-p', '5432',
        '-U', 'postgres.tkofnsyqywhixuotbiet', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-f', $sql)
    Write-Host 'Enter the production PostgreSQL password at the masked psql prompt.'
    & $PsqlExe @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Production Session Pooler preflight failed.' }
    Write-Host 'Production Session Pooler TLS and read-only preflight passed.'
} finally {
    foreach ($name in $previous.Keys) {
        if ($null -eq $previous[$name]) {
            Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item -LiteralPath "Env:$name" -Value $previous[$name]
        }
    }
}
