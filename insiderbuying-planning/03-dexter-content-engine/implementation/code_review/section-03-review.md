# Section 03 Review: W1 Keyword Selection Workflow

**Reviewer**: Claude Opus 4.6 (Senior Code Reviewer)
**Date**: 2026-03-27
**Files reviewed**:
- `insiderbuying-site/n8n/code/insiderbuying/select-keyword.js` (374 lines)
- `insiderbuying-site/n8n/tests/select-keyword.test.js` (251 lines)

**Test result**: 30/30 passing

---

## What Was Done Well

1. **Clean module structure**: Pure functions with dependency injection (`fetchFn`, `opts`) make the code testable without mocking globals. This is the correct pattern for n8n Code nodes where `fetch` is not available globally.

2. **Graceful degradation**: The fallback from DataForSEO to seed-only mode is well-designed. `Promise.allSettled` prevents one failed API call from killing the other. The pipeline never crashes -- it always returns keywords.

3. **Intent classification priority ordering**: Checking C/D before B/A is the right call. The comment explaining why ("insider buying strategy guide" should be D, not B) demonstrates good thinking about overlapping signal words.

4. **Scoring formula**: Matches the spec exactly: `volume * (1 - difficulty/100) * intent_multiplier`. Rounding to 2 decimal places prevents floating-point noise.

5. **Test coverage**: All 11 spec test stubs are covered. Intent classification, scoring, seed generation, dedup, batch output, multi-blog -- all tested with concrete assertions.

---

## Issues

### Important (should fix)

**I1. `classifyIntent` has a redundant double-check that creates a subtle ordering bug.**

Line 98:
```javascript
if (words.includes(signal) || lower.includes(signal)) {
```

The `lower.includes(signal)` substring match is overly broad. For example, the word `"top"` (type C) would match inside `"stopped"` or `"autopilot"`, and `"how"` (type B) would match inside `"showdown"`. Since C/D are checked before B/A, a keyword like `"earnings showdown"` would correctly fall through C (no match) but then match D if `"how"` were in D -- except `"how"` is in B, so it would match B via substring of "showdown". Currently this is partially saved by the priority ordering, but it is fragile.

The `words.includes(signal)` check (word-boundary match) is the correct one. The `lower.includes(signal)` fallback should be removed, or replaced with a word-boundary regex like `/\b${signal}\b/`.

**I2. Spec requires fuzzy dedup (similarity > 0.8), implementation only does exact match.**

Section spec, Step 5: "skip any keyword already present (by exact match **or fuzzy similarity > 0.8**)." The implementation only does case-insensitive exact match. This means near-duplicates like `"insider buying AAPL stock"` vs `"insider buying AAPL"` will both be selected.

This is likely acceptable for MVP since fuzzy matching adds complexity (Levenshtein or similar), but the deviation from the spec should be documented as a known limitation or the spec should be updated.

**I3. Spec requires SERP Analysis (Endpoint 3), implementation omits it entirely.**

The spec lists three DataForSEO endpoints: Search Volume, Related Keywords, and SERP Analysis (`/v3/serp/google/organic/live/regular`). The implementation only calls the first two. SERP analysis is mentioned for "gap analysis" in the spec. If this was intentionally deferred, it should be noted. If not, it is missing functionality.

**I4. Dead variable `existingLower` in `runKeywordPipeline`.**

Line 311:
```javascript
const existingLower = (existingKeywords || []).map((k) => k.toLowerCase().trim());
```

This variable is computed but never used. The next line calls `isDuplicate()` which does its own lowercasing internally. The dead code should be removed.

**I5. No self-dedup within the candidate pool.**

If DataForSEO returns the same keyword in both the volume results and the related keywords results, it will appear twice in `allCandidates`. The dedup only checks against `existingKeywords` (external NocoDB entries), not within the current batch. Two identical keywords could both end up in the final 21.

Fix: Add a `Set` or map-based dedup after merging volume and related results, keyed on `keyword.toLowerCase().trim()`.

**I6. Hardcoded year in sector seeds.**

Line 75:
```javascript
'best dividend stocks 2026',
```

This will be stale in 2027. Either compute the year dynamically (`new Date().getFullYear()`) or remove the year from the seed and let DataForSEO return time-relevant variations.

### Suggestions (nice to have)

**S1. No NocoDB write step implemented.**

The spec's Step 6 says "Insert top 21 keywords per blog into Keywords table, status='new'." The implementation returns the keyword objects but does not write them to NocoDB. This is presumably handled by a downstream n8n node (not this Code node), but it should be documented in the module header comment or in a `// NOTE:` comment near the return.

**S2. `fetchSearchVolume` returns `null` on HTTP error, `fetchRelatedKeywords` returns `[]`.**

These two functions handle the same error case differently. For consistency, both should return the same empty-result type (`[]` is better since the caller iterates over it).

**S3. Sector seeds are not tagged with a source.**

Ticker-based seeds and sector-level seeds are merged into the same array with no way to distinguish them later. If you ever need to trace where a keyword came from (ticker X vs sector-level), adding a `source` field would help debugging.

**S4. Test for `runKeywordPipeline` and `selectKeywords` is missing.**

The 30 tests cover the individual pure functions well, but neither `runKeywordPipeline` nor `selectKeywords` (the two async orchestration functions) are tested, even with a mock `fetchFn`. The fallback path (DataForSEO unavailable) is described in the spec tests but only implicitly covered by testing the sub-functions.

**S5. DataForSEO auth credentials are read from `helpers.env`.**

This is correct for n8n (environment variables, not hardcoded). However, the `buildDataForSEOAuth` function is exported and takes raw login/password. Ensure no test or calling code passes literal credentials. The current tests do not call `buildDataForSEOAuth` with real values, which is correct.

---

## Spec Alignment Summary

| Acceptance Criterion | Status | Notes |
|---|---|---|
| AC1: Sunday midnight EST trigger | N/A | Workflow JSON not in scope of this code review |
| AC2: Seed keywords per blog | PASS | All 3 blogs have correct patterns |
| AC3: DataForSEO search volume | PASS | Endpoint 1 implemented |
| AC4: Related keywords included | PASS | Endpoint 2 implemented |
| AC5: Intent classification A/B/C/D | PASS | TYPE_MAP matches spec exactly |
| AC6: Default to type A | PASS | Tested |
| AC7: Priority score formula | PASS | Formula matches spec |
| AC8: Case-insensitive dedup | PARTIAL | Exact match only, spec requires fuzzy (I2) |
| AC9: Exactly 21 per blog | PASS | selectTopKeywords caps at 21 |
| AC10: Fallback mode | PASS | Seeds used when DataForSEO unavailable |
| AC11: Warning if < 7 keywords | PASS | Warning generated at line 318 |
| AC12: All test stubs pass | PASS | 30/30 |

**Missing from spec**: SERP Analysis endpoint (I3), NocoDB write step (S1), fuzzy dedup (I2).

---

## Verdict

**PASS with issues.** The core logic (intent classification, scoring, seed generation, dedup, fallback) is correct and well-tested. The six Important issues should be addressed before production use, particularly I1 (substring matching bug), I4 (dead code), and I5 (no self-dedup within batch). I2, I3, and I6 are spec deviations that should either be implemented or documented as intentional deferrals.
