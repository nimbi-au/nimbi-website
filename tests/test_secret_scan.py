"""Tests for the pre-commit secret scan (.githooks/secret_scan.py).

The fake secrets below are assembled at run time so this file does not itself
trip the scanner when CI scans every tracked file.
"""
import importlib.util
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / ".githooks/secret_scan.py"

spec = importlib.util.spec_from_file_location("secret_scan", SCRIPT)
scan = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scan)

J = "".join
FAKE = {
    "private key": "-----BEGIN RSA " + "PRIVATE KEY-----",
    "Entra client secret": 'GRAPH = "' + J(["abc", "8Q~", "x" * 34]) + '"',
    "Turnstile secret key": J(["0x4", "AAAAAAA", "B" * 25]),
    "GitHub token": J(["ghp", "_", "a1" * 18]),
    "AWS access key": J(["AKIA", "ABCDEFGHIJKLMNOP"]),
    "Google API key": J(["AIza", "S" * 35]),
    "Slack token": J(["xoxb", "-1234567890-abcdef"]),
    "Stripe live key": J(["sk", "_live_", "a" * 24]),
    "Anthropic API key": J(["sk-", "ant-", "api03-", "a" * 30]),
    "JSON web token": J(["eyJ", "hbGciOiJIUzI1NiJ9", ".eyJ", "zdWIiOiIxMjM0NTY3ODkwIn0", ".", "s" * 20]),
    "password in a URL": J(["postgres://admin:", "hunter22", "@db.example.com/app"]),
}


class Rules(unittest.TestCase):

    def test_each_kind_of_secret_is_caught(self):
        for name, line in FAKE.items():
            with self.subTest(name):
                hits = scan.scan_line(line)
                self.assertTrue(any(h.startswith(name) for h in hits), hits)

    def test_secret_names_given_literals_are_caught(self):
        for line in ['GRAPH_CLIENT_SECRET = "' + "q" * 20 + '"',
                     '"apiKey": "' + "k" * 24 + '"',
                     "CLOUDFLARE_API_TOKEN=" + "t" * 40,
                     "export DB_PASSWORD=" + "p" * 14]:
            with self.subTest(line=line):
                self.assertTrue(scan.scan_line(line))

    def test_public_values_and_references_pass(self):
        for line in [
            'var SITEKEY = "0x4AAAAAAEoZ_xYFhf2xFw1I";',              # Turnstile site key, public
            '"GRAPH_CLIENT_ID": "0884fd1e-2eff-4531-b461-68b908f137e0"',
            "client_secret: env.GRAPH_CLIENT_SECRET,",
            "apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
            'TURNSTILE_SECRET: "ts-secret"',                         # too short to be real
            "https://nimbi.com.au/who-we-help/",
            "GRAPH_CLIENT_SECRET=",
        ]:
            with self.subTest(line=line):
                self.assertEqual(scan.scan_line(line), [])

    def test_allow_marker_silences_a_line(self):
        self.assertEqual(scan.scan_line(FAKE["AWS access key"] + "  # " + scan.ALLOW_MARKER), [])

    def test_matches_are_redacted(self):
        hit = scan.scan_line(FAKE["GitHub token"])[0]
        self.assertNotIn(FAKE["GitHub token"], hit)

    def test_forbidden_files(self):
        for path in [".env", ".env.local", "worker/.dev.vars", "worker/.dev.vars.production",
                     "certs/site.pem", "deploy.key", "id_ed25519"]:
            with self.subTest(path=path):
                self.assertIsNotNone(scan.forbidden(path))
        for path in [".env.example", "assets/forms.js", "keys.md", "worker/src/index.js"]:
            with self.subTest(path=path):
                self.assertIsNone(scan.forbidden(path))


class Hook(unittest.TestCase):
    """The real pre-commit hook, in a throwaway repository."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = pathlib.Path(self.tmp.name)
        self.git("init", "-q")
        self.git("config", "user.email", "t@example.com")
        self.git("config", "user.name", "t")
        self.git("config", "core.hooksPath", str(ROOT / ".githooks"))

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.run(["git", *args], cwd=self.repo, capture_output=True, text=True)

    def commit(self, name, text):
        (self.repo / name).parent.mkdir(parents=True, exist_ok=True)
        (self.repo / name).write_text(text, encoding="utf-8")
        self.git("add", name)
        return self.git("commit", "-q", "-m", "x")

    def test_clean_commit_goes_through(self):
        run = self.commit("page.html", "<p>Hello</p>\n")
        self.assertEqual(run.returncode, 0, run.stderr)

    def test_secret_blocks_the_commit(self):
        run = self.commit("config.js", 'const k = "%s";\n' % FAKE["GitHub token"])
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("config.js:1: GitHub token", run.stderr)
        self.assertEqual(self.git("rev-list", "--all").stdout, "", "nothing was committed")

    def test_dev_vars_file_blocks_the_commit(self):
        run = self.commit("worker/.dev.vars", "X=1\n")
        self.assertNotEqual(run.returncode, 0)
        self.assertIn("worker/.dev.vars", run.stderr)

    def test_scan_all_mode_on_this_repo_is_clean(self):
        run = subprocess.run([sys.executable, str(SCRIPT), "--all"], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)


if __name__ == "__main__":
    unittest.main()
