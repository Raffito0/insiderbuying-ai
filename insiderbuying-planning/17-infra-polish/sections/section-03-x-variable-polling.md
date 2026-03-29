# Section 03: A6 — X Monitoring Variable Frequency Polling

## Overview

`x-engagement.js` currently runs on a fixed cron schedule via n8n's Schedule Trigger (W8). The goal is to make polling market-hours-aware without requiring native n8n dynamic scheduling (which doesn't exist). The approach is a 1-minute cron + skip-logic pattern: the workflow fires every minute, but most executions return immediately after comparing elapsed time against the computed interval.

**File to modify:** `n8n/code/insiderbuying/x-engagement.js`
**Test file:** `n8n/tests/x-engagement.test.js` (create or update)
**n8n manual step:** Change W8 Schedule Trigger to every 1 minute, then set concurrency to 1 (Single Execution Mode) in W8 Settings.

**Dependencies:** None. This section is fully independent and can be implemented in parallel with all others.

---

## Tests First

Add these tests to `n8n/tests/x-engagement.test.js`. All tests use the Node.js native test runner.

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
```

### getCurrentPollingInterval

```
describe('getCurrentPollingInterval', () => {
  // weekday (Mon–Fri) at 10:00 EST → 5 * 60 * 1000
  // weekday at 17:00 EST → 15 * 60 * 1000
  // weekday at 22:00 EST → 60 * 60 * 1000
  // Saturday at 10:00 EST → 60 * 60 * 1000
  // Sunday at 14:00 EST → 60 * 60 * 1000
  // boundary: 9:00 EST → market_open (5 min), 8:59 EST → overnight (60 min)
  // boundary: 15:59 EST → market_open (5 min), 16:00 EST → extended (15 min)
  // boundary: 19:59 EST → extended (15 min), 20:00 EST → overnight (60 min)
  // DST spring-forward (e.g. 2025-03-09): 10:00 America/New_York → market_open
  // DST fall-back (e.g. 2025-11-02): 10:00 America/New_York → market_open
});
```

Each test constructs a specific `Date` object and passes it into `getCurrentPollingInterval(date)` (see implementation note below about the function signature).

To construct deterministic test dates: use `new Date('2025-03-10T15:00:00.000Z')` (UTC) and verify the function maps it correctly to EST market hours. Alternatively, accept `date` as a parameter and test by passing explicit UTC timestamps that correspond to known EST times.

### getESTHour

```
describe('getESTHour', () => {
  // returns an integer (typeof === 'number', Number.isInteger)
  // for a UTC date corresponding to 10:00 EST, returns 10
  // uses Intl.DateTimeFormat internally (verify via code inspection or mock-replace)
});
```

### Skip Logic

```
describe('skip logic', () => {
  // elapsed < interval → does NOT call engagement logic, returns early
  // elapsed >= interval → calls nocodbPatch with last_run BEFORE engagement logic
  // if engagement logic throws → last_run was already patched (not rolled back)
  // at end of successful run → patches polling_interval field for observability
});
```

For the "last_run patched before engagement" test: pass in a mock engagement function that throws, then assert the mock `nocodbPatch` was called with `last_run` before the throw propagated.

---

## Implementation

### 1. Add helper functions (export or module-local)

```javascript
function getESTHour(date) {
  // Use Intl.DateTimeFormat with timeZone: 'America/New_York'
  // Returns integer hour (0-23)
  // See exact implementation below — do not use UTC offset arithmetic
}

function getCurrentPollingInterval(date /* optional, defaults to new Date() */) {
  // Returns one of:
  //   5 * 60 * 1000   (market hours: Mon-Fri 09:00-15:59 EST)
  //   15 * 60 * 1000  (extended hours: Mon-Fri 16:00-19:59 EST)
  //   60 * 60 * 1000  (overnight + weekends)
}
```

Exact implementation of both functions (copy verbatim — correctness is critical for DST):

```javascript
function getESTHour(date) {
  return parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    hour12: false,
  }).format(date), 10);
}

