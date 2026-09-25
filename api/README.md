# DRC read Function

This folder is the Azure Function that answers checklist reads. Writes still go to the existing Power Automate flow. The page keeps sending the same JSON.

The public address, once deployed, is:

`https://<function-app>.azurewebsites.net/api/drc`

The page changes later by swapping **FLOW_URL** to that address. This folder does not change the page.

## What it does

- **POST** JSON `{ "action", "actor" or "email", ... }`
- Success: HTTP 200 `{ "ok": true, "data": ... }`
- Failure: HTTP 200 `{ "ok": false, "error": "...", "code": "..." }`
- Header: `Access-Control-Allow-Origin: *`
- A browser preflight (`OPTIONS`) returns 204 with the same CORS headers.

Reads answered here: `login`, `getTasks`, `getKits`, `listKits`, `getHistory`, `listAccess`.

Writes forwarded to Power Automate: `checkIn`, `updateTasks`, `checkOut`, `upsertAccess`, `upsertKit`, `resetDay`.

SharePoint stays the source of truth. List ids (already used by the live flow):

| List | App setting | Id |
| --- | --- | --- |
| DailyReadinessLog | `SP_LIST_LOG` | `7e537ecf-b161-4904-b238-6c5639a435c1` |
| DailyReadinessTasks | `SP_LIST_TASKS` | `e66c73cb-0810-4547-af8f-46e7f793bdd3` |
| DRC_Kits | `SP_LIST_KITS` | `3bfaa34f-e12d-4a03-b29e-e472189f1f6e` |
| DRC_Access | `SP_LIST_ACCESS` | `07c4ca78-f5d8-461b-9138-f5c8ecf1f40e` |

Site: `https://digitaltechedge.sharepoint.com/sites/DataCollectionUSHUB`

Do not commit the Power Automate address, client secrets, or `api/local.settings.json`.

## App settings

Copy `local.settings.json.example` to `local.settings.json` on your machine only.

| Setting | Required | What to put |
| --- | --- | --- |
| `GRAPH_TENANT_ID` | Yes, unless the Function uses its own Azure identity | Entra tenant id |
| `GRAPH_CLIENT_ID` | Yes, unless using the Function identity | App registration client id |
| `GRAPH_CLIENT_SECRET` | Yes, unless using the Function identity | Client secret. App setting or Key Vault only |
| `SP_SITE_ID` | Yes | Graph site id for DataCollectionUSHUB. Look up once; do not commit it |
| `SP_LIST_LOG` | Yes | Log list id above |
| `SP_LIST_TASKS` | Yes | Tasks list id above |
| `SP_LIST_KITS` | Yes | Kits list id above |
| `SP_LIST_ACCESS` | Yes | Access list id above |
| `PA_ROUTER_URL` | Yes before writes | Full Power Automate trigger address, including the signature. Load it from the secret file on the deploy machine. Never paste it into git or logs |

If `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, and `GRAPH_CLIENT_SECRET` are all set, the Function uses that app. If they are empty, it uses the Function App's managed identity (`DefaultAzureCredential`).

`FUNCTIONS_WORKER_RUNTIME` must be `node`. Runtime is Node 20. Programming model is Azure Functions v4.

## Let the app read this SharePoint site only

Use **Sites.Selected**. Do not grant access to every SharePoint site.

1. Open [https://entra.microsoft.com](https://entra.microsoft.com) and sign in with an account that can register apps.
2. Go to **Identity** → **Applications** → **App registrations** → **New registration**.
3. Name it `drc-read`. Leave the redirect blank. Click **Register**.
4. Copy **Application (client) ID** into `GRAPH_CLIENT_ID`. Copy **Directory (tenant) ID** into `GRAPH_TENANT_ID`.
5. Open **Certificates & secrets** → **New client secret**. Copy the secret value into `GRAPH_CLIENT_SECRET` in the Function App settings. Do not put it in this repo.
6. Open **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions**.
7. Add **Sites.Selected**. Do not add Sites.Read.All or Sites.FullControl.All.
8. Click **Grant admin consent**.

The app still cannot read the hub until you grant this one site.

9. Look up the site id (do this once; store it only in `SP_SITE_ID`):

```http
GET https://graph.microsoft.com/v1.0/sites/digitaltechedge.sharepoint.com:/sites/DataCollectionUSHUB
```

The `id` field in that response is `SP_SITE_ID`. It looks like `hostname,site-guid,web-guid`.

10. Grant read on that site only. `POST` this body to `https://graph.microsoft.com/v1.0/sites/{SP_SITE_ID}/permissions`:

```json
{
  "roles": ["read"],
  "grantedToIdentities": [
    {
      "application": {
        "id": "<GRAPH_CLIENT_ID>",
        "displayName": "drc-read"
      }
    }
  ]
}
```

Reads do not need write permission. Power Automate still performs check-in, check-out, and settings saves.

To use a managed identity instead of a client secret: turn on a system-assigned identity for the Function App, grant **Sites.Selected** to that identity's app id the same way, and leave the three `GRAPH_*` secret settings empty.

## Check Graph from your machine

From this `api` folder, with the settings exported in the shell (not printed):

```bash
node scripts/graph-smoke.mjs
```

You should see a line like `DRC_Access top 1: 1 item(s); field names: ...`. The script does not print emails or the token. If a setting name is missing, it prints the name only.

## Tests

```bash
cd api
npm install
npm test
```

That runs `node --test`. No SharePoint call is made.

## Blob cache

Skipped in this pull request. Warm timings do not exist yet, because this change does not deploy the Function. Reads go straight to Microsoft Graph.

Turn the cache on only if a later smoke shows warm medians at or above 2 seconds for `getTasks`, `getKits`, `listKits`, or `getHistory`. Until then, do not add Blob reads.

If that later pass is needed, reuse the existing container `drc-cache` on storage account `stdrcreadcache01`. Keys:

- `tasks/v1.json`
- `kits/{yyyy-MM-dd}.json`
- `listKits/v1.json`
- `access/v1.json`

Envelope: `{ "expiresAt", "cachedAt", "ttlSeconds": 45, "action", "payload" }`. A miss or a bad blob must not fail the read. Writes stay on Power Automate. That flow already deletes these blobs when data changes.

## Deploy

Do not deploy from this pull request. `scripts/deploy.sh` and `scripts/smoke.sh` are added as stubs in a later commit. Cutover steps for Ron are in `docs/DRC-FUNCTION-CUTOVER.md` once that file exists.
