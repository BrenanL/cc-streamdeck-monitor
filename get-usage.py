#!/usr/bin/env python3
"""
Claude Code usage fetcher for Stream Deck integration.

Reads the OAuth access token from ~/.claude/.credentials.json (read-only —
never calls the refresh endpoint, see CLAUDE.md for why) and fetches usage
data from the Anthropic API.

Usage:
  python3 get-usage.py          # human-readable output
  python3 get-usage.py --json   # JSON output for plugin

Exit codes:
  0  success
  1  error (auth failure, network error, etc.)
"""

import json
import os
import sys
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone

CREDENTIALS_FILE = os.path.expanduser("~/.claude/.credentials.json")
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
SSL_CTX = ssl.create_default_context()


def read_token():
    """Read access token from credentials file. Never refreshes."""
    try:
        with open(CREDENTIALS_FILE) as f:
            creds = json.load(f)
        token = creds["claudeAiOauth"]["accessToken"]
        if not token:
            raise ValueError("accessToken is empty")
        return token
    except FileNotFoundError:
        raise RuntimeError("not-logged-in")
    except (KeyError, ValueError) as e:
        raise RuntimeError(f"bad-credentials: {e}")


def fetch_usage(token):
    req = urllib.request.Request(
        USAGE_URL,
        headers={
            "Authorization": f"Bearer {token}",
            "anthropic-beta": "oauth-2025-04-20",
        },
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise RuntimeError("auth-error")
        raise RuntimeError(f"http-{e.code}")
    except urllib.error.URLError as e:
        raise RuntimeError(f"network-error")


def fmt_delta(iso_str):
    """Convert ISO 8601 timestamp to human-readable time-until string."""
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        secs = int((dt - datetime.now(timezone.utc)).total_seconds())
        if secs <= 0:
            return "now"
        m = secs // 60
        if m < 60:
            return f"{m}m"
        h, rm = divmod(m, 60)
        if h < 24:
            return f"{h}h{rm:02d}m" if rm else f"{h}h"
        d, rh = divmod(h, 24)
        return f"{d}d{rh}h" if rh else f"{d}d"
    except Exception:
        return "?"


def main():
    json_mode = "--json" in sys.argv

    def fail(code, msg):
        if json_mode:
            print(json.dumps({"error": code, "message": msg}))
        else:
            print(f"Error [{code}]: {msg}", file=sys.stderr)
        sys.exit(1)

    try:
        token = read_token()
    except RuntimeError as e:
        fail(str(e), "Could not read Claude Code credentials. Is Claude Code logged in?")

    try:
        data = fetch_usage(token)
    except RuntimeError as e:
        code = str(e)
        if code == "auth-error":
            fail(code, "Token rejected (401/403). Claude Code may need to refresh it — try using Claude Code briefly.")
        else:
            fail(code, f"Could not reach Anthropic API ({code}).")

    # Annotate with human-readable reset countdowns
    for key in ("five_hour", "seven_day", "seven_day_sonnet"):
        bucket = data.get(key)
        if bucket and bucket.get("resets_at"):
            bucket["resets_in"] = fmt_delta(bucket["resets_at"])

    if json_mode:
        print(json.dumps(data))
    else:
        fh = data.get("five_hour") or {}
        sd = data.get("seven_day") or {}
        ss = data.get("seven_day_sonnet") or {}
        print(f"5h session:  {fh.get('utilization', 0):.0f}%  (resets in {fh.get('resets_in', '?')})")
        print(f"7d weekly:   {sd.get('utilization', 0):.0f}%  (resets in {sd.get('resets_in', '?')})")
        print(f"7d sonnet:   {ss.get('utilization', 0):.0f}%  (resets in {ss.get('resets_in', '?')})")


if __name__ == "__main__":
    main()
