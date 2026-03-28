# Section 07 — n8n Workflow Configuration

## Dependencies

This section wires together the Code nodes built in sections 02–06. It cannot be completed until:
- **section-05-write-persistence** is done (sec-monitor, score-alert, analyze-alert, write logic all working)
- **section-06-deliver-alert** is done (deliver-alert.js working)

This section has no downstream blockers — it is the final backend section.

---

## What This Section Covers

1. Two n8n workflow definitions: **W4-market** and **W4-afterhours**
2. The market-hours guard logic inside W4-afterhours
3. The node chain connecting all four Code nodes
4. Environment variable setup in docker-compose.yml

---

## Tests (Write These First)

From `claude-plan-tdd.md`, Section 7:

```
# Test (manual): W4-market cron fires every 15 min during NYSE hours — verify in n8n execution log
# Test (manual): W4-afterhours cron fires every 60 min
# Test: afterhours market-hours guard exits at 10:00 EST on Monday (market hours)
# Test: afterhours market-hours guard proceeds at 20:00 EST on Monday (afterhours)
# Test: afterhours market-hours guard proceeds at 10:00 EST on Saturday (weekend)
# Test: afterhours guard uses Intl.DateTimeFormat('America/New_York') — no manual DST math
# Test (manual): n8n "Wait for previous execution" is enabled — two simultaneous executions don't occur
# Test: all required env vars are present (ANTHROPIC_API_KEY, FINANCIAL_DATASETS_API_KEY, etc.) — fail fast at startup if missing
```

### How to Test the Market-Hours Guard

The guard logic is pure JavaScript and can be unit-tested outside n8n. Extract the guard into a standalone function and call it with known UTC timestamps:

```javascript
// tests/insiderbuying/marketHoursGuard.test.js
// Test cases: Monday 10:00 EST = market hours → should exit
// Monday 20:00 EST = afterhours → should proceed
// Saturday 10:00 EST = weekend → should proceed
// Monday 09:29 EST = before open → should proceed (afterhours)
// Monday 16:00 EST = exact close = market hours boundary → check spec: should proceed
```

Use `new Date('2026-03-23T15:00:00Z')` style inputs (UTC) so tests are timezone-independent.

The guard must use `Intl.DateTimeFormat('America/New_York')`. Do **not** manually subtract 5 or 4 hours — this will break during DST transitions. The `America/New_York` timezone identifier handles EST/EDT automatically. `isDST()` does not exist in JavaScript — do not attempt to call it.

### Env Var Fail-Fast Test

At the top of `sec-monitor.js` (or any Code node), add a startup check:

```javascript
const REQUIRED_ENV = [
  'ANTHROPIC_API_KEY',
  'FINANCIAL_DATASETS_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_KEY',
  'AIRTABLE_INSIDERBUYING_BASE_ID',
  'RESEND_API_KEY',
  'ONESIGNAL_APP_ID',
  'ONESIGNAL_REST_API_KEY',
  'TELEGRAM_ALERT_CHAT_ID',
];
// stub: iterate REQUIRED_ENV, throw if any is missing/empty
```

Test: if any env var is missing, the node throws immediately with a clear message naming the missing variable. This prevents silent failures hours into a run.

---

## W4-market Workflow

**Schedule trigger**: every 15 minutes during NYSE market hours.

- Cron expression: `*/15 * * * *`
- No market-hours guard needed inside the code — the schedule itself can be configured to only run Mon-Fri, or an IF node can be added after the trigger checking EST time.
- If using an IF node: same `Intl.DateTimeFormat` approach as W4-afterhours, but inverted (exit if NOT market hours).

Recommended approach: configure the n8n schedule trigger with the cron `*/15 9-16 * * 1-5` (approximately Mon-Fri 09:00-16:00 UTC... but EST offset varies). The simpler and more reliable approach is to keep `*/15 * * * *` and add the IF node guard — this handles DST correctly without depending on n8n's cron timezone support.

---

## W4-afterhours Workflow

**Schedule trigger**: every 60 minutes, always active.

- Cron expression: `0 * * * *`
- In n8n workflow settings: enable **"Wait for previous execution to finish"**. This is critical — if one afterhours run takes longer than 60 minutes (e.g., large batch of filings), a second run must not start until the first completes. Without this, two runs hit the SEC endpoint simultaneously and create dedup races.

**Market-hours guard** — add as the first IF node after the Schedule Trigger, or at the top of `sec-monitor.js`:

```javascript
const now = new Date();
const estParts = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric', minute: 'numeric', weekday: 'short', hour12: false
}).formatToParts(now);

const parts = Object.fromEntries(estParts.map(p => [p.type, p.value]));
const estHour = parseInt(parts.hour);
const estMinute = parseInt(parts.minute);
const isWeekday = !['Sat', 'Sun'].includes(parts.weekday);

const isMarketHours = isWeekday &&
  (estHour > 9 || (estHour === 9 && estMinute >= 30)) && estHour < 16;

if (isMarketHours) return []; // exit — W4-market handles this window
```

