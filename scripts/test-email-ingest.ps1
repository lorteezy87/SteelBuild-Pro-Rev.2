<#
.SYNOPSIS
  Smoke-test the SteelBuild Pro `email-ingest` edge function.

.DESCRIPTION
  Posts a sample, Power-Automate-shaped JSON email to the email-ingest
  endpoint for one project -- exactly the way the Power Automate flow will.
  Use this to confirm the function, the EMAIL_WEBHOOK_SECRET, and the
  project_id all line up BEFORE wiring up Power Automate, and to verify
  attachments flow after the base64-attachment update is deployed.

  -DryRun previews the request (URL + body) without sending, so you can
  sanity-check it with no secret. -IncludeAttachment exercises the base64
  attachment path (requires email-ingest v8+).

.PARAMETER ProjectId
  The target project UUID. Find it in the app (Integrations -> Email
  Accounts shows the full webhook URL) or ask a project admin.

.PARAMETER Secret
  The EMAIL_WEBHOOK_SECRET configured on the function. Required unless -DryRun.

.PARAMETER BaseUrl
  Supabase project URL. Defaults to the production project.

.EXAMPLE
  .\test-email-ingest.ps1 -ProjectId 1111-... -DryRun

.EXAMPLE
  .\test-email-ingest.ps1 -ProjectId 1111-... -Secret 'super-secret'

.EXAMPLE
  .\test-email-ingest.ps1 -ProjectId 1111-... -Secret 'super-secret' -IncludeAttachment
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $ProjectId,
  [string] $Secret,
  [string] $BaseUrl = "https://kjrwqagyeswwoxpjkcko.supabase.co",
  [string] $From = "test.sender@example.com",
  [string] $Subject = "RFI-999 TEST - beam connection at gridline B (email-ingest smoke test)",
  [switch] $IncludeAttachment,
  [switch] $DryRun
)

$ErrorActionPreference = "Stop"
# Windows PowerShell 5.1 defaults to TLS 1.0/1.1; Supabase requires 1.2+.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not $DryRun -and [string]::IsNullOrWhiteSpace($Secret)) {
  Write-Error "EMAIL_WEBHOOK_SECRET is required unless -DryRun is set. Pass -Secret '<value>'."
  exit 2
}

$endpoint = "$($BaseUrl.TrimEnd('/'))/functions/v1/email-ingest/$ProjectId"

# Sample payload using the FLAT field names the function understands. The
# real Power Automate flow can send these flat fields or the connector's
# native nested/Graph shape -- parseJsonPayload handles both.
$payload = [ordered]@{
  subject    = $Subject
  from       = $From
  to         = "project-inbox@yourcompany.com"
  html       = "<p>This is an <b>automated test</b> from test-email-ingest.ps1 -- please disregard.</p><p>References RFI-999, drawing S3.2, and work package WP-104.</p>"
  message_id = "smoke-test-$([guid]::NewGuid().ToString('N').Substring(0,12))@steelbuildpro.test"
  date       = (Get-Date).ToUniversalTime().ToString("o")
}

if ($IncludeAttachment) {
  $attBytes = [System.Text.Encoding]::UTF8.GetBytes("SteelBuild Pro email-ingest test attachment. Generated $((Get-Date).ToString('o')).")
  $payload["attachments"] = @(
    [ordered]@{
      Name         = "email-ingest-test.txt"
      ContentType  = "text/plain"
      ContentBytes = [System.Convert]::ToBase64String($attBytes)
      Size         = $attBytes.Length
      IsInline     = $false
    }
  )
}

$json = $payload | ConvertTo-Json -Depth 6

$secretPreview = if ([string]::IsNullOrWhiteSpace($Secret)) { "(none - dry run)" } `
  else { "***" + $Secret.Substring([Math]::Max(0, $Secret.Length - 4)) }

Write-Host "POST $endpoint" -ForegroundColor Cyan
Write-Host "Header  x-webhook-secret: $secretPreview"
Write-Host "Attach  $(if ($IncludeAttachment) { 'yes (email-ingest-test.txt)' } else { 'no' })"
Write-Host "Body:" -ForegroundColor Cyan
Write-Host $json

if ($DryRun) {
  Write-Host "`n[DryRun] Not sending. Re-run without -DryRun and with -Secret to POST." -ForegroundColor Yellow
  exit 0
}

$headers = @{ "x-webhook-secret" = $Secret }

try {
  $resp = Invoke-RestMethod -Method Post -Uri $endpoint -Headers $headers -ContentType "application/json" -Body $json
  Write-Host "`n[OK] Ingested:" -ForegroundColor Green
  $resp | ConvertTo-Json -Depth 6
  Write-Host "`nOpen the project's Email Inbox - the message should appear with import_status 'pending'." -ForegroundColor Green
  if ($IncludeAttachment) {
    Write-Host "attachments_stored should be 1. If it is 0, the function may predate the base64-attachment update." -ForegroundColor Yellow
  }
}
catch {
  $status = $null
  $bodyText = $null
  if ($_.Exception.Response) {
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try {
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $bodyText = $reader.ReadToEnd()
    } catch {}
  }
  Write-Host "`n[FAIL] Request failed (HTTP $status)" -ForegroundColor Red
  if ($bodyText) { Write-Host $bodyText }
  switch ($status) {
    401 { Write-Host "-> 401: EMAIL_WEBHOOK_SECRET is wrong or not set on the function (Supabase -> Edge Functions -> email-ingest -> Secrets)." -ForegroundColor Yellow }
    400 { Write-Host "-> 400: bad payload or missing project_id in the URL. Confirm -ProjectId is a real project UUID." -ForegroundColor Yellow }
    404 { Write-Host "-> 404: endpoint not found. Confirm the function name and -BaseUrl." -ForegroundColor Yellow }
    default { Write-Host "-> See the response body above and the function logs in Supabase." -ForegroundColor Yellow }
  }
  exit 1
}
