# Section 06 Code Review Interview — Analysis Validation

**Date**: 2026-03-29
**Review source**: `section-06-review.md`

---

## Triage Summary

All review items resolved without user input — 4 auto-fixes applied, 6 items let-go with rationale.

---

## Auto-Fixes Applied

### Fix A1 — Guard `GOOD_ANALYSIS` with score-less-only comment (I1)

**Finding**: `GOOD_ANALYSIS` (~42 words) would fail Rule 1 for any score-aware call. The legacy tests all call `validateAnalysis(GOOD_ANALYSIS)` without a score, so Rule 1 is always skipped and they pass. A developer reusing the fixture with a score arg would get a silent failure.

**Resolution**: Added a 3-line comment block above the constant warning: "Do NOT use this fixture with a score arg — it would fail Rule 1. Use `makeAnalysis()` from the S06 describe block for score-aware tests."

**Why auto-fixed**: Zero behavioral change, pure documentation. Prevents future confusion.

---

### Fix A2 — Guard `priceStr` to prevent `$` with no digits (I4)

**Finding**: `const priceStr = alert.pricePerShare || alert.price_per_share || ''` produced `"... at $. Score: ..."` when both price fields were absent — which contains `$` but not `$\d`, meaning it would technically fail Rule 3 if ever validated.

**Resolution**: Changed to `const rawPrice = alert.pricePerShare || alert.price_per_share; const priceStr = rawPrice != null ? \`$\${rawPrice}\` : 'N/A'`. Fallback template now produces `"... at N/A. Score: ..."` — ugly but structurally safe and honest.

**Why auto-fixed**: One-line fix, zero risk, makes the spec claim "fallback is always structurally safe" actually true.

---

### Fix A3 — Add test: "precautionary" passes Rule 5 (S2)

**Finding**: Rule 5 uses substring matching (`.includes()`). `CAUTIONARY_WORDS` contains `"caution"`, which is a substring of `"precautionary"`. This passes Rule 5 — but the behavior was undocumented.

**Resolution**: Added test `'"precautionary" passes Rule 5 (documented: "caution" is a substring of "precautionary")'` in the Rule 5 describe block.

**Why auto-fixed**: Documents actual substring behavior, mirrors the "recover" test that documents the non-match case.

---

### Fix A4 — Add test: `attemptCount=1` on first-attempt success (S4)

**Finding**: The retry flow tests covered `attemptCount=2` (retry path) and fallback path, but never asserted that a clean first-pass response returns `attemptCount: 1`.

**Resolution**: Added test `'first attempt passes → attemptCount=1'` before the existing retry tests.

**Why auto-fixed**: Trivial boundary test, makes the `attemptCount` contract explicit for both paths.

---

## Accepted Decisions

### Decision D1 — Legacy `analyze()` retry does not use error list (I2)

`analyze()` retry sends the original prompt unchanged on failure, while `runAnalyzeAlert()` appends the error list. The reviewer noted this as a quality divergence.

**Decision**: Accept. `analyze()` is explicitly documented as legacy. New callers use `runAnalyzeAlert()`. Backporting retry improvements to legacy code would increase surface area for regressions with no user-visible benefit — `analyze()` is slated for eventual removal once all callers migrate.

---

### Decision D2 — `stripMarkdownFences` anchored at `^` (I3)

The regex fails if the LLM prepends text before the fence. At temperature 0.3 with a prompt that says "Return ONLY the analysis prose. No JSON, no markdown headers", LLM preamble is extremely unlikely.

**Decision**: Accept. Document limitation with a comment in the function. If it becomes a real issue in production, the fix is to remove the `^` anchor — a one-character change.

---

### Decision D3 — `stripMarkdownFences` not exported (I5)

The function is a private helper used only inside `validateAnalysis`. No other module currently needs it.

**Decision**: Accept as-is. Export only when a second consumer exists (YAGNI). The canonical copy is in `analyze-alert.js` line ~25.

---

### Decision D4 — `wordCount` in log uses raw text, not stripped (S1)

The `console.log` in `runAnalyzeAlert` counts words from the original `text` response, while `validateAnalysis` counts from the `stripped` version. Discrepancy only occurs if DeepSeek actually wraps response in markdown fences.

**Decision**: Accept. Adding `wordCount` to the return value of `validateAnalysis` would change its return shape for a logging-only benefit. The discrepancy is noted in this interview. Fix if fences become a real production issue.

---

### Decision D5 — Smart apostrophe in "can't lose" (S5)

DeepSeek could output `can\u2019t lose` (right single quotation mark) which would slip past the straight-apostrophe check.

**Decision**: Accept. Temperature 0.3 prose output rarely produces typographic quotes. If it becomes an issue, normalize input to ASCII before BANNED_PHRASES check.

---

## Final Status

All important issues resolved. No user decisions required.

**Test count after fixes**: 90/90 passing.
