# Section 01 — Airtable Base Setup

## Overview

Create the "InsiderBuying.ai" Airtable base with two tables: `Insider_Alerts` and `Monitor_State`. This base serves as the human-readable audit trail, dedup source of truth, and delivery tracking interface for the W4/W5 workflows.

**Depends on**: section-00-schema-migration (must be applied before seeding Monitor_State)
**Blocks**: section-02-sec-monitor, section-05-write-persistence, section-06-deliver-alert

---

## Tests (write these before creating the base)

From `claude-plan-tdd.md` Section 1:

```
# Test: Insider_Alerts table accepts a record with all required fields populated
# Test: Insider_Alerts transaction_type single-select rejects values outside buy/sell/cluster
# Test: Monitor_State table has exactly two records (market / afterhours) after seeding
# Test: Monitor_State last_check_timestamp is readable and parseable as ISO datetime
# Test: dedup_key field is unique — Airtable formula filterByFormula({dedup_key}='X') returns at most 1 record
```

Test file location: `ryan_cole/insiderbuying-site/tests/insiderbuying/`

---

## Table 1: Insider_Alerts

One record per Form 4 filing processed by W4. Create these fields in order:

### Filing Metadata

| Field Name | Type | Notes |
|---|---|---|
| `dedup_key` | Single line text | Composite key: `{ticker}_{insider_name}_{transaction_date}_{shares}`. This is the idempotency key — it must be unique. Create a manual unique check via `filterByFormula({dedup_key}='X')` returning at most 1 record (Airtable does not enforce DB-level unique constraints). |
| `ticker` | Single line text | e.g. `AAPL` |
| `company_name` | Single line text | e.g. `Apple Inc.` |
| `insider_name` | Single line text | Full name from Financial Datasets |
| `insider_title` | Single line text | Raw title string from API |
| `insider_category` | Single line text | Classified value: one of `C-Suite`, `Board`, `VP`, `Officer`, `10% Owner` |

### Trade Details

| Field Name | Type | Notes |
|---|---|---|
| `transaction_type` | Single select | Options: `buy`, `sell`, `cluster`. The processed type (not the raw `P - Purchase` string from the API). |
| `shares` | Number | Integer — number of shares transacted |
| `price_per_share` | Number | Float — price per share in USD |
| `total_value` | Number | Float — `shares × price_per_share` |
| `transaction_date` | Date | Date the insider executed the trade |
| `filing_date` | Date | Date the Form 4 was filed with the SEC |

### AI Scoring

| Field Name | Type | Notes |
|---|---|---|
| `significance_score` | Number | Integer 1–10. Haiku output. Higher = more significant. |
| `score_reasoning` | Long text | Short reasoning string from Haiku explaining the score. |
| `ai_analysis` | Long text | Full 2–3 paragraph Sonnet analysis referencing actual numbers. Stored unredacted — the frontend applies blur for free users. May be null if score < 4 or Sonnet fails. |

### Cluster Fields

| Field Name | Type | Notes |
|---|---|---|
| `cluster_id` | Single line text | UUID shared by all filings in the same cluster buy event. Null for non-cluster trades. |
| `is_cluster_buy` | Checkbox | True if this filing is part of a multi-insider cluster buy within 7 days. |
| `cluster_size` | Number | Integer — how many distinct insiders are in this cluster. |

### Debug & Cross-Reference

| Field Name | Type | Notes |
|---|---|---|
| `raw_filing_data` | Long text | Full JSON string of the Financial Datasets API response. Used for debugging enrichment issues. |
| `supabase_id` | Single line text | UUID from the Supabase insert. Used to cross-reference between Airtable and the web app's database. |

### Delivery Tracking

| Field Name | Type | Notes |
|---|---|---|
| `status` | Single select | Options: `new`, `processing`, `processed`, `delivered`, `delivery_failed`, `failed`. Set to `processed` after W4 writes the record. Set to `delivered` or `delivery_failed` by W5. |
| `emails_sent` | Number | Count of emails successfully sent by Resend for this alert. |
| `push_sent` | Number | Count of push notifications sent by OneSignal for this alert. |
| `delivered_at` | Date/time | Timestamp when W5 completed delivery. |
| `error_log` | Long text | Error details if delivery failed. Append-only — never replace. |

---

## Table 2: Monitor_State

Tracks the last successful check timestamp per workflow variant. W4 reads `last_check_timestamp` at startup to know where to begin scanning for new filings, and updates it after a successful run.

### Fields

| Field Name | Type | Notes |
|---|---|---|
| `name` | Single line text | The lookup key. Exactly two allowed values: `market` and `afterhours`. |
| `last_check_timestamp` | Date/time | ISO 8601 datetime. W4 uses this as the lower bound for `file_date` when querying SEC EDGAR. Must be stored with time (not date-only). |
| `last_run_status` | Single line text | `ok` or `error`. Set at end of each W4 run. |
| `last_run_filings_found` | Number | How many new Form 4 filings were found in the last run. |
| `last_run_error` | Long text | Error details if `last_run_status` = `error`. |

### Seed Records

After creating the table, manually insert exactly **two** records:

**Record 1:**
- `name`: `market`
- `last_check_timestamp`: set to 24 hours ago (e.g. yesterday at current time in ISO format)
- `last_run_status`: (leave blank)
- `last_run_filings_found`: (leave blank)
- `last_run_error`: (leave blank)

**Record 2:**
- `name`: `afterhours`
- `last_check_timestamp`: set to 24 hours ago (same as above)
- `last_run_status`: (leave blank)
- `last_run_filings_found`: (leave blank)
- `last_run_error`: (leave blank)

Setting `last_check_timestamp` to 24 hours ago on both records ensures W4's first run picks up any filings from the past day without scanning the full SEC history.

---

## How This Base Is Used by Later Sections

- **sec-monitor.js (section-02)**: reads `Monitor_State` to get `last_check_timestamp`, reads `Insider_Alerts.dedup_key` values (7-day window) into an in-memory Set for O(1) dedup checks, writes new filing records to `Insider_Alerts`.
- **write-persistence (section-05)**: updates `Insider_Alerts` with `supabase_id` after Supabase insert, updates `Monitor_State.last_check_timestamp` after each run.
- **deliver-alert.js (section-06)**: updates `Insider_Alerts` with `status`, `emails_sent`, `push_sent`, `delivered_at`, `error_log` after W5 delivery.

---

## Verification Checklist

- [ ] Base named exactly "InsiderBuying.ai"
- [ ] `Insider_Alerts` table exists with all fields above
- [ ] `transaction_type` single-select has exactly three options: `buy`, `sell`, `cluster`
- [ ] `status` single-select has exactly six options: `new`, `processing`, `processed`, `delivered`, `delivery_failed`, `failed`
- [ ] `Monitor_State` table exists with all five fields
- [ ] `Monitor_State` contains exactly two records: `market` and `afterhours`
- [ ] Both `last_check_timestamp` values are parseable as ISO datetimes (not date-only)
- [ ] Insert a test record in `Insider_Alerts` with all fields — confirm it saves without error
- [ ] Run `filterByFormula({dedup_key}='TEST_KEY')` — confirm at most 1 result (Airtable unique check)
