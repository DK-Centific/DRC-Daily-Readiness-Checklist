# DRC Blob Read Cache — Design Note

**Status:** Cheaper-auth `access/v1.json` **LIVE** (§11 / report §2h). Prior read cache live §10.
**When:** 2026-09-23 ~11:06 PM PT
**Constraint:** SharePoint remains source of truth; Blob is a short-TTL read cache only. Do **not** touch Twilight/OD/Orbit.

---

## 1) Purpose

Cache Power Automate **DRC Router** READ responses for ~30–60 seconds to cut SharePoint round-trips on hot paths:

| Action | Cache key | Notes |
|--------|-----------|--------|
| `getTasks` | `tasks/v1.json` | Shared; invalidates on task admin changes (rare; TTL enough if no write path) |
| `getKits` | `kits/{yyyy-MM-dd}.json` | Per ClaimDate (Pacific `YYYY-MM-DD`) |
| `listKits` | `listKits/v1.json` | Admin kit catalog |

Writes (`checkIn`, `updateTasks`, `checkOut`, `upsertKit`, `upsertAccess`) **must invalidate or bypass** relevant cache keys (see §5).

---

## 2) Azure resources (IDs)

| Item | Value | Status |
|------|-------|--------|
| Subscription | `ONE_DATA_PLATFORM` (`6d5cb021-587e-4003-a9d8-b35e8578510f`) | Confirmed |
| Tenant | Centific (`9b415834-803a-4da0-afdc-fe6b1d52d649`) | Confirmed |
| Resource group | `pegasus-checklist-rg` | Reused (hosts `pegasus-checklist` Static Web App; DRC-aligned) |
| Storage account | `stdrcreadcache01` | **Created** this pass (did **not** reuse OneData prod accounts `onedataplatformrg8a09` / `stadonedata` — Criticality High / Production) |
| SKU / tier | `Standard_LRS`, access tier **Hot**, HTTPS-only, min TLS 1.2, public blob access **disabled** | Applied |
| Location | `centralus` (same as RG siblings) | Applied |
| Container | **`drc-cache`** | Private (`publicAccess: null` / None) — **created** |
| Blob endpoint | `https://stdrcreadcache01.blob.core.windows.net/drc-cache/` | Live |

**Created this pass:** storage account `stdrcreadcache01` + private container `drc-cache` in `pegasus-checklist-rg`.

**Auth secret on box:** `/workspace/drc/.drc_blob_conn` (chmod 600) — connection string; never commit / never print.

---

## 3) Key layout & blob shape

### Keys

```
tasks/v1.json
kits/{yyyy-MM-dd}.json    # e.g. kits/2026-09-23.json
listKits/v1.json
access/v1.json            # cheaper-auth allowlist (payload.users)
```

Also: `access/v1.json` — active DRC_Access users for **actor auth** on non-login actions (see §11). Login still hits SharePoint live.

### Blob JSON envelope

```json
{
  "expiresAt": "2026-09-24T05:30:45.123Z",
  "cachedAt": "2026-09-24T05:30:00.123Z",
  "ttlSeconds": 45,
  "action": "getKits",
  "payload": { }
}
```

- `payload` = **exact** router success body the client already expects for that action (typically `{ "ok": true, "data": ... }`), so the flow can return it as-is when fresh.
- Default **TTL = 45 seconds** (within the 30–60s target). Clock: UTC ISO-8601.
- Freshness rule: `expiresAt > utcNow()` ⇒ cache hit. Missing blob / parse error / expired ⇒ miss.

---

## 4) Read path (future Router change — not this pass)

For `getTasks` / `getKits` / `listKits` only:

1. **Get blob** content for the key (Azure Blob connector).
2. If blob exists and `expiresAt` is in the future → **Respond** with `payload` (cache hit). Prefer not to log full payload.
3. Else → existing SharePoint fetch path → build response body → **Put blob** with new envelope (`expiresAt = utcNow() + 45s`) → **Respond**.
4. Blob Get failure (404 / 404-equivalent / connector error): treat as miss; do not fail the user request.
5. Blob Put failure after SP success: still return SP result; cache is best-effort.

No change to request/response contract for the static frontend.

---

## 5) Write path — invalidation / bypass

On successful mutating actions, **delete** (or overwrite with expired envelope) the keys those writes affect:

