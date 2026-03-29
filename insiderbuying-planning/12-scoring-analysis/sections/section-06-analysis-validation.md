# Section 06 — Analysis Validation

## Overview

This section adds `validateAnalysis(text, score, direction, percentageDataAvailable)` to `analyze-alert.js`. The function is called after each DeepSeek response during alert analysis. It runs five independent rules, collects all failures before deciding whether to retry, and drives the retry/fallback flow inside `runAnalyzeAlert()`.

**Dependency**: Section 05 (Structured Alert Analysis) must be complete first. This section modifies `analyze-alert.js` and assumes `runAnalyzeAlert()` and `getWordTarget(score)` already exist.

**File to modify**: `n8n/code/insiderbuying/analyze-alert.js`
**Test file to modify**: `n8n/tests/analyze-alert.test.js`

---

## Tests First

Add a `validateAnalysis()` test block to `analyze-alert.test.js`. Write all stubs before implementing any production code. Tests follow the existing dependency-injection pattern — pass `fetchFn`, `sleep`, and `env` as mocks.

### Rule 1 — Word Count

```
test: text with word count >= target * 0.70 → Rule 1 passes
test: text with word count < target * 0.70 → Rule 1 fails, error message includes "too short"
test: text with word count > max → Rule 1 fails, error message includes "too long"
test: text at exactly floor (target * 0.70, rounded down) → passes (boundary inclusive)
test: text at exactly max word count → passes (boundary inclusive)
test: text at max + 1 word → fails
```

The `target` and `max` values come from `getWordTarget(score)`. Pass `score` to `validateAnalysis()` so it can call `getWordTarget()` internally.

### Rule 2 — Banned Phrases

```
test: text containing "guaranteed" → fails with banned phrase error naming the phrase
test: text containing "will moon" → fails
test: text containing "to the moon" → fails
test: text containing "GUARANTEED" (uppercase) → fails (check is case-insensitive)
test: text containing "guarantee" as part of a longer word → behavior is your choice; document it in the test
test: text with none of the banned phrases → Rule 2 passes
```

The banned phrase list: `["guaranteed", "will moon", "to the moon", "can't lose", "sure thing"]`. Implement as a constant array — not hardcoded inside the loop.

### Rule 3 — Dollar Amount Present

```
test: text containing "$45.20" → passes
test: text containing "$1,200" → passes
test: text containing no "$" character → fails
test: text containing "$" not followed by digits (e.g., "the $ amount") → fails
```

The check is a regex: `\$\d`. At least one match must exist anywhere in the text.

### Rule 4 — Percentage Present (Conditional)

```
test: percentageDataAvailable = true, text contains "15%" → passes
test: percentageDataAvailable = true, text contains no "%" → fails with "no percentage" error
test: percentageDataAvailable = false → Rule 4 skipped entirely; passes regardless of text content
test: percentageDataAvailable = false, text has no "%" → still passes (rule was skipped)
```

`percentageDataAvailable` is `true` when at least one of `pct_change_today` (from Finnhub) or `portfolio_pct` (from `sharesOwnedAfter`) was injected into the prompt. If neither was available, the LLM cannot produce a percentage — skip the rule.

### Rule 5 — Cautionary Language

```
test: text containing "however" → passes
test: text containing "could" → passes
test: text containing "routine" → passes
test: text containing "caution" → passes
test: text containing "consider" → passes
test: text containing "risk" → passes
test: text with none of the cautionary words → fails
test: cautionary word embedded in a longer word (e.g., "recover") → behavior is your choice; document it
```

Cautionary word list: `["however", "risk", "caution", "could", "routine", "consider"]`. Case-insensitive check.

### All Rules Together

```
test: text failing Rules 1 and 3 simultaneously → errors array contains both failures, {valid: false}
test: text failing all 5 rules → errors array length = 5 (or 4 if Rule 4 skipped)
test: text passing all applicable rules → returns {valid: true, errors: []}
```

The function must always collect ALL failures before returning — do not short-circuit on first failure.

### Retry Flow (integration tests on `runAnalyzeAlert()`)

```
test: first DeepSeek response fails validation → second call sent; prompt appended with error list from first failure
test: second attempt passes validation → returns second response; logs which attempt succeeded
test: both attempts fail validation → minimal fallback template returned; validateAnalysis() NOT called a third time
test: fallback template contains: insiderName, "bought"/"sold" (direction-aware), share count, price, finalScore
test: fallback template format: "{insiderName} {bought/sold} {shares} shares at ${price}. Score: {finalScore}/10."
```

On the second attempt, the appended error list format is: `"Previous attempt failed validation: [error1, error2]. Fix these issues."` The errors are the human-readable strings from `validateAnalysis().errors`.

---

## Implementation

### `validateAnalysis(text, score, direction, percentageDataAvailable)`

**Signature**: pure function, no external dependencies, no async.

**Returns**: `{ valid: boolean, errors: string[] }`

**Logic**:

1. Call `getWordTarget(score)` to get `{ target, max }`.
2. Count words in `text` (split on whitespace, filter empty).
3. Rule 1: check `wordCount >= Math.floor(target * 0.70)` and `wordCount <= max`. Add error strings on failure.
4. Rule 2: for each banned phrase, test case-insensitive regex against `text`. Add error string naming the phrase on match.
5. Rule 3: test `/\$\d/` against `text`. Add error string if no match.
6. Rule 4: if `percentageDataAvailable`, test `/%/` against `text`. Add error string if no match. If `!percentageDataAvailable`, skip entirely.
7. Rule 5: test each cautionary word case-insensitively against `text`. Add error string if none match.
8. Return `{ valid: errors.length === 0, errors }`.

