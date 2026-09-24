# DRC (Daily Readiness Checklist) — spec + backend contract v1

Site: https://digitaltechedge.sharepoint.com/sites/DataCollectionUSHUB
Frontend: static web app (HTML/CSS/JS, no server) — hostable on GitHub Pages later.
Backend: ONE Power Automate HTTP-trigger "router" flow over SharePoint lists (same pattern as Twilight).
All times stored in UTC ISO-8601; UI displays America/Los_Angeles ("PT").
"Day" for claims = the date selected in the calendar, as YYYY-MM-DD (Pacific date).

## SharePoint lists

### DailyReadinessTasks (EXISTS)
- ID, Title (task name), TaskOrder (Number, optional)
- Optional to add: Active (Yes/No, default Yes)

### DailyReadinessLog (EXISTS — becomes the check-in/check-out log; add these columns)
- Title (text) = "<KitName> <ClaimDate> <Email>"
- UserEmail (text), UserName (text)
- KitID (number), KitName (text)
- ClaimDate (text, YYYY-MM-DD, Pacific)  <- text on purpose (avoid SP Date timezone drift)
- CheckInAt (Date+time, UTC), CheckOutAt (Date+time, UTC, blank while claimed)
- Status (Choice: Claimed | CheckedOut)
- TasksCompleted (number), TasksTotal (number)
- CompletedTaskIDs (multi-line text, JSON array of task IDs, e.g. [1,3])
(Legacy columns TaskID/TaskTitle/CompletedBy/CompletedDate can stay but must be made NOT required. The page ignores legacy columns.)

### DRC_Kits (NEW)
- ID, Title (kit name, e.g. "Kit 01"), Active (Yes/No), SortOrder (number), Notes (text)

### DRC_Access (NEW) — login allowlist
- ID, Title (display name), Email (text, lowercased, unique), FirstName, LastName,
  Role (Choice: Admin | User), Active (Yes/No), AddedBy (text), AddedAt (Date+time)
- Seed rows:
  - Brian Leong — brian.leong@centific.com — Admin
  - Annie Tran — thaingan.tran@centific.com — Admin
  - admin-drc — admin-drc (also accept admin-drc@centific.com) — Admin (shared admin account)

## Business rules
- Login: user enters firstName.lastName@centific.com (or admin-drc). Must exist in DRC_Access with Active=Yes. Otherwise "You don't have access. Ask a DRC admin."
- First/last name pre-populated from DRC_Access (derive from email if blank).
- A kit can have at most ONE open (Status=Claimed) claim per ClaimDate. Claims on different days are independent.
- Check-in: claims selected kit for selected date -> message "Kit X claimed on <date> at <time PT>" ; kit shows lock icon for others; others can't claim it that day.
- While claimed by me: task list (from DailyReadinessTasks, ordered by TaskOrder) is shown with checkboxes; toggles persist to CompletedTaskIDs.
- Check-out: confirm modal "Please ensure you have completed the task." with [Cancel] [Confirm]. Confirm sets CheckOutAt, Status=CheckedOut, TasksCompleted/TasksTotal, and frees the kit so another user can claim it for that same date (one OPEN claim per kit per date; a new claim row may follow a CheckedOut one). A user may hold at most one open claim per date.
- History tab: my check-ins/outs (admin: everyone, filterable by user/kit/date) with kit, date, check-in PT, check-out PT, tasks completed X/Y.
- Admin view: banner "Admin View"; extra Settings tab to list/add/edit/deactivate access entries (Name, Email, Role, Active). Optional: manage kits there too.

## Router flow HTTP contract
POST <FLOW_URL>  (Content-Type: application/json)
Request:  { "action": "<name>", "actor": "<email of signed-in user>", ...params }
Response: 200 { "ok": true, "data": ... }  or  200 { "ok": false, "error": "message", "code": "..." }
Flow must re-check actor in DRC_Access (Active) on every call and require Role=Admin for admin actions.
Response headers: Access-Control-Allow-Origin: *  (so localhost / GitHub Pages can call it)

Actions:
- login {email} -> data: {email, name, firstName, lastName, role}
- getTasks {} -> data: [{id, title, order}]
- getKits {date} -> data: [{id, name, sortOrder, claim: null | {claimId, userEmail, userName, checkInAt, status}}]  (claim = open Status=Claimed claim for that date; also include lastCheckedOut optional)
- checkIn {kitId, date} -> data: {claimId, kitId, kitName, date, checkInAt}  | error code KIT_CLAIMED / ALREADY_HAVE_CLAIM
- updateTasks {claimId, completedTaskIds:[...]} -> data: {claimId, completedTaskIds}   (only owner)
- checkOut {claimId, completedTaskIds, tasksTotal} -> data: {claimId, checkOutAt, tasksCompleted, tasksTotal, checkedOutByEmail, checkedOutByName}  (only owner or admin; records the actor, who may differ from the claimant)
- getHistory {userEmail?, from?, to?, kitId?} -> data: [log rows including checkedOutByEmail, checkedOutByName]  (every signed-in user can read the log; userEmail matches claimant or the person who unclaimed. Older flows may still force a non-admin to their own rows.)
- listAccess {} (admin) -> data: [{id, name, email, firstName, lastName, role, active}]
- upsertAccess {id?, name, email, firstName?, lastName?, role, active} (admin)
- listKits / upsertKit {id?, name, active, sortOrder} (admin, optional)

## Security note
This is an allowlist sign-in (email checked against DRC_Access), not Microsoft SSO/password auth. Flow URL (sig) is a secret-ish token: keep it in a non-committed config.local.json or inject at deploy. The browser still receives that address in this version. The follow-up that holds it on the server is docs/SECURITY-PROXY-PLAN.md. Upgrade path: that same-origin proxy, then MSAL/Entra ID sign-in.
