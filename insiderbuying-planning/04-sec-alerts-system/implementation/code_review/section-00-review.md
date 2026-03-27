# Code Review — Section 00: Schema Migration

**Reviewer:** Claude Sonnet 4.6
**Date:** 2026-03-27
**Files reviewed:**
- `insiderbuying-site/supabase/migrations/20260327000001_insider_alerts_v2.sql`
- `insiderbuying-site/tests/insiderbuying/section-00-schema-migration.test.js`
- `insiderbuying-site/supabase/migrations/20260326000000_insiderbuying_schema.sql` (v1, for context)
- `insiderbuying-planning/04-sec-alerts-system/sections/section-00-schema-migration.md` (plan)

---

## Summary

The migration is correct in its core logic. It correctly avoids re-adding `cluster_id` and `is_cluster_buy` (present in v1), uses `IF NOT EXISTS` guards throughout, and the DO block wrapping the policy creation is the right approach. There is one critical deviation from the plan: the plan spec includes `cluster_id` and `is_cluster_buy` in its SQL block (suggesting they may not exist yet), but the implementation correctly omits them based on the prose description that they already exist in v1. This is a plan inconsistency, not a code bug.

Two issues require fixes before this migration is safe for production. Several test gaps need addressing before the test suite can be considered complete.

---

## Plan Alignment

The section plan SQL block (lines 62-70 of `section-00-schema-migration.md`) shows `cluster_id` and `is_cluster_buy` inside the `ADD COLUMN IF NOT EXISTS` block. However, the plan's prose (line 7) explicitly states they already exist in v1, and the v1 migration (`20260326000000_insiderbuying_schema.sql`, lines 63-64) confirms they are defined there.

The implementation correctly omits those two columns from v2. This is the right decision. The plan SQL block is internally inconsistent with its own prose — it should be updated to remove those two columns from the example SQL. The implementation is right; the plan needs a correction.

All 11 columns that v2 should add are present in the migration. The column reference table in the plan lists 13 columns (including `cluster_id` and `is_cluster_buy` from v1), and the implementation adds exactly the 11 that are missing. This is correct.

---

## Issues

### Critical

**1. `status` column has no CHECK constraint**

The `status` column is added as `TEXT DEFAULT 'new'` with no constraint on allowed values. The plan's column reference table shows `deliver-alert.js` writes to this column (section-06). Without a CHECK constraint, invalid values like `'delivered'`, `'done'`, `'pending'` can be inserted silently, and section-06's delivery logic will have no database-level protection against inconsistent state.

The plan does not specify allowed values for `status` explicitly, but `'new'` is the stated default and delivery logic implies at minimum `'new'`, `'sent'`, `'failed'`, and `'dead'` are reasonable states. The migration should define a CHECK constraint when the full set of valid states is known. At minimum, a comment explaining the intentional omission should be added if the constraint is being deferred to a later section.

This is a data integrity issue that cannot be patched forward without a new ALTER TABLE, which will require another migration.

**2. `insider_category` column has no CHECK constraint**

Same issue as `status`. The column reference table shows `sec-monitor.js` (section-02) writes this value. Without a constraint, any string is accepted. If section-02 ever writes a typo (`'director'` vs `'Director'`) the front-end filter logic will silently miss it. This is lower severity than `status` because it is display/filter data rather than state-machine data, but it should still be constrained once the valid set of SEC insider categories is known (typically: `'Director'`, `'Officer'`, `'10% Owner'`, `'Other'`).

---

### Important

**3. The v1 CHECK constraint name assumption is fragile**

The migration drops `insider_alerts_transaction_type_check` by exact name. PostgreSQL generates this name automatically when a CHECK constraint is created without an explicit name (using the pattern `{table}_{column}_check`). The v1 migration at line 56 does not assign a name to the constraint:

```sql
transaction_type TEXT CHECK (transaction_type IN ('buy', 'sell')),
```

PostgreSQL's auto-generated name for this is indeed `insider_alerts_transaction_type_check`, so the assumption is correct for a freshly-created table. However, if the v1 migration was ever applied, altered, or recreated manually under a different name, the `DROP CONSTRAINT IF EXISTS` will silently no-op, and then the `ADD CONSTRAINT` will fail because the old constraint still exists.

