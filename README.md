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

Deploys are **manual**. Merging to `main` does not publish anything — the live
site only changes when someone runs the deploy workflow.

To deploy:

- **GitHub UI** — Actions tab -> "Deploy to GitHub Pages" -> *Run workflow*
- **CLI** — `gh workflow run deploy.yml`

By default it publishes `main`; the workflow takes an optional `ref` input if you
need to deploy another branch, tag or SHA.

Live site: <https://nimbi-au.github.io/nimbi-website/>
