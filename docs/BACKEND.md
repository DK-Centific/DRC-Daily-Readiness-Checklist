# DRC backend notes

These notes sit next to the checklist page. This pass adds documentation only. The page, Render setup, and the existing API contract stay as they are.

| Doc | What it is |
| --- | --- |
| [DRC_SPEC_AND_API_CONTRACT.md](DRC_SPEC_AND_API_CONTRACT.md) | What the page sends and what it expects back |
| [DRC-READ-FUNCTION-DESIGN.md](DRC-READ-FUNCTION-DESIGN.md) | Locked plan: an Azure Function serves fast reads and forwards writes to Power Automate |
| [superpowers/specs/2026-09-24-drc-read-function-design.md](superpowers/specs/2026-09-24-drc-read-function-design.md) | The same read-Function design, in the spec folder |
| [DRC-BLOB-CACHE-DESIGN.md](DRC-BLOB-CACHE-DESIGN.md) | Short-lived Blob cache already used by Power Automate |
| [PA-BACKEND-BUILD-REPORT.md](PA-BACKEND-BUILD-REPORT.md) | What was built in Power Automate, and the timing results |

Future Function code will live under `api/`. That folder is empty until the Function is built.

After the Function ships, the page switches by changing one address. No page redesign in that step. Until then, Power Automate remains the live backend.

Do not commit flow addresses, blob signatures, tokens, or connection strings. Keep those in local files such as `config.local.json` and `.drc_*`.
