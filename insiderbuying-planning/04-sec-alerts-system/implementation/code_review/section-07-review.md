# Section 07 Code Review -- n8n Workflow Configuration

**Reviewer**: Claude Opus 4.6 (1M context)
**Date**: 2026-03-28
**Verdict**: PASS with Important issues

---

## What Was Done Well

- **Market hours guard is correctly extracted** as a standalone pure function with full testability. The `checkMarketHours(date)` signature accepting an injected Date is exactly right for deterministic testing.
- **Intl.DateTimeFormat usage is correct** -- `America/New_York` with `hour12: false` handles EST/EDT transitions automatically. No manual DST math anywhere. This matches the spec requirement exactly.
- **Guard inversion is correct**: W4-market checks `if (!isMarketHours) return []` (exit when NOT market hours), W4-afterhours checks `if (isMarketHours) return []` (exit when IS market hours). The tests explicitly verify this via regex assertions against the jsCode.
- **Boundary conditions are well-tested**: 09:29 (before open), 09:30 (exact open), 15:59 (last minute), 16:00 (exact close). The close boundary correctly returns `false` since the condition is `estHour < 16` (exclusive).
- **DST transition test** covers November (EST, UTC-5) separately from March (EDT, UTC-4), verifying the Intl approach works across both offsets.
- **Workflow JSON structure is complete**: both workflows have the full node chain (trigger -> guard -> sec-monitor -> score-alert -> analyze-alert -> IF -> deliver-alert), correct connections, and proper IF node configuration with `significance_score >= 6`.
- **Env var validation** reports ALL missing vars at once (not just the first), which is better for debugging.
- **maxConcurrency: 1** on W4-afterhours prevents overlapping executions as required by the spec.

---

## Issues

### IMPORTANT -- fetchFn polyfill duplicated 5 times per workflow (10 total)

`insiderbuying-site/n8n/workflows/insiderbuying/w4-market.json` and `w4-afterhours.json` both contain the identical ~15-line `fetchFn` polyfill copy-pasted into every Code node's `jsCode`. This is 4 copies per workflow (sec-monitor, score-alert, analyze-alert, deliver-alert) = 8 copies total.

**Why this matters**: When a bug is found in the fetch polyfill (e.g., missing `Content-Length` header for POST bodies, or redirect handling), it must be fixed in 8 places. This is the exact pattern that causes silent divergence over time.

**Recommendation**: Extract `fetchFn` into a shared utility file (e.g., `n8n/code/insiderbuying/fetch-polyfill.js`) and `require()` it in each Code node, the same way `market-hours-guard.js` is required. Each Code node's jsCode would shrink to ~4 lines:

```javascript
const { fetchFn, sleep } = require('/home/node/.n8n/code/insiderbuying/fetch-polyfill.js');
const { runSecMonitor } = require('/home/node/.n8n/code/insiderbuying/sec-monitor.js');
const filings = await runSecMonitor({ fetchFn, sleep, env: $env });
return filings.map(f => ({ json: f }));
```

### IMPORTANT -- W4-market missing maxConcurrency / concurrency guard

`w4-market.json` settings:
```json
"settings": {
  "executionOrder": "v1"
}
```

`w4-afterhours.json` settings:
```json
"settings": {
  "executionOrder": "v1",
  "callerPolicy": "workflowsFromSameOwner",
  "maxConcurrency": 1
}
```

The spec says "Wait for previous execution to finish" is critical for afterhours (to prevent dedup races), but W4-market also runs expensive operations (SEC API calls, Supabase writes, Anthropic API calls). If a market-hours run takes > 15 minutes (large batch of filings + Anthropic latency), the next trigger will start a second concurrent execution. This creates the same dedup race the afterhours guard prevents.

**Recommendation**: Add `"maxConcurrency": 1` to W4-market settings as well.

### IMPORTANT -- Env var name mismatch between spec and env vars file

The spec (section-07-n8n-workflow-config.md line 162) specifies:
```
SUPABASE_SERVICE_KEY: "eyJ..."
```

The env vars file (`w4-env-vars.yml` line 200) specifies:
```
SUPABASE_SERVICE_ROLE_KEY: "eyJ..."
```

And the env vars file adds table-specific IDs not in the spec:
```
INSIDER_ALERTS_TABLE_ID: "tbl..."
MONITOR_STATE_TABLE_ID: "tbl..."
```

While the env vars file is more granular (which is fine), the name discrepancy (`SERVICE_KEY` vs `SERVICE_ROLE_KEY`) could cause confusion. Verify which name `sec-monitor.js` actually reads from `$env` and ensure the docker-compose matches.

### SUGGESTION -- `hour: 'numeric'` with `hour12: false` can return "24" for midnight

