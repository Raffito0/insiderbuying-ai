# Code Review: Section 06 -- Deliver Alert

**Reviewer**: Senior Code Review Agent
**Date**: 2026-03-28
**Files reviewed**: `deliver-alert.js` (308 lines), `deliver-alert.test.js` (382 lines)
**Spec**: `sections/section-06-deliver-alert.md`

---

## Summary

The implementation is well-structured and covers the core delivery flow correctly. The dependency injection pattern (`fetchFn`/`env`/`_sleep` via `opts`) is clean, testable, and consistent with earlier sections. Error isolation between email and push channels works as specified. The test suite covers all 18 spec test cases. There are two important issues (env var naming mismatch, email privacy filtering gap) and several smaller items worth addressing.

---

## What Was Done Well

- Error isolation is correctly implemented: Resend failure does not block OneSignal, and vice versa. Both channels' results are still reported in the Airtable tracking PATCH.
- The `fetchEligibleUsers` function correctly implements the three-step process (preferences query, profiles query, per-user admin auth lookup) as specified.
- Log safety is enforced: the `catch` block in Step 3 of `fetchEligibleUsers` (line 91) logs only `user_id`, never the email address.
- `_sleep` is injectable, making the 200ms inter-batch delay testable without real timers.
- CAN-SPAM compliance elements are present: unsubscribe link with the exact URL from the spec, physical postal address in footer, manage preferences link.
- The `chunkArray` and `formatMoney` helpers are pure functions with dedicated tests.
- Delivery tracking correctly populates `emails_sent` and `push_sent` even on partial failure, as the spec requires.

---

## Issues

### Critical (must fix)

**C1: Cluster alert subject is missing the fire emoji**
- **File**: `deliver-alert.js`, line 131
- **Spec says**: `"🔥 CLUSTER BUY: {cluster_size} insiders buying {ticker}"`
- **Implementation**: `"CLUSTER BUY: ${alertData.cluster_size} insiders buying ${alertData.ticker}"`
- **Test assertion** (line 543): checks for `'CLUSTER BUY'` without the emoji, so the test passes but the output diverges from spec.
- **Impact**: Minor cosmetically, but the spec is explicit about the emoji in the subject line. Email subject emojis are a deliberate design choice for inbox visibility.
- **Fix**: Add the `\uD83D\uDD25` (fire emoji) prefix to the cluster subject string. Update the test to match.

### Important (should fix)

**I1: Env var naming mismatch -- `SUPABASE_SERVICE_ROLE_KEY` vs spec's `SUPABASE_SERVICE_KEY`**
- **File**: `deliver-alert.js`, lines 39, 40, 77, 78
- **Spec says** (Environment Variables section): `const SUPABASE_SERVICE_KEY = ...`
- **Implementation uses**: `env.SUPABASE_SERVICE_ROLE_KEY`
- **Test file**: `BASE_ENV` uses `SUPABASE_SERVICE_ROLE_KEY`
- **Impact**: If other sections in the pipeline (e.g., `write-persistence.js`) use `SUPABASE_SERVICE_KEY` as the env var name, the same Docker Compose env var will need to be defined under two different names, or one module will silently get an empty string. This should be consistent across all sections.
- **Fix**: Align with whichever name the other sections use. If `SUPABASE_SERVICE_ROLE_KEY` is the correct name across the project, the spec should be updated. If `SUPABASE_SERVICE_KEY` is the standard, rename in code and tests.

