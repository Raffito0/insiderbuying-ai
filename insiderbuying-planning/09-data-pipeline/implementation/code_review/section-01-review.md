# Code Review — Section 01: EDGAR RSS Feed Discovery

**Reviewer:** Senior Code Reviewer
**Date:** 2026-03-29
**Files reviewed:**
- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/edgar-parser.js` (Section 1 functions only)
- `ryan_cole/insiderbuying-site/tests/insiderbuying/edgar-parser.test.js` (Section 1 tests only)

**Scope note:** `edgar-parser.js` contains Sections 02 and 03 as well. This review focuses exclusively on the five Section 1 concerns: `TokenBucket`, `httpsGet`, `buildEdgarRssUrl`, `fetchRecentFilings`, and `deduplicateFilings`. References to Section 02/03 code appear only where they interact with Section 1 contracts (e.g., rate limiter bypass).

---

## Summary

The implementation is largely correct and well-structured. The module skeleton matches the spec precisely, all required exports are present, and all nine Section 1 test cases pass the spec requirements. Two issues are important enough to fix before this code goes to production: the rate-limiter bypass in `fetchRecentFilings` that silently skips the `edgarBucket.acquire()` call whenever a `fetchFn` is provided, and the `toEdgarIso` helper stripping the trailing `Z` via an over-broad regex that will silently corrupt datetime strings in edge cases. One additional concern — the missing 10-second timeout on the `_sleep` post-request delay path — is minor but worth noting.

---

## What Was Done Well

- **Module skeleton exactly matches spec.** The section comment headers, constant names (`edgarBucket`, `EDGAR_REQUEST_DELAY_MS`, `EDGAR_USER_AGENT`), and export list all match the skeleton in the spec verbatim. Later sections can extend the file without restructuring.
- **TokenBucket implementation is correct and production-quality.** The `_refill` drain loop (lines 32-35) correctly handles queued waiters in arrival order. The `unref()` call (line 26) is a good defensive touch — it prevents the interval from keeping the Node.js process alive in test environments, which would cause Jest to hang.
- **httpsGet handles all four spec requirements.** Gzip decompression, redirect following up to 3 hops, `req.destroy()` timeout, and `Promise<string>` return are all implemented correctly. The `res.resume()` calls on redirect and error paths (lines 83, 89) correctly drain the response body to avoid connection leaks.
- **CIK regex extraction is correct.** The two-tier approach — full match for ticker+CIK, secondary match for CIK-only — handles the fund/trust case the spec calls out. The "skip if no CIK at all" guard (line 188) matches the spec's instruction exactly.
- **deduplicateFilings is clean and correct.** The `== null` check (line 214) correctly catches both `null` and `undefined` in one expression, which is the right pattern for JavaScript. String comparison of ISO 8601 dates is lexicographically correct.
- **Test fixtures are well-designed.** The `EFTS_TWO_HITS` fixture exercises both the ticker-present and ticker-absent cases in a single fetch call, avoiding test duplication. The `makeRouteFetch` router pattern in the Section 02 test block is a clean pattern for multi-URL mocking.
- **failureCount test isolation.** The `_resetFailureCount()` call before the network error test (line 855) correctly prevents count bleed from other tests. This is exactly the pattern the spec calls for.

---

## Issues

### Important (should fix)

**Issue 1: Rate limiter is silently bypassed in all test-mode calls, and in all production callers that pass a fetchFn**

File: `edgar-parser.js`, lines 146-159

```javascript
// Rate limiting (skip acquire when fetchFn provided — tests don't wait for bucket)
if (!fetchFn) {
  await edgarBucket.acquire();
}

let body;
if (fetchFn) {
  const res = await fetchFn(url);
  body = await res.text();
} else {
  body = await httpsGet(url);
}

