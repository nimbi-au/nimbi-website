#!/usr/bin/env python3
"""Render the Nimbi site from src/ into deployable static pages at the repo root.

The site is plain static HTML on GitHub Pages, so the generated output is
committed alongside the sources. Run `python build.py` after editing anything
under src/ and commit both.

Page structure follows the site draft: v0.35 (14 September 2026), brought up to
v0.44 (23 September 2026).
"""
import html
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
ORIGIN = "https://nimbi.com.au"

SECTORS = json.loads((SRC / "data/sectors.json").read_text(encoding="utf-8"))
CHECKLIST = json.loads((SRC / "data/checklist.json").read_text(encoding="utf-8"))
SECTOR_BY_KEY = {s["key"]: s for s in SECTORS}

LAYOUT = (SRC / "layout.html").read_text(encoding="utf-8")

# Header navigation. "Who we help" is a dropdown; the rest are plain links.
NAV_WHO = [
    ("accountants", "Accountants", "/who-we-help/accountants/"),
    ("lawyers", "Lawyers and conveyancers", "/who-we-help/lawyers-and-conveyancers/"),
    ("realestate", "Real estate", "/who-we-help/real-estate/"),
    ("obligations", "Your obligations in practice", "/who-we-help/obligations-in-practice/"),
]
NAV = [
    ("how", "How Nimbi helps", "/how-nimbi-helps/"),
    ("readiness", "Readiness check", "/readiness-check/"),
    ("about", "About", "/about/"),
    ("pricing", "Pricing", "/pricing/"),
]

# The scheduling link behind the contact page's inline booking widget. Change it
# here and both the embed and its fallback link follow. The embed carries
# hide_gdpr_banner so Calendly's own cookie prompt stays out of the page; the
# fallback link opens Calendly proper, where that is Calendly's call to make.
CALENDLY_URL = "https://calendly.com/d/dz6h-mfg-twp/initial-consultation"
CALENDLY_EMBED_URL = CALENDLY_URL + "?hide_gdpr_banner=1"
CALENDLY = ('<script src="https://assets.calendly.com/assets/external/widget.js" '
            "async defer></script>\n")

# Old URLs from the first version of the site. Each gets a small page that sends
# the visitor (and search engines) to its replacement.
REDIRECTS = [
    ("who-we-serve/index.html", "/who-we-help/"),
    ("designated-services/index.html", "/who-we-help/"),
    ("obligations/index.html", "/who-we-help/obligations-in-practice/"),
    ("obligations/accountants/index.html", "/who-we-help/accountants/"),
    ("obligations/lawyers/index.html", "/who-we-help/lawyers-and-conveyancers/"),
    ("obligations/conveyancers/index.html", "/who-we-help/lawyers-and-conveyancers/"),
    ("obligations/real-estate-agents/index.html", "/who-we-help/real-estate/"),
    ("obligations/property-developers/index.html", "/who-we-help/real-estate/"),
    ("obligations/trust-and-company-service-providers/index.html", "/who-we-help/"),
    ("obligations/dealers-in-precious-metals-and-stones/index.html", "/who-we-help/"),
    ("why-nimbi/index.html", "/how-nimbi-helps/#compare"),
]


def esc(s):
    return html.escape(s, quote=True)


def render_nav(active):
    """`active` is a nav key: one of the NAV keys, one of the NAV_WHO keys, or ""."""
    who_keys = [k for k, _, _ in NAV_WHO]
    out = ['   <details class="dd">']
    cls = "link active" if active in who_keys else "link"
    out.append('    <summary class="%s">Who we help</summary>' % cls)
    out.append('    <div class="dd-menu">')
    for key, label, href in NAV_WHO:
        acls = ' class="active" aria-current="page"' if key == active else ""
        out.append('     <a href="%s"%s>%s</a>' % (href, acls, label))
    out.append("    </div>")
    out.append("   </details>")
    for key, label, href in NAV:
        cls = "link active" if key == active else "link"
        cur = ' aria-current="page"' if key == active else ""
        out.append('   <a class="%s" href="%s"%s>%s</a>' % (cls, href, cur, label))
    return "\n".join(out)


