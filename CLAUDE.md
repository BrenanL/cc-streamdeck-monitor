# Stream Deck Tools — Claude Code Usage Display

## Project Overview

Displays Claude Code session/weekly usage on an Elgato Stream Deck button. Polls
`https://api.anthropic.com/api/oauth/usage` every 60 seconds. Implemented as a
Windows Stream Deck plugin (Node.js) that shells out to a WSL2 Python script.

## Current Status

**Implementation phase.** Research complete. See `research/` and `DESIGN.md`.

---

## Rules for This Project

### Model Usage
- **Never use Opus for subagents.** Use `sonnet` or `haiku` only.
- **Use Haiku** for lightweight subagents (file exploration, quick lookups).
- **Use Sonnet** for research and synthesis subagents.

### Subagent Standards
Always define: Goal, Context (files to read, prior findings), Deliverables (exact
format), Rules (cite all sources; never hallucinate).

### Scope Discipline
- Do not add features beyond what is asked.
- Keep subagent prompts tight — one question per subagent where practical.

---

## OAuth Token — Critical Rules

**NEVER call the refresh endpoint (`POST https://platform.claude.com/v1/oauth/token`).**

### Why
Anthropic rotates both tokens on every refresh call. If you call refresh and fail
to write the new tokens atomically back to `~/.claude/.credentials.json`, the old
tokens are permanently invalidated. This forces the user to log out and back in to
Claude Code. This happened during development (2026-02-24) and is confirmed behavior.

### Safe pattern (always use this)
1. Read `accessToken` from `~/.claude/.credentials.json` — never modify the file.
2. Call the usage API with that token.
3. On 401/403: show error state on button. **Do not retry with refresh.**
4. Keep polling on the same interval. Claude Code refreshes the token automatically
   when the user is active. The next successful poll recovers the button automatically.

### Why this is fine
- Token lifetime: ~7–8 hours.
- Claude Code proactively refreshes 5 min before expiry whenever it runs.
- If the user hasn't used Claude Code long enough for the token to expire, there's
  nothing to monitor anyway — showing an auth error is correct behavior.
- Auto-recovery: polling continues during error state, so the button heals itself
  the moment Claude Code refreshes the token, with no user action needed.

---

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file |
| `DESIGN.md` | Architecture and design decisions |
| `get-usage.py` | WSL2 Python script — reads token, fetches usage, prints JSON |
| `com.claude-code.usage-monitor.sdPlugin/` | Stream Deck plugin (Windows Node.js) |
| `research/` | All research documents |
