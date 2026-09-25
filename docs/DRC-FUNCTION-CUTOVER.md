# DRC Function cutover and rollback

The checklist page is **not** switched in this change. Power Automate is still the live address. David deploys the Function first, then hands Ron the new address.

## New address

After deploy, the page address is:

`https://<function-app-name>.azurewebsites.net/api/drc`

Suggested app name: `func-drc-read` (confirm the name is free before creating it). There is no signature on this address. Do not put the Power Automate address in git.

The page still sends the same POST JSON: `{ "action", "actor" or "email", ... }`.

Success is still HTTP 200 `{ "ok": true, "data": ... }`. Failure is still HTTP 200 `{ "ok": false, "error": "...", "code": "..." }`.

## What Ron changes later

Only the checklist address. Do not change the page layout.

1. Open [https://dashboard.render.com](https://dashboard.render.com) and sign in.
2. Open the static site **drc-daily-readiness**.
3. Click **Environment**.
4. Edit **DRC_FLOW_URL**.
5. Replace the Power Automate address with the Function address David sends (`.../api/drc`). Do not add a signature.
6. Save, then deploy again so the build writes the new address.
7. Open the live checklist and sign in as **admin-drc**. Tasks and kits should load. A check-in on a **TEST** kit should still save.

Local copy, if you use one: edit `config.local.json` and set `FLOW_URL` to the same Function address. That file is not committed.

Keep the old Power Automate address somewhere private (not in git) until the new address has been used for a day. Both addresses work during that window. The Function forwards saves to Power Automate. Power Automate itself is not turned off and its trigger address is not edited.

## Browser permission the page still needs

The page is only allowed to call Power Automate today (`connect-src` includes `https://*.environment.api.powerplatform.com`). A call to `*.azurewebsites.net` will be blocked until that permission includes the Function host.

That edit is **not** in this pull request. Do it in the same change that swaps `DRC_FLOW_URL`, in all three places:

- `index.html` (the Content-Security-Policy meta tag)
- `render.yaml` (the Content-Security-Policy header)
- `js/security-headers.js`

Add the Function host next to the Power Automate host, for example `https://<function-app-name>.azurewebsites.net`. Then deploy the page. Until that ships, leave `DRC_FLOW_URL` on Power Automate.

## Rollback

1. Open the Render service **drc-daily-readiness**.
2. Click **Environment**.
3. Set **DRC_FLOW_URL** back to the previous Power Automate address.
4. Deploy again.

No list data moves. Kits, access rows, and the log stay in SharePoint. If the browser permission was widened, it can stay; the old address is still allowed.

## Checks before calling Ron

- Unknown person gets `NO_ACCESS`. A non-admin `listAccess` gets `FORBIDDEN`. A non-admin `listKits` succeeds.
- `login`, `getTasks`, `getKits`, `listKits`, `getHistory`, and `listAccess` match the current page fields. Open claims include `claimId`, `userEmail`, `userName`, `checkInAt`, `status`, and `completedTaskIds`.
- `checkIn`, `updateTasks`, and `checkOut` on a **TEST-*** kit go through the Function and land in SharePoint. `resetDay` cleans up only that test date and kit.
- After one warm-up call, the median of five calls is under 2.0 seconds for `getTasks`, `getKits`, `listKits`, and `getHistory`. A cold start may be slower. That is acceptable.
- No edits to Twilight, OD, or Orbit. No kit seeding. Andrew, Ritu, Sander, and Blake access rows stay as they are.
- The Power Automate trigger address is unchanged. The Function reads it from the app setting `PA_ROUTER_URL` only.

## Who does what

| Person | Action |
| --- | --- |
| David | Deploy the Function, set app settings, run the smoke on TEST kits, send Ron the `/api/drc` address |
| Ron | Swap `DRC_FLOW_URL` and allow the Function host in the page policy, then deploy the page |
| Either | Rollback by putting the old address back |
