# Code Review: section-03-score-alert.js

## Critical Issues (must fix before commit)

### 1. n8n entrypoint is commented out — the node will never run
The n8n entry block is wrapped in a comment (`/* n8n-entrypoint-start ... */`). When deployed to n8n, the Code node produces no output. Fix: use `if (typeof $input !== 'undefined')` guard.

### 2. Yahoo Finance exceptions inside loop abort all remaining price lookups
`fetch30DayReturn` does not wrap `fetchFn` in a try/catch, so a network exception on one ticker propagates to the outer catch and discards all remaining historical data. Fix: wrap the `fetchFn` call in `fetch30DayReturn` itself with a try/catch returning `null`.

### 3. Supabase ilike pattern uses `*` wildcards instead of SQL `%`
Pattern `*john*smith*` should be `%john%smith%`. PostgREST ilike uses SQL LIKE syntax where `%` is the wildcard, not `*`. Currently every track record lookup silently returns zero rows.

## Important Issues (should fix)

### 4. HAIKU_DEFAULT is a shared mutable object
`callHaiku` returns the same object reference. Fix: return `{ ...HAIKU_DEFAULT }`.

### 5. hit_rate denominator is validReturns.length, not rows.length
If Yahoo only returns data for 2 of 3 past buys, hit_rate = hits/2 but past_buy_count = 3 — inconsistency can mislead Haiku. Document this in a comment.

## Minor Issues

### 6. `fetch30DayReturn` uses `validPairs[0]` as start price, not nearest filing_date
Minor spec deviation — Yahoo may return data starting a day before period1.

### 7. Prompt includes raw decimal AND percentage for hit_rate — test is brittle on format

## Test Coverage Gaps

- No test asserting Supabase URL contains `%john%smith%` (would have caught Issue #3)
- No test for `insider_name = null` (would throw in `normalizeInsiderName`)
- No test for `callHaiku` when Haiku returns 200 with non-JSON body
- No test for Yahoo Finance returning empty timestamp array

## Summary
3 critical issues that break production behavior:
1. Commented-out n8n entrypoint
2. Per-filing Yahoo Finance exception isolation
3. Wrong wildcard char in Supabase ilike pattern
