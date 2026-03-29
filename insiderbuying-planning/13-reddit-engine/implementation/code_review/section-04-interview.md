# Section 04 — Code Review Interview

## Auto-fixes (no user input needed)

### Fix A — `shouldPostDailyThread`: EST weekday (Critical)
`getDay()` returns UTC weekday. On n8n VPS (UTC), Sunday 8 PM EST = Monday UTC → posts on a Sunday.
Fix: derive weekday from `getESTDateString()` using `Date.UTC` + `getUTCDay()`.

### Fix B — `postDailyThread`: throw → graceful return (Critical)
Throwing on Reddit API failure propagates as an n8n execution error. All other skip conditions are graceful.
Fix: convert to `console.warn` + early return.

### Fix C — `mockSkipDays` dead reference (Suggestion)
`mod._setNow._currentNow` does not exist. Remove the ternary; Saturday/Sunday tests return early before NocoDB anyway.

## Let go

- **getDailyThreadTarget advances on lookup** (Important-4): The spec's DoD explicitly shows `setState` called inside `getDailyThreadTarget`. Keeping spec behavior.
- **shouldSkipToday no week validation** (Important-3): Intentional; eliminates timing-sensitive test failures. Week validation would require exporting `_now` to tests.
- **ValueInvesting regex gap** (Suggestion-8): Out of scope for this section.
- **getRedditToken called twice** (Suggestion-9): Cached NocoDB read; negligible cost.
