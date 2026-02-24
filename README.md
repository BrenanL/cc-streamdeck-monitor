# Claude Usage Monitor — Stream Deck Plugin

Displays Claude Code session and weekly usage directly on an Elgato Stream Deck button.

```
┌──────────────────┐
│   5h session     │
│       85%        │  ← color: green < 60%, yellow 60–89%, red ≥ 90%
│    ↺ 3h09m      │  ← time until session resets
│ ─────────────── │
│  7d 28%  ◆32%   │  ← weekly total · weekly Sonnet
└──────────────────┘
```

Updates every 60 seconds. Press the button to refresh immediately.

---

## Prerequisites

- Elgato Stream Deck software 6.9+ installed on Windows
- **Node.js installed on Windows** (required for the Elgato CLI — download from nodejs.org)
- Elgato CLI installed on Windows: `npm install -g @elgato/cli@latest`
- WSL2 running (Ubuntu or any distro with Python 3)
- Claude Code logged in (your OAuth token must be valid)

---

## Install

**Step 1 — from a WSL2 terminal** in this directory:

```bash
bash install.sh
```

The script:
1. Copies `get-usage.py` to `~/.local/share/claude-usage/`
2. Copies the plugin to `%APPDATA%\Elgato\StreamDeck\Plugins\`

**Step 2 — from a Windows PowerShell terminal:**

```powershell
streamdeck restart com.claude-code.usage-monitor
```

This reloads the plugin. You only need to do this after install or update.

---

## Stream Deck Setup (you do this once)

1. **Enable developer mode** from a Windows PowerShell terminal:
   ```powershell
   streamdeck dev
   ```

2. **Drag the action** onto a button:
   In the action library (right panel), find:
   `Claude Code` → `Claude Usage Monitor` → `Usage Display`
   Drag it onto any button.

That's it. The button will show a loading state for up to 60 seconds, then display live usage data.

---

## How It Works

The plugin runs on Windows as a Stream Deck plugin (Node.js). Every 60 seconds it calls:

```
wsl.exe -e bash -c "python3 ~/.local/share/claude-usage/get-usage.py --json"
```

The Python script reads `~/.claude/.credentials.json` (the same credentials Claude Code uses) and calls `https://api.anthropic.com/api/oauth/usage`.

**The script never refreshes the OAuth token.** Claude Code manages its own token lifecycle. If your token expires (every ~7–8 hours), the button shows an auth error until you use Claude Code briefly, at which point it auto-recovers on the next poll — no restart needed.

---

## Troubleshooting

**Button shows "auth-error"**
The OAuth token expired or was invalidated. Open Claude Code and send a message. The button should recover within 60 seconds.

**Button shows "wsl-error"**
WSL2 isn't running or the script path is wrong. Verify from a WSL2 terminal:
```bash
python3 ~/.local/share/claude-usage/get-usage.py
```

**Button stays on "loading…"**
The plugin isn't receiving data. Check the Stream Deck software log at:
`%APPDATA%\Elgato\StreamDeck\logs\`
Look for `com.claude-code.usage-monitor.log`.

**Plugin not appearing in action library**
1. Confirm developer mode is enabled — run `streamdeck dev` in Windows PowerShell
2. Confirm the plugin folder exists at:
   `%APPDATA%\Elgato\StreamDeck\Plugins\com.claude-code.usage-monitor.sdPlugin\`
3. Run `streamdeck restart com.claude-code.usage-monitor` in Windows PowerShell

**After updating get-usage.py**
Re-run `bash install.sh` from WSL2. No need to restart the plugin.

**After updating the plugin itself**
Re-run `bash install.sh` from WSL2, then run `streamdeck restart com.claude-code.usage-monitor` in Windows PowerShell.

---

## What the Metrics Mean

| Metric | Meaning |
|--------|---------|
| 5h session % | Rolling 5-hour usage window (cost-weighted, not raw tokens). Starts when you first send a message. |
| ↺ timer | Time until the 5-hour window resets |
| 7d % | Rolling 7-day total usage (not calendar-week aligned) |
| ◆ % | Rolling 7-day Sonnet-specific usage (separate limit) |

All percentages are server-side opaque cost-weighted values. 100% = rate limit reached.
