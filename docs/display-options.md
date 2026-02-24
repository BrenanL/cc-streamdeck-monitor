# Claude Usage Monitor — Display Options

This document describes all six Stream Deck action types provided by this plugin,
the 7-day pace algorithm, configurable settings, and the extra usage indicator.

---

## Overview of Action Types

All six actions share the same data source (one poll every 60 seconds via `wsl.exe`)
and display the same three usage buckets:

| Bucket | Field | Meaning |
|--------|-------|---------|
| `five_hour` | 5h session % | Rolling 5-hour window, starts on first message |
| `seven_day` | 7d all-models % | Rolling 7-day window for all models |
| `seven_day_sonnet` | 7d Sonnet % | Rolling 7-day window for Sonnet-only |

**Important:** All three windows are *rolling* — they are NOT aligned to Monday or any
calendar boundary. Each resets 5 hours (or 7 days) after the *first message* that
opened the window. The `resets_at` timestamp tells you when.

---

## Action 1: Usage Display (enhanced existing)

The original single-button view. All three buckets on one button.

```
┌──────────────────┐
│   5h session     │  ← dim label
│       80%        │  ← large, green/yellow/red by session threshold
│    ↺ 2h15m      │  ← reset countdown for 5h window
│ ─────────────── │
│  7d 28%  ◆ 32%  │  ← 7d% colored by pace; ◆32% colored by Sonnet threshold
└──────────────────┘
```

**7d pace color:** The `7d XX%` text is colored based on whether you are over or under
your expected weekly pace (see "7-Day Pace Algorithm" below). Green = on/under pace,
yellow = slightly over, red = significantly over.

**Extra usage:** When `extra_usage.is_enabled` is true, a small orange "EXTRA $X.XX"
indicator appears in the top-right corner.

**Settings:** Session thresholds, pace parameters, Sonnet thresholds.

---

## Action 2: Stacked Bars

Three horizontal progress bars, one per bucket, all equally prominent.

```
┌──────────────────┐
│5h [████████░░]80%│  ← bar colored by session threshold
│7d [████░░░░░░]42%│  ← bar colored by 7d pace
│ S [███░░░░░░░]28%│  ← bar colored by Sonnet threshold
│    ↺ 2h15m      │  ← 5h reset countdown
└──────────────────┘
```

Best for comparing all three buckets at a glance.

**Settings:** Session thresholds, pace parameters, Sonnet thresholds.

---

## Action 3: Toggle View

One view at a time; press the button to cycle through 5h → 7d → 7dS.
Each view uses the full button area for that bucket's detail.

```
View 0 (5h):        View 1 (7d):        View 2 (Sonnet):
● ○ ○  5h           ○ ● ○  7d           ○ ○ ●  S
       80%                  42%                  28%
   ↺ 2h15m              ↻ 1d12h             ↻ 5d03h
```

The dots at top show which view is active. Press to advance.

**Settings:** Session thresholds, pace parameters, Sonnet thresholds.

---

## Action 4: 5h Session Button

Dedicated button showing only the 5-hour session in detail.

```
┌──────────────────┐
│   5h session     │
│       80%        │  ← large, green/yellow/red
│    ↺ 2h15m      │
└──────────────────┘
```

**Settings:** Session yellow threshold (default 60), session red threshold (default 90).

---

## Action 5: 7d Weekly Button

Dedicated button showing 7-day usage with full pace breakdown.

```
┌──────────────────┐
│   7d weekly      │
│       42%        │  ← large, pace-colored
│  expected: 28%   │  ← expected at this point in the window
│   +14% over      │  ← delta, colored
│    ↻ 1d12h       │  ← 7d reset countdown
└──────────────────┘
```

The most informative view for pace tracking. Shows exactly how much over or under
you are relative to a steady working-days pace.

**Settings:** Pace parameters (pacePerDay, paceYellow, paceRed).

---

## Action 6: 7d Sonnet Button

Dedicated button for Sonnet-only 7-day usage.

```
┌──────────────────┐
│   7d Sonnet      │
│       28%        │  ← large, threshold-colored
│    ↻ 5d03h       │
└──────────────────┘
```

**Settings:** Sonnet yellow threshold (default 60), Sonnet red threshold (default 90).

---

## 7-Day Pace Algorithm

The goal is to answer: *given where I am in my 7-day window, am I using too much?*

### Window position

```
window_start = seven_day.resets_at − 7 days
days_elapsed  = (now − window_start) / 86400
```

