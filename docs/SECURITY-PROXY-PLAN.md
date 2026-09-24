# Next step: keep the flow address on the server

This is the follow-up for review items H1 and H2. It is not built yet.

Today the browser receives the Power Automate address, including `sig`, inside `config.local.json`. Anyone who can open the site can call the flow. The flow also answers from any website (`Access-Control-Allow-Origin: *`), and the page sends the signed-in email itself.

## What to build

A small Render **web service** on the same address as the checklist (a backend-for-frontend). The static files and this service should be one origin so the browser never calls Power Automate directly.

- The flow address lives only in the Render environment variable `DRC_FLOW_URL`. The build must stop writing it into `dist`.
- The page calls `POST /api/drc` on its own origin with the same JSON body it sends today (`action`, and the other fields).
- The service reads `DRC_FLOW_URL` and forwards that body to the flow. It returns the flow’s JSON unchanged.
- Bind the service to `0.0.0.0` and the `PORT` Render provides.
- Set response headers in this service: `Cache-Control: private, no-store` on `/`, `/index.html`, and any config file; `X-Frame-Options: SAMEORIGIN`; `Referrer-Policy: no-referrer`; `X-Content-Type-Options: nosniff`; and the content security policy.
- After the page only talks to itself, change the content security policy `connect-src` to `'self'` and remove the Power Automate host.
- Do not put `DRC_FLOW_URL` in the page, in git, or in a public config file.

Sign-in can stay the access list for that first proxy change. The proxy is the place to add a server session or Microsoft sign-in later. A secret header inside the static page is not a secret.

## What this current change already did

`config.local.json` is data, not a script. The app shell waits until `login` returns. A connected build ignores `?backend=mock` unless the documented debug flags are both set. Those do not hide the flow address. The proxy does.
