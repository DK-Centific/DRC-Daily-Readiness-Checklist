# DRC hot-read Azure Function — Design

**Status:** Approved for spec (David 2026-09-24 ~12:03 PM PT). Implementation plan not started.
**Goal:** Cut DRC **read** wall-clock to **< 2s median** (warm) while keeping the FE API contract and SharePoint as source of truth.
**Constraint:** Do not touch Twilight / OD / Orbit flows. Do not seed kits. Leave andrew/ritu/sander/blake access alone unless David asks. Do not change PA Router trigger URL until FE cutover.

---

## 1) Problem

Live **DRC Router** (Power Automate) serves all actions over SharePoint lists. Perf passes, Blob short-TTL cache, and cheaper-auth (skip SP actor on warm reads) confirmed architectural wins, but **warm medians stayed ~3–7s** because PA runtime tax dominates. Excel-as-DB behind PA was rejected: same PA tax plus lock/concurrency risk (Twilight already moved assignments off Excel to List for that reason).

David priority: **speed** (sub‑2s reads). Chosen approach: **Azure Function for hot reads**; writes stay on PA for pass 1.

---

## 2) Architecture (locked)

| Piece | Role |
|-------|------|
| **SharePoint lists** (DataCollectionUSHUB) | Source of truth: `DailyReadinessLog`, `DailyReadinessTasks`, `DRC_Kits`, `DRC_Access` |
| **DRC Router** PA flow `9c1cd488-…` | Remains live write engine; also rollback target |
| **New Azure Function App** in `pegasus-checklist-rg` (centralus) | Public HTTPS entry; native reads; **proxies** mutations to PA Router |
| **Storage `stdrcreadcache01` / `drc-cache`** | Optional short-TTL read envelopes (reuse existing); not required if Graph alone hits the bar |
| **Static Web App `pegasus-checklist`** | Unchanged this pass; Ron FE config points at Function URL when ready |

**Why faster:** Function path = auth + Graph/SP REST + JSON response — no PA orchestration hops.

**Why stable:** One public URL (proxy writes), SP SoT (no dual DB), same JSON contract/codes, PA kept behind proxy, rollback = point FE back at PA URL.

---

## 3) Components

### 3.1 Function App
- Resource group: `pegasus-checklist-rg`
- Subscription: `ONE_DATA_PLATFORM` (`6d5cb021-587e-4003-a9d8-b35e8578510f`)
- Runtime: Node 20 or Python 3.11 (pick at implement; prefer Node if FE/ops already Node-aligned)
- Plan: Consumption or Flex Consumption (centralus). Always-on / keep-warm only if cold-start misses the bar in verify.
- Auth to SP: **Microsoft Graph** via managed identity or app registration with Sites.Selected (or equivalent least privilege) on the HUB site. Secrets in Function App settings / Key Vault — never in FE or git.

### 3.2 Public HTTP contract (unchanged)
`POST <FUNCTION_URL>`  
`Content-Type: application/json`  
Body: `{ "action": "<name>", "actor": "<email>", ... }`  
Response: `200 { "ok": true, "data": ... }` or `200 { "ok": false, "error": "...", "code": "..." }`  
CORS: `Access-Control-Allow-Origin: *`

### 3.3 Action ownership

| Action | Owner (pass 1) |
|--------|----------------|
| `login`, `getTasks`, `getKits`, `listKits`, `getHistory`, `listAccess` | **Function (native)** |
| `checkIn`, `updateTasks`, `checkOut`, `upsertAccess`, `upsertKit`, `resetDay` | **Function → proxy → PA Router** |

Unknown `action` → `{ ok:false, code:"VALIDATION" }` (or same code PA uses today if already defined).

### 3.4 Actor rules (parity with live Router)
- Normalize email: trim + lower; bare `admin-drc` → `admin-drc@centific.com`.
- Every action: actor must exist in `DRC_Access` with Active=Yes → else `NO_ACCESS` (login copy unchanged).
- Admin-only: `listAccess`, `upsertAccess`, `upsertKit`, `resetDay` → else `FORBIDDEN`.
- `listKits`: active users allowed (current live behavior; not admin-gated).
- `getHistory`: any Active user may read full log with optional filters (current live behavior).

---

## 4) Data flow

