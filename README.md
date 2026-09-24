# Daily Readiness Checklist

A checklist for claiming a kit, completing that day’s tasks, and checking the kit back in. People sign in with a Centific ID. The access list decides who can enter.

The page is a static site. It can run on your computer now, and later on GitHub Pages. It does not have its own server. Data will live in SharePoint lists, reached through one Power Automate flow. Until that flow is ready, the page runs in **practice mode** with sample data stored in the browser.

## Try it on your computer

1. Open a terminal in this folder.
2. Run:

```bash
python3 -m http.server 8790
```

3. Open [http://localhost:8790/](http://localhost:8790/).
4. Leave that terminal window open while you use the page. Closing it stops the page.

There is no password. Sign-in only checks the email against the access list.

### Practice sign-in

On the sign-in page, click one of these:

- **Sign in as Jane Doe** — regular user (`jane.doe@centific.com`)
- **Sign in as Brian Leong (admin)** — `brian.leong@centific.com`
- **Sign in as Annie Tran (admin)** — `thaingan.tran@centific.com`
- **Sign in as admin-drc** — shared admin login. `admin-drc@centific.com` also works.

You can also type an email and click **Sign in**. An email that is not on the list shows: “You don't have access. Ask a DRC admin.”

### What to click through

1. Sign in as Jane Doe. Her first and last name are filled in.
2. Pick a kit and click **Check in**. You should see a line like “Kit 01 claimed on Sep 24, 2026 at 8:06 AM PT”. The kit shows a lock.
3. Check a task, such as **Check hardware status**.
4. Click **Sign out**, then sign in as Brian Leong. Kit 01 stays locked and Brian cannot check it in for that same day. He can check in a different kit, or the same kit on another day.
5. Sign back in as Jane. The task you checked is still checked. Click **Check out**, then **Confirm** on “Please ensure you have completed the task.”
6. Open **History**. Check-in and check-out times are in Pacific time, with tasks shown as a count like `1/4`.
7. Sign in as Brian (or Annie, or admin-drc). The page shows **Admin View** and a **Settings** tab. Add a person (name, email, Admin or User, active). History can be filtered by person, kit, and date.

**Reset sample data** on the sign-in page (or in Settings) puts the sample people, kits, and tasks back. Your sign-in lasts until you click **Sign out** or close the tab.

## Practice mode and the real flow

| | Practice mode | Connected mode |
| --- | --- | --- |
| When | Default | After the Power Automate flow exists |
| Where data lives | This browser only | SharePoint lists |
| How to turn it on | `config.js` already says `backend: 'mock'` | Copy `config.local.example.js` to `config.local.js`, set `backend: 'pa'` and the flow URL |

You can also force a mode in the address bar:

- [http://localhost:8790/?backend=mock](http://localhost:8790/?backend=mock)
- [http://localhost:8790/?backend=pa](http://localhost:8790/?backend=pa)

`config.local.js` is ignored by git. Do not commit a real flow URL or signature.

The page sends `POST` JSON `{ "action", "actor", ... }` to `FLOW_URL`. The contract is in [docs/DRC_SPEC_AND_API_CONTRACT.md](docs/DRC_SPEC_AND_API_CONTRACT.md). Field names the page expects are in [docs/CLIENT_NOTES.md](docs/CLIENT_NOTES.md).

If the service returns an error, the page shows that message. It does not pretend the list is empty.

## Lists

Site: `https://digitaltechedge.sharepoint.com/sites/DataCollectionUSHUB`

- **DailyReadinessTasks** — task name (`Title`) and `TaskOrder`
- **DailyReadinessLog** — check-in / check-out log
- **DRC_Kits** — kit name, active, sort order, notes
- **DRC_Access** — who may sign in (name, email, first name, last name, Admin or User, active)

Column details are in the spec. Times are stored in UTC. The page shows them in Pacific time (`America/Los_Angeles`). A claim day is the calendar date you picked, as `YYYY-MM-DD`, not a UTC timestamp.

## Tests

Node is only needed to run the checks, not to open the page.

```bash
npm test
```

That runs `node --test tests/mock-backend.test.js`. The checks cover: one open claim per kit per date, different dates, check-out freeing the kit, admins-only actions, a rejected sign-in, and Pacific time labels.

## Assumptions

- Sign-in is the access list only. There is no Microsoft password prompt in this version.
- First and last name on the main page are read-only. An admin changes them in Settings.
- A person can hold one open kit per date. After check-out, that kit can be claimed again the same day (a new log row).
- Claim dates are Pacific calendar dates. The old prototype’s `toISOString()` date bug is not used.
- The service should count completed tasks itself. Practice mode ignores a fake total sent by the browser.
- History includes open check-ins (no check-out time yet) and finished ones.
- An admin can release someone else’s kit from the checklist. The owner’s check-out dialog uses the exact sentence “Please ensure you have completed the task.”
- New emails must end in `@centific.com`, except the shared `admin-drc` id.
- The last active admin cannot be removed.
- Month arrows move the calendar only. The selected day changes when you click a day, Today, Yesterday, or Last week.
- Kit management is included in Settings.
- Practice buttons are hidden in connected mode.
