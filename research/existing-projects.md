# Prior Art: Stream Deck + Live Data / API Status Displays

*Research by subagent (claude-sonnet-4-6), 2026-02-24*

---

## Section 1: Claude/Anthropic-Specific Findings

### 1.1 Existing Stream Deck + Claude Projects

**TerminalDeck** is the only publicly available project that directly combines Claude Code with a Stream Deck.
- Source: https://github.com/sidmohan0/terminaldeck
- What it does: Hands-free *control* of Claude Code via Stream Deck MK.2 + voice dictation. Lets users respond to prompts (Yes/No/Cancel), switch terminal windows. **Does NOT display usage/rate-limit data.**
- Stack: TypeScript + Rust, Tauri v2 + React 19, uses `hidapi` for Stream Deck. macOS only.

**Conclusion:** There is no existing open-source project that displays Claude/Anthropic API usage on a Stream Deck. This is an unoccupied niche.

### 1.2 Claude Code Usage Monitoring Tools (Terminal/CLI — No Stream Deck Integration)

These exist and track the right data but don't connect to Stream Deck. Most relevant upstream data sources:

**ccusage** ← MOST RELEVANT
- Source: https://github.com/ryoppippi/ccusage
- Docs: https://ccusage.com/guide/statusline
- Node.js/Bun CLI. Parses Claude Code's local JSONL logs (`~/.claude/`). Outputs:
  - Daily/monthly tables
  - `statusline` compact format (e.g., `"🤖 Opus | 💰 $0.23 session / $1.23 today | 🔥 $0.12/hr | 🧠 25,000 (12%)"`)
  - `--json` flag for machine-readable output
- Run: `npx ccusage@latest` or `bun x ccusage statusline`

**Claude-Code-Usage-Monitor**
- Source: https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor
- Python 3.9+, real-time terminal dashboard using Rich. Tracks tokens, message count, cost, burn rate, 5-hour window. Refresh: 1-60s data, 0.1-20 Hz display. No Stream Deck integration.

**CCstatusline**
- Source: https://github.com/Wzh0718/CCstatusline
- Python wrapper around ccusage output, integrates with Claude Code's status line hooks.

**Anthropic Analytics API**
- Docs: https://docs.anthropic.com/en/api/claude-code-analytics-api
- Official REST endpoint `/v1/organizations/usage_report/claude_code`. Org-level metrics: sessions, token counts, costs, commits, PRs. Requires org API key. Enterprise-focused.

**Feature Request (GitHub Issue)**
- https://github.com/anthropics/claude-code/issues/3626 — "Track Remaining Anthropic API Token Usage Within 5-Hour Window" — confirms user demand.

---

## Section 2: Best Prior Art for Live Data Displays

### 1. home-assistant-streamdeck-yaml (Best Overall Example)
- Source: https://github.com/basnijholt/home-assistant-streamdeck-yaml
- PyPI: https://pypi.org/project/home-assistant-streamdeck-yaml/
- Python app connecting to Home Assistant WebSocket API, re-renders Stream Deck buttons reactively on state changes. Supports progress rings, colored text, Material Design Icons.
- Stack: `python-elgato-streamdeck` + Pillow + aiohttp + asyncio
- **This is the closest architectural match to what we want to build.**

### 2. python-homeassistant-streamdeck (Canonical Author Example)
- Source: https://github.com/abcminiuser/python-homeassistant-streamdeck
- By the author of the core library. asyncio + Pillow for tile image generation. Event-driven updates.

### 3. github-api-streamdeck-plugin (Direct Precedent: API Polling → Button Badge)
- Source: https://github.com/guyb7/github-api-streamdeck-plugin
- Polls GitHub GraphQL API every 60 seconds, displays PR counts/status as badges. JavaScript/webpack.

### 4. DevOps for Stream Deck (CI/CD Status)
- Source: https://github.com/SantiMA10/devops-streamdeck
- Monitors GitHub, GitLab, Netlify, Vercel CI/CD pipelines. React + TypeScript + Parcel.

### 5. streamdeck-api-request (Generic HTTP Polling)
- Source: https://github.com/mjbnz/streamdeck-api-request
- Generic HTTP API polling plugin. User configures endpoint + interval, updates key icon based on JSON response (JSONPath, boolean eval).

### Honorable Mention: BarRaider Text File Tools
- Source: https://github.com/BarRaider/streamdeck-textfiletools
- Reads last word (or regex match) from a text file, displays on button. **Lowest-effort prototype path:** a script writes Claude usage to a file every N seconds, this plugin displays it.

---

## Section 3: Rendering Patterns

### Pattern A: PIL/Pillow Image Generation (Python) — Dominant Pattern

Canonical approach using `python-elgato-streamdeck`:

```python
from PIL import Image, ImageDraw, ImageFont
from StreamDeck.ImageHelpers import PILHelper

def render_key(deck, text):
    image = Image.new("RGB", (72, 72), (26, 26, 46))  # dark background
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("font.ttf", 14)
    draw.text((36, 36), text=text, font=font, anchor="mm", fill="white")
    return PILHelper.to_native_key_format(deck, image)

# Background thread update loop:
def update_loop(deck, interval_s=10):
    while deck.is_open():
        value = fetch_usage_data()
        image = render_key(deck, value)
        with deck:
            deck.set_key_image(KEY_INDEX, image)
        time.sleep(interval_s)
```

