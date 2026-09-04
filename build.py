#!/usr/bin/env python3
"""Render the Nimbi site from src/ into deployable static pages at the repo root.

The site is plain static HTML on GitHub Pages, so the generated output is
committed alongside the sources. Run `python build.py` after editing anything
under src/ and commit both.
"""
import html
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"
ORIGIN = "https://nimbi.com.au"

SOURCE_LINE = ("Source: AML/CTF Act 2006 (Cth) as amended by the AML/CTF Amendment Act 2024; "
               "AML/CTF Rules 2025; AUSTRAC guidance. Last reviewed August 2026. "
               "General information only - not legal advice.")

SECTORS = json.loads((SRC / "data/sectors.json").read_text(encoding="utf-8"))
CHECKLIST = json.loads((SRC / "data/checklist.json").read_text(encoding="utf-8"))
COMPARISON = json.loads((SRC / "data/comparison.json").read_text(encoding="utf-8"))

LAYOUT = (SRC / "layout.html").read_text(encoding="utf-8")

# nav key -> which top-level item renders as active
NAV = [
    ("home", "Home", "/"),
    ("obligations", "Your obligations", "/obligations/"),
    ("why", "Why Nimbi", "/why-nimbi/"),
    ("about", "About Nimbi", "/about/"),
]
NAV_CHILDREN = [
    ("Designated services", "/designated-services/"),
    ("Obligations by profession", "/obligations/"),
    ("Readiness check", "/readiness-check/"),
]

TURNSTILE = ('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js'
             '?render=explicit&onload=onTurnstileLoad" async defer></script>\n')


def esc(s):
    return html.escape(s, quote=True)


def render_nav(active):
    out = []
    for key, label, href in NAV:
        cls = "navlink active" if key == active else "navlink"
        cur = ' aria-current="page"' if key == active else ""
        if key == "obligations":
            out.append('    <div class="navdrop">')
            out.append('      <button type="button" class="%s" aria-haspopup="true">'
                       '%s &#9662;</button>' % (cls, label))
            out.append('      <div class="dropmenu">')
            for clabel, chref in NAV_CHILDREN:
                out.append('        <a href="%s">%s</a>' % (chref, clabel))
            out.append("      </div>")
            out.append("    </div>")
        else:
            out.append('    <a class="%s" href="%s"%s>%s</a>' % (cls, href, cur, label))
    return "\n".join(out)


