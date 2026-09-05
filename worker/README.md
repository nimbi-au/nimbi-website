# Nimbi contact-form Worker

The website is static and hosted on GitHub Pages, so it cannot send email by
itself. This Cloudflare Worker receives the enquiry, checks it, and sends it to
`dean@nimbi.com.au` through the Microsoft Graph API, using Nimbi's own Microsoft
365 tenant. Nothing is stored — the Worker validates the request, sends the mail,
and forgets it. No third-party form service ever holds the enquiry.

```
Visitor's browser  →  Worker (Cloudflare)  →  Microsoft Graph  →  dean@nimbi.com.au
                                                (sends as dean@nimbi.com.au)
```

Cloudflare Email Service was the original plan. Its free tier only sends to
verified destination addresses, and reaching that path means enabling Email
Routing on the zone, which puts Cloudflare in charge of the domain's MX records —
unacceptable when those MX records carry the firm's Microsoft 365 mail. Graph
avoids the question entirely: no new vendor, no DNS changes, no extra cost.

## Setup order

1. Move DNS to Cloudflare — **done 2026-09-04**
2. Register an Entra app, then grant it scoped `Mail.Send` in Exchange Online
3. Create Turnstile keys
4. Deploy the Worker
5. Paste the Worker URL and Turnstile site key into `assets/site.js`

Until step 5 the site keeps working as it does today: with `ENQUIRY_ENDPOINT`
empty, the form falls back to opening the visitor's email app. Nothing breaks
halfway through.

---

## Step 1 — DNS (complete)

`nimbi.com.au` moved from GoDaddy to Cloudflare on 2026-09-04. Nameservers are
`josh.ns.cloudflare.com` / `rita.ns.cloudflare.com`. The GoDaddy zone was left in
place as a rollback.

The zone as verified after cutover:

| Type  | Name                     | Value                                                        |
|-------|--------------------------|--------------------------------------------------------------|
| A     | `@`                      | `185.199.108.153`, `.109`, `.110`, `.111` (GitHub Pages)      |
| CNAME | `www`                    | `nimbi-au.github.io`                                          |
| MX    | `@`                      | `nimbi-com-au.mail.protection.outlook.com` (priority 0)       |
| TXT   | `@`                      | `v=spf1 include:spf.protection.outlook.com -all`              |
| TXT   | `@`                      | `google-site-verification=KKentYZxDEkOYYzZfMLIKmHjUT2hhIcPzcjA6T2t2jA` |
| TXT   | `_dmarc`                 | `v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=…`              |
| CNAME | `selector1._domainkey`   | M365 DKIM (added 2026-09-04)                                  |
| CNAME | `selector2._domainkey`   | M365 DKIM (added 2026-09-04)                                  |
| CNAME | `autodiscover`           | `autodiscover.outlook.com`                                    |
| CNAME | `enterpriseregistration` | `enterpriseregistration.windows.net`                          |
| CNAME | `enterpriseenrollment`   | `enterpriseenrollment-s.manage.microsoft.com`                 |

**Every A and CNAME above must stay *DNS only* (grey cloud).** Proxying the apex
or `www` breaks GitHub Pages certificate renewal; proxying the Microsoft records
breaks Outlook autodiscover and device enrolment.

Outstanding: the DMARC `rua` still points at `dmarc_rua@onsecureserver.net`,
GoDaddy's aggregate collector. Those reports no longer reach anyone here. Repoint
it at a mailbox Nimbi controls.

## Step 2 — Entra app registration

The Worker authenticates as an application (client credentials) and sends as one
mailbox.

