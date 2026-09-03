---
name: serve
description: Build and serve the Nimbi site locally so it can be viewed in a browser. Use when asked to run, serve, preview, or "open" the site locally, or to look at a change in the real site rather than in the source files.
---

# Serve the site locally

The site is generated: pages at the repo root are built from `src/` by `build.py`.
Opening `index.html` from disk does **not** work — pages link to `/assets/...` by
absolute path, which `file://` resolves against the filesystem root. It has to be
served over HTTP from the repo root.

## Steps

1. **Rebuild.** From the repo root, always build before serving — the server reads
   files off disk and will happily serve stale pages:

   ```bash
   python build.py
   ```

   If it exits non-zero, stop and fix the error. It fails on unreplaced
   `{{placeholders}}` and on meta descriptions over 160 characters.

2. **Pick a free port.** Default to 8000; if it is taken, try 8001, 8002, …

   ```bash
   python -c "import socket;s=socket.socket();s.bind(('127.0.0.1',8000));print('free')"
   ```

3. **Start the server in the background**, from the repo root:

   ```bash
   python -m http.server 8000 --bind 127.0.0.1
   ```

   Use `run_in_background: true` so it keeps serving across turns.

4. **Confirm it is up** before telling the user it is ready — do not just assume
   the process started:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
   ```

5. **Report the URL** (`http://localhost:8000`) and mention `Ctrl+C` (or killing
   the background task) to stop it.

## If the user is checking a specific page

Give them the direct URL rather than making them navigate:

| Page | URL |
| --- | --- |
| Home | `/` |
| About | `/about/` |
| Who we serve | `/who-we-serve/` |
| Designated services | `/designated-services/` |
| Obligations hub | `/obligations/` |
| A sector page | `/obligations/accountants/` (also `real-estate-agents`, `property-developers`, `lawyers`, `conveyancers`, `trust-and-company-service-providers`, `dealers-in-precious-metals-and-stones`) |
| Readiness check | `/readiness-check/` |
| Why Nimbi | `/why-nimbi/` |

## Notes

- **Serve from the repo root**, never a subdirectory — absolute paths break the
  same way they do under `file://`.
- **After any edit under `src/`, re-run `python build.py`.** The server does not
  rebuild. It can stay running; the user just refreshes.
- `python -m http.server` shows its own plain 404 for missing paths rather than
  the site's `404.html`. GitHub Pages serves the real one, so that difference is
  local-only and not a bug.
- If a page looks unstyled, it is almost always because it was opened as a file
  rather than through `http://localhost:...`.