ORGANISATION = {
    "@type": "Organization",
    "@id": ORIGIN + "/#organisation",
    "name": "Nimbi AML",
    "legalName": "Nimbi Group Pty Ltd",
    "url": ORIGIN + "/",
    "logo": ORIGIN + "/branding/png/logo-full-white-bg@2000w.png",
    "image": ORIGIN + "/branding/png/logo-full-white-bg@2000w.png",
    "email": "info@nimbi.com.au",
    "telephone": "1300 823 016",
    "identifier": {"@type": "PropertyValue", "propertyID": "ABN", "value": "36 701 758 018"},
    "description": ("AML/CTF risk assessments, programs and implementation (Nimbi Foundations) and "
                    "self-service CDD, KYC and KYB tooling (Nimbi Lens) for Australian accounting, "
                    "legal, conveyancing and real estate practices."),
    "areaServed": {"@type": "Country", "name": "Australia"},
    "knowsAbout": [
        "Anti-Money Laundering and Counter-Terrorism Financing Act 2006",
        "AML/CTF Rules 2025",
        "Tranche 2 reforms",
        "Customer due diligence",
        "AUSTRAC reporting",
    ],
}


def render_jsonld(blocks):
    if not blocks:
        return ""
    graph = {"@context": "https://schema.org", "@graph": blocks}
    return ('<script type="application/ld+json">\n'
            + json.dumps(graph, indent=2, ensure_ascii=False)
            + "\n</script>\n")


def fill(template, values):
    for key, val in values.items():
        template = template.replace("{{%s}}" % key, val)
    return template


def brand(title):
    """Append the brand suffix only when the result still fits a SERP title."""
    suffixed = title + " | Nimbi AML"
    return suffixed if len(suffixed) <= 60 else title


def render_page(out_path, nav_active, title, description, body,
                scripts="", extra_ld=(), ogtype="website", indexable=True, headextra=""):
    if not out_path.endswith("index.html"):
        canonical = ORIGIN + "/" + out_path
    else:
        canonical = ORIGIN + ("/" if out_path == "index.html"
                              else "/" + out_path[: -len("index.html")])
    title = brand(title)
    if len(description) > 160:
        raise SystemExit("%s: description is %d chars (max 160)" % (out_path, len(description)))
    headmeta = ('<link rel="canonical" href="%s">' % canonical if indexable
                else '<meta name="robots" content="noindex, follow">')
    blocks = list(extra_ld)

    page = fill(LAYOUT, {
        "title": esc(title),
        "description": esc(description),
        "ogtitle": esc(title),
        "ogdescription": esc(description),
        "ogtype": ogtype,
        "canonical": canonical,
        "headmeta": headmeta,
        "headextra": headextra,
        "origin": ORIGIN,
        "nav": render_nav(nav_active),
        "body": body,
        "jsonld": render_jsonld(blocks),
        "scripts": scripts,
    })
    left = re.findall(r"\{\{(\w+)\}\}", page)
    if left:
        raise SystemExit("%s: unreplaced placeholders %s" % (out_path, sorted(set(left))))
    target = ROOT / out_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(page, encoding="utf-8")
    return canonical


def page_src(name):
    return (SRC / "pages" / (name + ".html")).read_text(encoding="utf-8")


def print_head(what, path):
    return ("%s. Printed from nimbi.com.au%s - the current version is always the one "
            "published there." % (what, path))


# ---------- the shared "obligations in practice" block ----------
OBLIGATIONS = page_src("_obligations")
# The standalone page cites its sources under the block. Inside a guide the same
# citations are merged into the guide's own sources line instead.
OBLIGATIONS_SOURCES = (
    '\n <p class="ng-sources">Sources: AUSTRAC, '
    '<a href="https://www.austrac.gov.au/amlctf-reform/reforms-guidance/amlctf-program-reform/develop-your-amlctf-program-reform/your-amlctf-program-reform">Your AML/CTF program</a>; '
    '<a href="https://www.austrac.gov.au/amlctf-reform/reforms-guidance/amlctf-program-reform/customer-due-diligence-reform/initial-customer-due-diligence-reform/overview-initial-customer-due-diligence-reform">Overview of initial customer due diligence</a>; '
    '<a href="https://www.austrac.gov.au/amlctf-reform/reforms-guidance/amlctf-program-reform/reporting-austrac-reform">Reporting to AUSTRAC</a>; '
    '<a href="https://www.austrac.gov.au/about-us/legislation/updates-legislation/amlctf-transitional-rules-2026">AML/CTF transitional rules 2026</a>; '
    '<a href="https://www.austrac.gov.au/new-austrac/enrol-us/enrol-us-overview">Enrol with us</a>. '
    'General information, not legal advice. Reviewed 21 September 2026.</p>\n')


