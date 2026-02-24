# Stream Deck Tools — Claude Code Usage Display

## Project Overview

A tool that displays Claude Code session/weekly usage statistics on a physical Elgato Stream Deck device. The goal is to surface the usage data shown by `claude usage` (session percentage, 5-hour block countdown, weekly usage, Sonnet-only usage) directly on the Stream Deck as a live readout button.

## Current Status

**Research phase.** No code has been written yet. We are investigating:
- What Claude Code usage metrics actually mean and how they are calculated
- How to programmatically drive a Stream Deck on Linux (WSL2)
- Existing open-source projects for Stream Deck integration on Linux
- Whether the Stream Deck is accessible from this WSL2 environment

---

## Rules for This Project

### Model Usage
- **Never use Opus for subagents.** Subagent model must be `sonnet` or `haiku`.
- **Use Haiku for lightweight subagents** (file exploration, local searches, quick lookups).
- **Use Sonnet for complex research subagents** (multi-source web research, synthesis tasks).

### Subagent Standards
When spawning a subagent, always define:
1. **Goal** — what question it must answer or what artifact it must produce
2. **Context** — what files to read, what prior findings to be aware of
3. **Deliverables** — the exact format/content of the output (e.g., a markdown summary, a list of findings with source URLs)
4. **Rules** — cite all sources (URLs, file paths, command outputs); do not hallucinate; if uncertain, say so explicitly

### Source Citation
All research findings must include citations. For web research: full URL. For local findings: absolute file path or command that produced the output.

### Scope Discipline
- Do not build until research is complete and unknowns are resolved.
- Do not add features beyond what is asked.
- Keep subagent prompts tight — one question per subagent where practical.

---

## Key Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | This file — project rules and status |
| `research/claude-usage-metrics.md` | What `claude usage` output means |
| `research/stream-deck-linux.md` | Stream Deck Linux/WSL2 integration options |
| `research/existing-projects.md` | Prior art: existing Stream Deck + status display projects |
| `research/unknowns.md` | Outstanding unknowns blocking implementation |

---

## Known Context

- Machine: Linux WSL2 (WSL2 kernel 6.6.87.2-microsoft-standard-WSL2)
- Stream Deck: physically connected to the host Windows machine
- Claude CLI command for usage: `claude usage`
- Usage data includes: session %, session block end time, weekly usage %, Sonnet-only weekly usage
- Primary language preference: not yet determined (Python or Node.js most likely)