If implemented as an IF node: the "true" branch (isMarketHours) leads to a Stop & Error node or simply ends the workflow. The "false" branch continues to `sec-monitor.js`.

If implemented inside `sec-monitor.js`: place the guard at the very top of the main execution block, before any SEC API calls or Airtable reads.

---

## Node Chain (Both Workflows)

```
Schedule Trigger
  → [optional IF: market-hours guard] (W4-afterhours only)
  → sec-monitor.js (Code node)         — Section 02: filing discovery + enrichment
  → score-alert.js (Code node)         — Section 03: significance scoring
  → analyze-alert.js (Code node)       — Section 04: AI analysis prose
  → IF: significance_score >= 6
      TRUE  → deliver-alert.js (Code node)  — Section 06: email + push delivery
      FALSE → (workflow ends)
```

### Data Flow Between Nodes

Each Code node receives the previous node's output as `$input.first().json` and returns enriched data forward. The shape passed between nodes accumulates fields:

- After `sec-monitor.js`: array of filing objects with `ticker`, `insider_name`, `transaction_date`, `transaction_value`, `transaction_type`, `insider_category`, `dedup_key`, `cluster_id`, `is_cluster_buy`, `airtable_record_id`, `supabase_id`
- After `score-alert.js`: same + `significance_score`, `score_reasoning`
- After `analyze-alert.js`: same + `ai_analysis` (may be null if score < 4 or generation failed)
- The IF node checks `significance_score >= 6` on each item
- `deliver-alert.js` receives the full enriched filing object

**Empty batch handling**: if `sec-monitor.js` returns an empty array (no new filings since last check), all downstream nodes naturally receive no items and stop without error. No special handling needed.

---

## Environment Variables

Add or verify the following in `/docker/n8n/docker-compose.yml` under `environment:`:

```yaml
# Claude AI (scoring + analysis)
ANTHROPIC_API_KEY: "sk-ant-..."

# Financial Datasets (Form 4 enrichment)
FINANCIAL_DATASETS_API_KEY: "..."

# Supabase (read/write insider_alerts + user preferences)
SUPABASE_URL: "https://<project>.supabase.co"
SUPABASE_SERVICE_KEY: "eyJ..."   # service role key, NOT anon key

# Airtable InsiderBuying base (different from ToxicOrNah base)
AIRTABLE_INSIDERBUYING_BASE_ID: "app..."
AIRTABLE_API_KEY: "pat..."       # may already exist; verify it has access to new base

# Email delivery
RESEND_API_KEY: "re_..."         # may already exist in docker-compose; verify

# Push notifications
ONESIGNAL_APP_ID: "..."
ONESIGNAL_REST_API_KEY: "..."

# Error monitoring (Telegram bot from existing content pipeline)
TELEGRAM_ALERT_CHAT_ID: "-100..."  # chat ID for dead-letter + error alerts
```

**Access pattern in Code nodes** (follow existing n8n convention):
```javascript
const anthropicKey = (typeof $env !== 'undefined' && $env.ANTHROPIC_API_KEY) || '';
if (!anthropicKey) throw new Error('Missing ANTHROPIC_API_KEY');
```

**SUPABASE_SERVICE_KEY vs anon key**: cluster detection and status updates require the service role key (bypasses RLS). The anon key will silently fail on UPDATE operations. Confirm the correct key is used.

---

## n8n Workflow JSON Tips

When building the workflows in the n8n UI and exporting JSON:

- **W4-market**: name it `W4-market` or `InsiderBuying SEC Monitor (Market Hours)`
- **W4-afterhours**: name it `W4-afterhours` or `InsiderBuying SEC Monitor (After Hours)`
- Code nodes: name them clearly — `sec-monitor`, `score-alert`, `analyze-alert`, `deliver-alert` — to match the file convention in `n8n/code/insiderbuying/`
- The IF node condition: `{{ $json.significance_score >= 6 }}` — use n8n expression syntax
- "Wait for previous execution": found in workflow Settings (gear icon), not in the trigger node itself

---

## Verification Checklist

Before marking this section done, verify:

- [ ] W4-market fires in n8n execution log every 15 min during a test window (manually check logs)
- [ ] W4-afterhours fires in n8n execution log every 60 min
- [ ] With a manually set `Monitor_State.last_check_timestamp` from 30 min ago, W4-market picks up filings from that window
- [ ] W4-afterhours skips execution at 10:00 EST Mon-Fri (market hours guard works)
- [ ] W4-afterhours executes at 20:00 EST Mon-Fri (afterhours)
- [ ] W4-afterhours executes at 10:00 EST Saturday (weekend)
- [ ] Only one W4-afterhours execution runs at a time (verified via n8n execution list — no overlaps)
- [ ] All env vars present and accessible inside a test Code node (`return [{ json: { key: $env.ANTHROPIC_API_KEY?.slice(0,5) } }]`)
- [ ] End-to-end: triggering W4 manually on a day with known AAPL Form 4 activity produces an Airtable record and Supabase row
