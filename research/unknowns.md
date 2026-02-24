# Outstanding Unknowns — Stream Deck Usage Display

*Synthesized from three research agents, 2026-02-24*

---

## What We Now Know (Resolved)

### Data Source
- Usage data comes from the **undocumented `/api/oauth/usage` endpoint**: `GET https://api.anthropic.com/api/oauth/usage` with `Authorization: Bearer <oauth_token>` and `anthropic-beta: oauth-2025-04-20`
- Returns JSON with `five_hour`, `seven_day`, `seven_day_sonnet`, and `extra_usage` objects, each with `utilization` (0.0–1.0) and `resets_at` (ISO 8601 timestamp)
- The OAuth token lives in `~/.claude/.credentials.json` on Linux
- **This endpoint is free to call** — it doesn't consume API credits
- Source: https://github.com/nsanden/claude-rate-monitor, community reverse-engineering

### What the Metrics Mean
- **5-hour %**: rolling window starting from first message, server-side cost-weighted (not raw tokens — 1,500x token spread confirmed per 1% of quota)
- **7-day %**: independent rolling window, not calendar-week aligned, unique per account
- **Sonnet-only 7-day %**: separate bucket introduced Nov 2025; Sonnet has its own protected quota
- **None of these are documented by Anthropic**; limits expressed only as "approximate usage hours" (~40–480 hrs/week depending on plan)

### Rendering / Library
- Best data source alternative: `ccusage` (https://github.com/ryoppippi/ccusage) reads `~/.claude/*.jsonl` locally, has `--json` flag — but tracks LOCAL cost/tokens, NOT the server-side utilization percentage
- Best rendering for Python: `python-elgato-streamdeck` + Pillow (72×72px images)
- Best rendering for Node.js plugin: `@elgato/streamdeck` + SVG `setImage()` or `setTitle()`

### Architecture Choice (Recommended)
**Windows Node.js plugin that shells out to WSL2** — no USB passthrough needed, Elgato software keeps control, WSL2 script calls `/api/oauth/usage` directly.

---

## Unknowns Requiring Hands-On Testing

### 1. `/api/oauth/usage` Token Authentication
- **Unknown:** Does the OAuth token in `~/.claude/.credentials.json` work directly with `curl` / Python `requests`, or does it require additional refresh logic?
- **Why it matters:** If the token auto-expires and needs refreshing via a flow only the Claude CLI knows, we cannot call this endpoint independently
- **How to test:** `curl -H "Authorization: Bearer $(jq -r .accessToken ~/.claude/.credentials.json)" -H "anthropic-beta: oauth-2025-04-20" https://api.anthropic.com/api/oauth/usage`

### 2. `/api/oauth/usage` Response Schema
- **Unknown:** Exact JSON schema, field names, whether `utilization` is 0.0–1.0 or 0–100, and whether all four buckets always appear
- **How to test:** Run the curl above and inspect the output

### 3. Which `~/.claude/.credentials.json` Field is the Token
- **Unknown:** Field name and whether it's an access token or a different credential type
- **How to test:** `ls -la ~/.claude/.credentials.json` and inspect (avoid printing full token to logs)

### 4. usbipd USB Passthrough Reliability (for Approach B)
- **Unknown:** Whether `usbipd attach --wsl` succeeds with this WSL2 kernel (6.6.87.2), and whether Elgato software gracefully releases the device
- **Why it matters:** Only needed if going with the Linux-direct approach (Approach B). Approach A (Windows plugin) doesn't need this.

### 5. hidraw Buffer Size with Stream Deck at Kernel 6.6
- **Unknown:** Whether 8192-byte writes work via `python-elgato-streamdeck`'s libusb backend at this kernel version
- **Only relevant for Approach B**

### 6. Text File Tools Plugin Auto-Refresh
- **Unknown:** Whether the BarRaider Text File Tools plugin polls on a timer or only updates on button press
- **Why it matters:** Determines whether Approach C (file bridge) is viable for auto-updating display

### 7. `seven_day` vs `seven_day_sonnet` Interaction Bug
- **Unknown:** Whether exhausting `seven_day` (all-models) blocks Sonnet even when `seven_day_sonnet` shows remaining capacity
- **Source:** Multiple user reports, https://github.com/anthropics/claude-code/issues/12487, no official response
- **Why it matters:** If both must be monitored for "can I use Sonnet?", the display needs to show both

---

## Key Decision Point

Before building, one curl command resolves the most critical unknown:

```bash
# Check if OAuth token is in credentials file and if the endpoint is callable
ls ~/.claude/.credentials.json 2>/dev/null && echo "credentials file exists"

# Inspect token fields (safely — don't print the actual token value)
jq 'keys' ~/.claude/.credentials.json 2>/dev/null

# Test the API endpoint (will show the actual field name needed)
TOKEN=$(jq -r '.<FIELD_NAME>' ~/.claude/.credentials.json)
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  -H "anthropic-beta: oauth-2025-04-20" \
  https://api.anthropic.com/api/oauth/usage | python3 -m json.tool
```

If this returns usage data → the project is straightforward.
If authentication fails → we need to understand how the Claude CLI refreshes tokens and whether we can hook into that.

---

## Architecture Summary

### Approach A (Recommended — No USB passthrough)

```
~/.claude/.credentials.json (OAuth token)
    ↓
WSL2 shell script: GET /api/oauth/usage → parse JSON → format string
    ↓ (stdout)
wsl.exe child process (spawned by Windows plugin)
    ↓
Node.js plugin (CodePath: bin/plugin.js) using @elgato/streamdeck
    ↓ WebSocket
Elgato Stream Deck software (Windows)
    ↓ USB
Stream Deck button displays: "74% · 2h 30m"
```

### What to Display (suggested)
- **Line 1:** `5h: 74%` + color-coded (green/yellow/red based on thresholds: 90%+ = red, 72%+ = yellow)
- **Line 2:** `resets 2h 30m`
- **Line 3:** `7d: 42%` (weekly)
- **Line 4 (optional):** `✦ $1.23` (today's cost from ccusage, local data)

### Data Update Interval
- Poll `/api/oauth/usage` every 60 seconds (conservative; no official rate limit documented but avoid hammering)
- On button press: force refresh immediately

---

## Sources Index

- `/api/oauth/usage` endpoint: https://github.com/nsanden/claude-rate-monitor
- Usage metrics analysis: https://github.com/anthropics/claude-code/issues/22435
- 5-hour reset behavior: https://usagebar.com/blog/when-does-claude-code-usage-reset
- 7-day reset behavior: https://codelynx.dev/posts/claude-code-usage-limits-statusline
- Max plan limits: https://tessl.io/blog/why-claude-code-is-capping-power-users-and-what-it-means
- seven_day_sonnet interaction bug: https://github.com/anthropics/claude-code/issues/12487
- Extra usage bug (stale cache): https://github.com/anthropics/claude-code/issues/24727
- Claude rate monitor (reference implementation): https://github.com/nsanden/claude-rate-monitor
- ccusage (local token tracking): https://github.com/ryoppippi/ccusage
- Stream Deck Windows plugin SDK: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/
- python-elgato-streamdeck: https://github.com/abcminiuser/python-elgato-streamdeck
- usbipd-win: https://github.com/dorssel/usbipd-win
