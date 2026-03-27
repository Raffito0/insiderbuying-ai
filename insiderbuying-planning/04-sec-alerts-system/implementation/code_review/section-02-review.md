# Section 02 Code Review — `sec-monitor.js`

Reviewer: Claude Code (Senior Code Review)
Date: 2026-03-28
Files reviewed:
- `insiderbuying-site/n8n/code/insiderbuying/sec-monitor.js` (559 lines)
- `insiderbuying-site/tests/insiderbuying/sec-monitor.test.js` (539 lines)
- `insiderbuying-planning/04-sec-alerts-system/sections/section-02-sec-monitor.md`

---

## What Was Done Well

The overall architecture is solid. The dependency injection pattern (`fetchFn`, `_sleep`) makes every function unit-testable without mocking globals, which is the right choice for an n8n Code node. The parallel pre-load with `Promise.all`, the O(1) Set dedup, and the write-order rationale in the comments all reflect careful engineering. The `module.exports` exposes every function individually, avoiding the need for awkward re-imports in tests.

The `passesDedup` mutation pattern — adding to the Set before returning true — correctly implements the spec requirement for preventing same-run duplicates. The fallback UUID generator and the non-fatal cluster error handling are both good defensive decisions.

---

## Issues Found

### Critical (must fix before production)

**1. `enrichFiling` retry logic does not increment `failureCount` — the spec requires this**

The spec states: "After 3 failed retries, return null (do not throw) and increment the run-level `failureCount` variable." The function correctly returns `null` but has no way to increment `failureCount` — that variable lives in `runSecMonitor`, not inside `enrichFiling`. The caller in `runSecMonitor` (line 442–446) does increment `failureCount` after `enrichFiling` returns `null`, but it increments on ANY null return, including the case where Financial Datasets simply has no data for the ticker (empty `insider_trades` array, line 263). That case is not a failure — it is expected for small-cap tickers with no coverage.

The result: `failureCount` is currently over-counted. A run with 30 small-cap tickers and no coverage will trigger the Telegram failure alert at `failureCount > 5` even though zero network errors occurred.

**Fix required**: Distinguish the two null return paths. The function should return either `null` (no data found, not a failure) or throw/return a sentinel on actual API failure. One clean approach is returning `{ data: null, failed: true }` vs `{ data: null, failed: false }`, or having `enrichFiling` accept a callback to increment an external counter only on error. The simplest fix is adding a boolean `failed` property to the return: `return { data: null, failed: false }` for empty results and `return { data: null, failed: true }` after exhausted retries. The caller then only increments `failureCount` when `failed === true`.

**Impact**: Telegram alert fires falsely on every run with obscure tickers; alert becomes noise and loses operational value immediately.

---

**2. `enrichFiling` 100ms delay fires on EVERY attempt including retries — but the backoff delays also fire, making retry timing incorrect**

At line 255–256:
```javascript
await _sleep(100);
const res = await fetchFn(url, { ... });
```

The 100ms delay is inside the attempt loop with no guard. On the first attempt this is correct (rate limit mitigation). On the 2nd and 3rd retry attempts the code runs: 100ms delay + then falls into the `catch` block → 1000ms or 3000ms backoff (line 283). This is correct behavior but the spec only says "100ms delay between consecutive Financial Datasets calls" — implying the delay is between calls in the outer loop across filings, not between retries.

More importantly: the test at line 309–314 calls `enrichFiling` once and asserts `_sleep` was called with `100`. It passes only because `_sleep` is called once at the start. But if the test called the function twice in sequence via the outer loop (as happens at runtime), the delay would correctly appear between calls. The test is testing the right thing but only proves the delay exists, not that it appears between consecutive distinct filing calls rather than preceding every attempt within a single retry sequence.

This is a minor behavior deviation from the spec intent. It is not wrong, but could add unexpected latency: a filing that requires 3 retries adds 100ms + 1000ms + 100ms + 3000ms + 100ms = 4300ms instead of the expected 100ms + 1000ms + 3000ms = 4100ms per the spec. For the 60-second timeout this is negligible, but the placement is architecturally inconsistent with the stated rationale.

**Recommendation**: Move the 100ms delay to before the retry loop, not inside it, to match the spec intent precisely. This is low-severity but worth aligning.

---

### Important (should fix)

**3. `classifyInsider`: `is_board_director=true` overrides VP to Board — this is wrong per the spec**

At line 107–109 in the implementation:
```javascript
if (/vice\s*president|svp|evp|senior\s*vice/i.test(t)) {
  if (isBoardDirector) return 'Board';
  return 'VP';
}
```