| Write action | Invalidate |
|--------------|------------|
| `checkIn` | `kits/{date}.json` for the claim date |
| `updateTasks` | Prefer **no** tasks/listKits key change; if claim-derived fields appear in `getKits`, invalidate `kits/{ClaimDate}.json` for that claim’s date (lookup from claim or request context) |
| `checkOut` | `kits/{date}.json` for that claim’s ClaimDate |
| `upsertKit` | `listKits/v1.json` **and** all date-scoped kit views that embed kit metadata — practical v1: delete `listKits/v1.json` + optionally leave date keys to TTL (45s) **or** delete `kits/` prefix if connector supports; minimum: `listKits/v1.json` + document that kit rename/active may lag ≤45s on `getKits` unless date keys also cleared |
| `upsertAccess` | `access/v1.json` (cheaper-auth allowlist) |

**Bypass:** mutating actions never read from cache for their own response; they always hit SharePoint.

**Race note:** concurrent GetKits may refill cache just after delete; 45s TTL bounds staleness. Acceptable for DRC.

---

## 6) Auth path for Power Automate

**Chosen preference:** official **Azure Blob Storage** connector in the PA environment (`Default-9b415834-803a-4da0-afdc-fe6b1d52d649`), connection authenticated with a **storage account connection string** (or account key) scoped to this account.

**Why:** first-class Get/Create/Update/Delete blob actions; no manual SAS URL assembly in every step; secrets live in the PA connection, not in flow definition JSON.

**Bootstrap secret on box (this pass):** connection string stored **only** in:

```
/workspace/drc/.drc_blob_conn
```

`chmod 600`. Never commit; never print in reports/chat.

**Fallback:** container-scoped **SAS** (read + write + delete, no list if avoidable; short-lived or renewable) if the Blob connector is unavailable in the env.

**Not chosen for v1:** anonymous public container (forbidden); per-user Entra for the HTTP caller (frontend stays anonymous to Blob).

Bootstrap of the PA connection is **optional later** (after account exists): create connection in make.powerautomate.com → Azure Blob Storage → connection string from Portal/CLI / `.drc_blob_conn` → reference in Router when that pass lands.

---

## 7) Smoke test (this pass — PASS)

1. Uploaded `smoke/ping.json` with envelope `{ expiresAt, cachedAt, ttlSeconds: 45, action: "smoke", payload: { ok: true, ... } }` via **connection string** auth (`az storage blob upload --connection-string` from `.drc_blob_conn`).
2. Downloaded and verified byte-for-byte JSON match; keys + `payload.ok` confirmed.
3. Deleted `smoke/ping.json`; `exists=false` after delete.
4. Container still private (`publicAccess: null`).

**Auth method used:** storage account connection string (not printed).  
**MCP note:** user-Azure `storage_account_create` was cancelled mid-call; provision + smoke completed with `az storage` CLI under the same `david.kang@centific.com` credential.

---

## 8) Auth status (resolved)

**user-Azure MCP** / box `az login` as **david.kang@centific.com** — working. Default sub `ONE_DATA_PLATFORM`.  
§2 IDs filled from live discovery + create.

---

## 9) Out of scope (this / next Router pass)

- ~~Patching DRC Router definition / live flow.~~ **Done** — see §10.
- Twilight, OD, Orbit.
- Caching `login`, `getHistory`, or write responses.
- Soft-delete / lifecycle rules (optional later; short TTL makes GC less critical).


---

## 10) Live Router wiring (2026-09-23 ~11:00 PM PT)

**Flow:** designer `9c1cd488-b061-41bd-b36a-4fc442b94dc8` (same trigger URL).  
**Backup:** `/workspace/drc/_drc_router_def_backup_pre_blob_cache_2026-09-23.json`  
**Definition:** `/workspace/drc/_drc_router_def_only.json`  
**Perf:** `/workspace/drc/_perf_blob_after.json`

### Auth method used
**HTTP + container SAS** (not the Azure Blob connector).

- Tried creating `shared_azureblob` connection via Flow/PowerApps APIs with account key from `.drc_blob_conn` — no workable non-interactive create path (404/403/audience mismatch).
- Generated container SAS (`rcwd`, HTTPS-only, ~1y) → `/workspace/drc/.drc_blob_sas` (chmod 600).
- Flow holds SAS in `Compose_BlobSas`; Get/Put/Delete use native **HTTP** actions against `https://stdrcreadcache01.blob.core.windows.net/drc-cache/…`.
- Prefer migrating to Azure Blob connector later if connection can be created in maker UI.

