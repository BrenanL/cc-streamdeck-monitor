# Claude Usage Monitor — Stream Deck Plugin

A free, open source Stream Deck plugin that puts your Claude Code usage stats on a physical button. If you use Claude Code on a Max or Pro plan, this shows your 5-hour session percentage, 7-day weekly usage, and Sonnet-specific quota — with color-coded alerts and a pace indicator that tells you if you're burning through your weekly budget too fast. Six display styles available, all configurable from the Stream Deck property inspector.

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

**Supported platforms:** macOS · Windows (via WSL2)

## Prerequisites

- Elgato Stream Deck software 6.9+
- **Node.js** installed ([nodejs.org](https://nodejs.org)) — required for the Elgato CLI
- Elgato CLI: `npm install -g @elgato/cli@latest`
- Claude Code logged in (your OAuth token must be valid)
- **macOS only:** Python 3 (pre-installed on macOS)
- **Windows/WSL2 only:** WSL2 running with Python 3 (Ubuntu or any distro)

---

## Install — macOS

**Step 1 — from Terminal** in this directory:

```bash
bash install.sh
```

The script copies `get-usage.py` to `~/.local/share/claude-usage/` and the plugin to `~/Library/Application Support/com.elgato.StreamDeck/Plugins/`.

**Step 2 — from Terminal:**

```bash
streamdeck restart com.claude-code.usage-monitor
```

---

## Install — Windows (WSL2)

**Step 1 — from a WSL2 terminal** in this directory:

```bash
bash install.sh
```

The script copies `get-usage.py` to `~/.local/share/claude-usage/` (in WSL2) and the plugin to `%APPDATA%\Elgato\StreamDeck\Plugins\`.

**Step 2 — from a Windows PowerShell terminal:**

```powershell
streamdeck restart com.claude-code.usage-monitor
```

---

## Stream Deck Setup (once, either platform)

1. **Enable developer mode:**
   ```bash
   streamdeck dev
   ```

2. **Drag an action** onto a button:
   In the action library (right panel), find `Claude Code` → choose any display style → drag onto a button.

That's it. The button shows a loading state for up to 60 seconds, then displays live usage data.

---

## How It Works

The plugin runs as a Node.js Stream Deck plugin. Every 60 seconds it runs `get-usage.py`, which reads your Claude Code OAuth token and calls `https://api.anthropic.com/api/oauth/usage`.

- **macOS:** calls `python3` directly; reads the token from the macOS Keychain
- **Windows/WSL2:** calls `wsl.exe` to reach your WSL2 environment; reads `~/.claude/.credentials.json`

**The script never refreshes the OAuth token.** Claude Code manages its own token lifecycle. If your token expires, the button shows an auth error and auto-recovers within 60 seconds after you use Claude Code briefly.

---

## Display Styles

Choose your preferred display layout. All six actions update automatically every 60 seconds; press a button to refresh immediately.

### Enhanced (usage-display)

Two-zone layout emphasizing 5h session with 7d and Sonnet metrics in a compact footer.

```
┌──────────────────┐
│   5h session     │
│       85%        │  green/yellow/red
│    ↺ 3h09m      │
│ ─────────────── │
│  7d 28%  ◆32%   │  pace-colored
└──────────────────┘
```

**Configurable settings:** Session yellow/red thresholds, Sonnet yellow/red thresholds, Pace per day, Pace yellow/red delta thresholds

### Stacked Bars (usage-stacked)

Three horizontal progress bars side-by-side: 5h (red/yellow/green), 7d (pace-colored), Sonnet (red/yellow/green), plus reset timer below.

```
┌──────────────────┐
│  5h  ▓▓▓░░░░░   │  threshold-colored
│  7d  ▓▓▓░░░░░   │  pace-colored
│  S   ▓░░░░░░░   │  threshold-colored
│ ─────────────── │
│  ↺ 3h09m        │
└──────────────────┘
```

**Configurable settings:** Session yellow/red thresholds, Sonnet yellow/red thresholds, Pace per day, Pace yellow/red delta thresholds

### Toggle (usage-toggle)

Cycles through three full-page views on button press: 5h session, 7d weekly (with pace delta), Sonnet. Page indicator dots at top show current view.

```
View 1: 5h Session   View 2: 7d Weekly      View 3: Sonnet
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│ ● ◌ ◌        5h  │  │ ◌ ● ◌        7d  │  │ ◌ ◌ ●         S  │
│                  │  │                  │  │                  │
│       75%        │  │       42%        │  │       28%        │
│                  │  │   +8% pace       │  │                  │
│   ↺ 4h30m      │  │   ↺ 5h20m      │  │   ↺ 3h09m      │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Configurable settings:** Session yellow/red thresholds, Sonnet yellow/red thresholds, Pace per day, Pace yellow/red delta thresholds

### Session (usage-session)

Large 5-hour session percentage with reset timer — a dedicated button for tracking your current 5h block.

```
┌──────────────────┐
│   5h session     │
│       75%        │  threshold-colored
│   ↺ 4h30m       │
│                  │
│                  │
└──────────────────┘
```

**Configurable settings:** Session yellow/red thresholds

### Weekly (usage-weekly)

Large 7-day percentage with expected pace, delta indicator, and reset timer — shows if you're on pace for your workday budget.

```
┌──────────────────┐
│   7d weekly      │
│       42%        │  pace-colored
│   exp 35%        │
│  +7% pace        │
│   ↺ 5h20m       │
└──────────────────┘
```

**Configurable settings:** Pace per day, Pace yellow/red delta thresholds

### Sonnet (usage-sonnet)

Large 7-day Sonnet-specific percentage with reset timer — tracks your separate Sonnet quota.

```
┌──────────────────┐
│   7d Sonnet      │
│       28%        │  threshold-colored
│   ↺ 3h09m       │
│                  │
│                  │
└──────────────────┘
```

**Configurable settings:** Sonnet yellow/red thresholds

---

## Color Coding

Across all display styles:

- **Session & Sonnet:** Threshold-colored — green below yellow (default 60%), yellow up to red threshold (default 90%), red at or above red threshold
- **Weekly (7d):** Pace-colored — green if within 5% of expected workday pace, yellow if 5–15% over pace, red if 15%+ over pace
- **Extra usage badge:** Small "$" indicator appears in the top-right corner of any button when extra usage is enabled

---

## Troubleshooting

**Button shows "auth-error"**
The OAuth token expired or was invalidated. Open Claude Code and send a message — the button recovers within 60 seconds.

**Button shows "wsl-error" (Windows)**
WSL2 isn't running or the script path is wrong. Verify from a WSL2 terminal:
```bash
python3 ~/.local/share/claude-usage/get-usage.py
```

**Button shows "python-error" (macOS)**
Python 3 isn't found or the script path is wrong. Verify from Terminal:
```bash
python3 ~/.local/share/claude-usage/get-usage.py
```

**Button stays on "loading…"**
The plugin isn't receiving data. Check the Stream Deck log at:
- macOS: `~/Library/Logs/ElgatoStreamDeck/`
- Windows: `%APPDATA%\Elgato\StreamDeck\logs\`

Look for `com.claude-code.usage-monitor.log`.

**Plugin not appearing in action library**
1. Confirm developer mode is enabled: `streamdeck dev`
2. Confirm the plugin folder exists in your platform's plugins directory
3. Run `streamdeck restart com.claude-code.usage-monitor`

**After updating**
Re-run `bash install.sh`, then `streamdeck restart com.claude-code.usage-monitor`.

---

## What the Metrics Mean

| Metric | Meaning |
|--------|---------|
| 5h session % | Rolling 5-hour usage window (cost-weighted, not raw tokens). Starts when you first send a message. |
| ↺ timer | Time until the 5-hour window resets |
| 7d % | Rolling 7-day total usage (not calendar-week aligned) |
| ◆ % | Rolling 7-day Sonnet-specific usage (separate limit) |

All percentages are server-side opaque cost-weighted values. 100% = rate limit reached.

---

## License

MIT — see [LICENSE](LICENSE)
