# Claude Code Usage Metrics: Research Document

**Research date:** 2026-02-24
**Claude Code version reverse-engineered:** 2.1.52
**Model used for this research:** claude-sonnet-4-6

---

## Summary of Pre-Existing Findings (not re-researched)

The following facts were established before this research session by reverse-engineering the Claude Code v2.1.52 binary:

- Rate limit types: `five_hour` (18,000 s window) and `seven_day` (604,800 s window), with `seven_day_sonnet` as a third type
- Rate limit state object fields: `status`, `resetsAt`, `isUsingOverage`, `unifiedRateLimitFallbackAvailable`
- API headers tracked: `anthropic-ratelimit-unified-*`, `anthropic-ratelimit-unified-overage-reset`
- `/usage` command description: "Show plan usage limits"
- Extra usage / overage feature exists
- Local stats cache at `~/.claude/stats-cache.json` tracks tokens/messages/sessions
- Alert thresholds: `five_hour` at 90% utilization / 72% time elapsed; `seven_day` at 75%/60%, 50%/35%, 25%/15%

---

## Research Question 1: What unit is "usage percentage"?

### Finding

The `utilization` value returned by both the API headers and the `/api/oauth/usage` endpoint is a **server-side opaque percentage** (0–100, or 0.0–1.0 as a ratio in headers), computed by Anthropic's backend. Anthropic does not publicly document the exact formula.

