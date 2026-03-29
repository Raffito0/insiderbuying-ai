# Code Review: Section 02 — Form 4 XML Parser

**Reviewer:** Senior Code Reviewer (updated review)
**Date:** 2026-03-29
**Files reviewed:**
- `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/edgar-parser.js` (lines 213–465, plus shared helpers lines 1–99)
- `ryan_cole/insiderbuying-site/tests/insiderbuying/edgar-parser.test.js` (section-02 blocks)
- `ryan_cole/insiderbuying-planning/09-data-pipeline/sections/section-02-form4-xml-parser.md`

---

## Summary

The implementation is production-quality. Both auto-fixes from the prior review are confirmed applied in the current code (`res.resume()` on non-2xx paths in `httpsGet`, two-step `transactionCode` extraction in `parseTransaction`). The test suite covers all five fixture types and all specified edge cases. One important structural issue and one important gap remain. No critical blockers.

---

## Prior Auto-Fixes: Confirmed Applied

Both fixes noted in the prior review are present in the current file:

1. `res.resume()` is called on both non-2xx paths in `httpsGet` (lines 77 and 82) — socket leak prevented.
2. `parseTransaction` extracts `transactionCoding` via `extractTag` and then extracts `transactionCode` from that block (lines 358–359) — correct two-step pattern.

---

## What Is Working Correctly

**pricePerShare null vs 0 distinction**: `parseTransaction` checks `extractTag(block, 'transactionPricePerShare') !== null` before parsing (line 365–369). When the element is absent, `pricePerShare` stays `null`. When the element is present with `<value>0</value>` (option exercise fixture), `parseNum("0")` returns `0`. Both cases are correct. The gift fixture test asserts `toBeNull()` explicitly.

**fetchForm4Xml: all failure paths return null**: Outer `try/catch` plus individual inner `try/catch` blocks around each `doFetch` call cover network errors, JSON parse failures, and missing index items. All six `fetchForm4Xml` tests pass.

**index.json fallback with type preference**: The double `find` at lines 287–289 prefers `type === '4'` items, then falls back to any `.xml` item. This matches the spec.

**Namespace prefix handling**: `extractTag` pattern `<(?:\\w+:)?tagName[^>]*>` strips any namespace prefix on both opening and closing tags. The `<edgar:transactionDate>` test validates this path.

**Entity decoding — named entities**: All five named XML entities (`&amp;`, `&lt;`, `&gt;`, `&apos;`, `&quot;`) are decoded. Hex numeric entities (`&#xNN;`) are decoded via `String.fromCharCode(parseInt(h, 16))`. The `AT&amp;T INC` test validates the `&amp;` case.

**parseNum with commas**: Strips commas before `parseFloat`, validates with `Number.isFinite`. The `1,000 → 1000` test validates this.

**All 5 fixture types**: Standard buy, amendment (4/A), gift (no price), option exercise (derivative), multi-transaction (3 blocks) — all implemented as inline fixture strings per spec.

**Exports**: `buildForm4XmlUrl`, `fetchForm4Xml`, `parseForm4Xml` all present in `module.exports`.

**Rate limiter bypass in tests**: The `if (!fetchFn)` guard correctly skips `edgarBucket.acquire()` and `_sleep()` when a test mock is injected.

---

## Issues

### Important (should fix)

**I-1: The 404 → index.json fallback is unreachable in production**

Location: `edgar-parser.js` lines 80–84, 240–244, 251–257

In production (no `fetchFn`), `doFetch` calls `httpsGet`. `httpsGet` calls `reject(new Error('HTTP 404 for ...'))` for any non-2xx response (line 83). It never returns a `{ status: 404 }` object. The `doFetch` wrapper wraps `httpsGet` and always returns `{ status: 200, text: async () => body }` when `httpsGet` resolves — it has no way to surface a 404 status code as a non-throwing return value.

The result: in production, a 404 on the primary URL causes the inner `try/catch` at lines 253–257 to catch the rejection and immediately return `null`. The check `if (res.status !== 404)` at line 264 is never reached. The index.json fallback is entirely bypassed.

The test suite does not catch this because all `fetchForm4Xml` tests inject a `fetchFn` mock that returns `{ status: 404, text: ... }` as a resolved promise — bypassing `httpsGet` entirely.

This is a behavioral gap between the tested path and the production path. Any real Form 4 filing whose primary URL returns 404 will silently fail instead of falling back to index.json.

Recommendation: Change `httpsGet` to return `{ status, body }` on 4xx responses instead of rejecting (reserve rejection for true network errors and 5xx), then update `doFetch` to unwrap it, so the 404 status code is visible to `fetchForm4Xml`. Alternatively, in the inner `catch` block at lines 253–257, check the error message for the 404 pattern and proceed to the index fallback instead of returning `null`.

---

**I-2: `decodeXmlEntities` does not handle decimal numeric character references**

Location: `edgar-parser.js` line 347

