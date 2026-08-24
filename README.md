# Nimbi Website

Prototype marketing site for **Nimbi** — AML/CTF compliance for newly regulated entities.

The whole site is a single self-contained file, [`index.html`](index.html): HTML, CSS and JS inline, no build step and no dependencies.

## Local preview

Open `index.html` in a browser, or serve the folder:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

## Deployment

Published with GitHub Pages from the `main` branch (root). Any push to `main` redeploys.