### Read path (getTasks / getKits / listKits)
1. Prefetch Switch for these three is a no-op (cache-first after auth).
2. After actor Active OK → HTTP GET blob → if `statusCode=200` and `expiresAt > utcNow` → **Response** with envelope `payload` (exact prior body shape).
3. Else → existing SharePoint path (getKits still parallel kits+open-claims) → HTTP PUT envelope (TTL 45s, best-effort; Response does not wait on Put) → Response.
4. Blob GET 404/failure treated as miss (`runAfter` includes Failed).

### Write invalidation (HTTP DELETE, fire-and-forget after success Response)
| Action | Keys deleted |
|--------|----------------|
| checkIn | `kits/{ClaimDate}.json` |
| updateTasks | `kits/{claim.ClaimDate}.json` |
| checkOut | `kits/{claim.ClaimDate}.json` |
| upsertKit | `listKits/v1.json` + `kits/{Compose_ClaimDate}.json` |
| resetDay | `kits/{date}.json` + `listKits/v1.json` |

### Timing note
Warm path still pays actor SharePoint lookup (by design: cache after auth). Observed warm medians often within noise of cold due to SP variance; run-history confirms cache **hits** skip SP fetch + Put (HTTP GET Succeeded, Put Skipped).

---

## 11) Cheaper auth — `access/v1.json` (LIVE 2026-09-24 ~10:54 AM PT)

**Goal:** Warm `getTasks` / `getKits` / `listKits` skip SharePoint `Get_Access_Actor` by authorizing from Blob `access/v1.json` (TTL **45s**).

**Status:** Definition patched **offline** only. Live flow **not** PATCHed — `/workspace/drc/.pa_bearer` expired; computerUse refresh failed → **NEED_SIGNIN**.

| Item | Path / value |
|------|----------------|
| Backup | `/workspace/drc/_drc_router_def_backup_pre_cheap_auth_2026-09-24.json` |
| Patch script | `/workspace/drc/_patch_cheap_auth_cache.py` |
| Definition | `/workspace/drc/_drc_router_def_only.json` (offline) |

### Auth gate (If_IsLogin else)

1. `HTTP_Get_AccessCache` GET `access/v1.json` (parallel with `Switch_Prefetch`).
2. `If_AccessCacheHit` (`statusCode==200` ∧ `expiresAt > utcNow()`):
   - `Filter_AccessCacheActor` on `payload.users` where `toLower(email)==Compose_Actor`
   - Set `Var_ActorRow` (SP-compatible `{Email, Role.Value, Active, Title}`) + `Var_IsAdmin`
3. Else (miss):
   - `Get_Access_ForCache` SP GetItems DRC_Access Top 500, `Active ne false`
   - `Select_AccessCacheUsers` → `{email, role, active, displayName}`
   - Filter actor → set same variables
   - `HTTP_Put_AccessCache` best-effort envelope (Ack compose so Put failure never fails the branch)
4. After If: `Compose_ActorRow` / `Compose_IsAdmin` from variables → existing `If_ActorActive` → `Switch_Action` (data caches unchanged).

Root `Initialize_Var_ActorRow` / `Initialize_Var_IsAdmin` added (PA requires init at workflow top).

### Envelope

```json
{
  "expiresAt": "<utcNow+45s>",
  "cachedAt": "<utcNow>",
  "ttlSeconds": 45,
  "action": "access",
  "payload": { "users": [ { "email", "role", "active", "displayName" } ] }
}
```

### Invalidation

After `Resp_UA_Created` / `Resp_UA_Updated`: HTTP DELETE `access/v1.json` (fire-and-forget).

### Login

Unchanged — still live SharePoint `Get_Access_Login`.

### Live verify (blocked)

Delete `access/v1.json` + `tasks/v1.json` → cold/warm getTasks ×3 → expect warm AccessCache hit and no `Get_Access_ForCache` / former `Get_Access_Actor`. Write timings to `_perf_cheap_auth_after.json` after PATCH.

**LIVE fix:** PA rejects `createObject` (`InvalidTemplate`); ActorRow reshape uses `json(concat(...))`. PATCH 200; warm runs skip `Get_Access_ForCache` on cache hit.

