#Requires -Version 5.1
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Load deploy config ────────────────────────────────────────────────────────
if (-not (Test-Path '.env.deploy')) {
    Write-Error "ERROR: .env.deploy not found. Copy .env.deploy.example and fill it in."
    exit 1
}

$config = @{}
Get-Content '.env.deploy' | Where-Object { $_ -match '^\s*[^#=]' } | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') {
        $config[$Matches[1].Trim()] = $Matches[2].Trim() -replace '\s*#.*$', ''
    }
}

$NasHost = if ($config['NAS_HOST']) { $config['NAS_HOST'] } else { throw "NAS_HOST must be set in .env.deploy" }
$NasUser = if ($config['NAS_USER']) { $config['NAS_USER'] } else { throw "NAS_USER must be set in .env.deploy" }
$NasDir  = if ($config['NAS_DIR'])  { $config['NAS_DIR']  } else { '/volume1/docker/cctv-ui' }
$SshKey  = if ($config['SSH_KEY'])  { $config['SSH_KEY']  } else { '' }
$Image   = if ($config['IMAGE'])    { $config['IMAGE']    } else { 'ghcr.io/atotmakov/cctv-ui:latest' }
$Archive = 'cctv-ui.tar.gz'

# SSH/SCP option arrays
$SshOpts = @('-o', 'StrictHostKeyChecking=no')
if ($SshKey) { $SshOpts += @('-i', $SshKey) }

$sshBin = "$env:SystemRoot\System32\OpenSSH\ssh.exe"

# Transfer a local file to remote via SSH stdin — no SFTP/SCP needed
function Send-FileViaSsh {
    param([string]$LocalPath, [string]$RemotePath)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $sshBin
    $startInfo.Arguments = ($SshOpts + @("${NasUser}@${NasHost}", "cat > '$RemotePath'")) -join ' '
    $startInfo.RedirectStandardInput = $true
    $startInfo.UseShellExecute = $false
    $proc = [System.Diagnostics.Process]::Start($startInfo)
    $fileStream = [System.IO.File]::OpenRead((Resolve-Path $LocalPath).Path)
    $fileStream.CopyTo($proc.StandardInput.BaseStream)
    $fileStream.Close()
    $proc.StandardInput.Close()
    $proc.WaitForExit()
    if ($proc.ExitCode -ne 0) { throw "SSH transfer failed for $LocalPath" }
}

# ── Install crane if not present ──────────────────────────────────────────────
$craneDir = "$env:LOCALAPPDATA\crane"
$craneBin = "$craneDir\crane.exe"
if (-not (Test-Path $craneBin)) {
    Write-Host "==> crane not found, installing..."
    New-Item -ItemType Directory -Force -Path $craneDir | Out-Null
    $tgz = "$env:TEMP\crane.tar.gz"
    curl.exe -fsSL -o $tgz "https://github.com/google/go-containerregistry/releases/latest/download/go-containerregistry_Windows_x86_64.tar.gz"
    if ($LASTEXITCODE -ne 0) { throw "Failed to download crane" }
    & "$env:SystemRoot\System32\tar.exe" -xzf $tgz -C $craneDir crane.exe
    Remove-Item $tgz
    Write-Host "==> crane installed at $craneBin"
}
$env:PATH = "$craneDir;$env:PATH"

# ── Step 1: Pull image from registry ─────────────────────────────────────────
Write-Host "==> Pulling Docker image $Image..."
& $craneBin pull --format=tarball $Image $Archive
if ($LASTEXITCODE -ne 0) { throw "crane pull failed" }

# ── Step 2: Upload archive + compose file ────────────────────────────────────
Write-Host "==> Uploading to ${NasUser}@${NasHost}:${NasDir}/ ..."
& $sshBin @SshOpts "${NasUser}@${NasHost}" "mkdir -p '$NasDir' && chown `$USER '$NasDir'"
if ($LASTEXITCODE -ne 0) { throw "Failed to create directory $NasDir on NAS" }
Write-Host "  -> Transferring archive..."
Send-FileViaSsh $Archive "${NasDir}/${Archive}"
Write-Host "  -> Transferring docker-compose.yml..."
Send-FileViaSsh docker-compose.yml "${NasDir}/docker-compose.yml"

# ── Step 3: Load image and restart container on NAS ──────────────────────────
Write-Host "==> Loading image and starting container on NAS..."
$remoteScript = @"
set -euo pipefail
export PATH="`$PATH:/usr/local/bin:/usr/bin"
cd '$NasDir'
echo '  -> Loading image...'
sudo docker load < '$Archive'
rm -f '$Archive'
echo '  -> Starting container...'
sudo docker compose up -d --remove-orphans
sudo docker compose ps
"@
($remoteScript -replace "`r`n", "`n") | & $sshBin @SshOpts "${NasUser}@${NasHost}" bash
if ($LASTEXITCODE -ne 0) { throw "Remote deploy failed" }

# ── Step 4: Clean up local archive ───────────────────────────────────────────
Write-Host "==> Cleaning up local archive..."
Remove-Item -Force $Archive

Write-Host ""
Write-Host "Done! App is available at http://${NasHost}:8888"
