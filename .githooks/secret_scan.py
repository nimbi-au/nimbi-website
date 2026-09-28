#!/usr/bin/env python3
"""Stop secrets from being committed. Python 3 stdlib only.

    python .githooks/secret_scan.py            # the staged changes (what the pre-commit hook runs)
    python .githooks/secret_scan.py --all      # every tracked file (what CI runs)
    python .githooks/secret_scan.py --history  # every line ever added, on any branch

It looks for two things: files that should never be in the repo (.env,
.dev.vars, private keys), and text shaped like a credential. Public values
are fine: the Turnstile site key, the Entra tenant and client IDs, and
`${{ secrets.X }}` references are not flagged.

A false positive can be let through by putting `secret-scan: allow` on the
same line. Never do that for a real secret: rotate it instead, because
anything pushed to this public repo must be treated as leaked.
"""
import argparse
import re
import subprocess
import sys

ALLOW_MARKER = "secret-scan: allow"

# Files that hold secrets by design. `.env.example` is the one allowed template.
FORBIDDEN_FILES = [
    ("env file", re.compile(r"(^|/)\.env(\.(?!example$)[^/]+)?$")),
    ("Wrangler local secrets", re.compile(r"(^|/)\.dev\.vars(\.[^/]+)?$")),
    ("key or certificate file", re.compile(r"\.(pem|key|p12|pfx)$", re.I)),
    ("SSH private key", re.compile(r"(^|/)id_(rsa|dsa|ecdsa|ed25519)$")),
]

_NAME = r"[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY)[A-Za-z0-9_]*"

RULES = [
    ("private key", re.compile(r"-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----")),
    # Entra (Azure AD) client secret values carry "Q~" after the fourth character.
    ("Entra client secret", re.compile(r"(?<![A-Za-z0-9_~.-])[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{31,34}(?![A-Za-z0-9_~.-])")),
    # Turnstile site keys (public, in assets/forms.js) are 24 characters; secret keys are 35.
    ("Turnstile secret key", re.compile(r"\b0x4[A-Za-z0-9_-]{30,}\b")),
    ("GitHub token", re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})\b")),
    ("AWS access key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("Slack token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
    ("Stripe live key", re.compile(r"\b[rs]k_live_[0-9A-Za-z]{20,}")),
    ("Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}")),
    ("OpenAI API key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}")),
    ("JSON web token", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")),
    ("password in a URL", re.compile(r"\b[a-z][a-z0-9+.-]*://[^\s/:@\"']+:[^\s/@\"'$]{6,}@")),
    # A secret-looking name given a literal value: CLIENT_SECRET = "abc...", or
    # TOKEN=abc... at the start of a line (.env style). References such as
    # env.GRAPH_CLIENT_SECRET or ${{ secrets.X }} have no literal and pass.
    ("secret assigned a literal", re.compile(
        r"(?i)\b" + _NAME + r"""["']?\s*[:=]\s*["']([^"'\s]{16,})["']""")),
    ("secret assigned a literal", re.compile(
        r"(?im)^\s*(?:export\s+)?" + _NAME + r"\s*=\s*([^\s\"'$#{][^\s\"']{11,})\s*$")),
]


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def scan_line(line):
    """Return the names of the rules a line breaks, redacted matches included."""
    if ALLOW_MARKER in line:
        return []
    found = []
    for name, rx in RULES:
        m = rx.search(line)
        if m:
            hit = m.group(m.lastindex or 0)
            found.append("%s (%s...)" % (name, hit[:6]))
    return found


def forbidden(path):
    for name, rx in FORBIDDEN_FILES:
        if rx.search(path):
            return name
    return None


def added_lines(diff):
    """(path, line number, text) for each added line of a unified diff with -U0."""
    path, lineno = None, 0
    for raw in diff.decode("utf-8", "replace").splitlines():
        if raw.startswith("+++ "):
            path = raw[6:] if raw.startswith("+++ b/") else None
        elif raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            lineno = int(m.group(1)) if m else 0
        elif raw.startswith("+") and path:
            yield path, lineno, raw[1:]
            lineno += 1
        elif raw.startswith("commit "):
            path = None


def scan_staged():
    problems = []
    for path in git("diff", "--cached", "--name-only", "--diff-filter=ACR", "-z").decode().split("\0"):
        if path and forbidden(path):
            problems.append("%s: %s must not be committed" % (path, forbidden(path)))
    diff = git("diff", "--cached", "-U0", "--no-color", "--no-ext-diff", "--diff-filter=ACMR")
    for path, n, text in added_lines(diff):
        for hit in scan_line(text):
            problems.append("%s:%d: %s" % (path, n, hit))
    return problems


def scan_all():
    problems = []
    for path in git("ls-files", "-z").decode().split("\0"):
        if not path:
            continue
        if forbidden(path):
            problems.append("%s: %s must not be committed" % (path, forbidden(path)))
            continue
        try:
            data = open(path, "rb").read()
        except OSError:
            continue
        if b"\0" in data[:8000]:
            continue  # binary
        for n, text in enumerate(data.decode("utf-8", "replace").splitlines(), start=1):
            for hit in scan_line(text):
                problems.append("%s:%d: %s" % (path, n, hit))
    return problems


def scan_history():
    problems = []
    log = git("log", "--all", "-p", "-U0", "--no-color", "--no-ext-diff", "--format=commit %h")
    commit = "?"
    for raw in log.decode("utf-8", "replace").splitlines():
        if raw.startswith("commit "):
            commit = raw[7:]
        elif raw.startswith("+++ b/") and forbidden(raw[6:]):
            problems.append("%s %s: %s was committed" % (commit, raw[6:], forbidden(raw[6:])))
    for path, n, text in added_lines(log):
        for hit in scan_line(text):
            problems.append("%s:%d: %s" % (path, n, hit))
    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--all", action="store_true", help="scan every tracked file")
    mode.add_argument("--history", action="store_true", help="scan every line ever committed")
    args = ap.parse_args()

    problems = scan_all() if args.all else scan_history() if args.history else scan_staged()
    if not problems:
        return 0
    print("secret scan: possible secrets found\n", file=sys.stderr)
    for p in problems:
        print("  " + p, file=sys.stderr)
    print("\nRemove the secret and keep it in `wrangler secret put`, a GitHub Actions secret or a\n"
          "local .dev.vars file (git-ignored). If a line is a false positive, add the comment\n"
          "'%s' to it. If a real secret was ever pushed, rotate it." % ALLOW_MARKER, file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
