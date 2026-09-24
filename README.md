# Daily Readiness Checklist

A checklist for claiming a kit, completing that day’s tasks, and checking the kit back in. People sign in with a Centific ID. The access list decides who can enter.

The page is a static site. It can run on your computer now, and it is ready to publish on Render. It does not have its own server. Data will live in SharePoint lists, reached through one Power Automate flow. Until that flow address is set, the page runs in **practice mode** with sample data stored in the browser.

The page uses the font already on the computer or phone. It does not load a font from Google.

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

1. Sign in as Jane Doe. The checklist opens on today.
2. Click a kit tile, then **Check in to Kit 01** (or whichever kit you picked). A bar shows that kit is yours, with how many tasks are done.
3. Check a task, such as **Battery charging: Walkie-talkies (Two per kit)**. A finished group closes on its own.
4. Click **Sign out**, then sign in as Brian Leong. Jane’s kit stays locked and shows her name. Brian cannot check that kit in for the same day.
5. Sign back in as Jane. The task you checked is still checked. Click **Check out**. The box says “Please ensure you have completed the task.” Click **Check out anyway** if some tasks are still open, or **Check out** if they are all done.
6. Open **History**. You see one line that Jane claimed the kit and, after check-out, one line that she unclaimed it. Each line has her name, email, and Pacific time, plus a count like `1/18`. **Mine** is already on.
7. Click **Mine** to turn it off. Use **Today**, **7 days**, or **All**, and the kit list, to narrow the log. **All** starts with the last 14 days. **Load older** goes back further.
8. Sign in as Brian (or Annie, or admin-drc). The page shows **Admin View** and a **Settings** tab. Under **People**, a regular person is labeled **Staff**. The saved role is still User. On History, **Mine** starts off. If Brian releases Jane’s kit, History shows Jane claimed it and Brian unclaimed it.

**Reset sample data** on the sign-in page (or in Settings) puts the sample people, kits, and tasks back. Your sign-in lasts until you click **Sign out** or close the tab.

### Light, Dark, and System

Next to **Sign out** there are three icons: sun (Light), monitor (System), moon (Dark). System follows the device and is the one already selected. The choice stays in this browser. On a phone, tap your initials to open the same choice and **Sign out**.

### Date control

Admins always see the month on the left, with a count and colored dots for each day that had a kit. Navy means someone is still checked in. Green means a kit was checked out with every task done. Amber means a kit was checked out with tasks still open. The Day summary under the month matches the day you clicked. A past day is view-only, with **Back to today**. On a phone, admins see the current week; **Sep** opens the full month.

Everyone else sees **Today · Wed, Sep 23**. **Change date** opens the month. On a phone that month slides up from the bottom. **Clear** or **Cancel** closes it. **Today** jumps back to today. Future days cannot be selected.

## Practice mode and the real flow

| | Practice mode | Connected mode |
| --- | --- | --- |
| When | Default | After the Power Automate flow exists |
| Where data lives | This browser only | SharePoint lists |
| How to turn it on | `config.js` already says `backend: 'mock'` | Copy `config.local.example.json` to `config.local.json`, set `"backend"` to `"pa"` and paste the flow URL |

On your computer, you can still switch mode in the address bar:

