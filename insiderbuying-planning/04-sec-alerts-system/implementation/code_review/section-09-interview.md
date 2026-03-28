# Section 09 — Code Review Interview

## Review verdict: PASS with fixes applied

### C1 — Test/code mismatch (Number vs String)
**Auto-fixed.** Updated test to match production reality: OneSignal `addTag()` takes string, server-side filter does numeric comparison. Tests now assert `typeof === 'string'` and `'7'` not `7`.

### I1 — login() before init() race
**Auto-fixed.** Added comment explaining OneSignal's internal deferred queue handles this automatically.

### I2 — Redundant login on TOKEN_REFRESHED
**Auto-fixed.** Added `lastUserId` guard — only calls `login()` when user ID actually changes.

### I3 — No logout on sign-out
**Auto-fixed.** Added `logoutOneSignal()` call on `SIGNED_OUT` event. Prevents stale push subscriptions.

### S4 — force-static bug in subscribe route
**Auto-fixed.** Changed `export const dynamic = "force-static"` to `"force-dynamic"` in `src/app/api/alerts/subscribe/route.ts`. Pre-existing bug — `getUser()` requires dynamic rendering.
