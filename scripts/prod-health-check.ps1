# Production health verification for yerlikoglon.uz (PowerShell / Windows).
#
#   Checks:
#     1. Frontend (Cloudflare Pages)               -> 200
#     2. Backend /health (Render, live)            -> 200  {ok:true}
#     3. New-code marker on Render (me/delete)     -> 401  (route exists)
#     4. Backend /health (VPS api.yerlikoglon.uz)  -> 200  (fix SSL 526 first)
#
#   Usage:
#     .\scripts\prod-health-check.ps1              (optional: -Token to verify CF token)

param([switch]$Token)
$ErrorActionPreference = "Continue"
$fail = 0

function Check-Url([string]$Name, [string]$Url, [int]$Expected, [string]$Method = "GET") {
    try {
        $code = curl.exe -s -o NUL -w "%{http_code}" --max-time 25 -X $Method $Url
        if ([int]$code -eq $Expected) { Write-Output "PASS  $Name -> $code" }
        else { Write-Output "FAIL  $Name -> $code (expected $Expected): $Url"; $script:fail = 1 }
    } catch {
        Write-Output "FAIL  $Name -> error: $_"
        $script:fail = 1
    }
}

Write-Output "=== yerlikoglon.uz production health check ==="
Check-Url "Frontend (Pages)"            "https://default-project-bza.pages.dev/"                         200
Check-Url "Backend health (Render)"     "https://yerlikoglon-backend.onrender.com/health"                 200
Check-Url "Backend new-code marker"     "https://yerlikoglon-backend.onrender.com/api/auth/me/delete"     401 "POST"
Check-Url "Backend health (VPS api...)" "https://api.yerlikoglon.uz/health"                               200

if ($Token) {
    if (-not $env:CF_API_TOKEN) { Write-Output "FAIL  Cloudflare token check skipped (set CF_API_TOKEN)"; $fail = 1 }
    else {
        Write-Output "=== Cloudflare token verify ==="
        curl.exe -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" -H "Authorization: Bearer $env:CF_API_TOKEN"
        Write-Output ""
    }
}

Write-Output ""
if ($fail -eq 0) { Write-Output "ALL CHECKS PASSED" } else { Write-Output "ONE OR MORE CHECKS FAILED" }
exit $fail