The spec says: "Override rule: if `is_board_director === true` and the title doesn't already classify as `C-Suite`, override to `Board`." It gives VP as a separate, concrete example category. The override rule is stated as overriding **ambiguous** titles, not all non-C-Suite titles. The example test in the test file at line 419 (`classifyInsider('Special Advisor', true)` → `'Board'`) tests an ambiguous title, which is the spec's intent.

The current code converts "Executive Vice President" with `is_board_director=true` to `'Board'`, losing the VP signal. In practice, someone who is both an EVP and on the board is a more important signal as VP than as a generic board member. The VP classification is unambiguous — `is_board_director` should not override it.

This is exactly what the test at line 423 (`classifyInsider('Chief Executive Officer', true)` → `'C-Suite'`) is testing for C-Suite: the board flag must not override a clear, unambiguous title category. The same logic applies to VP.

**Fix**: Remove the `if (isBoardDirector) return 'Board'` branch from inside the VP check. Let VP titles remain VP regardless of `is_board_director`. The board override should only apply at the final fallthrough default, not inside explicit title matches.

The test suite does NOT have a test case for this scenario (`classifyInsider('Executive Vice President', true)` → should be `'VP'`, not `'Board'`). Both the implementation bug and the missing test need to be addressed.

---

**4. `detectCluster` write-order requirement is NOT enforced — the node returns results at the end without writing them to Supabase**

The spec states in section 2.6, explicitly and with bold emphasis: "Write order matters: Each filing must be written to Supabase (Section 05) immediately after processing, not in a batch at the end. Cluster detection depends on being able to see previously-processed filings from the same run already in Supabase. If you batch writes to the end, the second cluster member will never see the first and cluster detection silently fails for same-run clusters."

The current `runSecMonitor` collects results into a `results` array (line 429) and returns them all at the end (line 530). The Supabase write happens in Section 05, downstream in the n8n chain — after this Code node has already finished. This means: if AAPL files a Form 4 at 9:01am and AAPL files another Form 4 at 9:02am and both appear in the same 40-hit EDGAR batch, the second filing's `detectCluster` call will find zero prior rows (the first has not been written yet) and will return `isClusterBuy: false`. The cluster is silently missed.

The spec's "write immediately" requirement is architecturally at odds with the n8n Code node returning all results at once. The spec acknowledged this: "Each filing must be written to Supabase (Section 05) immediately after processing." This implies the Supabase write must happen INSIDE the Code node, within the `for` loop, not delegated to a downstream node.

**Fix required**: The `runSecMonitor` function needs to write each processed filing to Supabase directly (using `supabaseUrl` and `serviceKey` that are already available in `env`) inside the `for` loop, immediately after the `results.push(...)` at line 481. The downstream Section 05 node should then be treated as a confirmation/update step rather than the primary write. If Section 05 is responsible for the write, then `sec-monitor.js` must be redesigned to write immediately or cluster detection for same-run batches will always be broken.

This is a correctness bug for the cluster detection feature. Single-run clusters are exactly the scenario the feature is designed to catch (multiple insiders at the same company buying on the same day), and this bug silently defeats it.

---

**5. Airtable `filterByFormula` for dedup keys uses `filing_date` but the dedup key format uses `transaction_date`**

At line 182:
```javascript
const formula = `IS_AFTER({filing_date}, '${sevenDaysAgo}')`;
```

The dedup key format is `{ticker}_{insider_name}_{transaction_date}_{shares}` — it uses `transaction_date`, not `filing_date`. The 7-day lookback window for dedup should match the 7-day window for cluster detection. `transaction_date` can be several days before `filing_date` (insider buys on Monday, files the Form 4 on Wednesday). A trade with `transaction_date` within 7 days but `filing_date` older than 7 days would be missed by this filter, allowing it to pass dedup when it should be blocked.

In practice this edge case is rare (most Form 4s are filed within 2 business days), but the filter field is wrong relative to the dedup key construction. Either:
- Change the formula to filter on `transaction_date` (matches the dedup key exactly), or
- Accept the minor inconsistency and document it

The test suite does not cover this mismatch.

---

### Suggestions (nice to have)

**6. EDGAR URL: `q='"form 4"'` will double-encode the quotes in URLSearchParams**

At line 49:
```javascript
q: '"form 4"',
```

`URLSearchParams` will percent-encode the double quotes to `%22form+4%22`. The spec calls for `q=%22form+4%22`, so this encodes correctly at runtime. However the test at line 160–165 does a round-trip decode check:
```javascript
const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
expect(decoded.toLowerCase()).toContain('form 4');
```

