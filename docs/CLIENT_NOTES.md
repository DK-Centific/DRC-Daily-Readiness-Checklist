# Client notes for the Power Automate flow

The app follows `DRC_SPEC_AND_API_CONTRACT.md`. These notes cover details the contract leaves open so the flow and the page stay in sync. The page also enforces the same rules in practice mode.

## Request

`POST` JSON:

```json
{ "action": "checkIn", "actor": "jane.doe@centific.com", "kitId": 1, "date": "2026-09-24" }
```

`actor` is the signed-in email on every action except `login`, which uses `email`. The shared admin account is stored as `admin-drc`. Both `admin-drc` and `admin-drc@centific.com` must sign in as that account. Return the canonical email `admin-drc`.

Every action except `login` must reject an unknown or inactive actor with:

```json
{ "ok": false, "error": "You don't have access. Ask a DRC admin.", "code": "NO_ACCESS" }
```

Admin actions (`listAccess`, `upsertAccess`, `listKits`, `upsertKit`, `resetDay`) reject a non-admin with code `FORBIDDEN`.

Use HTTP 200 for both `{ "ok": true }` and `{ "ok": false }`. Send `Access-Control-Allow-Origin: *`.

## Response fields the page reads

`login` data: `{ email, name, firstName, lastName, role }`. `role` is the plain string `Admin` or `User`. The page compares it without caring about capitalization.

`getTasks` data: `[{ id, title, order, active? }]` ordered by `order`. If `active` or `Active` is explicitly false (`false`, `"false"`, or `"No"`), the page hides that task. A missing Active flag means the task is shown.

The page does not read legacy log columns. The old date column on DailyReadinessLog is `CompletedDate`, not `CompletionDate`.

`getKits` data, active kits only, for the `date` (`YYYY-MM-DD`):

```json
{
  "id": 1,
  "name": "Kit 01",
  "sortOrder": 1,
  "claim": {
    "claimId": 10,
    "userEmail": "jane.doe@centific.com",
    "userName": "Jane Doe",
    "checkInAt": "2026-09-24T15:06:00.000Z",
    "status": "Claimed",
    "completedTaskIds": [1, 3]
  },
  "lastCheckedOut": null
}
```

`claim` is the open `Claimed` row for that kit and date, or `null`. `completedTaskIds` is extra but the page needs it to redraw checkboxes. If it is missing, the page falls back to `getHistory` for that kit and date.

`lastCheckedOut` is optional: `{ claimId, userEmail, userName, checkOutAt }` for the latest `CheckedOut` row that day, or `null`.

`checkIn` data: `{ claimId, kitId, kitName, date, checkInAt }`

Errors: `KIT_CLAIMED` (someone already holds that kit that day), `ALREADY_HAVE_CLAIM` (this person already holds a different kit that day).

`updateTasks` data: `{ claimId, completedTaskIds }` — owner only, and only while the claim is open.

`checkOut` data: `{ claimId, checkOutAt, tasksCompleted, tasksTotal, checkedOutByEmail, checkedOutByName }` — owner or admin. Record the signed-in person who checked the kit out, even when that person is an admin releasing someone else’s claim. Please count `tasksCompleted` from real task ids and set `tasksTotal` from the active task list. Do not trust a made-up total from the browser. Checking out sets `Status` to `CheckedOut` and frees the kit. A later check-in is a new log row.

`getHistory` data rows:

```json
{
  "id": 10,
  "title": "Kit 01 2026-09-24 jane.doe@centific.com",
  "userEmail": "jane.doe@centific.com",
  "userName": "Jane Doe",
  "kitId": 1,
  "kitName": "Kit 01",
  "claimDate": "2026-09-24",
  "checkInAt": "2026-09-24T15:06:00.000Z",
  "checkOutAt": null,
  "status": "Claimed",
  "tasksCompleted": 1,
  "tasksTotal": 4,
  "completedTaskIds": [1],
  "checkedOutByEmail": "",
  "checkedOutByName": ""
}
```

`checkedOutByEmail` and `checkedOutByName` are blank until check-out. After check-out they are the person who released the kit. Older rows may omit them; the page then shows the claimant as the person who unclaimed. `CheckedOutByEmail` / `CheckedOutByName` are accepted too.

The live log may send `date` instead of `claimDate`, and `claimId` instead of `id`. On every `getHistory` result the page copies `date` onto `claimDate` and `claimId` onto `id` when those page fields are missing. History and the calendar marks read `claimDate` and `id`.

Every signed-in person can read the kit log for all users. `userEmail` keeps rows where that person claimed the kit or released it. `from` and `to` are inclusive `YYYY-MM-DD` claim dates. `kitId` is optional. The History tab always sends `from` and `to`. It starts on today. **7 days** asks for the last 7 days. **All** starts with the last 14 days, and **Load older** moves `from` back another 14 days. The page sends `userEmail` of the signed-in person when **Mine** is on (on by default for Staff, off for an admin). The on-screen role **Staff** is stored as `User`. If a live flow still returns only that person’s own rows, the page shows what came back and, when they asked for someone else and nothing matched, a short note that the log may still be limited to them.

`listAccess` data: `[{ id, name, email, firstName, lastName, role, active }]` including inactive people.

`upsertAccess` body: `{ id?, name, email, firstName?, lastName?, role, active }`. `role` is `Admin` or `User`. Save emails in lowercase. Derive first and last name from `first.last@centific.com` when those fields are blank. Return the saved row. Reject a duplicate email with `DUPLICATE_EMAIL`.

`listKits` / `upsertKit`: `{ id, name, active, sortOrder, notes }`. `upsertKit` body: `{ id?, name, active, sortOrder, notes? }`. Include inactive kits in `listKits`. `getKits` hides them.

`resetDay` body: `{ date, kitId? }`. `date` is the Pacific ClaimDate (`YYYY-MM-DD`). Delete DailyReadinessLog rows for that date. When `kitId` is present, delete only that kit’s rows for the date, both `Claimed` and `CheckedOut`. When `kitId` is omitted, delete every kit’s rows for that date. Do not change DRC_Kits, DRC_Access, or DailyReadinessTasks. Success data: `{ date, kitId: null or the kit id, removedCount }`. Missing or invalid `date` is `VALIDATION`. An unknown `kitId` is `NOT_FOUND`. After a reset, `getKits` for that date shows the kit as unclaimed (`claim` and `lastCheckedOut` null) and `getHistory` no longer returns the deleted rows. The live flow already supports `resetDay` on the same checklist address.

## Codes the practice mode uses

`NO_ACCESS`, `FORBIDDEN`, `KIT_CLAIMED`, `ALREADY_HAVE_CLAIM`, `NOT_OWNER`, `NOT_FOUND`, `NOT_OPEN`, `KIT_INACTIVE`, `INVALID`, `VALIDATION`, `DUPLICATE_EMAIL`, `LAST_ADMIN`.

The live flow uses `NO_ACCESS` for an unknown actor, `KIT_CLAIMED` when that kit already has an open claim on that Pacific date, and `FORBIDDEN` when a non-admin calls an admin action. Kit management (`listKits` / `upsertKit` with name, active, and sortOrder) is required. An empty kit list tells a regular person “No kits set up yet, ask a DRC admin” and sends an admin to Settings to add kits.

`LAST_ADMIN` means the save would leave zero active admins.