**I2: `AIRTABLE_BASE_ID` and `INSIDER_ALERTS_TABLE_ID` vs spec's `AIRTABLE_INSIDERBUYING_BASE_ID`**
- **File**: `deliver-alert.js`, line 220; test `BASE_ENV` object
- **Spec says**: `const AIRTABLE_INSIDERBUYING_BASE_ID = ...` and the Airtable URL would use that.
- **Implementation uses**: `env.AIRTABLE_BASE_ID` and `env.INSIDER_ALERTS_TABLE_ID`
- **Impact**: Same cross-section consistency risk as I1. Additionally, the spec does not mention `INSIDER_ALERTS_TABLE_ID` as a separate env var -- the table name/ID could be hardcoded or derived from a constant, since there is only one alerts table.
- **Fix**: Reconcile env var names with other sections. If the project convention is to use separate `*_TABLE_ID` env vars, document that in the spec. Otherwise use the spec's naming.

**I3: No n8n entry point -- missing `$input` glue code**
- **File**: `deliver-alert.js` (entire file)
- **Spec says**: "The node receives the output from the upstream `analyze-alert.js` node via `$input.first().json`" and specifies the output as `return [{ json: { ... } }]`.
- **Implementation**: Exports functions via `module.exports` but contains no n8n entry point that reads from `$input` and returns the n8n-expected `[{ json }]` array. The `deliverAlert()` function returns a plain object.
- **Impact**: The file cannot be dropped into an n8n Code node as-is. It needs a thin wrapper that reads `$input.first().json`, calls `deliverAlert()`, and returns the result wrapped in `[{ json: result }]`.
- **Fix**: Add an n8n wrapper at the bottom of the file (guarded by `typeof $input !== 'undefined'`) similar to other Code nodes in this project. The `module.exports` can coexist for testability.

**I4: `fetchEligibleUsers` does not handle non-200 responses from Supabase REST**
- **File**: `deliver-alert.js`, lines 46-48 and 61-63
- **Spec**: Does not explicitly address this, but the REST calls to Supabase could return non-200 (e.g., 401 expired key, 400 malformed query).
- **Implementation**: `prefRes.json()` is called without checking `prefRes.ok`. If Supabase returns a 400 error with a JSON body like `{ message: "..." }`, `Array.isArray(allPrefs)` would be `false`, returning `[]` silently. The profiles call has the same issue.
- **Impact**: Silent failure -- zero users receive the alert, and no error is logged or tracked. The Airtable record would show `status: 'delivered'` with `emails_sent: 0, push_sent: N` which looks like success.
- **Fix**: Check `prefRes.ok` and `profileRes.ok` before parsing. On failure, throw or log a warning so the error surfaces in `deliverAlert`'s error array and gets recorded as `delivery_failed`.

**I5: OneSignal tag value sent as string may cause lexicographic comparison**
- **File**: `deliver-alert.js`, line 189
- **Spec warns**: "if tags are stored as strings, OneSignal uses lexicographic comparison which is incorrect (e.g., `"10" <= "6"` would be true)"
- **Implementation**: `value: String(alertData.significance_score)` -- explicitly converts to string.
- **Impact**: If the `alert_score_min` tag on the user side is set as a string (which is the default for OneSignal tags), the comparison `"7" <= "8"` works correctly for single digits but `"10" <= "8"` would be lexicographically true, causing score-10 users to receive score-8 alerts they should not receive.
- **Fix**: Either (a) ensure the frontend (Section 09) sets the tag as a numeric string and document that scores are always 1-9 (single digit), which makes string comparison safe, or (b) use OneSignal's `value` as a number type if the API supports it. The spec calls this out as a known risk -- at minimum, add a code comment documenting the constraint.

### Suggestions (nice to have)

**S1: `email_enabled=false` filtering happens client-side, not in the Supabase query**
- **File**: `deliver-alert.js`, line 45
- **Observation**: The Supabase REST query already filters `email_enabled=eq.true`, which is correct. However, the test for "users with email_enabled=false are excluded" (line 388) returns a user with `email_enabled: true` alongside one with `email_enabled: false` from the mock -- but since the query filter is `email_enabled=eq.true`, the mock is simulating what Supabase would actually return (only the `true` user). The second user in the mock response would never come back from the real API. This is not a bug, but the test is slightly misleading about what it validates. Consider a comment in the test clarifying that Supabase handles the filtering and the mock simulates its output.

