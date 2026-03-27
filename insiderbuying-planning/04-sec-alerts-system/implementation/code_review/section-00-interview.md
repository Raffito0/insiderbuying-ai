# Code Review Interview — Section 00: Schema Migration

## Review Summary

Reviewer found 2 critical issues and 2 important issues. All auto-fixed.

---

## Auto-fixes Applied

### Fix 1 (Critical): ADD CONSTRAINT idempotency
**Issue:** `ADD CONSTRAINT insider_alerts_transaction_type_check` had no guard — a second migration run would error with "constraint already exists".

**Fix:** Wrapped in `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint ...) THEN ALTER TABLE ... ADD CONSTRAINT END IF END $$`.

### Fix 2 (Critical): status column CHECK constraint missing
**Issue:** `status TEXT DEFAULT 'new'` had no CHECK constraint — delivery states would be silently accepted with any value.

**Fix:** Added `insider_alerts_status_check CHECK (status IN ('new', 'processed', 'delivered', 'delivery_failed', 'dead_letter'))` also wrapped in an idempotency DO block.

### Fix 3 (Important): Missing index on status
**Issue:** Section-06 `deliver-alert.js` queries `WHERE status = 'new'` — without an index this becomes a sequential scan as the table grows.

**Fix:** Added `CREATE INDEX IF NOT EXISTS idx_insider_alerts_status ON public.insider_alerts(status, created_at DESC)`.

### Fix 4 (Important): Comment on constraint name assumption
**Fix:** Added comment documenting that PostgreSQL auto-generates the constraint name `insider_alerts_transaction_type_check`.

### Fix 5 (Test): Improved test coverage
- Each column now tested individually with regex for `ADD COLUMN IF NOT EXISTS <col>` (not just string presence)
- Added test for status CHECK constraint and its DO block guard
- Added test for status index creation
- Added documentation comment for live-DB integration tests that require `supabase start`
- Removed the redundant `migration file exists` test (beforeAll throws before it could fail independently)

---

## Items Not Changed

- Constraint name hardcoding: acceptable — PostgreSQL auto-names exactly as written. Comment added.
- `DROP CONSTRAINT IF EXISTS` before re-add: correct pattern for CHECK constraints (no ADD CONSTRAINT IF NOT EXISTS in PostgreSQL).
