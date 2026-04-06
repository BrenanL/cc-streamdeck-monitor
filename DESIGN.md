# Design: Claude Usage Monitor for Stream Deck

## Architecture

```
~/.claude/.credentials.json  (read-only, written only by Claude Code)
          │ accessToken
          ▼
   get-usage.py  (WSL2, Python 3, no dependencies)
          │ stdout: JSON
          ▼
   wsl.exe -e bash -c "python3 /path/to/get-usage.py --json"
          │ (spawned by Windows Node.js plugin)
          ▼
   com.claude-code.usage-monitor.sdPlugin/bin/plugin.js
          │ WebSocket (ws:// localhost)
          ▼
   Elgato Stream Deck software (Windows)
          │ USB
          ▼
   Stream Deck button  →  SVG image rendered every 60s
```

## Data Source

- **Method:** `POST https://api.anthropic.com/v1/messages` with `max_tokens: 1` on `claude-3-haiku-20240307`. The response body is discarded; usage data is read from the `anthropic-ratelimit-unified-*` response headers.
- **Auth:** `Authorization: Bearer <accessToken>` + `anthropic-beta: oauth-2025-04-20`
- **Token location:** `~/.claude/.credentials.json` → `.claudeAiOauth.accessToken`
- **No token refresh.** See CLAUDE.md OAuth rules.
- **Legacy endpoint** (`GET /api/oauth/usage`) is still in the code but inactive — it stopped working and may come back.

## Parsed Data Shape

`get-usage.py` normalizes both fetch methods into this structure:

```json
{
  "five_hour":        { "utilization": 80.0, "resets_at": "<ISO 8601>", "resets_in": "1h20m" },
  "seven_day":        { "utilization": 27.0, "resets_at": "<ISO 8601>", "resets_in": "3d18h" },
  "seven_day_sonnet": { "utilization": 31.0, "resets_at": "<ISO 8601>", "resets_in": "3d18h" },
  "extra_usage":      { "is_enabled": false }
}
```

`utilization` is 0–100. `seven_day_sonnet` may be `null` depending on plan. `resets_in` is added by `annotate_resets()` at output time (not stored in cache).

## Polling & Error Recovery

- Poll every **60 seconds**, regardless of errors.
- On auth error (401/403): show error state, continue polling.
- Auto-recovery: when Claude Code refreshes the token, next poll succeeds silently.
- On button press: immediate re-poll.
- No manual restart ever needed.

## Button Display

72×72px SVG image set via `action.setImage()`:

```
┌──────────────────┐
│   5h session     │  ← 8px, dimmed
│       80%        │  ← 24px, color-coded
│    ↺ 5h20m      │  ← 9px, gray
│ ─────────────── │
│  7d 27%  ♦31%   │  ← 9px, dimmed
└──────────────────┘
```

Color coding (session %): green < 60%, yellow 60–85%, red ≥ 85%

## Plugin Stack

- **Language:** JavaScript (no TypeScript, no build step)
- **Runtime:** Node.js 20 (bundled with Stream Deck 6.4+) + `ws` npm package
- **WSL2 call:** `wsl.exe -e bash -c "python3 <script> --json"`
- **Install:** copy `.sdPlugin` folder to `%APPDATA%\Elgato\StreamDeck\Plugins\`

## Transaction Logging

Every real API call (not cache hits) is logged to `~/.local/share/claude-usage/`:

```
~/.local/share/claude-usage/
├── history.jsonl                     ← one line per call, easy to query
└── raw/
    └── YYYY-MM-DD/
        ├── HHMMSS_mmm.req.json       ← exact request sent (token redacted)
        └── HHMMSS_mmm.resp.json      ← response headers + parsed data
```

**`history.jsonl` format (one JSON object per line):**
```json
{"ts":"2026-04-06T19:25:02Z","trigger":"idle->active","five_hour":31.0,"seven_day":68.0,"seven_day_sonnet":null,"extra_usage":false,"raw":"raw/2026-04-06/192502_512"}
```

`trigger` values: `idle->active`, `interval (Xs since last)`, `idle refresh (Xs)`, `no cache`, `force`, `smart-off`.

The `raw` field links back to the paired `.req.json` / `.resp.json` files for full data.

All logging is non-fatal — write failures are swallowed and never affect the button display.

## What the User Must Do (Stream Deck side)

1. Enable developer mode in Stream Deck software (Settings → Advanced)
2. Run `install.sh` from WSL2 (copies plugin to Windows plugins folder)
3. Restart Stream Deck software
4. Drag "Claude Usage" action onto a button
