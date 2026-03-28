# Code Review: section-04-analyze-alert.js

## Overall Assessment

This is a clean, well-structured module. The spec is followed closely, the dependency injection pattern (`helpers` object) is good for testability, error handling is thorough, and the test suite covers all spec-listed scenarios plus additional edge cases. 22 tests pass.

## Critical Issues (must fix before commit)

None.

## Important Issues (should fix)

### 1. `callClaude` does not handle malformed API response body

At `analyze-alert.js:83`, `data.content[0].text` is accessed without defensive checks. If Anthropic returns an unexpected shape (e.g., `content: []`, or `content: [{ type: 'tool_use', ... }]`), this throws an uncaught TypeError that propagates through `callWithRetry` and is caught by `analyze()`'s outer try/catch, returning `null`. The behavior is technically correct (returns null on failure), but the logged error message would be `Cannot read properties of undefined (reading 'text')` rather than something actionable. Consider adding a guard:

```javascript
const data = await response.json();
const text = data?.content?.[0]?.text;
if (!text) throw new Error('Unexpected Anthropic response shape');
return text;
```

### 2. Validation retry doubles API calls but uses `callWithRetry`, not `callClaude`

At `analyze-alert.js:111`, a validation failure triggers a second `callWithRetry()` call. If that inner call also hits a 429 or 503, the retry logic inside `callWithRetry` fires again. Worst case: validation fails on attempt 1 (1-2 API calls via callWithRetry), then validation fails on attempt 2 (1-2 more API calls via callWithRetry). Total possible API calls = 4, not the 2 that a reader might expect. The spec says "one retry with the same prompt" for validation failure, which reads as exactly 2 total API calls for the validation path. Consider calling `callClaude` directly on the validation retry instead of `callWithRetry`, or document this intentional behavior.

### 3. `callWithRetry` does not wait before 500/503 retry

At `analyze-alert.js:146-148`, a 500/503 triggers an immediate retry with zero delay. While the spec says "one retry immediately", in practice an immediate retry against a server returning 500/503 will almost certainly hit the same error. Even a 1-2 second `helpers._sleep(1000)` before the retry would increase success rate meaningfully for transient server errors.

### 4. Missing file-level header comment

`score-alert.js` has a descriptive header block explaining where the module sits in the pipeline. `analyze-alert.js` has none. For consistency, add a header like:

```javascript
// ─── analyze-alert.js ────────────────────────────────────────────────────────
// AI prose generation for the W4 InsiderBuying.ai pipeline.
// Runs after score-alert.js, before write-persistence.js.
// Generates 2-3 paragraph analysis via Claude Sonnet for qualifying filings.
// ─────────────────────────────────────────────────────────────────────────────
```

## Minor Issues / Suggestions

### 5. `trackRecordSection` wraps a single string in an array then joins it

At `analyze-alert.js:7-11`, the truthy branch creates an array with one element and calls `.join('')`. This is equivalent to just the template literal string directly. The array wrapper adds no value and slightly obscures readability. Simplify to:

```javascript
const trackRecordSection = filing.track_record
  ? `Track record: ${filing.track_record.past_buy_count} past buys, ` +
    `${Math.round((filing.track_record.hit_rate || 0) * 100)}% hit rate, ` +
    `${Math.round((filing.track_record.avg_gain_30d || 0) * 100)}% avg 30-day gain.`
  : 'This insider has no track record of prior purchases in our database.';
```

### 6. `max_tokens: 1024` may be tight for 3 paragraphs

Sonnet at 1024 max_tokens produces roughly 700-800 words. For 2-3 substantive paragraphs about a complex filing, this should be sufficient, but if the prompt ever grows or Sonnet becomes more verbose, the response could be truncated mid-sentence, failing validation. Consider 1536 as a safety margin. Cost difference is zero (you only pay for generated tokens, not the max).

### 7. Prompt injection surface

Filing fields like `insider_name`, `company_name`, and `score_reasoning` are interpolated directly into the prompt. If a malicious actor could control these fields (unlikely since they come from SEC EDGAR), they could inject instructions. Since the data source is SEC filings parsed upstream, this is low risk. No action needed, but worth noting if the data source ever changes.

## Test Coverage Assessment

The test file covers all 8 scenarios listed in the spec, plus 14 additional edge cases. This exceeds spec requirements.

**Well covered:**
- Score gate boundary (0, 3, 4)
- Model verification
- Validation failure + retry
- Double validation failure returning null
- Prompt content assertions (numbers, names, track record, cluster, anti-generic)
- 429/500/503 retry behavior
- Network error graceful degradation
- `validateAnalysis` unit tests for all edge cases

**Missing tests (non-blocking):**
- No test for `callClaude` when `response.json()` throws (e.g., non-JSON body from Anthropic during outage). Currently would throw, caught by outer `analyze()` try/catch, returns null. Behavior is correct but untested.
- No test verifying the exact request body structure sent to Anthropic (headers, anthropic-version header). The model test checks `body.model` but not headers.
- No test for `filing.dedup_key` being undefined (the warn log would print "undefined" but function still works).
- No test for `track_record` with partial fields (e.g., `{ past_buy_count: 3, hit_rate: null, avg_gain_30d: null }`). The `|| 0` guards in `buildAnalysisPrompt` handle this, but it is untested.

## Spec Compliance

| Spec Requirement | Status | Notes |
|---|---|---|
| Score gate < 4 returns null | PASS | |
| Model = claude-sonnet-4-6 | PASS | Hardcoded, not parameterized per spec |
| Prompt covers 3 angles | PASS | Trade signal, historical context, risk factors |
| Prompt forbids generic phrases | PASS | Verbatim from spec |
| Prompt includes all filing data fields | PASS | All 12 fields interpolated |
| Response = plain prose, no JSON | PASS | Prompt says "Return ONLY the analysis prose" |
| Validation: >50 chars + 2 paragraphs | PASS | |
| One retry on validation failure | PASS | See Issue #2 re: nested retries |
| Failed retry returns null, no throw | PASS | |
| Logs dedup_key + truncated response | PASS | Truncated to 200 chars |
| 429 waits 5s then retries | PASS | |
| 500/503 retries immediately | PASS | |
| Network error returns null | PASS | |
| Never throws | PASS | All paths return string or null |
| Function signature matches spec | PASS | Added `helpers` param for DI (improvement over spec stub) |

## Summary

Solid implementation with no critical issues. The `helpers` dependency injection pattern is a good deviation from the spec's bare function signature -- it makes the module fully testable without any module-level mocking. The 3 important issues (malformed response guard, nested retry behavior, 500/503 delay) are all about resilience under edge conditions rather than correctness bugs. All are worth addressing before production but none block merging into the test suite.
