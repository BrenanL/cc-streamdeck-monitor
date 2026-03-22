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

Smart polling (SMART_POLLING): when enabled, the script checks for active
Claude Code network traffic before making API calls. If Claude Code is idle,
cached data is returned instead. The plugin calls this script frequently
(every ~15s), but API calls only happen when Claude is active, plus an
occasional background refresh.

Usage:
  python3 get-usage.py          # human-readable output
  python3 get-usage.py --json   # JSON output for plugin
  python3 get-usage.py --json --force  # bypass smart polling, always fetch

Exit codes:
  0  success
  1  error (auth failure, network error, etc.)
"""

import json
import os
import platform
import re
import subprocess
import sys
import ssl
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone

# ── Configuration ─────────────────────────────────────────────────────────────

# Fetch method: "headers" (messages API + parse headers) or "endpoint"
# (direct /api/oauth/usage GET). Change this to switch methods.
FETCH_METHOD = "headers"  # "headers" or "endpoint"
HEADERS_MODEL = "claude-3-haiku-20240307"  # cheapest model for minimal budget impact

# Smart polling: only call the API when Claude Code is actively streaming.
# Set to False to always call the API on every invocation (original behavior).
SMART_POLLING = True
ACTIVE_THRESHOLD_MS = 30_000  # lastrcv < this means Claude is actively streaming
MESSAGES_POLL_SEC = 60        # minimum seconds between API calls during active use
COOLDOWN_SEC = 30             # seconds after last activity before we stop polling
IDLE_POLL_SEC = 0             # background refresh when idle (0 = never, use button press)

STATE_FILE = "/tmp/claude-usage-state.json"
DEBUG_LOG = "/tmp/claude-usage-debug.log"  # set to "" to disable logging

CREDENTIALS_FILE = os.path.expanduser("~/.claude/.credentials.json")
USAGE_URL = "https://api.anthropic.com/api/oauth/usage"
MESSAGES_URL = "https://api.anthropic.com/v1/messages"
SSL_CTX = ssl.create_default_context()


# ── Token reading ─────────────────────────────────────────────────────────────

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


# ── API fetch methods ─────────────────────────────────────────────────────────

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


# ── Smart polling: activity detection ─────────────────────────────────────────

def check_activity():
    """Check if Claude Code has recent network activity to the Anthropic API.

    Uses `ss` to inspect TCP connections from bun/claude processes to port 443.
    Returns the minimum `lastrcv` value in milliseconds, or None if no active
    connections are found or `ss` is unavailable (e.g. on macOS).
    """
    try:
        result = subprocess.run(
            ["ss", "-tnpi", "dport", "=", ":443"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        if result.returncode != 0:
            return None

        min_lastrcv_ms = None
        lines = result.stdout.split('\n')
        for i, line in enumerate(lines):
            # Connection lines include process info — look for Claude Code
            if '"bun"' not in line and '"claude"' not in line:
                continue
            # TCP internal info is on the following indented line
            if i + 1 < len(lines):
                info = lines[i + 1]
                m = re.search(r'lastrcv:(\d+)', info)
                if m:
                    val = int(m.group(1))
                    if min_lastrcv_ms is None or val < min_lastrcv_ms:
                        min_lastrcv_ms = val
        return min_lastrcv_ms
    except FileNotFoundError:
        # ss not available (macOS, minimal container, etc.)
        return None
    except Exception:
        return None


def load_state():
    """Load cached state from STATE_FILE."""
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError, ValueError):
        return {}


def save_state(state):
    """Save state to STATE_FILE."""
    try:
        with open(STATE_FILE, "w") as f:
            json.dump(state, f)
    except OSError:
        pass  # non-fatal — next invocation will just refetch


# ── Formatting ────────────────────────────────────────────────────────────────

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


def debug_log(msg):
    """Append a timestamped line to the debug log."""
    if not DEBUG_LOG:
        return
    try:
        ts = datetime.now().strftime("%H:%M:%S")
        with open(DEBUG_LOG, "a") as f:
            f.write(f"{ts} {msg}\n")
    except OSError:
        pass


def annotate_resets(data):
    """Add human-readable resets_in to each bucket."""
    for key in ("five_hour", "seven_day", "seven_day_sonnet"):
        bucket = data.get(key)
        if bucket and bucket.get("resets_at"):
            bucket["resets_in"] = fmt_delta(bucket["resets_at"])


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    json_mode = "--json" in sys.argv
    force = "--force" in sys.argv

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

    # ── Smart polling logic ───────────────────────────────────────────────
    if SMART_POLLING and not force:
        now = time.time()
        state = load_state()
        lastrcv_ms = check_activity()

        is_active = lastrcv_ms is not None and lastrcv_ms < ACTIVE_THRESHOLD_MS
        last_activity = state.get("last_activity", 0)
        last_api_call = state.get("last_api_call", 0)
        was_idle = (now - last_activity) > COOLDOWN_SEC

        if is_active:
            state["last_activity"] = now

        time_since_api = now - last_api_call
        in_cooldown = (now - state.get("last_activity", 0)) < COOLDOWN_SEC

        should_call = False
        reason = ""
        if is_active and was_idle:
            should_call = True
            reason = "idle->active"
        elif (is_active or in_cooldown) and time_since_api >= MESSAGES_POLL_SEC:
            should_call = True
            reason = f"interval ({time_since_api:.0f}s since last)"
        elif IDLE_POLL_SEC > 0 and time_since_api >= IDLE_POLL_SEC:
            should_call = True
            reason = f"idle refresh ({time_since_api:.0f}s)"
        elif state.get("cached_data") is None and time_since_api >= MESSAGES_POLL_SEC:
            should_call = True
            reason = "no cache"

        lastrcv_str = f"{lastrcv_ms}ms" if lastrcv_ms is not None else "none"
        status = "ACTIVE" if is_active else "COOLDOWN" if in_cooldown else "IDLE"
        if should_call:
            debug_log(f"{status} lastrcv={lastrcv_str} API_CALL ({reason})")
        else:
            debug_log(f"{status} lastrcv={lastrcv_str} CACHED ({time_since_api:.0f}s since api)")

        if should_call:
            try:
                data = fetch_usage(token)
                state["last_api_call"] = time.time()
                state["cached_data"] = data
            except RuntimeError as e:
                # Save state even on failure so we don't retry every 15 seconds
                state["last_api_call"] = time.time()
                save_state(state)
                debug_log(f"  FAILED: {e}")
                code = str(e)
                if code == "auth-error":
                    fail(code, "Token rejected (401/403). Claude Code may need to refresh it.")
                else:
                    fail(code, f"Could not reach Anthropic API ({code}).")
        else:
            data = state.get("cached_data")
            if data is None:
                # Shouldn't happen (covered above), but just in case
                fail("no-data", "No cached data and no activity detected.")

        save_state(state)

    else:
        # Force mode or smart polling disabled — always fetch
        debug_log(f"FORCE API_CALL" if force else "SMART_OFF API_CALL")
        try:
            data = fetch_usage(token)
        except RuntimeError as e:
            code = str(e)
            if code == "auth-error":
                fail(code, "Token rejected (401/403). Claude Code may need to refresh it.")
            else:
                fail(code, f"Could not reach Anthropic API ({code}).")

    # ── Output ────────────────────────────────────────────────────────────
    # Recalculate resets_in every time (even cached data) since it's time-dependent
    annotate_resets(data)

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