Key facts:
- Button images: **72×72 pixels** (144×144 at high DPI)
- `PILHelper.create_scaled_key_image()` handles sizing
- Thread safety: use `with deck:` context manager
- Pillow has no built-in word wrap; line breaks require manual splitting

### Pattern B: Official SDK + setTitle() (Simplest for Text)

```typescript
await ev.action.setTitle("74%\n2h30m");
```
Stream Deck app handles rendering. Limited positioning/styling.

### Pattern C: Official SDK + SVG setImage()

```typescript
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72">
  <rect width="72" height="72" fill="#1a1a2e"/>
  <text x="36" y="25" text-anchor="middle" fill="#00ff88" font-size="12">74%</text>
  <text x="36" y="50" text-anchor="middle" fill="white" font-size="10">resets 2h30m</text>
</svg>`;
await ev.action.setImage(`data:image/svg+xml,${encodeURIComponent(svg)}`);
```

### Pattern D: File Bridge (Minimal Effort Prototype)
1. Script writes usage to `/tmp/claude_usage.txt` every N seconds
2. BarRaider Text File Tools plugin displays the last value
3. No Stream Deck programming needed

### Rendering Comparison

| Approach | Language | Flexibility | Effort | Notes |
|---|---|---|---|---|
| Pillow + python-elgato-streamdeck | Python | High | Medium | No official SW needed, Linux OK |
| Official SDK + setTitle() | TypeScript | Low (text only) | Low | Simplest |
| Official SDK + SVG setImage() | TypeScript | High | Medium | Full layout control |
| node-canvas + base64 | JS/TS | Highest | Medium-High | Complex dashboards |
| File bridge + BarRaider | Any | Low | Minimal | Prototype only |

**Max recommended update rate: 10 per second** (per Elgato docs). For a 10-second polling interval, this is irrelevant.

---

## Section 4: Recommended Starting Point

### Python (personal/scriptable):
**`python-elgato-streamdeck` + Pillow + ccusage**
- Library: https://github.com/abcminiuser/python-elgato-streamdeck
- PyPI: `pip install streamdeck` → https://pypi.org/project/streamdeck/
- Docs: https://python-elgato-streamdeck.readthedocs.io/en/stable/
- Data source: `subprocess.check_output(["npx", "ccusage", "--json"])` or read `~/.claude/` JSONL directly
- Template: `home-assistant-streamdeck-yaml` architecture

Architecture:
1. Background thread polls `ccusage --json` every 10s
2. Extract: session cost, today cost, block time remaining, burn rate, model
3. Render: dark background + 3-4 text lines via Pillow
4. Push: `deck.set_key_image(KEY_INDEX, ...)`

### TypeScript (distributable plugin):
**Official `@elgato/streamdeck` SDK**
- npm: `@elgato/streamdeck` → https://www.npmjs.com/package/@elgato/streamdeck
- GitHub: https://github.com/elgatosf/streamdeck
- Docs: https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/
- Samples: https://github.com/elgatosf/streamdeck-plugin-samples

---

## All Sources

**Claude/Anthropic:**
- https://github.com/sidmohan0/terminaldeck
- https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor
- https://github.com/ryoppippi/ccusage
- https://ccusage.com/guide/statusline
- https://github.com/Wzh0718/CCstatusline
- https://docs.anthropic.com/en/api/claude-code-analytics-api
- https://github.com/anthropics/claude-code/issues/3626

**Python Stream Deck:**
- https://github.com/abcminiuser/python-elgato-streamdeck
- https://python-elgato-streamdeck.readthedocs.io/en/stable/
- https://pypi.org/project/streamdeck/
- https://github.com/gri-gus/streamdeck-python-sdk
- https://github.com/basnijholt/home-assistant-streamdeck-yaml
- https://github.com/abcminiuser/python-homeassistant-streamdeck

**Node.js/TypeScript Stream Deck:**
- https://github.com/elgatosf/streamdeck
- https://www.npmjs.com/package/@elgato/streamdeck
- https://docs.elgato.com/streamdeck/sdk/introduction/getting-started/
- https://github.com/Julusian/node-elgato-stream-deck
- https://www.npmjs.com/package/@elgato-stream-deck/node

**Live data examples:**
- https://github.com/guyb7/github-api-streamdeck-plugin
- https://github.com/SantiMA10/devops-streamdeck
- https://github.com/mjbnz/streamdeck-api-request
- https://github.com/BarRaider/streamdeck-textfiletools
- https://github.com/fosron/easy-sysinfo
- https://github.com/claudiobernasconi/streamdeck-youtube
- https://github.com/9h03n1x/pythonscriptdeck

**Rendering docs:**
- https://docs.elgato.com/streamdeck/sdk/guides/keys/
- https://docs.elgato.com/guidelines/streamdeck/plugins/images-and-layouts/
- https://python-elgato-streamdeck.readthedocs.io/en/stable/examples/animated.html
- https://github.com/elgatosf/streamdeck-plugin-samples