def sector_options(selected):
    return "".join('<option value="%s"%s>%s</option>'
                   % (s["key"], " selected" if s["key"] == selected else "", esc(s["label"]))
                   for s in SECTORS)


def render_obligations(sector=None):
    """The five stages. Inside a guide page the sector's notes are baked in; on
    the standalone page a selector switches them and JS swaps the text."""
    if sector is not None:
        s = SECTOR_BY_KEY[sector]
        return fill(OBLIGATIONS, {
            "selectorintro": "",
            "selector": "",
            "reportnote": s["reportnote"],
            "backlink": "",
            "sources": "",
        })
    first = SECTORS[0]
    notes = "".join(
        '<span class="ob-note" data-sector="%s"%s>%s</span>'
        % (s["key"], "" if s is first else " hidden", s["reportnote"]) for s in SECTORS)
    return fill(OBLIGATIONS, {
        "selectorintro": "",
        "selector": ('<label for="ob-sector">Choose your business type</label>'
                     '<select id="ob-sector" class="sel">%s</select>' % sector_options(first["key"])),
        "reportnote": notes,
        "backlink": (' <p><a id="ob-back" href="%s">Back to the %s</a></p>'
                     % (first["guide"], esc(first["guidename"]))),
        "sources": OBLIGATIONS_SOURCES,
    })


# ---------- readiness check ----------
def answer_buttons(n):
    return ('<div class="ans" role="group" aria-label="Question %d">'
            '<button type="button" data-v="y" aria-pressed="false">Yes</button>'
            '<button type="button" data-v="n" aria-pressed="false">No</button>'
            '<button type="button" data-v="u" aria-pressed="false">Not sure</button>'
            "</div>" % n)


def render_scope_sets():
    """Part 1: one question set per sector, all in the HTML. Only the selected
    sector's set is shown; the others carry `hidden` until JS reveals them."""
    out = []
    for i, s in enumerate(SECTORS):
        hidden = "" if i == 0 else " hidden"
        out.append(' <div class="check scope" id="scope-check-%s" data-sector="%s"%s>'
                   % (s["key"], s["key"], hidden))
        for n, (q, why) in enumerate(s["scope"], start=1):
            out.append('  <div class="row" data-n="%d"><div class="q">%s'
                       '<details><summary>Why this matters</summary>%s</details></div>%s</div>'
                       % (n, esc(q), esc(why), answer_buttons(n)))
        out.append(" </div>")
    return "\n".join(out)


def render_scope_notes():
    out = []
    for i, s in enumerate(SECTORS):
        hidden = "" if i == 0 else " hidden"
        out.append(' <p class="small scope-note" data-sector="%s"%s>%s</p>'
                   % (s["key"], hidden, esc(s["scopenote"])))
    return "\n".join(out)


def render_checkrows():
    out = []
    for row in CHECKLIST:
        out.append('  <div class="row" data-area="%s" data-n="%d"><div class="q"><strong>%02d %s</strong> %s</div>%s</div>'
                   % (row["area"], row["n"], row["n"], esc(row["title"]), esc(row["question"]),
                      answer_buttons(row["n"])))
    return "\n".join(out)


# The enquiry forms (proposal on /pricing/, booking on /contact/) share one script,
# which loads Cloudflare Turnstile itself the first time a visitor focuses a form.
FORM_SCRIPTS = '<script src="/assets/forms.js" defer></script>\n'

urls = []

# ---------- home ----------
urls.append(render_page(
    out_path="index.html",
    nav_active="",
    title="Nimbi AML: AML/CTF support for accountants, lawyers and conveyancers, and real estate",
    description=("Industry guides, a quick readiness check, Nimbi Foundations (AML/CTF risk assessments "
                 "and programs) and Nimbi Lens (self-service CDD, KYC and KYB tooling)."),
    body=page_src("home"),
    headextra='<link rel="preload" as="image" href="/assets/hero.webp" type="image/webp">\n',
    extra_ld=[
        ORGANISATION,
        {"@type": "WebSite", "@id": ORIGIN + "/#website", "url": ORIGIN + "/",
         "name": "Nimbi AML", "publisher": {"@id": ORIGIN + "/#organisation"},
         "inLanguage": "en-AU"},
    ],
))