On some JavaScript engines, `Intl.DateTimeFormat` with `hour: 'numeric'` and `hour12: false` returns `"24"` for midnight instead of `"0"`. Using `hour: '2-digit'` would guarantee `"00"`. In practice this edge case only affects midnight ET, which is never market hours, so it would not cause a wrong `isMarketHours` result. However, the returned `estHour` value of 24 instead of 0 could confuse logging or debugging.

**Recommendation**: Consider using `hourCycle: 'h23'` instead of `hour12: false` to guarantee 0-23 range across all engines.

### SUGGESTION -- Market-hours guard node also in W4-market guard

The spec (line 82-85) says:

> No market-hours guard needed inside the code -- the schedule itself can be configured to only run Mon-Fri

The implementation adds a guard node to W4-market as well, which is a beneficial deviation. This is actually better than the spec's suggestion because it correctly handles DST without depending on n8n's cron timezone support. No action needed -- just noting this is an improvement over the spec.

### SUGGESTION -- No test for the afterhours guard regex assertion robustness

The test `w4-afterhours.json: has afterhours guard that skips market hours` uses:
```javascript
expect(guard.parameters.jsCode).toMatch(/isMarketHours.*return \[\]/s);
```

This regex with the `s` (dotAll) flag will match across newlines, which is correct for the minified jsCode. However, if someone reformats the jsCode to multi-line or adds a comment between `isMarketHours` and `return []`, the regex still matches (which is the desired behavior). This is fine.

The W4-market guard test uses:
```javascript
expect(guard.parameters.jsCode).toMatch(/!isMarketHours/);
```

This is weaker -- it only checks for the negation, not that it leads to `return []`. Consider strengthening to `/!isMarketHours.*return \[\]/s` for parity.

### SUGGESTION -- Holiday handling absent

NYSE is closed on ~9 holidays per year (New Year's, MLK Day, Presidents' Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas). The current guard only checks weekday + time. During holidays, W4-market will still run (and find no new filings), while W4-afterhours will skip.

This is not a bug -- running W4-market on holidays just wastes API calls (SEC returns nothing, cost is negligible). But if holiday handling is ever desired, it belongs in `checkMarketHours()` with a static holiday list for the current year.

---

## Plan Alignment

| Spec Requirement | Status | Notes |
|---|---|---|
| Two workflows: W4-market and W4-afterhours | DONE | Both JSON files present with correct names |
| Market-hours guard via Intl.DateTimeFormat | DONE | No manual DST math, `America/New_York` timezone |
| Guard correctly inverted between workflows | DONE | market: `!isMarketHours`, afterhours: `isMarketHours` |
| W4-market: `*/15 * * * *` cron | DONE | |
| W4-afterhours: `0 * * * *` cron | DONE | |
| Wait for previous execution (afterhours) | DONE | `maxConcurrency: 1` |
| Node chain: trigger -> guard -> sec-monitor -> score -> analyze -> IF -> deliver | DONE | Both workflows |
| IF node: `significance_score >= 6` | DONE | `gte` operator, rightValue 6 |
| Env var documentation | DONE | `w4-env-vars.yml` |
| Env var fail-fast validation | DONE | `validateEnvVars()` + test verifying `sec-monitor.js` exports `REQUIRED_ENV` |
| Unit tests for guard boundaries | DONE | 10 test cases including DST |
| Unit tests for env validation | DONE | 5 test cases |
| Workflow structure tests | DONE | JSON validation for both workflows |

---

## Test Coverage Assessment

**Covered well**: market hours boundaries, DST transitions, weekend detection, env var validation, workflow JSON structure, node chain connectivity, IF node configuration.

**Gap -- no test for `hour: 'numeric'` returning "24"**: As noted above, midnight edge case. Low risk since midnight is never market hours.

**Gap -- no integration test for empty batch flow**: The spec says "if sec-monitor returns empty array, downstream nodes naturally receive no items." This is an n8n runtime behavior, not testable in unit tests, but worth noting for the manual verification checklist.

**Gap -- `$input.first().json` failure on empty input**: In the workflow JSON, score-alert/analyze-alert/deliver-alert all use `$input.first().json`. If sec-monitor returns an empty array, n8n's `$input.first()` will be `undefined`, and `.json` will throw. This is actually handled correctly by n8n's runtime (nodes with no input items are simply not executed), but it is worth verifying during the manual end-to-end test.

---

## Summary

The implementation is solid and aligns well with the spec. The market-hours guard logic is correct, DST handling is proper, and the guard inversion between the two workflows is verified by tests. The most actionable items are: (1) extract the duplicated fetchFn polyfill into a shared module, (2) add `maxConcurrency: 1` to W4-market, and (3) reconcile the env var naming discrepancy. None of these are blockers for moving forward.
