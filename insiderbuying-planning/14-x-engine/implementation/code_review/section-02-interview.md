# Code Review Interview — Section 02: Data Enrichment

## Review Findings Triage

All fixes auto-applied — no user decisions needed.

### Auto-Fixes Applied

**Fix 1: `trackRecord` drops '0%' due to falsy check**
- Finding: `primary.historical_return || null` evaluates `"0%"` as falsy, returning null
- Spec says: null only when field is undefined, null, or empty string
- Fix: `(primary.historical_return != null && primary.historical_return !== '') ? primary.historical_return : null`

**Fix 2: `_formatValue` sub-$1K produces unformatted decimal**
- Finding: `return '$' + val` for values < 1000 passes unrounded decimal (e.g. `'$142.5'`) to LLM prompt
- Fix: `return '$' + Number(val).toFixed(0)` — rounds to whole dollars, consistent with M/K branches

### Items Let Go

- `_extractAllTickers` dedup: no real bug — first-match semantics still hold with duplicates, wasted iterations only
- `$USDollar` edge: regex matches `USD` from `$USDollar` — acceptable behavior, documented regex contract

## Final Test Results

32/32 passing after fixes.
