# Opus Review

**Model:** claude-opus-4.6
**Generated:** 2026-03-27

---

# Implementation Plan Review: 04 SEC Alerts System

## 1. Critical Schema Mismatch Between Plan and Database

**Severity: Blocker**

The existing Supabase migration at `ryan_cole/insiderbuying-site/supabase/migrations/20260326000000_insiderbuying_schema.sql` defines the `insider_alerts` table, but it is **missing many columns the plan requires**. The plan (Sections 2-5) assumes the following fields exist in Supabase, but the migration does not include them:

- `dedup_key` -- not in Supabase schema
- `insider_category` -- not in Supabase schema
- `score_reasoning` -- not in Supabase schema
- `cluster_size` -- not in Supabase schema
- `transaction_date` -- not in Supabase schema (only `filing_date` exists)
- `status` -- not in Supabase schema
- `emails_sent`, `push_sent`, `delivered_at`, `error_log` -- not in Supabase schema

The `transaction_type` CHECK constraint is `('buy', 'sell')` but the plan creates cluster records with `transaction_type = 'cluster'`. This INSERT will fail at the database level.

## 2. SEC EDGAR RSS Feed: Unvalidated Critical Assumption

**Severity: High**

- The plan should confirm which EDGAR endpoint actually works and returns structured Atom XML
- CIK-to-ticker mapping is hand-waved. This is a non-trivial problem
- The EDGAR feed returns only the last 40 filings. If the system goes down, filings could be missed

## 3. Race Condition in Cluster Detection

**Severity: Medium-High**

If two filings for the same ticker arrive in the same RSS poll, and Supabase writes happen at the end (Section 5), the second filing cannot see the first during cluster detection.

## 4. Yahoo Finance API Fragility

**Severity: Medium-High**

- Not an official API, has been intermittently blocked/changed
- Rate limits undocumented
- Should specify a fallback data source or caching strategy

## 5. Dual-Workflow Overlap During Market Hours

**Severity: Medium**

Both W4-market and W4-afterhours fire simultaneously every 60 minutes. The dedup check is not atomic -- both workflows can pass the dedup gate for the same filing simultaneously.

## 6. Resend Free Tier Limits vs. Alert Volume

**Severity: Medium**

50 users × 10 alerts/day = 500 emails/day, exhausting the 100/day free tier immediately.

## 7. Missing Supabase `service_role` UPDATE Policy

**Severity: Medium**

Section 2.5 (cluster detection) requires updating existing Supabase records. No UPDATE policy exists for `service_role` in the migration.

## 8. OneSignal Login Not Specified

**Severity: Medium**

`OneSignal.login(supabase_user_id)` needs to be called to link push subscriber to Supabase user. The plan says to add this but doesn't specify where in the auth flow.

## 9. Watched Tickers Not in Push Notifications

**Severity: Medium**

Email correctly handles `ticker = ANY(watched_tickers)`, but push only filters by `alert_score_min`. Users with watched tickers won't get push for low-score filings of those tickers.

## 10. Alerts Page Blur: Incomplete Spec

**Severity: Low-Medium**

The conditional CTA overlay, "Full Analysis" link behavior, and auth-first pattern need to be specified.

## 11. Financial Datasets Rate Limits

**Severity: Medium**

40 concurrent API calls without deliberate rate limiting could cause 429 errors.

## 12. n8n Code Node Timeout Risk

**Severity: Low-Medium**

Single node with 40+ API calls may hit the 60-second n8n Code node timeout.

## 13. Partial Run: Timestamp Update

**Severity: Medium**

If some filings fail, updating `last_check_timestamp` to "now" means failed filings are never retried.

## 14. Airtable Dedup Per-Filing Calls

**Severity: Low-Medium**

Should pre-load existing dedup keys into a Set at run start (200-500ms per Airtable call × 40 filings = 8-20s).

## 15. Smaller Issues

- `xml2js` is a third-party package -- may not be available in n8n sandbox
- Missing `P - Purchase` filter in plan (only process buys)
- `auth.users` table access pattern via service role needs clarification
- Model ID date suffixes may be outdated -- use aliases
