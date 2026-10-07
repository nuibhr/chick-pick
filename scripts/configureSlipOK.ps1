$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectDir 'wrangler.tidb.jsonc'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Worker configuration not found.' }
$previousDir = Get-Location
try {
    Set-Location -LiteralPath $projectDir
    Write-Host 'Target: chick-pick-tidb-staging; SlipOK branch 77946'
    Write-Host 'The key is stored only as a Cloudflare Worker Secret. No key is saved to a file or command argument.'
    & npx.cmd --yes wrangler@4.148.0 --version
    if ($LASTEXITCODE -ne 0) { throw 'Wrangler is unavailable.' }
    $secureValue = Read-Host 'Paste SLIPOK_API_KEY (hidden input)' -AsSecureString
    $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer).Trim()
        if ($plainValue.Length -lt 8 -or $plainValue.Length -gt 512 -or $plainValue -match '[\s\x00-\x1f]') { throw 'Invalid key format.' }
        $plainValue | & npx.cmd --yes wrangler@4.148.0 secret put SLIPOK_API_KEY --config $configPath
        if ($LASTEXITCODE -ne 0) { throw 'Failed to save SLIPOK_API_KEY.' }
    } finally {
        $plainValue = $null
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
        $secureValue.Dispose()
    }
    Write-Host 'Secret saved. Check SlipOK connection in the owner workspace, then verify a real booking slip.'
} finally {
    Set-Location -LiteralPath $previousDir.Path
}
