#!/usr/bin/env python3
"""
Claude Code usage fetcher for Stream Deck integration.

Reads the OAuth access token from ~/.claude/.credentials.json (read-only —
never calls the refresh endpoint, see CLAUDE.md for why) and fetches usage
data from the Anthropic API.

Two fetch methods are available (controlled by FETCH_METHOD below):
  "headers"  — POST a minimal message to /v1/messages and parse rate-limit
               headers. Costs negligible subscription usage. (default)
  "endpoint" — GET /api/oauth/usage directly. Free but undocumented and may
               be rate-limited or deprecated.

Usage:
  python3 get-usage.py          # human-readable output
  python3 get-usage.py --json   # JSON output for plugin

Exit codes:
  0  success
  1  error (auth failure, network error, etc.)
"""

import json
import os
import platform
import subprocess
import sys
import ssl
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ── Configuration ─────────────────────────────────────────────────────────────
# Switch between "headers" (messages API + parse headers) and "endpoint"
# (direct /api/oauth/usage GET). Change this to switch methods.
FETCH_METHOD = "headers"  # "headers" or "endpoint"
HEADERS_MODEL = "claude-3-haiku-20240307"  # cheapest model for minimal budget impact

CREDENTIALS_FILE = os.path.expanduser("~/.claude/.credentials.json")
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
MESSAGES_URL = "https://api.anthropic.com/v1/messages"
SSL_CTX = ssl.create_default_context()


def read_token():
    """Read access token from credentials, Keychain (macOS), or env var. Never refreshes."""
    # Environment variable takes priority on all platforms
    if os.environ.get("CLAUDE_CODE_OAUTH_TOKEN"):
        return os.environ["CLAUDE_CODE_OAUTH_TOKEN"]

    # macOS: read from Keychain
    if platform.system() == "Darwin":
        try:
            result = subprocess.run(
                ["security", "find-generic-password", "-s", "Claude Code-credentials", "-w"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            if result.returncode != 0 or not result.stdout.strip():
                raise RuntimeError("keychain-read-failed")
            creds = json.loads(result.stdout.strip())
            token = creds["claudeAiOauth"]["accessToken"]
            if not token:
                raise ValueError("accessToken is empty in Keychain")
            return token
        except json.JSONDecodeError:
            raise RuntimeError("keychain-json-invalid")
        except (KeyError, ValueError) as e:
            raise RuntimeError(f"keychain-bad-format: {e}")

    # Linux / WSL2: read from ~/.claude/.credentials.json
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


def fetch_usage_endpoint(token):
    """Original method: GET /api/oauth/usage. Free but undocumented."""
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
        raise RuntimeError("network-error")


def fetch_usage_headers(token):
    """New method: minimal POST to /v1/messages, parse rate-limit headers.

    Uses subscription quota (negligible with a 1-token haiku call).
    Returns data in the same shape as the old endpoint for compatibility.
    """
    body = json.dumps({
        "model": HEADERS_MODEL,
        "max_tokens": 1,
        "messages": [{"role": "user", "content": "hi"}],
    }).encode()
    req = urllib.request.Request(
        MESSAGES_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "anthropic-beta": "oauth-2025-04-20",
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as resp:
            hdrs = resp.headers
            return _parse_ratelimit_headers(hdrs)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise RuntimeError("auth-error")
        raise RuntimeError(f"http-{e.code}")
    except urllib.error.URLError as e:
        raise RuntimeError("network-error")


def _parse_ratelimit_headers(hdrs):
    """Convert anthropic-ratelimit-unified-* headers to the same JSON shape
    as the old /api/oauth/usage endpoint."""
    def _bucket(prefix):
        util = hdrs.get(f"anthropic-ratelimit-unified-{prefix}-utilization")
        reset = hdrs.get(f"anthropic-ratelimit-unified-{prefix}-reset")
        if util is None:
            return None
        return {
            "utilization": float(util) * 100,  # headers use 0–1, old endpoint used 0–100
            "resets_at": datetime.fromtimestamp(int(reset), tz=timezone.utc).isoformat() if reset else None,
        }

    data = {
        "five_hour": _bucket("5h"),
        "seven_day": _bucket("7d"),
        "seven_day_sonnet": _bucket("7d_sonnet"),  # may be None if model doesn't report it
    }

    overage_status = hdrs.get("anthropic-ratelimit-unified-overage-status")
    data["extra_usage"] = {
        "is_enabled": overage_status == "allowed",
    }

    return data


def fetch_usage(token):
    """Dispatch to the configured fetch method."""
    if FETCH_METHOD == "headers":
        return fetch_usage_headers(token)
    return fetch_usage_endpoint(token)


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
