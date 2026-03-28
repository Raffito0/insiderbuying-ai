# Section 00: Supabase Schema Migration

## Overview

This section adds the missing columns and constraints to the existing `insider_alerts` Supabase table. It is the **blocker for all other sections** — nothing else can run until this migration is applied.

The existing table was defined in `supabase/migrations/20260326000000_insiderbuying_schema.sql`. That migration is incomplete: several columns written by W4 and W5 are absent, the `transaction_type` CHECK constraint does not include `'cluster'`, and there is no UPDATE policy for the service role (required for cluster detection to patch existing rows).

---

## Dependencies

None. This is the first section.

## Blocks

- section-01-airtable-setup
- section-02-sec-monitor
- section-05-write-persistence
- section-06-deliver-alert
- section-08-frontend-blur

---

## Tests (write and run BEFORE applying the migration)

Test file location: `ryan_cole/insiderbuying-site/tests/insiderbuying/`

Testing approach for migrations: run against a local Supabase instance (`supabase start`) and verify schema diffs with `supabase db diff`.

```
# Test: migration runs cleanly on a fresh schema (no errors, no unintended drops)
# Test: after migration, insider_alerts has all new columns:
#       transaction_date, dedup_key, insider_category, score_reasoning,
#       cluster_id, is_cluster_buy, cluster_size, status, retry_count,
#       emails_sent, push_sent, delivered_at, error_log
# Test: transaction_type CHECK constraint accepts 'buy', 'sell', 'cluster'
# Test: transaction_type CHECK constraint rejects 'grant', 'other', null
# Test: dedup_key unique index — inserting two rows with same dedup_key raises constraint error
# Test: service_role UPDATE policy allows updating existing insider_alerts rows
# Test: anon role cannot UPDATE insider_alerts rows (RLS blocks it)
# Test: migration is idempotent — running it twice causes no errors (IF NOT EXISTS guards)
```

---

## Implementation

### File to create

`supabase/migrations/20260327000001_insider_alerts_v2.sql`

### Migration SQL

```sql
-- Add missing columns to insider_alerts
ALTER TABLE public.insider_alerts
  ADD COLUMN IF NOT EXISTS transaction_date DATE,
  ADD COLUMN IF NOT EXISTS dedup_key TEXT,
  ADD COLUMN IF NOT EXISTS insider_category TEXT,
  ADD COLUMN IF NOT EXISTS score_reasoning TEXT,
  ADD COLUMN IF NOT EXISTS cluster_id UUID,
  ADD COLUMN IF NOT EXISTS is_cluster_buy BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS cluster_size INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS emails_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS push_sent INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_log TEXT;

-- Unique index on dedup_key for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_insider_alerts_dedup
  ON public.insider_alerts(dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Fix transaction_type CHECK constraint to include 'cluster'
ALTER TABLE public.insider_alerts
  DROP CONSTRAINT IF EXISTS insider_alerts_transaction_type_check;
ALTER TABLE public.insider_alerts
  ADD CONSTRAINT insider_alerts_transaction_type_check
  CHECK (transaction_type IN ('buy', 'sell', 'cluster'));

-- Add service_role UPDATE policy (needed for cluster detection)
CREATE POLICY "service_role can update insider_alerts"
  ON public.insider_alerts
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);
```

---

## Column Reference

Each column has a specific consumer — do not rename or change types without updating the consuming section:

| Column | Type | Default | Written by | Read by |
|---|---|---|---|---|
| `transaction_date` | DATE | null | sec-monitor.js (section-02) | score-alert.js (section-03) |
| `dedup_key` | TEXT | null | sec-monitor.js (section-02) | dedup check in section-02; Supabase upsert in section-05 |
| `insider_category` | TEXT | null | sec-monitor.js (section-02) | score-alert.js (section-03) |
| `score_reasoning` | TEXT | null | score-alert.js (section-03) | Airtable record in section-05 |
| `cluster_id` | UUID | null | sec-monitor.js (section-02) | section-05 cluster summary logic |
| `is_cluster_buy` | BOOLEAN | false | sec-monitor.js (section-02) | section-05 cluster summary logic |
| `cluster_size` | INTEGER | 0 | sec-monitor.js (section-02) | section-05 cluster summary logic |
| `status` | TEXT | 'new' | deliver-alert.js (section-06) | section-06 delivery tracking |
| `retry_count` | INTEGER | 0 | sec-monitor.js (section-02) | section-05 dead-letter logic |
| `emails_sent` | INTEGER | 0 | deliver-alert.js (section-06) | section-06 delivery tracking |
| `push_sent` | INTEGER | 0 | deliver-alert.js (section-06) | section-06 delivery tracking |
| `delivered_at` | TIMESTAMPTZ | null | deliver-alert.js (section-06) | section-06 delivery tracking |
| `error_log` | TEXT | null | deliver-alert.js (section-06) | section-06 delivery tracking |

---

## Why the UPDATE policy is required

The cluster detection logic in `sec-monitor.js` (section-02) needs to reach back into Supabase and update previously inserted rows: when a new buy is filed, the code checks if other insiders have also bought the same ticker in the last 7 days. If they have, all matching rows get a shared `cluster_id` written via UPDATE, not INSERT. This UPDATE runs using the `service_role` key (not the `anon` key). Without the policy created in this migration, the UPDATE silently succeeds but affects 0 rows (RLS blocks it), and cluster detection is broken end-to-end.

The `anon` role must never be able to UPDATE `insider_alerts` — this is preserved by only granting the policy to `service_role`.

---

## Apply Instructions

```bash
# Start local Supabase
supabase start

# Apply the migration
supabase db push

# Verify the schema diff matches expectations
supabase db diff

# Run against production only after local tests pass
supabase db push --db-url $PRODUCTION_DB_URL
```

---

## Checklist

- [ ] Create `supabase/migrations/20260327000001_insider_alerts_v2.sql` with the SQL above
- [ ] Run migration locally (`supabase db push`)
- [ ] Verify all 13 new columns exist in `insider_alerts`
- [ ] Verify `transaction_type` CHECK accepts `'cluster'` and rejects `'grant'`
- [ ] Verify `dedup_key` unique index rejects duplicate values
- [ ] Verify `service_role` can UPDATE rows, `anon` cannot
- [ ] Verify migration is idempotent (run a second time, no errors)
- [ ] Apply to production
