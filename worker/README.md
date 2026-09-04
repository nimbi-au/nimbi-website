# Nimbi contact-form Worker

The website is static and hosted on GitHub Pages, so it cannot send email by
itself. This Cloudflare Worker receives the enquiry, checks it, and sends it to
`info@nimbi.com.au` through Cloudflare Email Service. Nothing is stored — the
Worker validates the request, sends the mail, and forgets it. No third-party
form service ever holds the enquiry.

```
Visitor's browser  →  Worker (Cloudflare)  →  Cloudflare Email Service  →  info@nimbi.com.au
```

## Setup order

The steps depend on each other. Do them in this order.

1. Move DNS to Cloudflare (below) — required, Email Service will not work without it
2. Onboard the domain to Email Service and verify `info@nimbi.com.au`
3. Create Turnstile keys
4. Deploy the Worker
5. Paste the Worker URL and Turnstile site key into `index.html`

Until step 5 the site keeps working exactly as it does today: with
`ENQUIRY_ENDPOINT` empty, the form falls back to opening the visitor's email app.
Nothing breaks halfway through.

---

## Step 1 — Move DNS from GoDaddy to Cloudflare

**This is the step that can break your email.** `nimbi.com.au` currently runs on
GoDaddy nameservers (`ns15/ns16.domaincontrol.com`) and your mail is Microsoft
365. When the nameservers change, every record has to already exist in
Cloudflare or mail stops flowing.

Records live on 2026-08-30, captured before any change:

| Type  | Name                     | Value                                          |
|-------|--------------------------|------------------------------------------------|
| A     | `@`                      | `76.223.105.230`                               |
| A     | `@`                      | `13.248.243.5`                                 |
| CNAME | `www`                    | `nimbi.com.au`                                 |
| MX    | `@`                      | `nimbi-com-au.mail.protection.outlook.com` (priority 0) |
| TXT   | `@`                      | `v=spf1 include:spf.protection.outlook.com -all` |
| CNAME | `autodiscover`           | `autodiscover.outlook.com`                     |
| CNAME | `enterpriseregistration` | `enterpriseregistration.windows.net`           |
| CNAME | `enterpriseenrollment`   | `enterpriseenrollment-s.manage.microsoft.com`  |

No DMARC record, no DKIM selectors, no `lyncdiscover`/`sip` records exist today.

**The three that carry your mail are `MX`, the SPF `TXT`, and `autodiscover`.**
If those are right, mail keeps working.

Procedure:

1. In GoDaddy, export or screenshot the full DNS zone. The table above is a
   safety net, not a substitute — it only lists records that answer public
   queries, so check GoDaddy for anything extra.
2. Add the domain in Cloudflare. Cloudflare scans and imports what it finds.
3. **Before changing nameservers**, compare Cloudflare's imported list against
   the table above and your GoDaddy export. Add anything missing by hand.
4. Set the two `A` records and the `www` `CNAME` to *DNS only* (grey cloud), not
   proxied. Proxying is for web traffic and can interfere with domain
   verification.
5. Only once the list matches, change the nameservers at GoDaddy to the pair
   Cloudflare gives you.
6. Propagation is usually 5–15 minutes. Send a test email to a Nimbi address and
   reply to it from outside before considering this done.

### If you are also pointing nimbi.com.au at GitHub Pages

A `CNAME` file containing `nimbi.com.au` now exists in the repo, so the apex is
being pointed at GitHub Pages. That changes the DNS plan: the two `A` records in
the table above point at GoDaddy parking, not GitHub, and must be **replaced**
(not copied across) with GitHub's Pages addresses:

| Type  | Name  | Value |
|-------|-------|-------|
| A     | `@`   | `185.199.108.153` |
| A     | `@`   | `185.199.109.153` |
| A     | `@`   | `185.199.110.153` |
| A     | `@`   | `185.199.111.153` |
| CNAME | `www` | `nimbi-au.github.io` |