**S2: No fail-fast on missing env vars**
- **File**: `deliver-alert.js` (entire file)
- **Spec says**: "The node should fail fast at startup with a clear error if any are missing."
- **Implementation**: No validation of env vars at the top of the file or in `deliverAlert()`. If `RESEND_API_KEY` is empty, the Resend call will fail with a 401, which is caught and handled, but the error message will be opaque ("Resend API error (401)") rather than "RESEND_API_KEY not configured".
- **Fix**: Add an early check in `deliverAlert()` that validates required env vars and throws a descriptive error before making any network calls.

**S3: `sendResendBatch` counts `chunks[i].length` as sent, not actual API confirmation**
- **File**: `deliver-alert.js`, line 170
- **Observation**: `totalSent += chunks[i].length` assumes every email in the batch was accepted. The Resend batch API returns `{ data: [{ id }] }` -- the actual sent count could be derived from `data.length`. This is a minor accuracy gap; Resend's batch endpoint either accepts all or rejects all, so in practice the chunk length is correct. But parsing the response would be more defensive.

**S4: HTML template uses string interpolation without escaping**
- **File**: `deliver-alert.js`, lines 111-113
- **Risk**: `alertData.insider_name`, `alertData.insider_title`, and `alertData.ai_analysis` are interpolated directly into HTML. If any of these contain `<script>` tags or HTML entities, they would render in the email. This is low risk since the data comes from SEC filings (not user input), but a simple `escapeHtml()` helper would be more defensive.

**S5: Delivery tracking tests only test `updateDeliveryStatus` in isolation**
- **File**: `deliver-alert.test.js`, lines 644-685
- **Observation**: The 6.4 tests call `updateDeliveryStatus` directly with pre-built field objects. They verify the PATCH body is correct, but they do not test the integration path where `deliverAlert()` constructs the fields object from mixed success/failure results. The "Resend failure does not block push" and "OneSignal failure does not block email" tests (6.2/6.3) do cover the integration path, but they only assert on `emails_sent` or `push_sent` -- not on the `status` field being `delivery_failed`. Consider adding assertions on `result.status` in those integration tests.

---

## Test Coverage Summary

| Spec Test Case | Covered | Notes |
|---|---|---|
| 6.1: email_enabled=false excluded | Yes | |
| 6.1: min_score=7 receives score=8 | Yes | |
| 6.1: min_score=9 skips score=8 | Yes | |
| 6.1: watched_tickers bypass | Yes | |
| 6.1: Pro gets full analysis | Yes | |
| 6.1: Free gets truncated + CTA | Yes | |
| 6.1: error logs user_id not email | Yes | |
| 6.2: single recipient per email | Yes | |
| 6.2: 250 recipients chunked [100,100,50] | Yes | |
| 6.2: 200ms delay between batches | Yes | |
| 6.2: unsubscribe link | Yes | |
| 6.2: postal address | Yes | |
| 6.2: regular subject format | Yes | |
| 6.2: cluster subject format | Yes | Missing emoji per C1 |
| 6.2: Resend failure does not block push | Yes | |
| 6.3: filter tag relation | Yes | |
| 6.3: deep-link URL | Yes | |
| 6.3: push_sent from recipients | Yes | |
| 6.3: OneSignal failure does not block email | Yes | |
| 6.4: success -> status=delivered | Yes | Isolation test only |
| 6.4: email failure -> delivery_failed | Yes | Isolation test only |
| 6.4: push failure -> delivery_failed | Yes | Isolation test only |

---

## Verdict

**Approve with required changes.** Fix C1 (emoji), I1/I2 (env var naming alignment), and I3 (n8n entry point). I4 (Supabase error handling) and I5 (OneSignal string comparison) should be addressed before production but are not blockers for the review pass. The code is well-organized, testable, and the error isolation pattern is exactly right.