function getCurrentPollingInterval(date) {
  date = date || new Date();
  const h = getESTHour(date);
  const day = date.getDay(); // 0=Sun, 6=Sat
  if ([1, 2, 3, 4, 5].includes(day) && h >= 9 && h < 16)
    return 5 * 60 * 1000;
  if ([1, 2, 3, 4, 5].includes(day) && h >= 16 && h < 20)
    return 15 * 60 * 1000;
  return 60 * 60 * 1000;
}
```

**Why `Intl.DateTimeFormat` and not UTC offset?** UTC-5/UTC-4 arithmetic requires manually tracking DST transitions. `Intl.DateTimeFormat` with `timeZone: 'America/New_York'` delegates to the IANA tz database embedded in the V8 runtime — it handles all historical and future DST transitions automatically. This is the correct, zero-maintenance approach.

**Why pass `date` as a parameter?** It makes the function pure and trivially testable without mocking `Date.now()`.

### 2. Add skip logic at the top of the workflow entry point

The entry point function in `x-engagement.js` (the function called by n8n on each 1-minute tick) must follow this exact ordering:

```javascript
async function runEngagement(opts) {
  const { nocodbGet, nocodbPatch, telegram } = opts;

  // Step 1: Read last_run from X_State
  const state = await nocodbGet('X_State', /* filter for single row */);
  const lastRun = state.last_run || 0;

  // Step 2: Compute elapsed
  const elapsed = Date.now() - lastRun;

  // Step 3: Check interval — skip if too soon
  if (elapsed < getCurrentPollingInterval()) {
    return; // early exit, no engagement
  }

  // Step 4: IMMEDIATELY patch last_run BEFORE engagement logic
  // This prevents a race condition if the engagement run takes > 1 min
  await nocodbPatch('X_State', { last_run: Date.now() });

  // Step 5: Run engagement logic (existing code unchanged)
  await doEngagement(opts);

  // Step 6: Patch polling_interval for observability
  await nocodbPatch('X_State', { polling_interval: getCurrentPollingInterval() });
}
```

**Race condition explanation:** If `last_run` is updated only at the end of the run and the engagement logic takes >1 minute, the next 1-minute tick fires before the run completes and reads the old `last_run`. Both executions proceed concurrently. Patching `last_run` at Step 4 (before engagement) means any concurrent tick will see an updated timestamp and skip. This is the correct fix. Single Execution Mode in n8n (concurrency=1) is a belt-and-suspenders guard, but the code-level patch ordering is the primary protection.

**What is `X_State`?** A single-row NocoDB table created in unit 08. It has at minimum `last_run` (timestamp in ms, stored as Number) and `polling_interval` (Number). If these fields don't exist in the table yet, add them manually in the NocoDB UI before deploying this section.

### 3. n8n manual step

In the n8n UI, on W8 (X Monitoring workflow):
1. Open the Schedule Trigger node → set interval to every 1 minute
2. Open Settings → set Concurrency to 1 (Single Execution Mode)

These two changes are required in addition to the code change. Without the 1-minute trigger, the skip logic never fires. Without Single Execution Mode, long engagement runs can overlap (though the code-level last_run patch handles the worst case).

---

## Interval Reference

| Time (EST) | Day type | Interval |
|------------|----------|----------|
| 09:00–15:59 | Mon–Fri | 5 min |
| 16:00–19:59 | Mon–Fri | 15 min |
| 00:00–08:59 | Mon–Fri | 60 min |
| 20:00–23:59 | Mon–Fri | 60 min |
| Any hour | Sat–Sun | 60 min |

---

## Definition of Done

- `getCurrentPollingInterval()` and `getESTHour()` are implemented with the exact code shown above
- Skip logic follows the ordering: read → compare → early-return OR patch-first-then-engage
- All tests in `n8n/tests/x-engagement.test.js` pass: `node --test n8n/tests/x-engagement.test.js`
- DST boundary tests pass (at minimum: March 9 and November 2 of a recent year)
- W8 Schedule Trigger set to 1 minute in n8n UI
- W8 concurrency set to 1 in n8n UI
- `X_State` table has `last_run` and `polling_interval` fields (Number type) in NocoDB
