#!/usr/bin/env bash
# Stub only. Does not call the live checklist or Power Automate unless
# FUNCTION_URL is set, and this pull request does not set it.
# Never print response bodies, emails beyond the actor you typed, or sig values.
set -euo pipefail

if [[ -z "${FUNCTION_URL:-}" ]]; then
  cat <<'EOF'
DRC read Function smoke stub
FUNCTION_URL is not set, so this script does not send any request.

When the Function is deployed, set FUNCTION_URL to the /api/drc address
(no signature query string) and run this script again.

Planned checks, TEST kits only:
1. login as admin-drc returns ok and role Admin.
2. login as an unknown email returns NO_ACCESS.
3. getTasks, getKits for today, listKits, getHistory, and listAccess return ok.
4. A non-admin listAccess returns FORBIDDEN.
5. A non-admin listKits returns ok.
6. checkIn, updateTasks, and checkOut on a TEST-* kit only, then resetDay for that date and kit.
7. Do not touch Team kit claims.
8. After one warm-up call, the median of 5 calls for getTasks, getKits, listKits, and getHistory is under 2.0 seconds.

Record timings outside git if they contain nothing secret. Do not commit the Power Automate URL.
EOF
  exit 0
fi

echo "FUNCTION_URL is set. This stub still does not send traffic from the pull-request workspace."
echo "Run the checklist in api/README.md from David's machine after deploy."
exit 0
