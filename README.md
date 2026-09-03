# Nimbi Website

Marketing site for **Nimbi** — AML/CTF compliance for newly regulated entities.

Live site: <https://nimbi-au.github.io/nimbi-website/>

The site is fourteen pages generated from the sources in [`src/`](src/). You edit a
file in `src/`, run `python build.py` to regenerate the pages, save your changes, and
press deploy. Python 3 is the only thing you need installed, and nothing has to be
downloaded from the internet.

**You do not need to know how to code to edit this site.** Everything below can be
done by asking Claude in plain English. If you are a developer, skip to
[For developers](#for-developers).

---

## How this works, in 30 seconds

There are three separate steps, and nothing happens automatically:

1. **Edit** — change the wording, prices, images, etc. in the matching file in `src/`.
2. **Build** — run `python build.py` to regenerate the pages.
3. **Commit & push** — save your change to GitHub, the shared copy of the site.
4. **Deploy** — publish it to the live website.

Editing and pushing does **not** change the live site. The live site only changes
when someone deploys. That is deliberate — it means you can make changes safely and
publish them when you're ready.

---

## Step 1 — One-time setup

Do this once, on each computer you want to edit from.

**What you need first:**

- A GitHub account that has been added to the `nimbi-au` organisation.
  (Ask whoever runs the GitHub account to invite you, and accept the email invite.)
- Claude Desktop, installed and signed in.

**Then:**

1. Open Claude Desktop.
2. Start a new Claude Code session. Point it at any folder where you'd like the
   website files to live — your Documents folder is fine.
3. Copy and paste this message to Claude:

> Please initialise the Nimbi website repo on this computer. Follow the "Setup
> instructions for Claude" section of the README at
> https://github.com/nimbi-au/nimbi-website step by step. If you can't open that
> link, install Git and the GitHub CLI, sign me in to GitHub, and clone
> nimbi-au/nimbi-website. I am not technical — check things for me, install what's
> missing, and tell me exactly what to click if you need me to do something.

Claude will check what's already installed, install or walk you through anything
missing, sign you in to GitHub, and download the site onto your computer. It will
ask you a couple of questions along the way — plain-English answers are fine.

When Claude says setup is done, you're ready to edit.

---

## Step 2 — Making an edit

Ask Claude for what you want in ordinary words. Some examples:

> Change the headline on the homepage to "AML compliance without the consultants".

> The pricing section says $499/month. Make it $599/month everywhere it appears.

> Add a fourth item to the FAQ: "Do you support crypto exchanges?" with a short yes,
> we do answer.

> The comparison table is squashed on mobile. Can you fix that?

**Always ask to see it before publishing:**

> Show me what it looks like now.

Claude can open the page in your browser so you can check it. Nothing you have done
so far is visible to the public — you are only changing the copy on your own
computer.

**When you're happy, save it to GitHub:**

> That looks good. Commit this to main and push it.

Claude will write a short description of the change, save it, and upload it to
GitHub. The live site still hasn't changed at this point.

---

## Step 3 — Deploying (publishing to the live site)

When you want the public to see your changes:

> Please deploy the site.

Claude runs the deploy for you and can tell you when it has finished. It takes
about a minute. Then check <https://nimbi-au.github.io/nimbi-website/> — you may
need to refresh the page (Ctrl+F5 on Windows, Cmd+Shift+R on Mac) to see the new
version.

**Prefer to press the button yourself?** Go to the repo on GitHub → the **Actions**
tab → **Deploy to GitHub Pages** in the left sidebar → the grey **Run workflow**
button → **Run workflow**.

---

## If something goes wrong

Just say so. Claude can undo things.

> The live site looks broken. Please put it back to how it was before my last change
> and deploy that.

> I don't like the change I just made. Undo it.

Every change is saved with its history, so nothing is ever permanently lost. If you
are unsure, ask Claude "what did I change?" before you deploy.

---

## Words you'll see

| Word | What it means |
| --- | --- |
| **repo** (repository) | The folder holding the website and its full history. |
| **commit** | One saved change, with a note describing it. |
| **push** | Upload your saved changes to GitHub. |
| **main** | The main version of the site that everyone shares. |
| **deploy** | Publish to the live public website. |
| **GitHub** | Where the shared copy of the site lives online. |
| **GitHub Pages** | The service that hosts the live website. |

---

## Setup instructions for Claude

*This section is for Claude, not for you. Claude follows it when asked to
initialise the repo.*

The user is likely non-technical. Do not assume any tool is installed, do not ask
them to run terminal commands themselves, and explain each step in one plain
sentence before doing it. Run the commands yourself.

1. **Check Git.** Run `git --version`. If missing, install it (`winget install
   --id Git.Git -e` on Windows, `brew install git` on macOS) or send them to
   <https://git-scm.com/downloads> with instructions to accept every default.
2. **Check the GitHub CLI.** Run `gh --version`. If missing, install it (`winget
   install --id GitHub.cli -e` on Windows, `brew install gh` on macOS).
3. **Sign in to GitHub.** Run `gh auth status`. If not authenticated, run
   `gh auth login` with the HTTPS + browser flow, and read the one-time code out to
   the user along with what to click. Confirm afterwards with `gh auth status`.
4. **Set the commit identity** if `git config --global user.name` or `user.email`
   is empty — ask the user for their name and the email on their GitHub account.
5. **Confirm the location.** Tell the user where you're about to put the folder and
   get a yes before cloning.
6. **Clone.** `gh repo clone nimbi-au/nimbi-website` (or
   `git clone https://github.com/nimbi-au/nimbi-website.git`). If a copy already
   exists, use it and run `git pull` instead of cloning again.
7. **Verify.** `git -C nimbi-website status` should be clean and on `main`, and
   `index.html` and `build.py` should be present. Run `python -m http.server 8000`
   and open <http://localhost:8000> in their browser so they can see the site
   render — opening `index.html` directly will not work, because pages link to
   each other by absolute path.
8. **Confirm deploy access.** `gh workflow list --repo nimbi-au/nimbi-website`
   should show "Deploy to GitHub Pages". If it errors, their GitHub account
   probably lacks access to the org — tell them who to ask.
9. **Hand over.** Summarise in three lines: they ask for edits in plain English, ask
   you to commit and push when happy, and ask you to deploy when they want it live.

**Ongoing rules for this repo:**

- Commit directly to `main` — no branches or pull requests unless the user asks.
- Always show the user the change (open the page in a browser) before committing.
- Push after committing unless told otherwise.
- Never deploy unless the user explicitly asks. Pushing to `main` does not publish.
- Deploy with `gh workflow run deploy.yml --repo nimbi-au/nimbi-website`, then
  report the result from `gh run list --workflow deploy.yml --limit 1`.
- To roll back, revert the offending commit, push, and deploy again — do not force
  push or rewrite history.

---

## Branding

Every logo, icon, colour and font on the site comes from the brand pack in
[`branding/`](branding/) — see [branding/README.md](branding/README.md) for the
palette and usage rules. Don't recreate the logo or invent new colours.

| Where | File |
|---|---|
| Header logo | `branding/svg/logo/logo-full-colour.svg` |
| Footer logo (on navy) | `branding/svg/logo/logo-full-mono-white.svg` |
| Favicon / app icon | `branding/png/icons/favicon.ico`, `branding/svg/icon/icon-full-colour.svg`, `branding/png/icons/icon-full-colour-180.png` |
| Social preview image | `branding/png/logo-full-white-bg@2000w.png` |
| Headings typeface | `branding/font/Bitter-ExtraBold.ttf` |

The colours live in one place — the `:root` block at the top of `assets/site.css`:

| Variable | Hex | Used for |
|---|---|---|
| `--primary` | #2E2A72 | Headings, footer, dark sections |
| `--accent` | #3D4DFF | Links, buttons, active nav, eyebrows |
| `--teal` | #4FBDB1 | Decorative fills only — too light behind text |
| `--grad` | #4FBDB1 → #3D4DFF | The logo gradient: nav rule, accent bars |
| `--tint` | #F3F4F6 | Alternating section backgrounds |
| `--ink` | #222222 | Charcoal |

## For developers

Static multi-page site generated by [`build.py`](build.py) (Python 3 stdlib only,
no dependencies). Generated output is committed, so the deploy workflow just
uploads the repo root.

```
src/layout.html        page shell: <head>, nav, footer
src/pages/*.html       one fragment per page; _sector.html is the per-sector template
src/data/*.json        sector, checklist and comparison content
assets/site.css        all styles
assets/site.js         contact forms (home + about)
assets/readiness.js    readiness check interactivity
assets/comparison.js   comparison table expand/tooltip
build.py               renders everything, plus sitemap.xml and robots.txt
```

Rebuild after any change under `src/` or you will publish stale pages:

```bash
python build.py
```

`build.py` fails the build on an unreplaced `{{placeholder}}` or a meta
description over 160 characters.

Content that a search engine needs to see is rendered into the HTML at build
time — the per-sector obligations, the readiness questions and the comparison
detail rows. JavaScript only enhances what is already there; do not move that
content back into JS.

Local preview:

```bash
python -m http.server 8000
# then visit http://localhost:8000
```

Deploys are **manual** — merging to `main` publishes nothing. The
[deploy workflow](.github/workflows/deploy.yml) is `workflow_dispatch` only:

```bash
gh workflow run deploy.yml            # deploys main
gh workflow run deploy.yml -f ref=my-branch   # optional ref input
```
