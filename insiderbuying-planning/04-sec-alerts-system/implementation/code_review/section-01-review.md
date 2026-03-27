# Code Review — Section 01: Airtable Base Setup

**Reviewer**: Claude Code (Senior Code Reviewer)
**Date**: 2026-03-27
**Files reviewed**:
- `insiderbuying-site/scripts/insiderbuying/setup-airtable-base.js`
- `insiderbuying-site/tests/insiderbuying/section-01-airtable-setup.test.js`

**Plan reviewed**: `insiderbuying-planning/04-sec-alerts-system/sections/section-01-airtable-setup.md`

**Verdict**: PASS with 1 Important issue and 3 Suggestions. No Critical issues.

---

## What Was Done Well

- Field count is exact: 25 fields on `Insider_Alerts`, 5 on `Monitor_State`, matching the spec table-for-table.
- All `singleSelect` fields (`transaction_type`, `status`) have the correct choice sets: 3 choices for `transaction_type` (buy/sell/cluster), 6 for `status` (new/processing/processed/delivered/delivery_failed/failed).
- `delivered_at` and `last_check_timestamp` are correctly typed `dateTime` rather than `date`, matching the spec's explicit "must be stored with time (not date-only)" requirement.
- `transaction_date` and `filing_date` are correctly `date`-only, not `dateTime`.
- The `require.main === module` guard is correctly applied to both the env-var check and the `main()` call, allowing the test file to `require()` the module without triggering any API calls or process exits.
- Seed records populate only `name` and `last_check_timestamp`, leaving all other fields blank — exactly what the spec calls for.
- HTTP error handling correctly rejects on `statusCode >= 400` and on JSON parse failure.
- `Content-Length` is only set when a body is present (GET-safe).
- Tests cover all five spec-mandated test scenarios and make no real network calls.

---

## Issues

### Important — Script has no idempotency guard (will duplicate tables on re-run)

**File**: `setup-airtable-base.js`, `createTable()` (line 154)

The Airtable Meta API `POST /v0/meta/bases/{baseId}/tables` will succeed even if a table with that name already exists — it creates a second table with the same name. There is no `GET /v0/meta/bases/{baseId}/tables` preflight check to detect existing tables before attempting creation.

If the script is run twice (e.g. after a partial failure on the first run), the base will end up with `Insider_Alerts` and `Monitor_State` appearing twice, and `Monitor_State` will have 4 seed records instead of 2. Later sections (sec-monitor, write-persistence, deliver-alert) all hard-code table IDs from env vars, so the duplicated table won't break them directly — but it creates a confusing state in the UI and the wrong table IDs may have been recorded.

The fix is to fetch existing tables first and skip creation when a matching name is found:

```js
async function getExistingTables() {
  const result = await airtableRequest('GET', `/v0/meta/bases/${BASE_ID}/tables`);
  return result.tables || [];
}
```

Then in `main()`, check before calling `createTable()` and before calling `seedRecords()`. This is a one-time setup script so the fix does not need to be elaborate — a simple name-match skip with a `console.log('Table already exists, skipping: ...')` message is sufficient.

---

### Suggestion 1 — `yesterday()` has a silent DST edge case

**File**: `setup-airtable-base.js`, lines 141-145

```js
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString();
}
```

`setDate(getDate() - 1)` subtracts one calendar day. On the two days per year when DST transitions occur, the resulting timestamp is either 23 hours or 25 hours in the past rather than exactly 24. This is extremely unlikely to matter for a seed record (the monitor will simply pick up an extra or slightly fewer hours of filings on first run), but it is worth noting.

A more precise approach is `new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()`, which subtracts exactly 86400000 ms regardless of timezone rules.

---

### Suggestion 2 — Seed timestamp staleness test is brittle under slow CI

**File**: `section-01-airtable-setup.test.js`, lines 325-333

```js
test('seed timestamps are roughly 24h in the past (± 2h)', () => {
  const now = Date.now();
  MONITOR_STATE_SEEDS.forEach((record) => {
    const ts = new Date(record.fields.last_check_timestamp).getTime();
    const hoursAgo = (now - ts) / 1000 / 3600;
    expect(hoursAgo).toBeGreaterThan(22);
    expect(hoursAgo).toBeLessThan(26);
  });
});
```

`MONITOR_STATE_SEEDS` is evaluated at module-load time because `yesterday()` is called when the array literal is evaluated (line 147-150 of the script). The test then compares the already-frozen timestamp against `Date.now()` at test execution time. In normal CI this gap is negligible (milliseconds). However, if the module is loaded by a long-running test suite that happens to evaluate this test more than 2 hours after module import — which can happen in watch mode or with `--runInBand` on a slow machine with many test files — the assertion `hoursAgo < 26` could pass but `hoursAgo > 22` could theoretically fail if the module were loaded very early and the test runs very late.

This is low-probability in practice, but the test can be made completely time-independent by instead verifying that the timestamp is `<= Date.now()` and `>= Date.now() - 48h`, which validates that it is a past timestamp without being sensitive to execution timing.

---

### Suggestion 3 — `price_per_share` and `total_value` precision is 2 decimal places; this truncates penny-stock prices

**File**: `setup-airtable-base.js`, lines 87-89

```js
{ name: 'price_per_share', type: 'number', options: { precision: 2 } },
{ name: 'total_value', type: 'number', options: { precision: 2 } },
```

The spec does not specify a precision for these fields. `precision: 2` is a reasonable default for most stocks (dollars and cents), but insider filings on penny stocks (e.g. OTC stocks under $0.01) will have prices like `$0.003` that get stored as `$0.00` in Airtable, making the record misleading. The `total_value` calculation will also lose accuracy for large share counts at sub-cent prices.

Consider `precision: 4` for both fields to handle penny stocks without impacting the display of normal stocks (Airtable's number formatting rounds for display but stores the full value). This is a minor data quality concern, not a blocking issue.

---

## Plan Alignment Summary

| Requirement | Status |
|---|---|
| `Insider_Alerts` has all 25 fields from spec | Confirmed |
| `transaction_type` singleSelect with buy/sell/cluster | Confirmed |
| `status` singleSelect with 6 correct values | Confirmed |
| `delivered_at` is dateTime not date | Confirmed |
| `transaction_date` and `filing_date` are date-only | Confirmed |
| `Monitor_State` has all 5 fields | Confirmed |
| `last_check_timestamp` is dateTime | Confirmed |
| Seed records: exactly 2, market + afterhours | Confirmed |
| Seed timestamps set to ~24h ago | Confirmed |
| Seed: other fields left blank | Confirmed |
| Script does not run on `require()` (test-safe) | Confirmed |
| Error handling on API failure | Confirmed |
| Outputs table IDs for .env at end | Confirmed |
| Tests cover all 5 spec test scenarios | Confirmed |
| Tests make no real network calls | Confirmed |
| Idempotency on re-run | NOT ADDRESSED (Important issue above) |