- [http://localhost:8790/?backend=mock](http://localhost:8790/?backend=mock)
- [http://localhost:8790/?backend=pa](http://localhost:8790/?backend=pa)

To feel a slow connection, open [http://localhost:8790/?backend=mock&latency=3000](http://localhost:8790/?backend=mock&latency=3000). Tabs still switch right away and show **Refreshing…** while the sample data catches up. Add `&debug=1` and open the browser console to see each action and how many milliseconds it took.

On the published site, after the build has connected to the flow, `?backend=mock` does nothing. The page stays on the shared checklist. To look at sample data in that browser anyway, the address needs both flags: `debug=1` and `backendOverride=1`. Example: `https://drc-daily-readiness.onrender.com/?debug=1&backendOverride=1&backend=mock`. That switch is for troubleshooting. It does not change SharePoint.

`config.local.json` is ignored by git. Do not commit a real flow URL or signature. The page reads that file as data. It does not run it as a program. An older `config.local.js` is still read the same way, and only when it is a plain settings assignment.

When the page is connected to the flow (`backend: 'pa'`), the practice sign-in buttons are hidden. People type their Centific ID and click **Sign in**.

## Put the page on Render

The repo includes `render.yaml`. Render publishes a static site named **drc-daily-readiness**.

1. Sign in at [render.com](https://render.com).
2. Click **New**, then **Blueprint**.
3. Choose this private repo. Render reads `render.yaml`.
4. When it asks for **DRC_FLOW_URL**, paste the Power Automate flow address. Leave it blank only if you still want the practice page.
5. Click **Apply**.

The build command is `bash scripts/build.sh`. The published folder is `dist`.

If **DRC_FLOW_URL** is set, the build writes `dist/config.local.json` with that address and turns on the real flow. That file is not committed. `render.yaml` tells Render to send `Cache-Control: private, no-store` for `/`, `/index.html`, `/config.local.json`, and `/config.local.js`, so a new flow address is not kept at the CDN. The same file lists `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and a content security policy. A copy of those rules is also in `_headers` (the file Cloudflare Pages understands). Render’s own docs apply headers from `render.yaml` or from **Settings → Headers**, not from `_headers`.

The live site does not pick up a header edit in git by itself. After this file is on the main branch and the deploy is **Live**:

1. Open [dashboard.render.com](https://dashboard.render.com) and sign in.
2. Click the service **drc-daily-readiness**.
3. If this site belongs to a Blueprint, open **Blueprints**, open the blueprint for this repo, and click **Manual Sync**. That copies the headers from `render.yaml`.
4. If there is no Blueprint sync, click **Settings** in the left sidebar, scroll to **Headers**, and click **Add Header** once for each row below. Then click **Save**.

| Path | Header | Value |
| --- | --- | --- |
| `/*` | X-Frame-Options | `SAMEORIGIN` |
| `/*` | Referrer-Policy | `no-referrer` |
| `/*` | X-Content-Type-Options | `nosniff` |
| `/*` | Content-Security-Policy | `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self' https://*.environment.api.powerplatform.com` |
| `/` | Cache-Control | `private, no-store` |
| `/` | CDN-Cache-Control | `no-store` |
| `/index.html` | Cache-Control | `private, no-store` |
| `/index.html` | CDN-Cache-Control | `no-store` |
| `/config.local.json` | Cache-Control | `private, no-store` |
| `/config.local.json` | CDN-Cache-Control | `no-store` |
| `/config.local.js` | Cache-Control | `private, no-store` |
| `/config.local.js` | CDN-Cache-Control | `no-store` |

`CDN-Cache-Control: no-store` is the line Cloudflare uses so it does not keep a copy. The connected Render tools cannot set these headers for you. Saving them in the dashboard is the step that changes the live site.

When the deploy is live, run this and read the header lines:

```bash
curl -sSI https://drc-daily-readiness.onrender.com/ | tr -d '\r'
curl -sSI https://drc-daily-readiness.onrender.com/index.html | tr -d '\r'
curl -sSI https://drc-daily-readiness.onrender.com/config.local.json | tr -d '\r'
```

You want these on `/`, `/index.html`, and `/config.local.json`:

- `cache-control: private, no-store`
- `x-frame-options: SAMEORIGIN`
- `referrer-policy: no-referrer`
- `x-content-type-options: nosniff`
- `content-security-policy:` including `default-src 'self'`

`cf-cache-status` for `/config.local.json` should no longer stay `HIT` with `s-maxage=300`. Until the dashboard save, the CDN still sends `cache-control: public, max-age=0, s-maxage=300` and omits the frame and referrer headers. The page itself also sends the referrer policy and the content security policy in the HTML, so those two apply on the next deploy even before the dashboard step. The HTML policy leaves out `frame-ancestors` because browsers ignore that piece in a meta tag and show an error. The HTTP header still includes `frame-ancestors 'self'` and `X-Frame-Options`. The frame header and the cache header change only after the dashboard step.

To change the flow address later: open the service, click **Environment**, edit **DRC_FLOW_URL**, and deploy again.

The browser still receives the flow address in this version. The next change, a same-origin service that keeps that address on the server, is described in [docs/SECURITY-PROXY-PLAN.md](docs/SECURITY-PROXY-PLAN.md). This version does not add that service.

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

That runs the checks in `tests/`. They cover: one open claim per kit per date, different dates, check-out freeing the kit, who claimed and who unclaimed, any signed-in person reading the kit log, non-admins blocked with `FORBIDDEN`, a rejected sign-in, Pacific time labels, Admin/User role text, hiding tasks whose Active flag is false, reading `config.local.json` without running it, keeping a connected build on the real checklist when the address says `?backend=mock`, waiting for sign-in before Admin View, and toast labels limited to ok, error, and slow.

## Assumptions

- Sign-in is the access list only. There is no Microsoft password prompt in this version.
- First and last name on the main page are read-only. An admin changes them in Settings.
- A person can hold one open kit per date. After check-out, that kit can be claimed again the same day (a new log row).
- Claim dates are Pacific calendar dates. The old prototype’s `toISOString()` date bug is not used.
- The service should count completed tasks itself. Practice mode ignores a fake total sent by the browser.
- History is an event log, newest first. A claim line says who claimed the kit. A check-out is a separate line that says who unclaimed it, with tasks completed. Open claims have no unclaimed line yet. The screen says Staff for a regular person; the saved role is still User.
- **Mine only** starts on for a regular user and off for an admin. Anyone signed in can turn it off and filter by person, kit, and date.
- An admin can release someone else’s kit from the checklist. History then shows the admin as the person who unclaimed it. Older rows with no checkout person show the claimant instead. The owner’s check-out dialog uses the exact sentence “Please ensure you have completed the task.”
- New emails must end in `@centific.com`, except the shared `admin-drc` id.
- The last active admin cannot be removed.
- Month arrows move the calendar only. The selected day changes when you click a day or Today. Future days stay closed. A past day is view-only.
- Kit management is in Settings (name, active, sort order). If no kits exist yet, a regular person sees “No kits set up yet, ask a DRC admin.” An admin gets a button that opens Settings to add the first kit.
- The flow address belongs only in `config.local.json` (or the Render variable `DRC_FLOW_URL`). Nothing in git contains a real flow URL. The follow-up that stops sending that address to the browser is [docs/SECURITY-PROXY-PLAN.md](docs/SECURITY-PROXY-PLAN.md).
- A non-admin who opens Settings actions gets the code `FORBIDDEN`. Unknown people get `NO_ACCESS`. A kit already claimed that day gets `KIT_CLAIMED`.
- Tasks with Active explicitly false are hidden. The page ignores old log columns, including `CompletedDate`.
- Practice buttons are hidden in connected mode.