This is acceptable given the controlled migration environment (`supabase db push`), but worth documenting with a comment in the SQL file so the next developer understands why the constraint name is hardcoded rather than queried.

**4. No index on `status` column**

Section-06 (`deliver-alert.js`) will query `insider_alerts WHERE status = 'new'` to find undelivered alerts. The existing indexes in v1 cover `ticker`, `created_at DESC`, `significance_score DESC`, and `cluster_id`. There is no index on `status`. At low row counts this is fine, but as the table grows, a status-filtered scan will do a sequential read. An index on `(status, created_at DESC)` would make the delivery queue query efficient.

This is not a blocker for section-00 but should be added before section-06 is implemented.

---

### Suggestions

**5. `dedup_key` partial index comment could be more explicit**

The comment says "fast lookups" but the real purpose is both uniqueness enforcement and performance for the dedup check in section-02. The comment in the plan says "Unique index on dedup_key for fast lookups" while the implementation's comment says "Unique index on dedup_key (partial — only for non-null keys)". The implementation comment is better. No change needed, this is informational only.

**6. `DO $$` block trailing semicolon**

The `DO $$ ... END $$;` block at line 83 of the migration file uses `$$;` without a preceding newline separator from `END`. This is valid SQL but looks slightly unusual. Some PostgreSQL linters and migration tools prefer `END; $$ LANGUAGE plpgsql` or `END $$;` with explicit language. The current form (`END\n$$;`) is correct and works in PostgreSQL — no change required.

---

## SQL Correctness

All ALTER TABLE statements are syntactically correct. PostgreSQL supports multiple `ADD COLUMN IF NOT EXISTS` clauses in a single `ALTER TABLE` statement (added in PostgreSQL 9.6), and Supabase uses PostgreSQL 15+, so this is safe.

The partial unique index using `WHERE dedup_key IS NOT NULL` is correct PostgreSQL syntax and achieves the intended behavior: multiple rows with `NULL` dedup_key are allowed (for rows inserted before dedup tracking was enabled), while non-null values are unique.

The DROP CONSTRAINT / ADD CONSTRAINT pattern for mutating a CHECK constraint is correct. `DROP CONSTRAINT IF EXISTS` will silently succeed even if the constraint does not exist, making this idempotent in one direction. The `ADD CONSTRAINT` after it is not guarded, which means a second full run of this migration will fail at that line if the constraint was successfully added on the first run.

**This is the one idempotency gap in the migration.** The `ADD COLUMN IF NOT EXISTS` lines and the `CREATE UNIQUE INDEX IF NOT EXISTS` line and the `DO $$` policy guard are all idempotent. But the final `ADD CONSTRAINT insider_alerts_transaction_type_check` has no `IF NOT EXISTS` equivalent in PostgreSQL (it does not exist as a syntax option for constraints). To make this truly idempotent, the ADD CONSTRAINT also needs to be wrapped in a DO block with a check against `pg_constraint`:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'insider_alerts_transaction_type_check'
      AND conrelid = 'public.insider_alerts'::regclass
  ) THEN
    ALTER TABLE public.insider_alerts
      ADD CONSTRAINT insider_alerts_transaction_type_check
      CHECK (transaction_type IN ('buy', 'sell', 'cluster'));
  END IF;
