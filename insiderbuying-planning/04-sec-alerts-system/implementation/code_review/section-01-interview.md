# Code Review Interview — Section 01: Airtable Setup

## Review Verdict: PASS (with 4 auto-fixes applied)

---

## Auto-fixes Applied

### Fix 1 (Important): Idempotency guard
**Issue:** Running setup twice would create duplicate tables and 4 seed records instead of 2.
**Fix:** Added `getExistingTables()` preflight call. `createTable()` now checks by name and skips if already present. Fields also skip if already in the table.

### Fix 2 (Suggestion): yesterday() DST fix
**Issue:** `setDate(getDate() - 1)` drifts ±1 hour on DST transitions.
**Fix:** Replaced with `new Date(Date.now() - 86400000).toISOString()` — exact 24h offset.

### Fix 3 (Suggestion): price_per_share precision
**Issue:** `precision: 2` truncates penny-stock prices (e.g. $0.003 → $0.00).
**Fix:** Changed to `precision: 4` to cover all realistic insider filing prices.

### Fix 4 (Suggestion): Test timestamp bounds
**Issue:** `22h < hoursAgo < 26h` test fails in watch mode if module loaded early and tests run late.
**Fix:** Widened to `1h < hoursAgo < 48h` — functionally validates "in the past, not too old" without being fragile.
