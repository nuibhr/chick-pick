param([switch]$Live)
$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $projectDir 'wrangler.tidb.jsonc'
if (-not (Test-Path -LiteralPath $configPath)) { throw 'Worker configuration not found.' }
$previousDir = Get-Location
try {
    Set-Location -LiteralPath $projectDir
    Write-Host 'Target: chick-pick-tidb-staging (Cloudflare Worker)'
    Write-Host 'Webhook: https://chick-pick-tidb-staging.nuibhr1.workers.dev/api/stripe/webhook'
    Write-Host 'Create a snapshot webhook in Stripe with checkout.session.completed, checkout.session.async_payment_succeeded, checkout.session.expired.'
    Write-Host 'Both secrets must belong to the same Stripe account and the same test/live mode. No secrets are saved to files.'
    & npx.cmd --yes wrangler@4.148.0 --version
    if ($LASTEXITCODE -ne 0) { throw 'Wrangler is unavailable.' }
    foreach ($secretName in @('STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET')) {
        $secureValue = Read-Host "Paste $secretName (hidden input)" -AsSecureString
        $buffer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
        try {
            $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($buffer).Trim()
            $prefix = if ($secretName -eq 'STRIPE_WEBHOOK_SECRET') { 'whsec_' } elseif ($Live) { 'sk_live_' } else { 'sk_test_' }
            if (-not $plainValue.StartsWith($prefix) -or $plainValue.Length -lt 20) { throw "Invalid $secretName. Required prefix: $prefix" }
            $plainValue | & npx.cmd --yes wrangler@4.148.0 secret put $secretName --config $configPath
            if ($LASTEXITCODE -ne 0) { throw "Failed to save $secretName. Do not enable Stripe in the app." }
        } finally {
            $plainValue = $null
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($buffer)
            $secureValue.Dispose()
        }
    }
    Write-Host 'Secrets saved. Next: owner settings > Stripe PromptPay QR > reopen bookings for a controlled test.'
    Write-Host 'Key presence is not proof of a successful payment. Verify Checkout, signed webhook and the booking result before using live mode.'
} finally {
    Set-Location -LiteralPath $previousDir.Path
}
