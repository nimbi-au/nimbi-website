#!/usr/bin/env python3
"""Render the Nimbi site from src/ into deployable static pages at the repo root.

The site is plain static HTML on GitHub Pages, so the generated output is
committed alongside the sources. Run `python build.py` after editing anything
under src/ and commit both.

Page structure follows the site draft: v0.35 (14 September 2026), v0.44
(23 September 2026), and Concept C / v0.45 (4 October 2026), which reduced the
site to eight pages: home, pricing, three industry guides, the readiness check,
contact and the privacy policy.
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
READINESS = json.loads((SRC / "data/readiness.json").read_text(encoding="utf-8"))["readiness"]

LAYOUT = (SRC / "layout.html").read_text(encoding="utf-8")

# The scheduling link behind the contact page's inline booking widget. Change it
# here and both the embed and its fallback link follow. The embed carries
# hide_gdpr_banner so Calendly's own cookie prompt stays out of the page; the
# fallback link opens Calendly proper, where that is Calendly's call to make.
CALENDLY_URL = "https://calendly.com/dean-nimbi/30min"
CALENDLY_EMBED_URL = CALENDLY_URL + "?hide_gdpr_banner=1"
CALENDLY = ('<script src="https://assets.calendly.com/assets/external/widget.js" '
            "async defer></script>\n")

# Old URLs from earlier versions of the site. Each gets a small page that sends
# the visitor (and search engines) to its replacement.
REDIRECTS = [
    ("who-we-serve/index.html", "/#industries"),
    ("designated-services/index.html", "/#industries"),
    ("who-we-help/index.html", "/#industries"),
    ("who-we-help/obligations-in-practice/index.html", "/readiness-check/"),
    ("obligations/index.html", "/readiness-check/"),
    ("obligations/accountants/index.html", "/who-we-help/accountants/"),
    ("obligations/lawyers/index.html", "/who-we-help/lawyers-and-conveyancers/"),
    ("obligations/conveyancers/index.html", "/who-we-help/lawyers-and-conveyancers/"),
    ("obligations/real-estate-agents/index.html", "/who-we-help/real-estate/"),
    ("obligations/property-developers/index.html", "/who-we-help/real-estate/"),
    ("obligations/trust-and-company-service-providers/index.html", "/#industries"),
    ("obligations/dealers-in-precious-metals-and-stones/index.html", "/#industries"),
    ("why-nimbi/index.html", "/#why-nimbi-summary"),
    ("how-nimbi-helps/index.html", "/#how-it-works"),
    ("about/index.html", "/#why-nimbi-summary"),
]


def esc(s):
    return html.escape(s, quote=True)


# ---------- header navigation ----------
# Concept C's header: "How it works" (an anchor on the home page), a "Who we help"
# dropdown with the three industry guides, "Pricing", and the proposal button
# that only shows inside the small-screen menu. `active` is a page key.
def render_nav(active):
    industry = [s["key"] for s in SECTORS]

    def current(key):
        return ' aria-current="page"' if key == active else ""

    out = ['<nav id="main-nav" class="desktop-nav" aria-label="Main navigation">']
    out.append('<a class="nav-link" href="/#how-it-works">How it works</a>')
    out.append('<div class="nav-group"><button class="nav-toggle" aria-expanded="false" '
               'aria-controls="industry-menu" data-nav-group="industry" data-active="%s">'
               'Who we help <span class="chevron" aria-hidden="true">⌄</span></button>'
               '<div class="nav-menu" id="industry-menu" hidden>'
               % ("true" if active in industry else "false"))
    for s in SECTORS:
        out.append('<a href="%s"%s>%s</a>' % (s["guide"], current(s["key"]), esc(s["name"])))
    out.append("</div></div>")
    out.append('<a class="nav-link" href="/pricing/"%s>Pricing</a>' % current("pricing"))
    out.append('<a class="btn mobile-proposal" href="/contact/#proposal">Get a proposal '
               '<span aria-hidden="true">↗</span></a>')
    out.append("</nav>")
    return "".join(out)


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
    "description": ("A practical AML/CTF framework (Nimbi Foundations), a customer due diligence "
                    "platform (Nimbi Lens) and practitioner support for Australian accounting, "
                    "legal, conveyancing and real estate businesses."),
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


# ---------- readiness check ----------
# Every question is rendered into the HTML so search engines (and anyone without
# JavaScript) can read them; assets/readiness.js only shows, hides and scores.
SCOPE_OPTIONS = [("yes", "Yes"), ("no", "No"), ("unsure", "Not sure")]
READY_OPTIONS = [("ready", "In place"), ("work", "Needs work"), ("unsure", "Not sure")]


def answer_options(kind, name, index):
    options = SCOPE_OPTIONS if kind == "scope" else READY_OPTIONS
    return '<div class="answers">' + "".join(
        '<label class="answer-option"><input type="radio" name="%s-%d" data-kind="%s" '
        'data-index="%d" value="%s">%s</label>' % (name, index, kind, index, value, label)
        for value, label in options) + "</div>"


def question_fieldset(kind, index, legend, note, name, hidden=False):
    return ('<fieldset class="check-question" data-kind="%s" data-index="%d"%s>'
            "<legend>%s</legend>%s%s</fieldset>"
            % (kind, index, " hidden" if hidden else "", esc(legend),
               '<p class="q-note">%s</p>' % esc(note) if note else "",
               answer_options(kind, name, index)))


def sector_options():
    return '<option value="">Please select</option>' + "".join(
        '<option value="%s">%s</option>' % (s["key"], esc(s["label"])) for s in SECTORS)


def render_scope_sets():
    """Part 1: one question set per sector, all in the HTML; JS reveals the chosen one."""
    out = []
    for s in SECTORS:
        out.append('<div class="scope-set" id="scope-check-%s" data-sector="%s" hidden>'
                   % (s["key"], s["key"]))
        for i, q in enumerate(s["scope"]):
            out.append(question_fieldset("scope", i, q["question"], q.get("note", ""),
                                         "scope-" + s["key"]))
        out.append("</div>")
    return "\n".join(out)


def render_checkrows():
    """Part 2: the eleven arrangement questions, shown one at a time by JS."""
    return "\n".join(
        question_fieldset("readiness", i, "%02d %s. %s" % (q["n"], q["title"], q["question"]),
                          q.get("note", ""), "readiness", hidden=True)
        for i, q in enumerate(CHECKLIST))


def readiness_data():
    data = {
        "scope_rules": READINESS["applicability"]["result_rules"],
        "result_rules": READINESS["result_rules"],
        "result_note": READINESS["result_note"],
        "questions": [{"title": q["title"]} for q in CHECKLIST],
        "scope": {s["key"]: [{"question": q["question"]} for q in s["scope"]] for s in SECTORS},
        "guides": {s["key"]: {"url": s["guide"], "name": s["guidename"]} for s in SECTORS},
    }
    # A closing tag inside the JSON would end the <script> early.
    return json.dumps(data, ensure_ascii=False).replace("</", "<\\/")


FORM_SCRIPTS = '<script src="/assets/forms.js" defer></script>\n'

urls = []

# ---------- home ----------
urls.append(render_page(
    out_path="index.html",
    nav_active="home",
    title="Nimbi AML: AML/CTF built around your business",
    description=("A practical AML/CTF framework (Nimbi Foundations), a customer due diligence platform "
                 "(Nimbi Lens) and practitioners to help your team put it into practice."),
    body=page_src("home"),
    extra_ld=[
        ORGANISATION,
        {"@type": "WebSite", "@id": ORIGIN + "/#website", "url": ORIGIN + "/",
         "name": "Nimbi AML", "publisher": {"@id": ORIGIN + "/#organisation"},
         "inLanguage": "en-AU"},
    ],
))

# ---------- pricing ----------
urls.append(render_page(
    out_path="pricing/index.html",
    nav_active="pricing",
    title="Pricing: Foundations + Lens, or Nimbi Comprehensive",
    description=("Foundations + Lens at $159 a month plus $19 per KYC and $45 per standard KYB check, "
                 "Nimbi Comprehensive on application, and optional outsourced checks."),
    body=page_src("pricing"),
    scripts='<script src="/assets/pricing.js" defer></script>\n',
))

# ---------- the three industry guides ----------
GUIDES = [
    dict(sector="accountants", src="guide-accountants",
         out="who-we-help/accountants/index.html",
         title="AML/CTF for accountants",
         description=("Which accounting services bring the AML/CTF Act into play, warning signs to "
                      "recognise in everyday work, and how Nimbi supports your practice.")),
    dict(sector="legal", src="guide-lawyers",
         out="who-we-help/lawyers-and-conveyancers/index.html",
         title="AML/CTF for lawyers and conveyancers",
         description=("Which legal and conveyancing work the AML/CTF Act regulates, warning signs to "
                      "recognise in everyday matters, and how Nimbi supports your practice.")),
    dict(sector="real_estate", src="guide-real-estate",
         out="who-we-help/real-estate/index.html",
         title="AML/CTF for real estate professionals",
         description=("When agents, buyers' agents and developers provide a designated service, "
                      "warning signs to recognise, and how Nimbi supports your agency.")),
]
for g in GUIDES:
    urls.append(render_page(
        out_path=g["out"],
        nav_active=g["sector"],
        title=g["title"],
        description=g["description"],
        body=page_src(g["src"]),
        ogtype="article",
    ))

# ---------- readiness check ----------
urls.append(render_page(
    out_path="readiness-check/index.html",
    nav_active="readiness",
    title="Quick readiness check",
    description=("Check which services bring your business into scope, then review eleven parts of "
                 "your AML/CTF arrangements. Runs in your browser; nothing is sent."),
    body=fill(page_src("readiness-check"), {
        "sectoroptions": sector_options(),
        "scopesets": render_scope_sets(),
        "checkrows": render_checkrows(),
        "checkcount": str(len(CHECKLIST)),
        "readinessdata": readiness_data(),
    }),
    scripts='<script src="/assets/readiness.js" defer></script>\n',
))

# ---------- contact ----------
urls.append(render_page(
    out_path="contact/index.html",
    nav_active="contact",
    title="Talk to Nimbi",
    description=("Request a proposal or a free 30-minute scoping call with a Nimbi practitioner, or "
                 "book a time directly. We come back to every enquiry within one business day."),
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
    nav_active="privacy",
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
    body="""<div class="site-page" data-page="not-found"><section class="sub-hero"><div class="wrap">
 <p class="eyebrow">Page not found</p>
 <h1>We couldn't find that page.</h1>
 <p class="lead">The link may be out of date. Start from the home page, or check your readiness and we'll point you to the right place.</p>
 <div class="actions"><a class="btn" href="/">Go to the home page</a><a class="text-link" href="/readiness-check/">Check your readiness <span aria-hidden="true">↗</span></a></div>
</div></section></div>""",
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
    "# Page sources, tooling and tests are not pages.\n"
    "Disallow: /src/\n"
    "Disallow: /worker/\n"
    "Disallow: /tests/\n"
    "\nSitemap: %s/sitemap.xml\n" % ORIGIN, encoding="utf-8")

print("built %d pages + 404, %d redirects, sitemap.xml, robots.txt, favicon.ico"
      % (len(urls), len(REDIRECTS)))
for u in urls:
    print("  ", u)
