#!/usr/bin/env bash
# Stub only. This script does not create Azure resources and does not publish code.
# David runs a real deploy later, signed in as the Centific account that owns
# pegasus-checklist-rg. Do not paste PA_ROUTER_URL, client secrets, or sig values
# into git, into this script, or into the terminal output.
set -euo pipefail

cat <<'EOF'
DRC read Function deploy stub
This copy does not call az and does not deploy.

When David is ready, from the api folder, on a machine already signed in:

1. Select subscription ONE_DATA_PLATFORM (6d5cb021-587e-4003-a9d8-b35e8578510f).
2. Confirm the name func-drc-read is free in pegasus-checklist-rg / centralus.
3. Create a Node 20 Functions v4 app on a Consumption plan in that group.
4. Set app settings (values stay in Azure, never in git):
   GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET
   SP_SITE_ID
   SP_LIST_LOG, SP_LIST_TASKS, SP_LIST_KITS, SP_LIST_ACCESS
   PA_ROUTER_URL  (read from the local secret file; do not echo it)
   FUNCTIONS_WORKER_RUNTIME=node
5. Publish this api folder with the Functions Core Tools or a zip deploy.
6. Run scripts/smoke.sh against the new https://<app>.azurewebsites.net/api/drc address.
   Use TEST kits only. Do not touch Team kit claims.
   Do not change the Power Automate trigger URL.
   Do not seed kits.
   Leave andrew, ritu, sander, and blake access rows alone.

List ids to copy are in api/README.md and api/local.settings.json.example.
Sites.Selected steps are in api/README.md.
EOF

exit 0
