# Section 07 — Code Review Interview

## Review verdict: PASS with fixes applied

### Issues triaged:

1. **fetchFn duplicated 8 times** → **Let go**. n8n Code nodes are sandboxed — each node needs its own polyfill. Not fixable without changing n8n architecture.

2. **W4-market missing maxConcurrency: 1** → **Auto-fixed**. Added `maxConcurrency: 1` to w4-market.json settings. Same protection as afterhours.

3. **Env var name mismatch (spec vs code)** → **Not an issue**. Verified all code files use `SUPABASE_SERVICE_ROLE_KEY`. The env vars reference file also uses this name. Spec text was slightly different but code is consistent.

4. **hourCycle: 'h23' for Intl.DateTimeFormat** → **Auto-fixed**. Added to market-hours-guard.js to avoid edge case where some JS engines return "24" for midnight with `hour12: false`.

5. **W4-market maxConcurrency test** → **Auto-fixed**. Added test to workflow-config.test.js.

### All fixes applied and verified: 29/29 tests pass.
