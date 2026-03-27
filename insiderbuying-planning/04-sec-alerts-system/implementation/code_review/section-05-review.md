# Code Review: Section 05 -- Write Persistence

**Reviewer**: Senior Code Review Agent
**Date**: 2026-03-28
**Files reviewed**: `write-persistence.js` (446 lines), `write-persistence.test.js` (447 lines)
**Spec**: `sections/section-05-write-persistence.md`

---

## Summary

The implementation is solid and covers the core persistence flow correctly. The code is well-structured, follows the established pattern from `score-alert.js` (dependency injection via `fetchFn`/`env`, `makeFetch`/`makeFetchSeq` test helpers, section-numbered describe blocks), and the test coverage hits every spec requirement. There are a few issues to address, mostly around a spec deviation in the Supabase conflict resolution strategy and a missing integration point.

---

## What Was Done Well

- Clean separation of concerns: each spec sub-section (5.1-5.5) maps to a named, exported function.
- Error handling in `writeFilingPersistence` follows the spec's exact write-order and failure cascade (step 1 fail -> skip, step 2 fail -> mark Airtable failed, step 3 fail -> warn only).
- Dead-letter filtering in `updateMonitorState` correctly excludes `retry_count > 3` filings from timestamp rollback.
- Cluster update logic correctly computes score delta and conditionally triggers W5.
- Telegram alerts gracefully degrade with `.catch(() => {})` when bot token or chat ID is missing.
- Test helper reuse (`makeFetch`, `makeFetchSeq`, `BASE_ENV`, `SAMPLE_FILING`) matches the existing `score-alert.test.js` pattern exactly.

---

## Issues

### Critical (must fix)

**C1: Supabase conflict resolution uses `merge-duplicates` instead of `ignore-duplicates`**
- **File**: `write-persistence.js`, line ~110
- **Spec says** (section 5.2): "Use `ON CONFLICT (dedup_key) DO NOTHING`" and "Use `onConflict: 'dedup_key', ignoreDuplicates: true`"
- **Implementation uses**: `Prefer: 'return=representation,resolution=merge-duplicates'`
- **Impact**: `merge-duplicates` performs an UPSERT (updates existing row on conflict). `ignore-duplicates` performs DO NOTHING (leaves existing row untouched). These are semantically different. With `merge-duplicates`, a second pipeline run for the same filing will overwrite all fields in the existing Supabase row, which could corrupt data if the second run has partial/stale enrichment. The spec explicitly chose DO NOTHING for safety.
- **Fix**: Change the Prefer header to `'return=representation,resolution=ignore-duplicates'`. Also update the test name at line ~595 which says "ignore-duplicates" but asserts `merge-duplicates` -- the test assertion and the code are consistent with each other but both contradict the spec.

**C2: `handleDeadLetter` is exported but never called**
- **File**: `write-persistence.js` (entire file), `write-persistence.test.js`
- **Spec says** (section 5.3): Before a failed filing is retried, increment `retry_count`. If `retry_count > 3`, mark dead_letter and send Telegram.
- **Implementation**: `handleDeadLetter` exists as an exported function and is tested in isolation, but it is never invoked from `writeFilingPersistence` or `runPostProcessing`. The `retry_count` increment logic is also absent from the per-filing write path. The caller (presumably `sec-monitor.js`) would need to handle this, but the spec places it in this section.
- **Fix**: Either (a) add dead-letter handling into `writeFilingPersistence` by checking `filing.retry_count` and calling `handleDeadLetter` when > 3, or (b) add dead-letter handling into `runPostProcessing` by iterating `failedFilings` and calling `handleDeadLetter` for those with `retry_count > 3`. Option (b) is cleaner since it runs after all writes complete, matching the spec's "before a failed filing is retried" timing.

### Important (should fix)

**I1: `raw_filing_data` is passed through but never JSON.stringified**
- **File**: `write-persistence.js`, lines ~44 and ~100
- **Spec says**: `raw_filing_data` should be `JSON.stringify(rawFinancialDatasetsResponse)`
- **Implementation**: `raw_filing_data: filing.raw_filing_data` -- passes through whatever the caller provides.
- **Risk**: If the caller passes an object instead of a pre-stringified JSON string, Airtable will receive `[object Object]`. The test at line ~588 uses a pre-stringified value (`'{"name":"Timothy D. Cook"}'`) which masks this. The implementation should either (a) call `JSON.stringify` defensively if the value is not already a string, or (b) document that callers must pre-stringify.
- **Suggested fix**:
  ```javascript
  raw_filing_data: typeof filing.raw_filing_data === 'string'
    ? filing.raw_filing_data
    : JSON.stringify(filing.raw_filing_data),
  ```

**I2: Spec says persistence belongs inline in `sec-monitor.js`, not a separate file**
- **Spec**: "File to implement: `n8n/code/insiderbuying/sec-monitor.js` (the write steps are inline within the same Code node as the rest of the monitor, not a separate file)."
- **Implementation**: Created a new file `write-persistence.js` with exports.
- **Assessment**: This is actually a reasonable deviation. Separating persistence into its own module improves testability and keeps `sec-monitor.js` focused on discovery/enrichment. However, the n8n Code node constraint matters -- if `sec-monitor.js` is a single Code node, it cannot `require()` a sibling file unless the n8n setup allows it. The existing pipeline (`score-alert.js`, `analyze-alert.js`) uses separate Code nodes per file, so this pattern is consistent. The spec should be updated to reflect this architectural decision.