Confirm these against GitHub's current published Pages IPs before entering them,
and keep them *DNS only* (grey cloud) in Cloudflare so GitHub can issue the TLS
certificate. This does not affect mail — `MX`, SPF and `autodiscover` are
untouched by it.

Worth doing while you are in there: you have **no DKIM and no DMARC**. That hurts
deliverability and lets others spoof your domain. Add DKIM from the Microsoft 365
admin centre and a starting DMARC record (`v=DMARC1; p=none; rua=mailto:...`).
Separate from this task, but this is the natural moment.

## Step 2 — Email Service

1. Cloudflare dashboard → **Email Service** → onboard `nimbi.com.au`. It adds
   DKIM/SPF/bounce records on a `cf-bounce` subdomain automatically.
2. Add `info@nimbi.com.au` as a **verified destination address** and click the
   confirmation link that arrives.

Verification matters for cost: sends to a verified destination are **free and
exempt from quota on every plan**, so this form costs nothing and needs no
Workers Paid plan.

## Step 3 — Turnstile

Cloudflare dashboard → **Turnstile** → add a widget for `nimbi.com.au`. Also add
`nimbi-au.github.io` if you want the form to work on the Pages preview URL. Keep
both keys — the **site key** is public and goes in `index.html`, the **secret
key** goes into the Worker.

## Step 4 — Deploy

Either from your machine:

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put TURNSTILE_SECRET   # paste the Turnstile secret key
npx wrangler deploy
```

Or without installing anything, via GitHub Actions: add repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, then run the
**Deploy contact Worker** workflow from the Actions tab. Note the secret still
has to be set once with `wrangler secret put` (or in the dashboard under the
Worker's Settings → Variables).

Deploying prints a URL like `https://nimbi-contact.<your-subdomain>.workers.dev`.

## Step 5 — Point the site at the Worker

In `index.html`, near the `/* ---------- contact forms ---------- */` comment:

```js
const ENQUIRY_ENDPOINT = "https://nimbi-contact.<your-subdomain>.workers.dev";
const TURNSTILE_SITEKEY = "0x4AAAAAAA...";
```

Then run the **Deploy to GitHub Pages** workflow to publish.

---

## Configuration

`wrangler.jsonc` holds the non-secret settings:

| Var | Meaning |
|-----|---------|
| `TO_ADDRESS` | Where enquiries go. Must be a verified destination. |
| `FROM_ADDRESS` | Sender. Must be on a domain onboarded to Email Service. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to post. Anything else is refused. |

`TURNSTILE_SECRET` is a secret, never in this file. **If it is not set, the
Turnstile check is skipped** — deliberate, so the form works before the keys
exist, but it means an unset secret silently removes your spam protection.

The `send_email` binding pins `destination_address`, so this Worker can only ever
send to that one address regardless of what a request asks for.

## Protections

- **Turnstile** — bot check, once keys are set
- **Honeypot** — a hidden field real visitors never fill; a filled one gets a fake
  success so the bot does not retry
- **Origin allowlist** — only the Nimbi origins may post
- **Server-side validation** — the Worker re-checks every field; browser checks
  are only a convenience
- **Size cap** — requests over 32 KB are refused
- **Header-injection guard** — newlines are stripped from values used in headers

Rate limiting is *not* included. Turnstile handles the realistic case; if you
later see abuse, add Cloudflare's rate-limiting binding.

## Troubleshooting

`npx wrangler tail` streams live logs from the deployed Worker.

| Symptom | Likely cause |
|---------|--------------|
| "We could not send your enquiry" | Check `wrangler tail`. Usually `E_SENDER_NOT_VERIFIED` — `FROM_ADDRESS` is not on the onboarded domain. |
| Browser console CORS error | The site's origin is missing from `ALLOWED_ORIGINS`. |
| "Please complete the verification check" | Site key missing/wrong in `index.html`, or the widget did not load. |
| Form opens the email app instead of sending | `ENQUIRY_ENDPOINT` is still empty. |