### Workday-weighted expected pace

Rather than assuming uniform daily usage, the algorithm weights only working days
(Monday–Friday) since developers typically don't work weekends.

Default assumption: **20% per working day** → 5 days × 20% = 100% over the week.

The calculation walks each calendar day from `window_start` to `now` in local time
and accumulates fractional working days:

```
for each day d from window_start to now:
    if d is a weekday:
        workday_fraction += min(1.0, fraction of day d elapsed)

expected_pct = min(workday_fraction × pacePerDay, 100)
```

### Delta and color thresholds

```
delta = utilization − expected_pct
```

| Delta | Color | Meaning |
|-------|-------|---------|
| < paceYellow (default 5%) | green `#33cc77` | On pace or under |
| < paceRed (default 15%) | yellow `#ffaa00` | Slightly over pace |
| ≥ paceRed (default 15%) | red `#ff4444` | Significantly over pace |

**Example:** It's Wednesday morning (2 full working days elapsed). Expected pace:
`2 × 20% = 40%`. Actual usage: 55%. Delta: `+15%`. Color: **red** (≥ 15% over).

### Why rolling windows make this tricky

Because the 7-day window is rolling (not Mon–Sun calendar), the "day 1" of your window
might be a Thursday. The workday-weighted algorithm uses the *actual* day of week for
each calendar day, so it naturally handles this correctly.

---

## Configurable Settings (Property Inspector)

Each action exposes settings in the Stream Deck property inspector (the panel that
appears when a button is selected in the Stream Deck app).

### Combination actions (Display, Stacked, Toggle)

| Setting | Default | Description |
|---------|---------|-------------|
| Session yellow % | 60 | 5h session % at which color turns yellow |
| Session red % | 90 | 5h session % at which color turns red |
| Expected pace (% per workday) | 20 | 7d budget per working day (20 = 5-day week) |
| Pace yellow (% over expected) | 5 | How many % over pace turns yellow |
| Pace red (% over expected) | 15 | How many % over pace turns red |
| Weekly yellow % | 50 | Raw 7d threshold yellow (fallback coloring) |
| Weekly red % | 75 | Raw 7d threshold red (fallback) |
| Sonnet yellow % | 60 | 7dS % at which color turns yellow |
| Sonnet red % | 90 | 7dS % at which color turns red |

### 5h Session button

| Setting | Default |
|---------|---------|
| Session yellow % | 60 |
| Session red % | 90 |

### 7d Weekly button

| Setting | Default |
|---------|---------|
| Expected pace (% per workday) | 20 |
| Pace yellow (% over expected) | 5 |
| Pace red (% over expected) | 15 |

### 7d Sonnet button

| Setting | Default |
|---------|---------|
| Sonnet yellow % | 60 |
| Sonnet red % | 90 |

---

## Extra Usage Indicator

When `extra_usage.is_enabled` is `true` (i.e., you've enabled the pay-as-you-go
continuation feature and your plan quota is exhausted), all display types show a
small orange indicator in the top-right corner of the button:

- If `used_credits` is available: shows `$X.XX` (amount charged this month)
- If no credit amount: shows `EXTRA`

This lets you see at a glance that you are burning real money, without disrupting
the main usage readout.

---

## Files Changed

| File | Change |
|------|--------|
| `src/shared/poller.ts` | New — shared polling logic for all actions |
| `src/shared/pace.ts` | New — 7d workday-weighted pace calculation |
| `src/shared/svg.ts` | New — shared SVG helpers |
| `src/actions/usage-display.ts` | Updated — pace color, settings, extra usage |
| `src/actions/usage-stacked.ts` | New — stacked bars action |
| `src/actions/usage-toggle.ts` | New — toggle-on-press action |
| `src/actions/usage-session.ts` | New — 5h-only dedicated button |
| `src/actions/usage-weekly.ts` | New — 7d-only dedicated button with pace detail |
| `src/actions/usage-sonnet.ts` | New — 7dS-only dedicated button |
| `src/plugin.ts` | Updated — register all 6 actions |
| `manifest.json` | Updated — 5 new actions, PropertyInspectorPath per action |
| `ui/combo-settings.html` | New — PI for Display/Stacked/Toggle |
| `ui/session-settings.html` | New — PI for Session button |
| `ui/weekly-settings.html` | New — PI for Weekly button |
| `ui/sonnet-settings.html` | New — PI for Sonnet button |
