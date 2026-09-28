"""Checks on the generated site: the committed pages are current, every internal
link lands somewhere real, every page has a complete <head>, and the sitemap,
redirects and data files agree with each other.

Run from the repo root (Python 3 stdlib only, nothing to install):

    python -m unittest discover -s tests -v
"""
import html.parser
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIGIN = "https://nimbi.com.au"

# Folders that hold sources, tooling or brand files rather than published pages.
NOT_PAGES = {".git", ".github", ".claude", "src", "worker", "tests", "branding", "assets", "node_modules"}

SECTORS = json.loads((ROOT / "src/data/sectors.json").read_text(encoding="utf-8"))
CHECKLIST = json.loads((ROOT / "src/data/checklist.json").read_text(encoding="utf-8"))


class PageParser(html.parser.HTMLParser):
    """Collects what the checks need from one HTML file."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.links = []          # (tag, attribute, value)
        self.titles = []
        self.meta = {}           # name or property -> content
        self.canonical = []
        self.refresh = None
        self.jsonld = []
        self._in_title = False
        self._in_jsonld = False
        self._buf = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get("id"):
            self.ids.append(a["id"])
        for attr in ("href", "src"):
            if a.get(attr):
                self.links.append((tag, attr, a[attr]))
        if tag == "title":
            self._in_title, self._buf = True, []
        elif tag == "meta":
            key = a.get("name") or a.get("property")
            if key:
                self.meta[key] = a.get("content", "")
            if (a.get("http-equiv") or "").lower() == "refresh":
                self.refresh = a.get("content", "")
        elif tag == "link" and a.get("rel") == "canonical":
            self.canonical.append(a.get("href", ""))
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_jsonld, self._buf = True, []

    def handle_endtag(self, tag):
        if tag == "title" and self._in_title:
            self.titles.append("".join(self._buf).strip())
            self._in_title = False
        elif tag == "script" and self._in_jsonld:
            self.jsonld.append("".join(self._buf))
            self._in_jsonld = False

    def handle_data(self, data):
        if self._in_title or self._in_jsonld:
            self._buf.append(data)


def html_files():
    out = []
    for p in ROOT.rglob("*.html"):
        rel = pathlib.PurePosixPath(p.relative_to(ROOT).as_posix())
        if rel.parts[0] not in NOT_PAGES:
            out.append(rel)
    return sorted(out)


def parse(rel):
    p = PageParser()
    p.feed((ROOT / rel).read_text(encoding="utf-8"))
    return p


def redirect_paths():
    """The redirect stubs, taken from build.py so the list is never duplicated."""
    src = (ROOT / "build.py").read_text(encoding="utf-8")
    block = re.search(r"^REDIRECTS = \[(.*?)^\]", src, re.S | re.M).group(1)
    return re.findall(r'\("([^"]+)",\s*"([^"]+)"\)', block)


def route_to_file(path):
    """/who-we-help/ -> who-we-help/index.html; /favicon.ico -> favicon.ico."""
    rel = path.lstrip("/")
    if rel == "" or rel.endswith("/"):
        rel += "index.html"
    return pathlib.PurePosixPath(rel)


PAGES = html_files()
REDIRECTS = redirect_paths()
REDIRECT_FILES = {pathlib.PurePosixPath(p) for p, _ in REDIRECTS}
PARSED = {rel.as_posix(): parse(rel) for rel in PAGES}


def ids_of(rel):
    return set(PARSED[pathlib.PurePosixPath(rel).as_posix()].ids)


def check_target(where, value):
    """Resolve a site-relative link and its #fragment, returning an error or None."""
    path, _, frag = value.partition("#")
    path = path.split("?")[0]
    if path.startswith(ORIGIN):
        path = path[len(ORIGIN):] or "/"
    if path:
        target = route_to_file(path)
        if not (ROOT / target).is_file():
            return "%s -> %s (no such file)" % (where, value)
    else:
        target = pathlib.PurePosixPath(where)
    if frag and target.suffix == ".html" and frag not in ids_of(target):
        return "%s -> %s (no element with id=%r)" % (where, value, frag)
    return None