ORGANISATION = {
    "@type": "ProfessionalService",
    "@id": ORIGIN + "/#organisation",
    "name": "Nimbi",
    "url": ORIGIN + "/",
    "logo": ORIGIN + "/branding/png/logo-full-white-bg@2000w.png",
    "image": ORIGIN + "/branding/png/logo-full-white-bg@2000w.png",
    "email": "dean@nimbi.com.au",
    "description": ("AML/CTF advisory for Australia's Tranche 2 reporting entities - accountants, "
                    "real estate agents, lawyers, conveyancers, trust and company service providers "
                    "and dealers in precious metals and stones."),
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


def sector_tiles(exclude=None):
    out = []
    for s in SECTORS:
        if s["slug"] == exclude:
            continue
        out.append('      <a class="tile" href="/obligations/%s/">%s<small>%s</small></a>'
                   % (s["slug"], esc(s["name"]), esc(s["tag"])))
    return "\n".join(out)


def render_checkrows():
    out = []
    for i, row in enumerate(CHECKLIST):
        out.append(
            "        <tr>"
            '<td style="font-weight:700;color:var(--primary)">%s</td>'
            "<td>%s</td>"
            '<td><span class="stag">%s</span></td>'
            '<td><div class="yn" data-row="%d">'
            '<button type="button" class="y" data-answer="yes">Yes</button>'
            '<button type="button" class="n" data-answer="no">No</button>'
            "</div></td></tr>"
            % (esc(row["area"]), esc(row["question"]), esc(row["source"]), i))
    return "\n".join(out)


def render_comparison(rows):
    """Server-render both the summary row and its detail row.

    The detail text used to live only in a JS tooltip. It is real content, so it
    ships in the HTML and JS only handles the show/hide.
    """
    out = []
    for row in rows:
        out.append('          <tr class="diyrow">'
                   '<td class="cons">%s</td><td>%s</td><td>%s</td></tr>'
                   % (esc(row["c"]), esc(row["d"]), esc(row["n"])))
        out.append('          <tr class="diydetail"><td colspan="3">%s</td></tr>' % esc(row["b"]))
    return "\n".join(out)


def fill(template, values):
    for key, val in values.items():
        template = template.replace("{{%s}}" % key, val)
    return template


def brand(title):
    """Append the brand suffix only when the result still fits a SERP title."""
    suffixed = title + " | Nimbi"
    return suffixed if len(suffixed) <= 60 else title


def render_page(out_path, nav_active, title, description, body,
                scripts="", extra_ld=(), ogtype="website", indexable=True):
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
        "origin": ORIGIN,
        "nav": render_nav(nav_active),
        "body": body,
        "jsonld": render_jsonld(blocks),
        "scripts": scripts,
        "sourceline": esc(SOURCE_LINE),
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


FORM_SCRIPTS = '<script src="/assets/site.js" defer></script>\n' + TURNSTILE

urls = []

# ---------- home ----------
urls.append(render_page(
    out_path="index.html",
    nav_active="home",
    title="Nimbi - AML/CTF compliance for Australian Tranche 2 firms",
    description=("AML/CTF advisory for Australia's Tranche 2 entities. We build your program, run "
                 "your customer due diligence and give you practitioners to call."),
    body=fill(page_src("home"), {"sectortiles": sector_tiles()}),
    scripts=FORM_SCRIPTS,
    extra_ld=[
        ORGANISATION,
        {"@type": "WebSite", "@id": ORIGIN + "/#website", "url": ORIGIN + "/",
         "name": "Nimbi", "publisher": {"@id": ORIGIN + "/#organisation"},
         "inLanguage": "en-AU"},
    ],
))

# ---------- about ----------
urls.append(render_page(
    out_path="about/index.html",
    nav_active="about",
    title="About Nimbi - AML/CTF advisory practitioners",
    description=("Nimbi is led by senior financial crime practitioners who built and ran AML/CTF "
                 "programs inside Australia's largest reporting entities."),
    body=page_src("about"),
    scripts=FORM_SCRIPTS,
    extra_ld=[{"@type": "AboutPage", "url": ORIGIN + "/about/",
               "about": {"@id": ORIGIN + "/#organisation"}}],
))

# ---------- who we serve ----------
urls.append(render_page(
    out_path="who-we-serve/index.html",
    nav_active="obligations",
    title="Who we serve - the Tranche 2 sectors",
    description=("The newly regulated sectors Nimbi works with: accountants, real estate agents, "
                 "developers, lawyers, conveyancers, TCSPs and precious metals dealers."),
    body=page_src("who-we-serve"),
))

# ---------- designated services ----------
urls.append(render_page(
    out_path="designated-services/index.html",
    nav_active="obligations",
    title="Designated services under the AML/CTF Act",
    description=("You are a reporting entity only if you provide a designated service. The "
                 "activities that bring each Tranche 2 sector into the AML/CTF regime."),
    body=page_src("designated-services"),
))

# ---------- obligations hub ----------
urls.append(render_page(
    out_path="obligations/index.html",
    nav_active="obligations",
    title="AML/CTF obligations by profession",
    description=("The ten AML/CTF obligations every reporting entity carries, plus the designated "
                 "services and risk flags specific to your profession. Choose your sector."),
    body=fill(page_src("obligations"), {"sectortiles": sector_tiles()}),
    extra_ld=[{
        "@type": "ItemList",
        "name": "AML/CTF obligations by profession",
        "itemListElement": [
            {"@type": "ListItem", "position": i, "name": s["name"],
             "url": "%s/obligations/%s/" % (ORIGIN, s["slug"])}
            for i, s in enumerate(SECTORS, start=1)
        ],
    }],
))

# ---------- one page per sector ----------
SECTOR_TEMPLATE = page_src("_sector")
for s in SECTORS:
    lower = s["name"][0].lower() + s["name"][1:]
    body = fill(SECTOR_TEMPLATE, {
        "lowername": esc(lower),
        "intro": esc(s["intro"]),
        "dslist": "\n".join("      <li>%s</li>" % esc(d) for d in s["ds"]),
        "flags": "\n".join('    <div class="flag">%s</div>' % esc(f) for f in s["flags"]),
        "othersectors": sector_tiles(exclude=s["slug"]),
    })
    urls.append(render_page(
        out_path="obligations/%s/index.html" % s["slug"],
        nav_active="obligations",
        title=s.get("title", "AML/CTF obligations for %s" % lower),
        description=s["desc"],
        body=body,
        ogtype="article",
    ))

# ---------- readiness check ----------
urls.append(render_page(
    out_path="readiness-check/index.html",
    nav_active="obligations",
    title="AML/CTF readiness check",
    description=("Ten questions covering every obligation a reporting entity carries, each cited "
                 "to the section of the AML/CTF Act or Rules it comes from."),
    body=fill(page_src("readiness-check"), {
        "checkrows": render_checkrows(),
        "sourceline": esc(SOURCE_LINE),
    }),
    scripts='<script src="/assets/readiness.js" defer></script>\n',
    extra_ld=[{
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": row["question"],
             "acceptedAnswer": {"@type": "Answer", "text":
                                "%s: this obligation sits at %s of the AML/CTF Act and Rules. "
                                "If you cannot answer yes, it is a gap in your AML/CTF program."
                                % (row["area"], row["source"])}}
            for row in CHECKLIST
        ],
    }],
))

# ---------- why nimbi ----------
urls.append(render_page(
    out_path="why-nimbi/index.html",
    nav_active="why",
    title="AUSTRAC starter kit vs AML software vs Nimbi",
    description=("How Nimbi Foundations compares with AUSTRAC's starter kit and with self-service "
                 "AML software - on cost, scoping, risk assessment and training."),
    body=fill(page_src("why-nimbi"), {
        "diyrows": render_comparison(COMPARISON["diy"]),
        "swrows": render_comparison(COMPARISON["software"]),
        "sourceline": esc(SOURCE_LINE),
    }),
    scripts='<script src="/assets/comparison.js" defer></script>\n',
))

# ---------- 404 ----------
render_page(
    out_path="404.html",
    nav_active="",
    title="Page not found",
    description="The page you were looking for is not here.",
    indexable=False,
    body="""<section>
  <div class="narrow">
    <h1>We couldn't find that page.</h1>
    <p class="lead">The link may be out of date. Start from the sections below, or get in touch and we'll point you to the right place.</p>
    <div class="btnrow">
      <a class="btn accent" href="/">Go to the home page</a>
      <a class="btn ghost" href="/obligations/">Find your obligations</a>
    </div>
  </div>
</section>""",
)

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

print("built %d pages + 404, sitemap.xml, robots.txt, favicon.ico" % len(urls))
for u in urls:
    print("  ", u)