This will pass because it decodes back to the string. The behavior is correct. This is only a suggestion to add a test that explicitly verifies the encoded form (`%22form+4%22`) rather than the decoded form, to prevent a future regression where someone changes the literal to `q=*` and the decode test still passes.

---

**7. `enrichFiling` takes `filingDate` but passes `lastCheckDate` from the outer loop — this may return wrong filings**

At line 438 in `runSecMonitor`:
```javascript
const enriched = await enrichFiling(ticker, lastCheckDate, { ... });
```

The parameter name in `enrichFiling` is `filingDate` and it is passed as `filing_date_gte` to Financial Datasets. Using `lastCheckDate` as the lower bound is correct for filtering (fetches all filings since last check), but the function name and parameter imply it should receive the specific filing's date to narrow the match. If `lastCheckDate` is 3 days ago, Financial Datasets may return multiple filings for the same ticker in that window, and the code takes `trades[0]` (the first result, which may not be the specific filing that EDGAR just reported).

This is a pre-existing design ambiguity in the spec ("Match the response to the specific filing by comparing `name` + `filing_date`"). The spec describes a match step but the implementation just takes `trades[0]`. For tickers with one filing per window this is fine. For tickers with multiple filings in the window it returns the wrong filing.

This is marked as a suggestion because resolving it requires passing `hit.file_date` into `enrichFiling` and doing the name+date match the spec describes, which is a more significant change. The current implementation works correctly for the common case.

---

**8. `detectCluster` Supabase PATCH uses string-interpolated IDs without validation**

At line 350:
```javascript
const idList = rowsToUpdate.map((id) => `"${id}"`).join(',');
```

If a Supabase `id` value contained a quote or comma (which Postgres UUIDs never do, but defensive coding would prevent injection), this could malform the query. Since IDs are UUIDs from a trusted Supabase response this is not a real security risk, but using the PostgREST `in` filter with proper encoding would be more robust. Low priority given UUIDs are safe by definition.

---

## Test Coverage Assessment

**Well covered**: All pure function paths (buildEdgarUrl, parseEdgarResponse, buildDedupKey, passesDedup, isBuyTransaction, classifyInsider, fetchDedupKeys, loadCikTickerMap, detectCluster basic scenarios).

**Gaps**:

1. No test for `classifyInsider('Executive Vice President', true)` — the missing VP+board_director case that proves Bug #3. This test would currently return `'Board'` when `'VP'` is the correct answer.

2. No test for `enrichFiling` distinguishing "empty results" null from "failure after 3 retries" null — the over-counted `failureCount` case from Bug #1. A test should verify that on empty `insider_trades`, the function returns null AND that the mock was only called once (no retries), demonstrating it is not a failure path.

3. No integration test for `runSecMonitor` that verifies two filings from the same ticker in one batch correctly detect a cluster — the write-order correctness test from Bug #4. This requires a mock Supabase that can return the first filing on the second call.

4. No test that Airtable pagination is exercised: the `do...while(offset)` loop at line 184–195 is not tested with a multi-page response. A test should mock a first response with `offset: 'pageToken'` and verify a second call is made.

5. No test for `failureCount > 5` Telegram alert path in `runSecMonitor`.

6. The spec required test "UPDATE requires service_role (test that anon key fails this update)" is not implemented. The test suite verifies the service key is sent in the `apikey` header but does not test that anon key access is rejected. This is a Supabase RLS enforcement test that would need a real or mocked RLS check, which is acceptable to defer.

---

## Summary

| # | Severity | Description |
|---|----------|-------------|
| 1 | Critical | `failureCount` incremented on empty-results null, not just error null — alert fires on normal small-cap runs |
| 2 | Important | 100ms delay fires inside retry loop — minor timing deviation from spec intent |
| 3 | Important | `is_board_director=true` overrides VP to Board — loses VP signal, violates spec override rule |
| 4 | Critical | Filing writes are batched at end — same-run cluster detection is broken for concurrent filings |
| 5 | Important | Dedup filter uses `filing_date`, dedup key uses `transaction_date` — mismatch allows rare cross-window duplicates |
| 6 | Suggestion | Test should verify encoded `%22form+4%22` not just decoded form |
| 7 | Suggestion | `enrichFiling` takes `lastCheckDate` not specific `file_date` — takes `trades[0]` without match validation |
| 8 | Suggestion | Supabase PATCH ID interpolation — safe with UUIDs but not defensively encoded |

**Blocking for production**: Issues 1, 3, and 4 must be fixed. Issue 4 in particular requires an architectural decision about where the Supabase write lives.

**Test additions required**: Missing test cases for Issues 1, 3, 4, and the Airtable pagination test.