Evidence from reverse-engineering and community investigation (GitHub issue [#22435](https://github.com/anthropics/claude-code/issues/22435)) reveals the utilization is **not a simple token count**. A detailed analysis of 722 quota-increasing requests found:

| Metric | Value |
|--------|-------|
| Median tokens per 1% quota | 2,517 |
| Mean tokens per 1% quota | 39,152 |
| Min | 12,300 tokens/1% |
| Max | 18,531,900 tokens/1% |

This ~1,500x spread between minimum and maximum tokens per 1% of quota means utilization is **not deterministically proportional to raw token count**. The most likely explanations (none confirmed by Anthropic):

- **Model-weighted cost**: Opus tokens may cost more quota than Sonnet tokens (which in turn cost more than Haiku), since Opus is ~3–5x more expensive per token at the API level.
- **Server-side quota accounting**: May reflect billable cost equivalent rather than raw token count.
- **Non-linear or cached effects**: Cache reads may contribute less quota than uncached input tokens.

Anthropic's own help center only states usage is affected by "the length and complexity of your conversations, the features you use, and which Claude model you're chatting with" — confirming model-sensitivity but giving no formula. ([Understanding usage and length limits](https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits))

Third-party tools that approximate quotas use the following rough token equivalents per plan per 5-hour window, based on community reverse-engineering rather than official documentation:

| Plan | Approx tokens/5h window |
|------|------------------------|
| Pro | ~19,000 |
| Max 5x | ~88,000 |
| Max 20x | ~220,000 |

Sources: [Claude Code Usage Monitor thresholds](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor), [TrueFoundry guide](https://www.truefoundry.com/blog/claude-code-limits-explained)

**These are community estimates, not Anthropic official numbers.**

**What Anthropic has not documented:** The precise formula mapping tokens/model/features to utilization percentage. The `anthropic-ratelimit-unified-*` headers expose the result but not the calculation.

---

## Research Question 2: Does the 5-hour window roll continuously or start at a fixed time?

### Finding: Rolling, user-triggered

The 5-hour window is a **rolling window that begins with the user's first request in a session**. It does not reset at midnight, at a fixed clock time, or on any calendar boundary.

- If you send your first message at 10:00 AM, the window resets at 3:00 PM.
- If you start a new session at 6:00 PM, you get a fresh window regardless of prior activity.
- The clock is personal and unique to each account.

This is confirmed by:
- The `anthropic-ratelimit-unified-5h-reset` header, which returns a Unix epoch timestamp specific to the caller's session window.
- Community reporting and guides: [Usagebar blog](https://usagebar.com/blog/when-does-claude-code-usage-reset), [CometAPI guide](https://www.cometapi.com/when-does-claude-code-usage-reset/)
- X post from @GaelBreton: "Claude limits reset every 5 hours from your FIRST message. Not midnight. Not daily. From when you start." ([source](https://x.com/GaelBreton/status/1958576661558939992))

The `resetsAt` field in the Claude Code rate limit state object contains this per-user timestamp.

**Important caveat from GitHub issue [#9236](https://github.com/anthropics/claude-code/issues/9236):** There have been multiple reports of the displayed reset time being wrong (e.g., showing 23 hours instead of 5 hours) and timezone handling bugs. The underlying server-side timestamp appears correct but the display layer has had bugs.

---

## Research Question 3: Does the 7-day window roll continuously or have a fixed weekly reset day?

### Finding: Rolling 7-day window, not calendar-week aligned

The 7-day window is also a **rolling window**, not aligned to any calendar day such as Monday or Sunday.

The `resets_at` field in the `/api/oauth/usage` response shows a specific ISO 8601 timestamp for each user (e.g., `"2026-02-12T14:59:59.771647+00:00"`), distinct per account. This timestamp rolls forward based on when usage was consumed 7 days prior.

Example from the `/api/oauth/usage` endpoint response showing different reset times for the 5-hour vs 7-day windows:

```json
{
  "five_hour": {
    "utilization": 37.0,
    "resets_at": "2026-02-08T04:59:59.000000+00:00"
  },
  "seven_day": {
    "utilization": 26.0,
    "resets_at": "2026-02-12T14:59:59.771647+00:00"
  }
}
```

Sources: [codelynx.dev statusline guide](https://codelynx.dev/posts/claude-code-usage-limits-statusline), [Usagebar weekly vs 5-hour guide](https://usagebar.com/blog/claude-code-weekly-limit-vs-5-hour-lockout), [CometAPI guide](https://www.cometapi.com/when-does-claude-code-usage-reset/)

The Anthropic help center article on Max plans confirms two separate weekly usage limits exist — one all-models and one Sonnet-specific — both with rolling 7-day resets. ([What is the Max plan?](https://support.claude.com/en/articles/11049741-what-is-the-max-plan))

---

## Research Question 4: What are the actual numeric limits for Claude Max?

### Finding: Anthropic publishes approximate "hours" ranges, not hard token or message counts

Anthropic announced the weekly limits in a July 28, 2025 email and [TechCrunch article](https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/), effective August 28, 2025. The limits are given as hour-range estimates, not hard counts:

#### Weekly limits (Sonnet 4 and Opus 4 active processing hours):

| Plan | Monthly price | Sonnet 4 weekly hours | Opus 4 weekly hours |
|------|--------------|----------------------|---------------------|
| Pro | $20 | 40–80 hours | not specified |
| Max 5x | $100 | 140–280 hours | 15–35 hours |
| Max 20x | $200 | 240–480 hours | 24–40 hours |

Source: [tessl.io analysis](https://tessl.io/blog/why-claude-code-is-capping-power-users-and-what-it-means), [the-decoder.com](https://the-decoder.com/anthropic-will-set-new-weekly-usage-limits-for-claude-subscribers-starting-august/), [Usagebar guide](https://usagebar.com/blog/claude-code-weekly-limit-vs-5-hour-lockout)

**"Hours" definition:** Anthropic defined active hours as "periods when Claude models are actively processing tokens or executing code-related reasoning. Idle moments such as file browsing or conversational pauses do not count toward this quota." ([TrueFoundry explainer](https://www.truefoundry.com/blog/claude-code-limits-explained))

#### 5-hour session limits (message counts):

These are also approximations based on user testing, not official hard limits:

| Plan | ~Messages per 5 hours |
|------|----------------------|
| Pro | ~45 |
| Max 5x | ~225 |
| Max 20x | ~900 |

Sources: [IntuitionLabs Max plan article](https://intuitionlabs.ai/articles/claude-max-plan-pricing-usage-limits), [Usagebar guide](https://usagebar.com/blog/claude-code-weekly-limit-vs-5-hour-lockout)

**Important caveat:** Anthropic does not publish hard numeric limits. The actual cutoff for any given user depends on the model used, message complexity, and token consumption. Usage can be exhausted faster with Opus or long context windows. The utilization percentage is what matters operationally, not a raw message count. The ranges given are Anthropic's own estimates for "typical" usage.

Anthropic stated the August 2025 weekly limits were expected to affect "fewer than 5% of users." ([the-decoder.com](https://the-decoder.com/anthropic-will-set-new-weekly-usage-limits-for-claude-subscribers-starting-august/))

---

## Research Question 5: Is the `seven_day_sonnet` limit different from the main `seven_day` limit? Why does it exist?

### Finding: Yes — Sonnet now has its own independent weekly bucket

As of the **November 24, 2025 update** to Claude Code, a separate `seven_day_sonnet` limit was introduced alongside the existing `seven_day` (all-models) limit. The announcement stated:

> "We've increased your limits and removed the Opus cap, so you can use Opus 4.5 up to your overall limit. **Sonnet now has its own limit** — it's set to match your previous overall limit, so you can use just as much as before."

Source: [GitHub issue #12487 – Clarification on Opus and Sonnet limits after Nov 24 update](https://github.com/anthropics/claude-code/issues/12487)

The `/api/oauth/usage` endpoint confirms this by returning separate fields:

```json
{
  "seven_day": {
    "utilization": 26.0,
    "resets_at": "2026-02-12T14:59:59.771647+00:00"
  },
  "seven_day_sonnet": {
    "utilization": 1.0,
    "resets_at": "2026-02-13T20:59:59.771655+00:00"
  }
}
```

Note the different `resets_at` timestamps — they track independently.

**Why a separate Sonnet limit?** Anthropic has not published an official rationale. The most coherent community interpretation (from [GitHub issue #12487](https://github.com/anthropics/claude-code/issues/12487) and [GitHub issue #11604](https://github.com/anthropics/claude-code/issues/11604)):

1. Before November 2025, there was one combined weekly limit shared by all models (including Opus). When users exhausted it with Opus, they had no Sonnet fallback.
2. The new structure gives Opus unlimited access up to the `seven_day` overall budget, while Sonnet gets its own separate `seven_day_sonnet` bucket — allowing users who use Opus heavily to still have Sonnet capacity.

**Unresolved ambiguity:** GitHub issue #12487 documents conflicting user reports. Some users find that exhausting the `seven_day` (all-models) limit blocks Sonnet even when `seven_day_sonnet` shows capacity remaining. Anthropic has not officially clarified whether Sonnet usage counts against both buckets simultaneously or whether the buckets are truly independent. The issue remains open as of February 2026 with no official Anthropic response.

The `seven_day_sonnet` claimAbbrev in the binary is `"7d"` (same as `seven_day`), and it uses the same `windowSeconds: 604800`, confirming it is a parallel 7-day window tracking Sonnet-specific consumption.

---

## Research Question 6: Can usage data be read programmatically?

### Finding: Yes — via the `/api/oauth/usage` endpoint (undocumented but community-discovered)

There is a live REST endpoint that returns the current rate-limit state for a Pro/Max subscriber:

**Endpoint:**
```
GET https://api.anthropic.com/api/oauth/usage
```

**Required headers:**
```
Authorization: Bearer <oauth_access_token>
anthropic-beta: oauth-2025-04-20
Content-Type: application/json
User-Agent: claude-code/2.x.x
```

**Response JSON structure:**
```json
{
  "five_hour": {
    "utilization": 37.0,
    "resets_at": "2026-02-08T04:59:59.000000+00:00"
  },
  "seven_day": {
    "utilization": 26.0,
    "resets_at": "2026-02-12T14:59:59.771647+00:00"
  },
  "seven_day_sonnet": {
    "utilization": 1.0,
    "resets_at": "2026-02-13T20:59:59.771655+00:00"
  },
  "extra_usage": {
    "is_enabled": false,
    "monthly_limit": null,
    "used_credits": null,
    "utilization": null
  }
}
```

- `utilization` is a float from 0.0 to (potentially) above 100.0 if overage is active.
- `resets_at` is an ISO 8601 timestamp with timezone offset.
- `seven_day_opus` may also appear as a field (confirmed in some responses as `{"utilization": 0.0, "resets_at": null}` when Opus-specific tracking is not active).

Sources: [codelynx.dev statusline guide](https://codelynx.dev/posts/claude-code-usage-limits-statusline), [GitHub issue #21943 feature request](https://github.com/anthropics/claude-code/issues/21943), web search results showing example responses.

**How to get the access token:**

- **Linux:** `~/.claude/.credentials.json` contains `claudeAiOauth.accessToken`. ([GitHub issue #1414](https://github.com/anthropics/claude-code/issues/1414))
- **macOS:** Keychain, accessed via `security find-generic-password -s "Claude Code-credentials" -w`, returns the JSON with `claudeAiOauth.accessToken`.
- **Environment variable:** `CLAUDE_CODE_OAUTH_TOKEN` overrides the credentials file.

**Alternative approach — API response headers:**
The `anthropic-ratelimit-unified-*` headers are returned on every call to `https://api.anthropic.com/v1/messages` when using OAuth (subscription) credentials with the `anthropic-beta: oauth-2025-04-20` header. The `claude-rate-monitor` tool ([github.com/nsanden/claude-rate-monitor](https://github.com/nsanden/claude-rate-monitor)) probes this by sending a minimal `claude-haiku-4-5` request (cost ~$0.001) to refresh the headers.

**Official programmatic access: does not exist.**
GitHub issue [#21943](https://github.com/anthropics/claude-code/issues/21943) requested an official `--json` flag for `/usage` or a documented local cache file. As of February 2026, this is open/stale with no Anthropic response. The `/api/oauth/usage` endpoint is **not documented in Anthropic's public API docs** and was discovered through binary reverse-engineering and community investigation.

**Local stats cache (`~/.claude/stats-cache.json`):**
This file tracks locally-computed token and session counts from JSONL conversation files. It does NOT contain the subscription rate-limit percentages from the server. Its fields (`dailyActivity`, `dailyModelTokens`, `modelUsage`, `totalSessions`, `totalMessages`) are computed from local conversation history, not from the Anthropic backend. It cannot tell you how much of your 5-hour or 7-day quota remains. Sources: [Milvus blog on Claude Code local storage](https://milvus.io/es/blog/why-claude-code-feels-so-stable-a-developers-deep-dive-into-its-local-storage-design.md), [GitHub gist on ~/.claude structure](https://gist.github.com/samkeen/dc6a9771a78d1ecee7eb9ec1307f1b52)

---

## Research Question 7: What is "extra usage" / overage? How does it interact with the display?

### Finding: Pay-as-you-go continuation after quota exhaustion, with a broken tracking bug

**What it is:**
Extra usage allows Pro and Max subscribers who have exhausted their plan's included limits to continue using Claude at standard API rates (pay-as-you-go). It requires pre-funding an account balance and enabling the feature in Settings > Usage. No pricing premium is charged over standard API rates.

Source: [Anthropic help center — Extra usage for paid plans](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)

**The `extra_usage` field in `/api/oauth/usage`:**
```json
"extra_usage": {
  "is_enabled": true/false,
  "monthly_limit": <number or null>,
  "used_credits": <number or null>,
  "utilization": <number or null>
}
```

- `is_enabled`: Whether extra usage has been activated for the account.
- `monthly_limit`: Optional cap on extra usage spend per month (null = unlimited).
- `used_credits`: Amount consumed from the prepaid balance this month.
- `utilization`: Percentage of the monthly extra-usage cap consumed (null if no cap set).

**The `isUsingOverage` field** (in the binary's rate limit state object) is likely set to `true` when the current request is being charged against the extra-usage balance rather than the plan's included quota. The `unifiedRateLimitFallbackAvailable` field likely indicates whether the account has extra usage enabled and funded (i.e., whether there is a fallback payment path available after the plan limit is hit).

**The `anthropic-ratelimit-unified-overage-reset` header** (found in binary) likely indicates when the overage billing cycle resets.

**Known bug (GitHub issue [#24727](https://github.com/anthropics/claude-code/issues/24727)):**
Claude Code has been reported to display 100% usage and trigger extra-usage billing when the claude.ai web dashboard shows only 73% usage on the same account. This reveals that Claude Code's usage display can be based on a locally-cached estimate that drifts from the authoritative backend. The "phantom text blocks" bug in earlier versions (fixed in v2.1.38) inflated token counts and contributed to premature limit warnings. This bug resulted in a user being charged $53 in extra usage they did not intend to incur.

**Display interaction:**
When the rate limit state has `isUsingOverage: true`, Claude Code likely shows a distinct UI state indicating extra-usage billing is active. The `anthropic-ratelimit-unified-fallback-percentage` header (found via the `claude-rate-monitor` tool, value e.g. `0.2`) appears to represent a throttle rate applied during overage — meaning requests are allowed but potentially at reduced throughput.

---

## Research Question 8: Are the `anthropic-ratelimit-unified-*` headers documented anywhere?

### Finding: Not in official Anthropic API documentation

The official Anthropic API rate-limit documentation ([platform.claude.com/docs/en/api/rate-limits](https://platform.claude.com/docs/en/api/rate-limits)) documents the following response headers:

- `anthropic-ratelimit-requests-*`
- `anthropic-ratelimit-tokens-*`
- `anthropic-ratelimit-input-tokens-*`
- `anthropic-ratelimit-output-tokens-*`
- `anthropic-priority-*` (Priority Tier only)
- `anthropic-fast-*` (fast mode only)
- `retry-after`

**The `anthropic-ratelimit-unified-*` headers are entirely absent from this documentation.**

These headers are specific to **OAuth (subscription) credentials** — they appear when using a Claude Max/Pro OAuth token rather than an API key. They were discovered through:
1. Reverse-engineering the Claude Code binary (confirmed by pre-existing research findings).
2. Community tools like `claude-rate-monitor` ([github.com/nsanden/claude-rate-monitor](https://github.com/nsanden/claude-rate-monitor)), which documents them as "not in Anthropic's public documentation."
3. GitHub bug reports such as [issue #12829](https://github.com/anthropics/claude-code/issues/12829).

**Complete set of `anthropic-ratelimit-unified-*` headers discovered:**

| Header | Value type | Description |
|--------|-----------|-------------|
| `anthropic-ratelimit-unified-status` | string (`"allowed"` / `"rate_limited"`) | Overall account status |
| `anthropic-ratelimit-unified-5h-status` | string | 5-hour window status |
| `anthropic-ratelimit-unified-5h-utilization` | decimal (0.0–1.0+) | 5-hour usage as fraction |
| `anthropic-ratelimit-unified-5h-reset` | Unix timestamp | When 5-hour window resets |
| `anthropic-ratelimit-unified-7d-status` | string | 7-day window status |
| `anthropic-ratelimit-unified-7d-utilization` | decimal (0.0–1.0+) | 7-day usage as fraction |
| `anthropic-ratelimit-unified-7d-reset` | Unix timestamp | When 7-day window resets |
| `anthropic-ratelimit-unified-representative-claim` | string (`"five_hour"` / `"seven_day"`) | Which window is currently the binding constraint |
| `anthropic-ratelimit-unified-fallback-percentage` | decimal (e.g., `0.2`) | Throttle rate during overage / fallback mode |
| `anthropic-ratelimit-unified-overage-reset` | timestamp | When overage billing cycle resets |

Sources: [GitHub issue #12829](https://github.com/anthropics/claude-code/issues/12829), [claude-rate-monitor README](https://github.com/nsanden/claude-rate-monitor), [GitHub issue #22435 mitmproxy data](https://github.com/anthropics/claude-code/issues/22435)

**Why they exist separately from the documented headers:** The documented headers (`anthropic-ratelimit-requests-*`, `anthropic-ratelimit-tokens-*`) serve API-key customers with per-minute rate limits. The `anthropic-ratelimit-unified-*` headers serve the subscription (OAuth) use case with 5-hour and 7-day rolling windows — a completely different rate-limiting regime that Anthropic has not chosen to document publicly.

---

## What We Still Don't Know

1. **The exact formula for utilization.** Anthropic has never published how tokens, model weights, cache status, or features map to the utilization percentage. The 1,500x variance in tokens-per-1% observed in issue #22435 suggests it is a server-side cost equivalent, but this is unconfirmed.

2. **Whether `seven_day_sonnet` and `seven_day` are truly independent buckets.** Multiple users report that exhausting `seven_day` (all-models) blocks Sonnet access even when `seven_day_sonnet` shows capacity. Anthropic has not responded to GitHub issue #12487 (open since November 2025, no official reply as of February 2026).

3. **What `anthropic-ratelimit-unified-fallback-percentage` means precisely.** The value (e.g., `0.2`) is observed but not defined. It may mean "20% throughput allowed" or "you have used 20% of your fallback/overage quota."

4. **Whether the `/api/oauth/usage` endpoint is intentionally public or a private internal endpoint.** It is not referenced in any Anthropic documentation. It may be changed or removed without notice.

5. **What triggers the 5-hour window start.** The consensus is "first message in a session," but there are edge cases (e.g., does a tool call count? Does a non-interactive `claude -p` invocation start a window?).

6. **Whether the `seven_day_opus` field still appears in responses.** One documented response showed `"seven_day_opus": {"utilization": 0.0, "resets_at": null}`. After the November 2025 changes, it is unclear if Opus still has its own bucket or if Opus usage now only counts against `seven_day`.

7. **The exact semantics of `unifiedRateLimitFallbackAvailable` in the binary's rate limit state.** Inferred to mean "extra usage is available/enabled," but not confirmed from Anthropic sources.

8. **How `isUsingOverage` affects the `/usage` display.** The binary has this field in the rate limit state, but no screenshot or community report clearly describes what Claude Code shows to the user when `isUsingOverage` is true vs. false.

9. **Numeric hard limits.** Anthropic publishes only approximate "hour" ranges (e.g., "40–80 Sonnet hours per week for Pro"), not deterministic message counts or token counts. The actual cutoff varies per usage pattern and is determined by server-side utilization, not a fixed local threshold.

---

## Key Implications for the Stream Deck Display

### What data is displayable

All of the following can be obtained programmatically:

| Data point | Source | Latency |
|-----------|--------|---------|
| 5-hour utilization (0–100%) | `GET /api/oauth/usage` → `five_hour.utilization` | Live (per request) |
| 5-hour reset timestamp | `GET /api/oauth/usage` → `five_hour.resets_at` (ISO 8601) | Live |
| 7-day all-models utilization | `GET /api/oauth/usage` → `seven_day.utilization` | Live |
| 7-day all-models reset time | `GET /api/oauth/usage` → `seven_day.resets_at` | Live |
| 7-day Sonnet utilization | `GET /api/oauth/usage` → `seven_day_sonnet.utilization` | Live |
| 7-day Sonnet reset time | `GET /api/oauth/usage` → `seven_day_sonnet.resets_at` | Live |
| Extra usage enabled? | `GET /api/oauth/usage` → `extra_usage.is_enabled` | Live |
| Extra usage credits used | `GET /api/oauth/usage` → `extra_usage.used_credits` | Live |
| Which window is the binding constraint | `anthropic-ratelimit-unified-representative-claim` header | Per API call |

### How to get it

**Method A — Poll `/api/oauth/usage` directly (recommended):**
- Read OAuth access token from `~/.claude/.credentials.json` (Linux) or macOS Keychain.
- Issue a GET request with `Authorization: Bearer <token>` and `anthropic-beta: oauth-2025-04-20`.
- No additional API cost.
- Suggested polling interval: 60–300 seconds (no guidance from Anthropic; avoid aggressive polling).

**Method B — Parse API response headers from live requests:**
- Subscribe to `anthropic-ratelimit-unified-5h-utilization`, `anthropic-ratelimit-unified-7d-utilization`, and `anthropic-ratelimit-unified-representative-claim` from every API response.
- This requires intercepting Claude Code's HTTPS traffic (e.g., via mitmproxy) or using `~/.claude/.credentials.json` to issue your own probe request.
- The `claude-rate-monitor` tool ([github.com/nsanden/claude-rate-monitor](https://github.com/nsanden/claude-rate-monitor)) uses a minimal `claude-haiku` probe call (~$0.001 per check) to refresh these headers.

**Method C — Local JSONL files (NOT recommended for rate limit display):**
- The local `~/.claude/` JSONL conversation files and `stats-cache.json` provide token counts and session data but do **not** contain the server-side utilization percentage.
- Third-party tools like [ccusage](https://github.com/ryoppippi/ccusage) use these files for cost analysis, not for remaining-quota display.

### What to display on Stream Deck

A practical Stream Deck key could show:

1. **5-hour bar** — `five_hour.utilization` as a percentage, with color: green < 75%, yellow 75–90%, red > 90%. The 90% threshold at 72% time-elapsed matches the binary's alert configuration.
2. **Time to 5h reset** — computed as `five_hour.resets_at - now`.
3. **7-day bar** — `seven_day.utilization` as a percentage, with color: green < 50%, yellow 50–75%, red > 75%. These match the binary's `seven_day` thresholds.
4. **Which is the binding constraint** — `representative-claim` header: show "5H" or "7D" to indicate which limit is tighter.
5. **Extra usage active indicator** — `extra_usage.is_enabled` as a distinct color or icon.

### Caveats for the display

- **The utilization values are opaque percentages** — do not display them as "X tokens remaining" since the token-to-percent mapping is not deterministic.
- **The `/api/oauth/usage` endpoint is undocumented** and may change without notice. Build error handling for 4xx/5xx responses.
- **The credentials token expires** and needs refreshing. The `expiresAt` field in `~/.claude/.credentials.json` gives the expiry time (Unix ms). The refresh token (`refreshToken`) can be used to obtain a new access token via Anthropic's OAuth flow.
- **There is a known tracking discrepancy** (issue [#24727](https://github.com/anthropics/claude-code/issues/24727)) where the `oauth/usage` endpoint and the claude.ai web dashboard can disagree by up to 27 percentage points. Treat displayed values as approximations.
- **Linux vs macOS credential storage differs.** On Linux: `~/.claude/.credentials.json`. On macOS: Keychain (`security find-generic-password -s "Claude Code-credentials" -w`). On both: `CLAUDE_CODE_OAUTH_TOKEN` env var takes precedence.

---

## Sources Referenced

- [Using Claude Code with your Pro or Max plan — Anthropic Help Center](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)
- [Understanding usage and length limits — Anthropic Help Center](https://support.claude.com/en/articles/11647753-understanding-usage-and-length-limits)
- [Usage limit best practices — Anthropic Help Center](https://support.claude.com/en/articles/9797557-usage-limit-best-practices)
- [What is the Max plan? — Anthropic Help Center](https://support.claude.com/en/articles/11049741-what-is-the-max-plan)
- [Extra usage for paid Claude plans — Anthropic Help Center](https://support.claude.com/en/articles/12429409-extra-usage-for-paid-claude-plans)
- [Rate limits — Anthropic API Docs](https://platform.claude.com/docs/en/api/rate-limits)
- [Claude Code CLI Reference](https://code.claude.com/docs/en/cli-reference)
- [GitHub issue #12829 — Bug: rate limit blocking ignores representative-claim header](https://github.com/anthropics/claude-code/issues/12829)
- [GitHub issue #12487 — Clarification: are Opus and Sonnet limits independent after Nov 24 update?](https://github.com/anthropics/claude-code/issues/12487)
- [GitHub issue #11604 — [URGENT] Increase weekly Sonnet rate limits](https://github.com/anthropics/claude-code/issues/11604)
- [GitHub issue #21943 — Feature Request: Expose subscription usage data via local file or API](https://github.com/anthropics/claude-code/issues/21943)
- [GitHub issue #22435 — Inconsistent and undisclosed quota accounting changes](https://github.com/anthropics/claude-code/issues/22435)
- [GitHub issue #24727 — Max 20x: Claude Code reports 100% while dashboard shows 73%](https://github.com/anthropics/claude-code/issues/24727)
- [GitHub issue #9094 — [Meta] Unexpected change in Claude usage limits as of 2025-09-29](https://github.com/anthropics/claude-code/issues/9094)
- [GitHub issue #9236 — Claude usage limit reached, wrong reset time](https://github.com/anthropics/claude-code/issues/9236)
- [GitHub issue #1414 — Mac deletes .credentials.json that Linux uses](https://github.com/anthropics/claude-code/issues/1414)
- [How to Show Claude Code Usage Limits in Your Statusline — codelynx.dev](https://codelynx.dev/posts/claude-code-usage-limits-statusline)
- [When Does Claude Code Usage Reset? — Usagebar Blog](https://usagebar.com/blog/when-does-claude-code-usage-reset)
- [Claude Code Weekly Limit vs 5-Hour Lockout — Usagebar Blog](https://usagebar.com/blog/claude-code-weekly-limit-vs-5-hour-lockout)
- [When does Claude Code usage reset? — CometAPI](https://www.cometapi.com/when-does-claude-code-usage-reset/)
- [Anthropic unveils new rate limits to curb Claude Code power users — TechCrunch](https://techcrunch.com/2025/07/28/anthropic-unveils-new-rate-limits-to-curb-claude-code-power-users/)
- [Why Claude Code is capping power users — tessl.io](https://tessl.io/blog/why-claude-code-is-capping-power-users-and-what-it-means)
- [Anthropic will set new weekly usage limits — The Decoder](https://the-decoder.com/anthropic-will-set-new-weekly-usage-limits-for-claude-subscribers-starting-august/)
- [Claude Code Limits: Quotas & Rate Limits Guide — TrueFoundry](https://www.truefoundry.com/blog/claude-code-limits-explained)
- [Everything We Know About Claude Code Limits — Portkey AI](https://portkey.ai/blog/claude-code-limits/index.html)
- [Claude Max Plan Explained — IntuitionLabs](https://intuitionlabs.ai/articles/claude-max-plan-pricing-usage-limits)
- [Claude Code Limits — ClaudeLog](https://claudelog.com/claude-code-limits/)
- [GitHub — nsanden/claude-rate-monitor](https://github.com/nsanden/claude-rate-monitor)
- [GitHub — ryoppippi/ccusage](https://github.com/ryoppippi/ccusage)
- [GitHub — Maciek-roboblog/Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor)
- [Feature Request: Add OAuth rate limits and usage dashboard — anomalyco/opencode](https://github.com/anomalyco/opencode/issues/8911)
- [Claude Code Status Line gist — patyearone](https://gist.github.com/patyearone/7c753ef536a49839c400efaf640e17de)
- [Authentication — Claude Code Docs](https://code.claude.com/docs/en/authentication)
- [~/.claude directory structure gist — samkeen](https://gist.github.com/samkeen/dc6a9771a78d1ecee7eb9ec1307f1b52)
- [claude-code-stats — PyPI](https://pypi.org/project/claude-code-stats/)