# ---------- who we help: the hub ----------
urls.append(render_page(
    out_path="who-we-help/index.html",
    nav_active="",
    title="Who we help",
    description=("AML/CTF guides for accountants, lawyers and conveyancers, and real estate: when the "
                 "rules apply, your obligations in practice and how Nimbi supports you."),
    body=page_src("who-we-help"),
    extra_ld=[{
        "@type": "ItemList",
        "name": "AML/CTF industry guides",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": s["label"], "url": ORIGIN + s["guide"]}
            for i, s in enumerate(SECTORS, start=1)
        ],
    }],
))

# ---------- the three industry guides ----------
GUIDES = [
    dict(sector="accountants", src="guide-accountants",
         out="who-we-help/accountants/index.html",
         title="AML/CTF for accountants",
         description=("When an accounting practice provides a designated service, your obligations "
                      "in practice, and how Nimbi Foundations and Lens support accountants."),
         printhead=print_head("Nimbi AML guide for accountants", "/who-we-help/accountants/")),
    dict(sector="lawyers", src="guide-lawyers",
         out="who-we-help/lawyers-and-conveyancers/index.html",
         title="AML/CTF for lawyers and conveyancers",
         description=("Which legal and conveyancing work the AML/CTF Act regulates, privilege and "
                      "reporting, the obligations in practice, and how Nimbi supports your practice."),
         printhead=print_head("Nimbi AML guide for lawyers and conveyancers",
                              "/who-we-help/lawyers-and-conveyancers/")),
    dict(sector="realestate", src="guide-real-estate",
         out="who-we-help/real-estate/index.html",
         title="AML/CTF for real estate professionals",
         description=("When agents, buyers' agents and developers provide a designated service, the "
                      "obligations in practice, and how Nimbi Foundations and Lens support agencies."),
         printhead=print_head("Nimbi AML guide for real estate professionals",
                              "/who-we-help/real-estate/")),
]
for g in GUIDES:
    urls.append(render_page(
        out_path=g["out"],
        nav_active=g["sector"],
        title=g["title"],
        description=g["description"],
        body=fill(page_src(g["src"]), {
            "printhead": esc(g["printhead"]),
            "obligations": render_obligations(g["sector"]),
        }),
        ogtype="article",
    ))

# ---------- obligations in practice (standalone, with the sector selector) ----------
urls.append(render_page(
    out_path="who-we-help/obligations-in-practice/index.html",
    nav_active="obligations",
    title="Your obligations in practice",
    description=("The AML/CTF obligations every reporting entity carries, in five practical stages, "
                 "with the notes that differ by sector: accountants, lawyers, real estate."),
    body=fill(page_src("obligations-in-practice"), {
        "printhead": esc(print_head("Nimbi AML: your obligations in practice",
                                    "/who-we-help/obligations-in-practice/")),
        "obligations": render_obligations(None),
    }),
    scripts='<script src="/assets/obligations.js" defer></script>\n',
    ogtype="article",
))

# ---------- readiness check ----------
urls.append(render_page(
    out_path="readiness-check/index.html",
    nav_active="readiness",
    title="Quick readiness check",
    description=("Two parts: whether the AML/CTF Act may apply to your practice, and how ready you are "
                 "against the ten obligation themes. Runs in your browser; nothing is sent."),
    body=fill(page_src("readiness-check"), {
        "sectoroptions": sector_options(SECTORS[0]["key"]),
        "scopesets": render_scope_sets(),
        "scopenotes": render_scope_notes(),
        "scopecount": str(len(SECTORS[0]["scope"])),
        "checkrows": render_checkrows(),
        "checkcount": str(len(CHECKLIST)),
    }),
    scripts='<script src="/assets/readiness.js" defer></script>\n',
))

# ---------- how Nimbi helps ----------
urls.append(render_page(
    out_path="how-nimbi-helps/index.html",
    nav_active="how",
    title="How Nimbi helps",
    description=("Nimbi Foundations prepares your AML/CTF risk assessment and program. Your team uses "
                 "Nimbi Lens for CDD, KYC and KYB checks. Your firm keeps the decisions."),
    body=page_src("how-nimbi-helps"),
    scripts='<script src="/assets/how.js" defer></script>\n',
))

