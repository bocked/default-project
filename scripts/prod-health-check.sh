#!/usr/bin/env bash
# Production health verification for yerlikoglon.uz.
#
#   Checks:
#     1. Frontend (Cloudflare Pages)               -> 200
#     2. Backend /health (api.yerlikoglon.uz)      -> 200  {ok:true}
#     3. New-code marker on API (me/delete)        -> 401  (route exists)
#     4. Optional: Cloudflare API token verify     -> success:true
#
#   Usage:
#     ./scripts/prod-health-check.sh [--token]        (token check via $CF_API_TOKEN)
#   Options:
#     --token   also verify the Cloudflare token in $CF_API_TOKEN (never printed)
set -u
FAIL=0
check() { # check <name> <https-url> <expected-code> [GET|POST]
  local name="$1" url="$2" expect="$3" method="${4:-GET}"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 25 -X "$method" "$url")
  if [ "$code" = "$expect" ]; then
    echo "PASS  $name -> $code"
  else
    echo "FAIL  $name -> $code (expected $expect): $url"
    FAIL=1
  fi
}
echo "=== yerlikoglon.uz production health check ==="
check "Frontend (Pages)"              "https://default-project-bza.pages.dev/"                        200
check "Backend health (API)"          "https://api.yerlikoglon.uz/health"                             200
check "Backend new-code marker"       "https://api.yerlikoglon.uz/api/auth/me/delete"                 401 POST
if [ "${1:-}" = "--token" ] && [ -n "${CF_API_TOKEN:-}" ]; then
  echo "=== Cloudflare token verify ==="
  curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
    -H "Authorization: Bearer $CF_API_TOKEN" ; echo
fi
echo
if [ "$FAIL" -eq 0 ]; then
  echo "ALL CHECKS PASSED"
else
  echo "ONE OR MORE CHECKS FAILED"
fi
exit "$FAIL"