class BuildIsCurrent(unittest.TestCase):
    """Rebuild into a scratch copy and compare with what is committed, so stale
    pages (an edit under src/ without `python build.py`) are caught before they
    are deployed. Nothing in the working tree is touched."""

    def test_committed_output_matches_a_fresh_build(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            shutil.copy(ROOT / "build.py", tmp / "build.py")
            shutil.copytree(ROOT / "src", tmp / "src")
            (tmp / "branding/png/icons").mkdir(parents=True)
            shutil.copy(ROOT / "branding/png/icons/favicon.ico", tmp / "branding/png/icons/favicon.ico")
            run = subprocess.run([sys.executable, "build.py"], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, "build.py failed:\n" + run.stdout + run.stderr)

            built = [p.relative_to(tmp) for p in tmp.rglob("*")
                     if p.is_file() and p.relative_to(tmp).parts[0] not in ("src", "branding")
                     and p.name != "build.py"]
            self.assertTrue(built, "build.py produced nothing")
            stale = []
            for rel in built:
                ours = ROOT / rel
                if not ours.exists():
                    stale.append("%s (missing)" % rel.as_posix())
                    continue
                a, b = (tmp / rel).read_bytes(), ours.read_bytes()
                # Line endings depend on the OS and git's autocrlf setting, not the build.
                if a.replace(b"\r\n", b"\n") != b.replace(b"\r\n", b"\n"):
                    stale.append(rel.as_posix())
            self.assertEqual(stale, [], "these files are out of date; run `python build.py` and commit")


class InternalLinks(unittest.TestCase):

    def test_links_in_pages_resolve(self):
        broken = []
        for rel in PAGES:
            where = rel.as_posix()
            for tag, attr, value in PARSED[where].links:
                if value.startswith("//") or not (value.startswith("/") or value.startswith("#")
                                                  or value.startswith(ORIGIN)):
                    continue
                err = check_target(where, value)
                if err:
                    broken.append(err)
        self.assertEqual(broken, [])

    def test_social_image_exists(self):
        for rel in PAGES:
            img = PARSED[rel.as_posix()].meta.get("og:image")
            if img:
                self.assertIsNone(check_target(rel.as_posix(), img))

    def test_links_in_scripts_resolve(self):
        """The readiness check and obligations page build links in JavaScript,
        where the page checks above cannot see them."""
        broken = []
        for js in sorted((ROOT / "assets").glob("*.js")):
            for value in re.findall(r"""["'](/[a-z0-9\-/]*/(?:#[\w\-]+)?)(?=\\?["'])""",
                                    js.read_text(encoding="utf-8")):
                err = check_target("assets/" + js.name, value)
                if err:
                    broken.append(err)
        self.assertEqual(broken, [])

    def test_no_duplicate_ids(self):
        dupes = {}
        for rel in PAGES:
            ids = PARSED[rel.as_posix()].ids
            seen = {i for i in ids if ids.count(i) > 1}
            if seen:
                dupes[rel.as_posix()] = sorted(seen)
        self.assertEqual(dupes, {}, "a repeated id makes #links and labels ambiguous")


class PageHeads(unittest.TestCase):

    def content_pages(self):
        return [rel for rel in PAGES if rel not in REDIRECT_FILES]

    def test_title_and_description(self):
        for rel in self.content_pages():
            p = PARSED[rel.as_posix()]
            with self.subTest(page=rel.as_posix()):
                self.assertEqual(len(p.titles), 1, "exactly one <title>")
                self.assertTrue(p.titles[0])
                desc = p.meta.get("description", "")
                self.assertTrue(desc, "missing meta description")
                self.assertLessEqual(len(desc), 160)
                self.assertNotIn("{{", (ROOT / rel).read_text(encoding="utf-8"), "unreplaced placeholder")

    def test_canonical_matches_route(self):
        for rel in self.content_pages():
            p = PARSED[rel.as_posix()]
            with self.subTest(page=rel.as_posix()):
                if rel.as_posix() == "404.html":
                    self.assertEqual(p.canonical, [])
                    self.assertIn("noindex", p.meta.get("robots", ""))
                    continue
                route = "/" + rel.as_posix()[: -len("index.html")]
                self.assertEqual(p.canonical, [ORIGIN + route])

    def test_structured_data_parses(self):
        for rel in self.content_pages():
            for block in PARSED[rel.as_posix()].jsonld:
                with self.subTest(page=rel.as_posix()):
                    data = json.loads(block)
                    self.assertEqual(data.get("@context"), "https://schema.org")


class RedirectsAndSitemap(unittest.TestCase):

    def test_redirects_land_on_real_pages(self):
        for stub, path in REDIRECTS:
            with self.subTest(stub=stub):
                self.assertTrue((ROOT / stub).is_file(), "redirect stub not built")
                p = PARSED[stub]
                self.assertEqual(p.refresh, "0; url=" + path)
                self.assertEqual(p.canonical, [ORIGIN + path])
                self.assertIsNone(check_target(stub, path))

    def test_sitemap_lists_every_page_and_nothing_else(self):
        tree = ET.parse(ROOT / "sitemap.xml")
        ns = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
        locs = [e.text for e in tree.getroot().findall("s:url/s:loc", ns)]
        self.assertEqual(len(locs), len(set(locs)), "duplicate sitemap entries")
        expected = {ORIGIN + "/" + rel.as_posix()[: -len("index.html")]
                    for rel in PAGES if rel not in REDIRECT_FILES and rel.as_posix() != "404.html"}
        self.assertEqual(set(locs), expected)

    def test_robots_points_at_sitemap(self):
        robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
        self.assertIn("Sitemap: %s/sitemap.xml" % ORIGIN, robots)
        self.assertNotRegex(robots, r"(?m)^Disallow: /\s*$", "the whole site is blocked")


class DataFiles(unittest.TestCase):

    def test_sectors_are_complete(self):
        keys = [s["key"] for s in SECTORS]
        self.assertEqual(len(keys), len(set(keys)), "duplicate sector key")
        for s in SECTORS:
            with self.subTest(sector=s.get("key")):
                for field in ("key", "label", "guide", "guidename", "notesfor", "reportnote", "scopenote"):
                    self.assertTrue(s.get(field), "missing %s" % field)
                self.assertTrue((ROOT / route_to_file(s["guide"])).is_file(), "guide page missing")
                self.assertTrue(s["scope"], "no scope questions")
                for q in s["scope"]:
                    self.assertEqual(len(q), 2, "each scope entry is [question, why it matters]")
                    self.assertTrue(q[0] and q[1])

    def test_checklist_is_numbered_and_scored(self):
        self.assertEqual([r["n"] for r in CHECKLIST], list(range(1, len(CHECKLIST) + 1)))
        # readiness.js groups answers by area; an unknown area would silently count as "firm".
        known = {"setup", "framework", "cdd", "firm", "prove"}
        for r in CHECKLIST:
            with self.subTest(n=r["n"]):
                self.assertIn(r["area"], known)
                self.assertTrue(r["title"] and r["question"])

    def test_scripts_know_every_sector(self):
        """obligations.js and readiness.js carry their own copy of the guide URLs."""
        expected = {s["key"]: s["guide"] for s in SECTORS}
        for name in ("obligations.js", "readiness.js"):
            src = (ROOT / "assets" / name).read_text(encoding="utf-8")
            block = re.search(r"var GUIDES = \{(.*?)\};", src, re.S).group(1)
            found = dict(re.findall(r'(\w+):\s*\[?"([^"]+)"', block))
            with self.subTest(script=name):
                self.assertEqual(found, expected)

    def test_readiness_page_has_every_question(self):
        ids = ids_of("readiness-check/index.html")
        for s in SECTORS:
            self.assertIn("scope-check-" + s["key"], ids)
        page = (ROOT / "readiness-check/index.html").read_text(encoding="utf-8")
        self.assertEqual(page.count('data-area="'), len(CHECKLIST))


if __name__ == "__main__":
    unittest.main()