if (!fetchFn) {
  await _sleep(EDGAR_REQUEST_DELAY_MS);
}
```

The comment says "tests don't wait for bucket" but the consequence is broader than that. Any caller of `fetchRecentFilings` that passes a custom `fetchFn` — which is the spec-defined public API for dependency injection — will bypass both tiers of the rate limiter entirely. The spec explicitly states that every EDGAR HTTP call must go through the shared two-tier rate limiter at lines 68-82 of the section spec:

> "Every EDGAR HTTP call in `edgar-parser.js` — both EFTS requests and Form 4 XML fetches (added in Section 02) — must go through the same two-tier rate limiter defined at module scope."

This design also means the rate-limiter is completely untested. There are no tests that verify `edgarBucket.acquire()` is called on a real (non-mocked) path.

The correct pattern is to keep rate limiting unconditional and instead give tests a way to fast-forward the bucket's internal clock. The simplest approach is a test-only reset method that refills the bucket: `_resetBucket: () => { edgarBucket._tokens = edgarBucket._capacity; }`. Alternatively, pass the bucket as a parameter with a default (but this changes the function signature). At minimum, the bypass should be narrowed to just the 110ms sleep, not the acquire, since `acquire()` on a full bucket resolves synchronously and costs nothing in tests.

**Issue 2: `toEdgarIso` datetime formatter uses an over-broad regex**

File: `edgar-parser.js`, lines 121-123

```javascript
function toEdgarIso(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, '').replace('Z', '');
}
```

`d.toISOString()` always produces the format `YYYY-MM-DDTHH:mm:ss.mmmZ`. The first `replace` with `/\.\d{3}Z$/` correctly strips `.mmmZ` to produce `YYYY-MM-DDTHH:mm:ss`. The second `.replace('Z', '')` is then a no-op because the first replace already consumed the only `Z`. However, the second replace is not anchored and operates on the first occurrence of `'Z'` anywhere in the string. If JavaScript's `Date.toISOString()` behavior ever changes (or if this function is called with a date whose ISO string representation contains a `Z` for another reason), the second replace will silently corrupt the output by removing the wrong `Z`.

The correct and minimal fix is to remove the second `.replace('Z', '')` since it is unreachable after the first replace. A cleaner alternative is a single replace: `d.toISOString().replace(/\.\d{3}Z$/, '')`.

This is low-severity because `Date.toISOString()` output is stable in the V8 runtime, but the dead code introduces confusion and a latent correctness risk.

---

### Minor (nice to have)

**Issue 3: The 110ms post-request delay is skipped on test paths, making the sleep untestable**

File: `edgar-parser.js`, lines 158-160

```javascript
if (!fetchFn) {
  await _sleep(EDGAR_REQUEST_DELAY_MS);
}
```

The same `!fetchFn` guard that bypasses `acquire()` also bypasses the sleep. This is acceptable from a test speed perspective, but it means there is no test verifying that real requests actually sleep 110ms. A comment explaining this intentional skip would help future maintainers distinguish "intentional test shortcut" from "forgotten requirement."

**Issue 4: `opts` parameter defensiveness is inconsistent**

File: `edgar-parser.js`, line 116

```javascript
const hours = (opts && opts.hours != null) ? opts.hours : 6;
```

This correctly handles `opts = null`, `opts = undefined`, and `opts = {}`. However, the function is documented as `@param {object} opts` (not nullable), and the spec shows only `buildEdgarRssUrl({ hours: 6 })` call sites. The defensive null check for `opts` itself is good practice, but the test at line 781 calls `buildEdgarRssUrl({})` (empty object), which the current implementation handles correctly. A call with `buildEdgarRssUrl()` (no argument) would also work due to the guard. This is fine — just noting it is slightly over-defensive given the spec.

**Issue 5: No test for the `opts` default hours path using `null` as the argument**

The test at line 780 verifies `buildEdgarRssUrl({})` uses 6-hour default. The spec also implies `opts.hours` defaulting when the key is absent. There is no test for `buildEdgarRssUrl(null)` or `buildEdgarRssUrl()` even though the implementation explicitly handles these. Since `fetchRecentFilings` always passes `{ hours }` explicitly, this is a low-priority gap, but worth a one-line test if the function is used by other callers.

---

## Plan Alignment

| Spec requirement | Status |
|---|---|
| `buildEdgarRssUrl` exported, pure, correct URL shape | Pass |
| URL host is `efts.sec.gov/LATEST/search-index` | Pass |
| `forms=4`, `dateRange=custom`, `size=2000` params | Pass |
| `startdt`/`enddt` in ISO 8601 (no trailing Z) | Pass |
| `fetchRecentFilings` exported, async, never rejects | Pass |
| Rate limit: `edgarBucket.acquire()` before each request | Fail — bypassed when `fetchFn` present |
| Rate limit: 110ms sleep after each request | Fail — bypassed when `fetchFn` present |
| `User-Agent` header on all EDGAR requests | Pass (in `httpsGet`; skipped via `fetchFn` bypass) |
| Field mapping: `file_num` -> `accessionNumber`, `file_date` -> `filedAt`, etc. | Pass |
| Ticker/CIK regex with secondary CIK fallback | Pass |
| Skip filing if CIK unavailable | Pass |
| `failureCount` incremented on error, returned `[]` | Pass |
| `deduplicateFilings` exported, synchronous, pure | Pass |
| Boundary condition: `filedAt <= lastCheckTimestamp` excluded | Pass |
| `null`/`undefined` timestamp returns all filings | Pass |
| `TokenBucket` module-level singleton named `edgarBucket` | Pass |
| `_resetFailureCount` / `_getFailureCount` exported | Pass |
| No external npm packages | Pass |
| `httpsGet`: gzip decompression | Pass |
| `httpsGet`: redirect following up to 3 hops | Pass |
| `httpsGet`: 10s timeout via `req.destroy()` | Pass |
| Module skeleton structure with section comment headers | Pass |

---

## Test Coverage Assessment

The nine Section 1 tests required by the spec are all present and correctly written:

- `buildEdgarRssUrl`: 3 tests (host, params, startdt tolerance) — all present. An additional "defaults hours to 6" test beyond the spec requirement is a useful addition.
- `fetchRecentFilings`: 5 tests (2 hits, no-ticker case, empty hits, network error, unexpected shape) — all present. The no-ticker test reuses the same `fetch` call as the 2-hits test by checking `results[1]`, which is efficient.
- `deduplicateFilings`: 5 tests (boundary excluded, included, null, undefined, empty) — all present and correct.

One gap: the rate limiter behavior (`edgarBucket.acquire()` is called on the production path, not bypassed) is completely untested. This is a direct consequence of Issue 1 above.

The mock pattern (`makeFetch` returning `{ ok, text, json }`) correctly matches the contract `fetchRecentFilings` expects (`res.text()`). The `makeRouteFetch` URL router used in Section 02 tests is a well-designed pattern.

---

## Recommended Actions

1. **Fix Issue 1 (rate limiter bypass):** Remove the `!fetchFn` guards around `edgarBucket.acquire()` and `_sleep`. Add `_resetBucket` as a test helper that sets `edgarBucket._tokens = edgarBucket._capacity` so tests that run many fillings don't block. If the 110ms sleep is a test performance concern, add a separate `_setRequestDelay(ms)` test helper rather than bypassing the whole mechanism.

2. **Fix Issue 2 (toEdgarIso):** Remove the second `.replace('Z', '')` — it is unreachable dead code after the first regex replace.

3. **Add a comment on Issue 3:** Where `_sleep` is conditionally skipped, add: `// 110ms SEC fair-access delay; skipped in tests via fetchFn injection`.

These are the only blocking items. The overall implementation quality is high — the TokenBucket, httpsGet, and deduplicateFilings implementations are production-ready, the test coverage is thorough for the spec-required cases, and the module skeleton is cleanly structured for extension by Sections 02 and 03.