The `direction` parameter is accepted for future extensibility (e.g., direction-specific banned phrases for buy vs. sell) but is not used in the five rules above. Do not throw if direction is missing.

### Retry Flow in `runAnalyzeAlert()`

The retry logic wraps the existing DeepSeek call. After receiving a response:

1. Call `validateAnalysis(responseText, finalScore, direction, percentageDataAvailable)`.
2. If `valid`, return the response.
3. If invalid, build a second prompt: original prompt + `"\n\nPrevious attempt failed validation: [${errors.join(', ')}]. Fix these issues."`.
4. Send second prompt to DeepSeek.
5. Call `validateAnalysis()` on the second response.
6. If valid, log which attempt succeeded, return second response.
7. If invalid, log both failures, return the fallback template string **without calling `validateAnalysis()` again**.

**Fallback template**:

```javascript
const direction_word = direction === 'A' ? 'bought' : 'sold';
return `${insiderName} ${direction_word} ${shares} shares at $${price}. Score: ${finalScore}/10.`;
```

The fallback bypasses validation by design — it is always structurally safe and will always contain a dollar amount, pass word count minimum (it's short, but the minimum doesn't apply to fallbacks), and is never sent back for re-validation.

### JSON Parsing Robustness (shared concern with Section 02)

The DeepSeek response for the analysis call (not just the refinement layer) should also strip markdown code fences before processing. If the response is wrapped in ` ```json ... ``` ` or ` ``` ... ``` `, strip the fences before using the text. This is the same stripping function used in the refinement layer — extract it as a shared helper `stripMarkdownFences(text)` if not already done.

---

## Constants to Define

Add these as module-level constants in `analyze-alert.js`:

```javascript
const BANNED_PHRASES = ["guaranteed", "will moon", "to the moon", "can't lose", "sure thing"];
const CAUTIONARY_WORDS = ["however", "risk", "caution", "could", "routine", "consider"];
```

---

## Logging

Every validation run should emit a structured log object:

```javascript
{
  event: 'analysis_validation',
  attempt: 1 | 2,
  valid: boolean,
  errors: string[],        // empty array if valid
  wordCount: number,
  ticker: string,
  timestamp: string        // ISO 8601
}
```

On fallback template usage, log:

```javascript
{
  event: 'analysis_fallback_used',
  reason: 'double_validation_failure',
  attempt1Errors: string[],
  attempt2Errors: string[],
  ticker: string,
  timestamp: string
}
```

---

## Dependencies from Other Sections

- **Section 05** (Structured Alert Analysis): `getWordTarget(score)` must exist and return `{ target, max }` before `validateAnalysis()` can be implemented. `percentageDataAvailable` flag is set in `runAnalyzeAlert()` during data injection.
- **Section 07** (finnhub-client.js): indirectly consumed — `pct_change_today` comes from Finnhub and determines `percentageDataAvailable`. No direct dependency on `finnhub-client.js` from this section.

---

## Checklist

- [ ] Write all `validateAnalysis()` test stubs in `analyze-alert.test.js` before writing production code
- [ ] Write retry flow integration test stubs before implementing the retry logic
- [ ] Implement `validateAnalysis()` as a pure synchronous function
- [ ] Define `BANNED_PHRASES` and `CAUTIONARY_WORDS` as module-level constants
- [ ] Wire retry flow into `runAnalyzeAlert()` (first attempt → validate → retry with error list → validate → fallback)
- [ ] Implement fallback template (direction-aware, bypasses validation)
- [ ] Add structured logging for validation events and fallback usage
- [ ] Extract `stripMarkdownFences()` as a shared helper if not already done in Section 02
- [ ] Run `npm test -- --testPathPattern="analyze-alert"` — all existing tests must still pass
- [ ] Confirm `validateAnalysis()` is exported or accessible to tests (e.g., via module export or by testing through `runAnalyzeAlert()`)

---

## Implementation Notes (Actual)

- **Files modified**: `n8n/code/insiderbuying/analyze-alert.js`, `tests/insiderbuying/analyze-alert.test.js`
- **New constants**: `BANNED_PHRASES`, `CAUTIONARY_WORDS` as module-level arrays per spec
- **`stripMarkdownFences(text)`**: Added as private helper, anchored at `^` — works for direct-fence responses. Not exported (no second consumer yet). Limitation documented in interview.
- **`validateAnalysis` return type change**: `boolean` → `{ valid: boolean, errors: string[] }`. Backward compat maintained by skipping Rule 1 when `score` is undefined/null, so all legacy callers (analyze()) that pass no score continue to work. Rule 4 skipped when `pctAvailable` is falsy.
- **`analyze()` updated**: `if (validateAnalysis(text))` → `if (validateAnalysis(text).valid)`. Retry still sends original prompt (legacy behavior, documented as intentional divergence from runAnalyzeAlert).
- **`runAnalyzeAlert()` retry flow**: Attempt 1 → validate → if invalid, append `"Previous attempt failed validation: [errors]. Fix these issues."` → Attempt 2 → validate → if still invalid, emit `analysis_fallback_used` log + return fallback template. No third validateAnalysis call.
- **Fallback template**: `priceStr` now guards against missing price (`rawPrice != null ? \`$\${rawPrice}\` : 'N/A'`), so fallback is always structurally safe.
- **Structured logging**: `analysis_validation` (attempts 1 and 2) + `analysis_fallback_used` events match spec schema exactly.
- **`GOOD_ANALYSIS` fixture**: Annotated with comment warning not to use with a score arg (would fail Rule 1 at ~42 words).
- **90/90 tests pass** (52 legacy + 38 new S06 tests)
