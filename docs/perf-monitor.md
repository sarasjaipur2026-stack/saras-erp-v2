# Post-idle Perf Monitor

Automated 5×/day regression check for the "click Orders/Enquiries after idle → slow" bug. Two layers.

## Layer 1 — GitHub Action (always on, no Claude needed)

**Workflow:** `.github/workflows/perf-monitor.yml`
**Runs:** 06:23 / 09:23 / 11:23 / 13:23 / 15:23 UTC (≈ 11:53 / 14:53 / 16:53 / 18:53 / 20:53 IST)
**Trigger:** cron + manual via "Run workflow" button

### What it does

1. Installs dependencies + headless Chromium.
2. Runs `tests/perf/idle-click.spec.js` against live production.
3. Measures:
   - Dashboard cold-load time
   - Warm Orders click → render
   - Warm Enquiries click → render
   - **Simulated expired-JWT + Orders click** (the idle-tab scenario)
   - Number of `/auth/v1/token` refreshes during the post-idle click (must be ≤ 1)
4. Appends one JSON line to `docs/perf-log.ndjson` + commits it.
5. Computes rolling median over last 10 healthy runs.
6. Opens a GitHub Issue tagged `perf`+`regression`+`auto-detected` if any of:
   - Latest `post_idle_orders_ms` is >50% worse than median (or +800 ms)
   - `token_refreshes_in_post_idle > 1` (means authGate race returned)
   - Test run crashed

### Required GitHub secrets (one-time setup)

To unlock the authenticated scenarios (Phases 2–5), add these in the GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `SARAS_TEST_EMAIL` | A dedicated test account email (create one in Supabase Auth, role=staff) |
| `SARAS_TEST_PASSWORD` | That account's password |

Without these, Phase 1 (Dashboard cold load) still runs and logs — but the idle-click scenarios are skipped.

**Optional** variable:

| Variable | Default |
|---|---|
| `PROD_URL` | `https://saras-erp-v2-rebuild.vercel.app` |

### Reading the log

`docs/perf-log.ndjson` — one JSON object per run:

```json
{
  "timestamp": "2026-04-16T14:53:00Z",
  "commit": "0c7d185",
  "branch": "main",
  "authenticated": true,
  "dashboard_load_ms": 742,
  "orders_click_ms": 635,
  "enquiries_click_ms": 128,
  "post_idle_orders_ms": 1362,
  "token_refreshes_in_post_idle": 1,
  "errors": []
}
```

Quick health check:
```bash
tail -5 docs/perf-log.ndjson | jq '{ts: .timestamp, idle: .post_idle_orders_ms, refreshes: .token_refreshes_in_post_idle, ok: .post_idle_orders_ms < 2000 and .token_refreshes_in_post_idle == 1}'
```

## Layer 2 — Claude watchdog (session-bound, opportunistic)

When a Claude Code session is open, a scheduled task fires at 08:27 / 11:27 / 14:27 / 17:27 / 20:27 IST and:

1. Reads the perf log.
2. Computes median / latest / refresh-count.
3. Only speaks up if there's a regression.
4. On regression, correlates with recent commits + Vercel runtime logs + Supabase advisors and proposes a fix.

This layer is bonus coverage — the primary watchdog is Layer 1. Layer 2 is best thought of as "when Claude happens to be around at check time, it does deeper analysis."

## What "no regression" looks like

On a healthy day, you should see:
- `post_idle_orders_ms` consistently between 800 – 1800 ms
- `token_refreshes_in_post_idle` always = 1 (one proactive refresh, zero reactive retries)
- No GitHub issues opened
- `docs/perf-log.ndjson` quietly growing by 5 entries/day

## When the system cries wolf

A GitHub issue is opened with full diagnostic context. Example:

```
Perf regression: 2026-04-20T14:53:00Z — token_refreshes_in_post_idle = 3
Reason: authGate race returned (>1 refresh call per post-idle click)
Latest: 3421ms
Median: 1180ms
```

Next steps when you see one:
1. Read the issue body (includes full JSON).
2. Check `git log` since the last healthy run — the regression commit is usually obvious.
3. If the authGate is still intact, check for new code paths that call `supabase.from(...)` WITHOUT going through `safe()` — those bypass the gate.

## Cost

- GitHub Actions: ~3 min/run × 5 = 15 min/day = 450 min/month. Well within free tier.
- No Supabase read amplification beyond what the test does (one login + ~4 data clicks).