**I3: `patchAirtableRecord` does not check response status**
- **File**: `write-persistence.js`, lines ~173-184
- **Current code**: Calls `fetchFn` but does not check `res.ok` or inspect the response body for errors.
- **Impact**: A 422 (validation error) or 401 (expired token) from Airtable will be silently swallowed. This is fine for the non-critical step 3 PATCH (supabase_id cross-reference), but `patchAirtableRecord` is also used in `handleDeadLetter` (marking dead_letter status) and in the Supabase failure path (marking status='failed'), where silent failures could leave records in incorrect states.
- **Fix**: Add a response check and throw on non-2xx:
  ```javascript
  const res = await fetchFn(url, { ... });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Airtable PATCH failed (${res.status}): ${errBody}`);
  }
  ```

**I4: Cluster size calculation is additive instead of absolute**
- **File**: `write-persistence.js`, line ~363
- **Code**: `cluster_size: oldSize + clusterFilings.length`
- **Spec says**: Updated `cluster_size` should reflect the actual cluster size.
- **Issue**: If the same filing is processed twice (e.g., rerun after partial failure), `cluster_size` will be inflated. The cluster size should be the count of all distinct filings with this `cluster_id`, not `old + new`. This would require querying Supabase or Airtable for all filings with the cluster_id and counting them.
- **Workaround**: If reruns are rare and dedup prevents double-writes, the additive approach works in the happy path. But it is fragile. At minimum, add a comment documenting this assumption.

### Suggestions (nice to have)

**S1: Missing test for `writeFilingPersistence` happy path end-to-end**
- The test file tests error counting via `writeFilingPersistence` but does not have a test that verifies the full success path: Airtable create -> Supabase insert -> Airtable patch supabase_id -> filing added to `successfulFilings`. This would catch regressions in the write-order logic.

**S2: Missing test for `runPostProcessing` with cluster filings**
- The cluster tests exercise `createOrUpdateClusterSummary` directly, but there is no test that verifies `runPostProcessing` correctly groups filings by `cluster_id` and calls the cluster function once per group. An integration-level test with 2 clusters would verify the grouping logic.

**S3: `updateMonitorState` silently returns if no state record found**
- Line ~206: `if (!stateRecord) return;`
- If the Monitor_State table is missing the expected record (misconfiguration), the function silently succeeds. Consider logging a warning so this does not fail silently in production.

**S4: Airtable URL construction uses table ID directly in URL path**
- The code uses `env.INSIDER_ALERTS_TABLE_ID` in the Airtable URL. Airtable API accepts both table name and table ID. Using the ID is correct and preferred (more stable). Just confirming this is intentional and matches the existing `sec-monitor.js` pattern.

**S5: Test for Realtime event (spec 5.2) is absent**
- Spec 5.2 mentions: "Realtime event fires on insert (integration test: subscribe, insert, assert event received)".
- This is correctly omitted as it requires a live Supabase instance. But it should be tracked as a manual integration test item.

---

## Test Coverage Matrix

| Spec Requirement | Test Present | Verdict |
|---|---|---|
| 5.1 All fields including dedup_key, status | Yes (line 533) | PASS |
| 5.1 score_reasoning included | Yes (line 560) | PASS |
| 5.1 ai_analysis null handling | Yes (line 568) | PASS |
| 5.1 raw_filing_data as JSON string | Yes (line 583) | PASS (but see I1) |
| 5.2 onConflict dedup_key | Yes (line 595) | PASS (but see C1) |
| 5.2 Duplicate returns gracefully | Yes (line 606) | PASS |
| 5.2 supabase_id extracted | Yes (line 613) | PASS |
| 5.2 Realtime event | Absent (integration) | N/A |
| 5.3 All-success timestamp ~now | Yes (line 623) | PASS |
| 5.3 Partial-failure rollback | Yes (line 639) | PASS |
| 5.3 Dead-letter not holding back | Yes (line 661) | PASS |
| 5.3 Dead-letter Telegram | Yes (line 682) | PASS |
| 5.3 last_run_status=error | Yes (line 702) | PASS |
| 5.4 3 members -> 1 summary | Yes (line 727) | PASS |
| 5.4 transaction_type=cluster | Yes (line 748) | PASS |
| 5.4 Score formula min(10, max+3) | Yes (line 766) | PASS |
| 5.4 Update existing (not new) | Yes (line 784) | PASS |
| 5.4 No re-trigger if delta < 2 | Yes (line 814) | PASS |
| 5.4 Re-trigger if delta >= 2 | Yes (line 836) | PASS |
| 5.5 failureCount increments | Yes (line 862) | PASS |
| 5.5 <= 5 no Telegram | Yes (line 872) | PASS |
| 5.5 > 5 Telegram alert | Yes (line 887) | PASS |
| **Happy path e2e** | **Absent** | **GAP** |
| **Cluster grouping in runPostProcessing** | **Absent** | **GAP** |

---

## Recommendation

Fix C1 (merge-duplicates -> ignore-duplicates) and C2 (dead-letter never called) before merging. Both are correctness issues that will cause real bugs in production. The Important items (I1, I3, I4) should be addressed in the same pass since they are small changes. The test gaps (S1, S2) would strengthen confidence but are not blocking.