END
$$;
```

Without this, running the migration a second time (e.g., during a rollback-and-retry scenario) will error on the ADD CONSTRAINT line. The plan's checklist item "Verify migration is idempotent (run a second time, no errors)" will fail as-is.

---

## Idempotency Analysis

| Statement | Idempotent | Mechanism |
|---|---|---|
| `ADD COLUMN IF NOT EXISTS` (×11) | Yes | `IF NOT EXISTS` clause |
| `CREATE UNIQUE INDEX IF NOT EXISTS` | Yes | `IF NOT EXISTS` clause |
| `DROP CONSTRAINT IF EXISTS` | Yes | `IF EXISTS` clause |
| `ADD CONSTRAINT` (new CHECK) | **No** | No guard — will error on second run |
| `CREATE POLICY` (inside DO block) | Yes | `pg_policies` check in DO block |

One of five idempotency-critical statements is not guarded. This needs to be fixed before the migration can be considered safe for the idempotency checklist item.

---

## RLS Policy Correctness

The service_role UPDATE policy is correctly structured:

- `FOR UPDATE` — correct operation type
- `TO service_role` — correctly scoped, does not grant to `anon` or `authenticated`
- `USING (true)` — allows updating any row (correct for a background service job)
- `WITH CHECK (true)` — allows any post-update state (correct, as validation is in application code)

The v1 migration already has SELECT for authenticated users and INSERT for service_role. The v2 addition of UPDATE for service_role completes the minimal set needed without opening any additional attack surface. The `anon` role still cannot SELECT, INSERT, or UPDATE `insider_alerts`, which is correct.

One subtle note: the existing SELECT policy at v1 line 72 is granted `TO authenticated` with no `USING` clause restriction — any authenticated user can read all alerts regardless of their subscription tier. The plan acknowledges this: "ai_analysis filtered in API by tier". This is correct by design and not a concern for this section.

---

## Test Coverage

### What is well covered

- All 11 new columns are verified by name in the `requiredColumns` array
- `IF NOT EXISTS` guard on columns is verified
- Partial unique index presence and `WHERE` clause are verified
- DROP + ADD constraint pattern is verified
- CHECK constraint includes all three values (`'buy'`, `'sell'`, `'cluster'`)
- The regex test for the CHECK constraint (line 63) correctly extracts the full `CHECK (...)` expression
- Service_role UPDATE policy presence is verified
- DO block guard is verified
- v1 columns (`cluster_id`, `is_cluster_buy`) are correctly verified as absent from the ADD COLUMN block

### Missing test coverage

**T1. No test that the ADD CONSTRAINT is not re-added idempotently**

The test at line 76 verifies the DO block guards the policy, and the test at line 131 verifies columns use IF NOT EXISTS. But there is no test verifying that the ADD CONSTRAINT line is inside a DO block or otherwise guarded. As described above, this is an actual bug in the SQL — but even if the SQL were fixed, the test suite has no coverage of this idempotency path.

**T2. No negative test for rejected transaction_type values**

The plan explicitly calls for: "Test: transaction_type CHECK constraint rejects 'grant', 'other', null". The test suite verifies the CHECK includes the right values by string-matching the SQL, but does not test that invalid values would be rejected. This is inherent to the file-content testing approach (no live DB), but the plan test list specifically calls for this. A comment in the test file should acknowledge that this test requires a live Supabase instance and is deferred to integration testing.

**T3. No test for the dedup_key uniqueness enforcement**

The plan calls for: "Test: dedup_key unique index — inserting two rows with same dedup_key raises constraint error". This also requires a live DB. Same comment as T2 applies.

**T4. No test verifying the `status` column has a CHECK constraint**

Given that `status` drives state-machine logic in section-06, the test suite should verify that the SQL contains a CHECK constraint for `status`. Currently it does not (and the SQL does not have one — see Critical issue 1).

**T5. The `IF NOT EXISTS` idempotency test is too broad**

At line 131, the test checks that `sql.toContain('ADD COLUMN IF NOT EXISTS')`. This passes if even one column uses the guard. It does not verify that ALL 11 columns use the guard. A stronger version would check `(sql.match(/ADD COLUMN IF NOT EXISTS/g) || []).length` equals 11.

**T6. `migration file exists` test will throw before it asserts**

The `beforeAll` at line 12 calls `fs.readFileSync(MIGRATION_FILE, 'utf8')` synchronously. If the file does not exist, `readFileSync` throws, the entire describe block fails with an unhandled error, and the individual `migration file exists` test never runs. The `migration file exists` test is effectively dead — it would never be the reported failure. The `beforeAll` should be wrapped in a try/catch, or the existence check should come before the readFileSync.

---

## Verdict

**The migration should not be applied to production as-is.** Two changes are required:

1. The `ADD CONSTRAINT` for `transaction_type` must be wrapped in a DO block to achieve idempotency (Critical for the checklist item, and will cause a runtime error on second application).

2. A CHECK constraint on `status` should be added once valid values are confirmed, or a tracking comment added explaining the deferral (Critical for data integrity in section-06).

The test suite is adequate for CI validation of the file contents but has six gaps relative to the plan's stated test requirements, two of which (T1 and T5) cover real bugs in the SQL.

**What is done well:** the overall structure is clean, the v1-awareness (skipping already-present columns) is correct, the partial unique index is well-designed, and the DO block idempotency guard for the policy is a good pattern that should be extended to the ADD CONSTRAINT as well.