1. [Entra portal](https://entra.microsoft.com) → **Applications → App registrations
   → New registration**. Name it something like `nimbi-contact-worker`. Single
   tenant. No redirect URI — this app never signs a user in.
2. From the **Overview** page, copy the **Application (client) ID** and the
   **Directory (tenant) ID** into `GRAPH_CLIENT_ID` and `GRAPH_TENANT_ID` in
   `wrangler.jsonc`. Neither is a credential.
3. **Certificates & secrets → New client secret.** Copy the *value* immediately;
   it is never shown again. Note the expiry and diarise the rotation.

Do **not** grant `Mail.Send` under **API permissions** in Entra. That grant is
tenant-wide and cannot be scoped — the permission is granted in Exchange instead,
against a single mailbox. See below.

### Scope the app to one mailbox

`Mail.Send` granted in Entra means send-as **any** mailbox in the tenant,
including the principals'. Grant it in Exchange Online instead, scoped to the
single mailbox this Worker sends as (`SENDER_MAILBOX`). This is RBAC for Applications; it replaces the older
`New-ApplicationAccessPolicy`, which Microsoft says should not be used for new
configurations.

```powershell
Install-Module -Name ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline -UserPrincipalName you@nimbi.com.au

# Both IDs come from Enterprise applications, NOT App registrations —
# that page shows different values.
New-ServicePrincipal -AppId <application-id> -ObjectId <object-id> `
  -DisplayName "nimbi-contact-worker"

New-ManagementScope -Name "ContactFormMailbox" `
  -RecipientRestrictionFilter "PrimarySmtpAddress -eq 'dean@nimbi.com.au'"

New-ManagementRoleAssignment -App <object-id> `
  -Role "Application Mail.Send" -CustomResourceScope "ContactFormMailbox"

# InScope should be True for dean@, False for any other mailbox.
Test-ServicePrincipalAuthorization -Identity "nimbi-contact-worker" `
  -Resource dean@nimbi.com.au | Format-Table

Disconnect-ExchangeOnline
```

**If `Mail.Send` was ever consented in Entra, remove it.** Exchange RBAC and Entra
consent are independent authorities and the effective permission is their
*union*, not their intersection — an unscoped Entra grant alongside a scoped RBAC
grant leaves the app unscoped. Confirm the RBAC assignment tests `InScope: True`
before removing the Entra consent, so the app is never left with neither.

Permission changes are cached for 30 minutes to 2 hours depending on how recently
the app called Graph. `Test-ServicePrincipalAuthorization` bypasses that cache, so
trust it over a live send when the two disagree.

Skipping all of this leaves a client secret in a Worker that can send as anyone in
the tenant.

`SENDER_MAILBOX` must be a real, licensed mailbox in the tenant — not an alias —
because the RBAC scope filter matches on `PrimarySmtpAddress`. It is
`dean@nimbi.com.au`, and `TO_ADDRESS` is the same mailbox — the Worker sends as
dean@ to dean@. The visitor's own address goes in `replyTo`, so replying from
Outlook reaches them rather than looping back. Note that `info@nimbi.com.au`,
the address published on the site, is an alias on this same mailbox, so both
routes land in the same inbox.

## Step 3 — Turnstile

Cloudflare dashboard → **Turnstile** → add a widget for `nimbi.com.au`. Add
`www.nimbi.com.au` and `nimbi-au.github.io` too, so the hostnames match
`ALLOWED_ORIGINS`. Keep both keys — the **site key** is public and goes in
`assets/site.js`, the **secret key** goes into the Worker.

## Step 4 — Deploy

From your machine:

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put GRAPH_CLIENT_SECRET   # the Entra client secret value
npx wrangler secret put TURNSTILE_SECRET      # the Turnstile secret key
npx wrangler deploy
```

Or via GitHub Actions: add repository secrets `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`, then run the **Deploy contact Worker** workflow from the
Actions tab. The two Worker secrets above still have to be set once with
`wrangler secret put`, or in the dashboard under the Worker's Settings → Variables.

Deploying prints a URL like `https://nimbi-contact.<your-subdomain>.workers.dev`.

## Step 5 — Point the site at the Worker

In `assets/site.js`, near the top:

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
| `TO_ADDRESS` | Where enquiries are delivered. |
| `SENDER_MAILBOX` | The mailbox Graph sends as. Must be a real licensed mailbox, and must be inside the Exchange RBAC management scope. |
| `GRAPH_TENANT_ID` | Directory (tenant) ID from the app registration. |
| `GRAPH_CLIENT_ID` | Application (client) ID from the app registration. |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to post. Anything else is refused. |

Two secrets, never in this file:

- `GRAPH_CLIENT_SECRET` — **required.** Without it no mail sends at all.
- `TURNSTILE_SECRET` — **if unset, the Turnstile check is skipped.** Deliberate,
  so the form works before the keys exist, but an unset secret silently removes
  spam protection.

The access token is cached in isolate memory and refreshed a minute before
expiry, so a burst of enquiries costs one token request rather than one each. A
401 triggers exactly one forced refresh and retry, which distinguishes a rotated
secret from a genuine authorisation failure.

## Protections

- **Turnstile** — bot check, once keys are set
- **Honeypot** — a hidden field real visitors never fill; a filled one gets a fake
  success so the bot does not retry
- **Origin allowlist** — only the Nimbi origins may post
- **Server-side validation** — the Worker re-checks every field; browser checks
  are only a convenience
- **Size cap** — requests over 32 KB are refused
- **Header-injection guard** — newlines are stripped from values used in headers
- **Exchange RBAC scope** — limits the app to one mailbox (Step 2)

Rate limiting is *not* included. Turnstile handles the realistic case; if you
later see abuse, add Cloudflare's rate-limiting binding.

## Troubleshooting

`npx wrangler tail` streams live logs from the deployed Worker.

| Symptom | Likely cause |
|---------|--------------|
| "We could not send your enquiry" | Check `wrangler tail`. The logged message carries the Graph status and body. |
| `token request failed: 401` | Wrong or expired `GRAPH_CLIENT_SECRET`, or wrong `GRAPH_TENANT_ID`/`GRAPH_CLIENT_ID`. |
| `sendMail failed: 403` | The Exchange RBAC role assignment is missing or its scope excludes `SENDER_MAILBOX`. Check `Test-ServicePrincipalAuthorization`. |
| `sendMail failed: 404` | `SENDER_MAILBOX` is not a real mailbox in the tenant (an alias or distribution list will 404). |
| Browser console CORS error | The site's origin is missing from `ALLOWED_ORIGINS`. |
| "Please complete the verification check" | Site key missing/wrong in `assets/site.js`, or the widget did not load. |
| Form opens the email app instead of sending | `ENQUIRY_ENDPOINT` is still empty. |
