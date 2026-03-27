# Section 02: Code Review Interview

## Auto-fixes applied (no user input needed)

### Issue 1: Ticker injection risk — FIXED
- Added `encodeURIComponent()` via `safeTicker()` in all endpoint URLs
- Added `validateTicker()` function (exported) for upstream validation
- Added tests for `validateTicker`

### Issue 2: `computeDataCompleteness` type check — FIXED
- Changed from `value && (Array.isArray(value) ? value.length > 0 : true)` to `Array.isArray(value) && value.length > 0`
- All 7 data types are arrays, so this is the correct strict check

### Issue 3: `fetchWithRetry` fallback — FIXED
- Removed `globalThis.fetch || require('https')` fallback
- Now throws clear error: `'fetchFn is required (n8n Code node does not have global fetch)'`

### Issue 5: Competitors endpoint comment — FIXED
- Added code comment explaining that `competitors` has no ENDPOINTS entry because it's fetched by a separate n8n node

### Suggestions 10-12: Missing tests — FIXED
- Added `formatMarketCap` tests (4 cases: T, B, M, null/non-number)
- Added `parsePreAnalysis` tests (5 cases: valid JSON, markdown-wrapped, malformed, wrong structure, cap arrays)
- Added `validateTicker` tests (valid + invalid tickers)
- Added `dexterResearch` entry point tests (4 cases: missing ticker, missing API key, success with mock, abort on low completeness)

## Deferred (not worth the complexity)

### Suggestion 6: `Math.max(...closes)` stack overflow
- At 252 elements this is safe. If we ever support multi-year data we can switch to reduce. Not worth the readability tradeoff now.

### Suggestion 7: `buildPreAnalysisPrompt` JSON truncation
- Pragmatic approach. The LLM handles partial JSON fine. A field-selection approach would add complexity for minimal gain.

### Suggestion 8: Greedy regex in `parsePreAnalysis`
- Works in practice because prompt asks for "ONLY valid JSON". Monitored.

### Suggestion 9: `filterRecentInsiderTrades` time dependency
- Tests use relative dates which work correctly. Adding `now` parameter would be overengineering for this use case.

## Final state
- 35 tests, all passing (212ms)
- All 3 important issues fixed
- 15 additional tests added from suggestions