`decodeXmlEntities` handles hex numeric references (`&#xNN;`) but not decimal numeric references (`&#NNN;`). Both forms are valid XML and both appear in EDGAR data. Common examples: `&#38;` (ampersand), `&#160;` (non-breaking space), `&#8212;` (em dash) in company names and officer titles. Without this, those characters pass through as literal entity strings in the parsed output.

The spec documents only `&#xNN;` in the requirement list, but this is an omission in the spec rather than an intentional exclusion — decimal references are valid XML per the XML 1.0 specification and can appear in any text node.

Recommendation: Add a decimal numeric entity replacement after the hex one:
```js
.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
```
No test currently catches this gap; a test for `&#38;` → `&` would be worth adding alongside the fix.

---

### Suggestions (nice to have)

**S-1: No test asserts `pricePerShare === 0` for the option exercise fixture**

Location: `edgar-parser.test.js` lines 508–521

The `FIXTURE_OPTION_EXERCISE` includes `<transactionPricePerShare><value>0</value></transactionPricePerShare>`. The implementation correctly returns `0` (not `null`) because the element is present. However, the test describe block for fixture 4 does not assert this. Adding `expect(result.derivativeTransactions[0].pricePerShare).toBe(0)` would document the `0 vs null` contract on the "present but zero" side, complementing the fixture 3 test for the "absent" side.

---

**S-2: `is10b5Plan` placeholder should have a traceable TODO comment**

Location: `edgar-parser.js` line 384

`is10b5Plan: false, // calculated in Section 3` is correct as a deferral, and `calculate10b5Plan` is fully implemented in section 3 and exported. But the integration point — calling `calculate10b5Plan(block)` in `parseTransaction` — is not wired up. The placeholder comment does not make the deferral discoverable. Changing it to `// TODO(section-03-integration): wire calculate10b5Plan(block) here` makes the gap explicit and searchable.

---

**S-3: `fetchForm4Xml` does not handle HTTP 500 or other non-200 non-404 status codes explicitly in the test suite**

Location: `edgar-parser.test.js` (missing test)

The production code at line 264 (`if (res.status !== 404) return null`) correctly handles 500, 429, and other non-success statuses by returning `null`. However, there is no test for this path — e.g., a `fetchFn` mock returning `{ status: 500, text: ... }` and asserting `null` is returned. This is a minor gap since the code is correct, but the test suite would be more complete with it.

---

## Plan Alignment

| Spec Requirement | Status |
|---|---|
| `buildForm4XmlUrl` returns `{ primaryUrl, indexUrl }` | Pass |
| Primary URL strips dashes for both path segment and filename | Pass |
| `fetchForm4Xml` tries primary URL first | Pass |
| Falls back to `index.json` on 404 | Pass in tests only — broken in production (I-1) |
| Prefers `type='4'` xml item in index | Pass |
| All fetch paths return `null` (no throws) | Pass |
| User-Agent header on all requests | Pass |
| `parseForm4Xml` handles all 5 fixture types | Pass |
| `pricePerShare` is `null` when element absent | Pass |
| `pricePerShare` is `0` when element present with value `0` | Pass (untested — S-1) |
| Namespace prefix handling | Pass |
| `issuerTradingSymbol` absent returns `null` | Pass |
| Malformed XML returns `null`, no throw | Pass |
| Comma-formatted share counts parsed correctly | Pass |
| Entity decoding — named entities | Pass |
| Entity decoding — hex numeric entities | Pass |
| Entity decoding — decimal numeric entities | Gap (I-2) |
| `is10b5Plan` field present in transaction | Pass (placeholder) |
| All exports in `module.exports` | Pass |

---

## Definition of Done Checklist (from spec)

1. All tests described above pass — Pass (test suite is complete and matches implementation)
2. `parseForm4Xml` handles all 5 fixture variants without throwing — Pass
3. `pricePerShare` is `null` (not `0`, not `NaN`) for the gift fixture — Pass
4. Entity-encoded names decoded correctly (`&amp;` → `&`) — Pass
5. Namespace-prefixed tags parsed correctly — Pass
6. `fetchForm4Xml` falls back to `index.json` on 404 and returns `null` on all failure paths — Partial: test-only, broken in production (I-1)
7. All EDGAR requests include the required `User-Agent` header — Pass

---

## Action Items

| Priority | Item | Location |
|---|---|---|
| Important | Fix `httpsGet` / `fetchForm4Xml` so the 404 → index.json fallback is reachable in production (I-1) | `edgar-parser.js` lines 80–84, 240–257 |
| Important | Add decimal numeric entity decoding `&#NNN;` to `decodeXmlEntities` (I-2) | `edgar-parser.js` line 347 |
| Suggestion | Add test asserting `pricePerShare === 0` for option exercise fixture (S-1) | `edgar-parser.test.js` fixture 4 block |
| Suggestion | Change `is10b5Plan` comment to traceable `TODO(section-03-integration)` (S-2) | `edgar-parser.js` line 384 |
| Suggestion | Add test for primary URL returning 500 → `null` (S-3) | `edgar-parser.test.js` |
