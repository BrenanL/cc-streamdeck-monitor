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

- **Endpoint:** `GET https://api.anthropic.com/api/oauth/usage`
- **Auth:** `Authorization: Bearer <accessToken>` + `anthropic-beta: oauth-2025-04-20`
- **Token location:** `~/.claude/.credentials.json` → `.claudeAiOauth.accessToken`
- **No token refresh.** See CLAUDE.md OAuth rules.

## Response Schema (confirmed 2026-02-24)

```json
{
  "five_hour":        { "utilization": 80.0, "resets_at": "<ISO 8601>" },
  "seven_day":        { "utilization": 27.0, "resets_at": "<ISO 8601>" },
  "seven_day_sonnet": { "utilization": 31.0, "resets_at": "<ISO 8601>" },
  "extra_usage":      { "is_enabled": false, ... },
  "seven_day_opus":   null,
  "seven_day_oauth_apps": null,
  "seven_day_cowork": null,
  "iguana_necktie":   null
}
```

`utilization` is 0–100 (not 0–1). Null buckets = not applicable for this plan.

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

## What the User Must Do (Stream Deck side)

1. Enable developer mode in Stream Deck software (Settings → Advanced)
2. Run `install.sh` from WSL2 (copies plugin to Windows plugins folder)
3. Restart Stream Deck software
4. Drag "Claude Usage" action onto a button