### 4.1 Read path
1. Parse body; normalize `actor`.
2. Resolve allowlist: Graph query Active `DRC_Access` (Top reasonable), optionally served from Blob `access/v1.json` if `expiresAt > utcNow()` (45s TTL, same envelope family as PA).
3. Gate actor / admin.
4. Execute action against Graph lists; shape Select fields to **exact** existing response keys (`id`/`claimDate` aliases on history; Role as string; etc.).
5. Return 200 JSON. Do **not** call PA on these actions.

### 4.2 Write path (proxy)
1. Same actor gate optional-but-recommended on Function (defense in depth); PA still re-checks.
2. Forward original JSON body to PA Router trigger URL (server-side secret).
3. Return PA status code and body unchanged (including claim race codes `KIT_CLAIMED`, `ALREADY_HAVE_CLAIM`, `NOT_OWNER`, `NOT_OPEN`, …).
4. PA continues Blob invalidation and SharePoint mutations.

### 4.3 Cache (optional day-one)
- Keys already defined: `tasks/v1.json`, `kits/{yyyy-MM-dd}.json`, `listKits/v1.json`, `access/v1.json`.
- Function may read/write the same envelopes. If direct Graph medians already < 2s, ship without cache and add only if needed.
- Writes remain PA’s responsibility for invalidation when proxied.

---

## 5) Error handling

| Case | Behavior |
|------|----------|
| Missing/inactive actor | `NO_ACCESS` |
| Non-admin on admin action | `FORBIDDEN` |
| Bad/missing params | `VALIDATION` (match PA wording where practical) |
| Graph/SP failure on read | `ok:false` with stable code (e.g. `BACKEND`); log server-side; no secret leakage |
| PA proxy timeout / 5xx | Surface as `ok:false` / pass through body if JSON; log duration |
| Blob miss/error | Treat as miss; never fail the user read |

Do not log full PII payloads in App Insights beyond actor email + action + duration + outcome.

---

## 6) Cutover

1. Deploy Function; configure Graph identity + PA Router URL in app settings.
2. Smoke: native reads + proxied writes against **TEST-*** kits only; do not disturb Team kits or seed access rows.
3. Time warm medians for getTasks / getKits / listKits / getHistory (target < 2s).
4. Give Ron new base URL; FE replaces FLOW_URL only (single URL).
5. Parallel window: both Function and PA public URLs work; compare medians.
6. After Ron confirms FE on Function, leave PA running as write backend via proxy.
7. **Rollback:** FE config → original PA trigger URL. No data migration.

---

## 7) Testing / success criteria

**Must pass before calling Ron for cutover:**
- Auth: unauthorized → `NO_ACCESS`; non-admin `listAccess` → `FORBIDDEN`; non-admin `listKits` → ok (parity).
- Reads: shapes match current PA responses (spot-check fields against `_perf_cheap_auth_after.json` / live PA).
- Writes via proxy: checkIn / updateTasks / checkOut / getHistory round-trip on TEST kit; resetDay scoped cleanup.
- **Warm medians** (after ≥1 warm invoke): getTasks, getKits, listKits, getHistory each **< 2.0s**.
- Cold start documented (may exceed 2s); not a ship blocker if warm meets bar.
- No edits to Twilight/OD/Orbit; trigger URL of PA unchanged until FE points away.

Evidence files (planned): `/workspace/drc/_perf_function_reads.json`, deploy notes in `/workspace/drc/PA-BACKEND-BUILD-REPORT.md` new §2i.

---

## 8) Out of scope (this pass)

- Moving writes off PA / replacing DailyReadinessLog SoT
- Excel as DB
- MSAL / Entra user sign-in (still allowlist email)
- Kit seeding; access row promotion
- Changing FE UI beyond base URL
- Always-on plan unless cold-start verify fails the product bar

---

## 9) Follow-ups (only if David asks)

- Move mutations into Function (drop PA proxy)
- Always-on / Flex to kill cold start
- Entra SSO
- Deprecate PA Router after write parity proven

---

## 10) Approval record

- Speed goal chosen (David).
- Option 1 Function reads chosen (David).
- Architecture + single-URL write proxy + SP SoT locked (David).
- Spec locked for write-up 2026-09-24 ~12:03 PM PT.
