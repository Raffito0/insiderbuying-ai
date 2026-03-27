# Code Review Interview: section-03-score-alert.js

## Decision Log

All review findings were auto-fixed (no tradeoffs requiring user input).

### Auto-fix: Supabase ilike wildcard `*` → `%` (Critical)
- **Finding**: Pattern `*john*smith*` used `*` which is not a SQL wildcard. PostgREST ilike uses `%`.
- **Fix**: Changed to `%john%smith%`. All track record lookups were silently returning 0 rows.
- **Test added**: Decodes URL and asserts it contains `%john%smith%`.

### Auto-fix: Per-filing Yahoo Finance exception isolation (Critical)
- **Finding**: Network exception inside the `for` loop propagated out, discarding all remaining filings' price data.
- **Fix**: Wrapped `fetchFn` call in `fetch30DayReturn` with its own try/catch returning `null`. Removed outer try/catch around the loop.
- **Test added**: Two-row history where first Yahoo call throws — verifies second row still produces valid return data.

### Auto-fix: n8n entrypoint documentation (Critical)
- **Finding**: Commented-out block was not clearly labeled as deployment instructions.
- **Fix**: Replaced `/* ... */` block with clearly commented deployment instructions (// lines) explaining the copy-paste steps for n8n Code node deployment.

### Auto-fix: Return `{ ...HAIKU_DEFAULT }` spread copy (Important)
- **Finding**: `callHaiku` returned direct reference to shared `HAIKU_DEFAULT` object, enabling accidental mutation.
- **Fix**: All 4 return paths now return `{ ...HAIKU_DEFAULT }` spread copy.

### Auto-fix: Document hit_rate denominator (Important)
- **Finding**: `hit_rate` uses `validReturns.length` (trades with Yahoo data) as denominator, not `rows.length` (total trades). Could mislead Haiku.
- **Fix**: Added comment documenting the denominator choice and noting that `past_buy_count` provides the full picture in the prompt.

## Tests Added (41 total, up from 39)
- `Supabase URL uses % wildcards for ilike (not * globs)`
- `one Yahoo failure does not abort remaining filings in loop`