# ---------- pricing ----------
urls.append(render_page(
    out_path="pricing/index.html",
    nav_active="pricing",
    title="Pricing: Foundations + Lens, or Nimbi Comprehensive",
    description=("Foundations + Lens at $159 a month plus $19 per KYC and $45 per KYB check, or Nimbi "
                 "Comprehensive with a dedicated practitioner. Estimate your monthly cost."),
    body=page_src("pricing"),
    scripts=FORM_SCRIPTS,
))

# ---------- about ----------
urls.append(render_page(
    out_path="about/index.html",
    nav_active="about",
    title="About us",
    description=("Nimbi was started to help small and medium-sized businesses make sense of AML/CTF "
                 "compliance and put it into practice, grounded in the legislation."),
    body=page_src("about"),
    extra_ld=[{"@type": "AboutPage", "url": ORIGIN + "/about/",
               "about": {"@id": ORIGIN + "/#organisation"}}],
))

# ---------- contact ----------
urls.append(render_page(
    out_path="contact/index.html",
    nav_active="",
    title="Book a free 30-minute call",
    description=("A free 30-minute scoping call: we map your services, tell you where you're captured "
                 "and give you a clear next step. Book a time or request a call back."),
    body=fill(page_src("contact"), {"calendlyurl": esc(CALENDLY_URL),
                                    "calendlyembed": esc(CALENDLY_EMBED_URL)}),
    scripts=FORM_SCRIPTS + CALENDLY,
    extra_ld=[{"@type": "ContactPage", "url": ORIGIN + "/contact/",
               "about": {"@id": ORIGIN + "/#organisation"}}],
))

# ---------- privacy policy ----------
# Also the APP 5 collection notice for people Nimbi verifies on a client's behalf,
# so clients can link straight to it from their own onboarding.
urls.append(render_page(
    out_path="privacy/index.html",
    nav_active="",
    title="Privacy Policy and Collection Notice",
    description=("How Nimbi collects, uses, discloses and protects personal information, including "
                 "information handled when we verify identities on behalf of our clients."),
    body=page_src("privacy"),
))

# ---------- 404 ----------
render_page(
    out_path="404.html",
    nav_active="",
    title="Page not found",
    description="The page you were looking for is not here.",
    indexable=False,
    body="""<section><div class="wrap">
 <h1>We couldn't find that page.</h1>
 <p class="lede">The link may be out of date. Start from the sections below, or get in touch and we'll point you to the right place.</p>
 <p><a class="btn primary" href="/">Go to the home page</a> <a class="btn outline dark" href="/who-we-help/">Find your industry guide</a></p>
</div></section>""",
)

# ---------- redirects from the old URLs ----------
REDIRECT_PAGE = """<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Redirecting to nimbi.com.au</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="{target}">
<meta http-equiv="refresh" content="0; url={path}">
<script>location.replace("{path}");</script>
</head>
<body>
<p>This page has moved. <a href="{path}">Continue to {target}</a>.</p>
</body>
</html>
"""
for out_path, path in REDIRECTS:
    target = ORIGIN + path
    stub = ROOT / out_path
    stub.parent.mkdir(parents=True, exist_ok=True)
    stub.write_text(REDIRECT_PAGE.format(path=path, target=target), encoding="utf-8")

# ---------- sitemap + robots ----------
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for url in urls:
    sitemap.append("  <url><loc>%s</loc></url>" % url)
sitemap.append("</urlset>")
(ROOT / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

# ---------- root favicon ----------
# The <link rel="icon"> tags point at branding/, but crawlers and feed readers
# still probe /favicon.ico, so keep a copy of the icon at the root.
shutil.copyfile(ROOT / "branding/png/icons/favicon.ico", ROOT / "favicon.ico")

(ROOT / "robots.txt").write_text(
    "User-agent: *\n"
    "Allow: /\n"
    "# Page sources and the generator are not pages.\n"
    "Disallow: /src/\n"
    "Disallow: /worker/\n"
    "\nSitemap: %s/sitemap.xml\n" % ORIGIN, encoding="utf-8")

print("built %d pages + 404, %d redirects, sitemap.xml, robots.txt, favicon.ico"
      % (len(urls), len(REDIRECTS)))
for u in urls:
    print("  ", u)
