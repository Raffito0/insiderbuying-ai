# Integration Notes — Iteration 2 Review (o3 + Gemini 3)

## What I'm Integrating

### 1. SEC EDGAR query narrowing + User-Agent header (o3 + Gemini 3 — CRITICAL)
`q=*` returns all Form 4s ever filed and triggers pagination. Switch to narrow date-range query with `sort=filingDate:desc`. Also: SEC requires `User-Agent: CompanyName (contact@email.com)` or they progressively block the IP. Both reviewers flagged this. Adding to Section 2.1.

### 2. cluster_id + is_cluster_buy missing from Section 0 migration (Gemini 3 — BUG)
The SQL migration in Section 0 adds many fields but completely omits `cluster_id` and `is_cluster_buy`, which are referenced throughout sections 2.6 and 5.4. Adding them to the migration SQL.

### 3. Duplicate cluster summaries (o3 + Gemini 3 — HIGH)
Every new insider triggers a new cluster summary record. 3 insiders in one run = 2 cluster alerts sent. Fix: defer cluster summary creation to END of run, group by `cluster_id`, emit exactly one summary per cluster per run. Adding to Section 5.4.

### 4. ON CONFLICT for Supabase dedup_key insert (o3 — HIGH)
No `ON CONFLICT` clause means a duplicate insert causes a 409 and aborts the entire Code node. Add `{ onConflict: 'dedup_key', ignoreDuplicates: true }` to the Supabase insert call. Adding to Section 5.2.

### 5. isDST() doesn't exist in JavaScript (Gemini 3 — BUG)
The market-hours guard example uses `isDST(now)` which is not a native JS function — it will throw a ReferenceError. Replace with `Intl.DateTimeFormat` native approach. Fixing in Section 7.

### 6. Dead-letter for permanently broken filings (Gemini 3 — HIGH)
If a filing fails permanently (malformed SEC data, Claude refusal), `last_check_timestamp` stays stuck at that filing's date forever — every run retries it infinitely. Add `retry_count` to Airtable. If `retry_count > 3`, mark `status = 'dead_letter'` and advance the timestamp. Adding to Section 5.3.

### 7. Dedup Set doesn't include current-run filings (Gemini 3 — BUG)
Pre-loading `existingDedupKeys` at run start won't catch two filings for the same insider in the same run. Fix: add each processed filing's `dedup_key` to the Set during the loop. Adding to Section 2.3.

### 8. OneSignal tag numeric comparison (o3 + Gemini 3 — MEDIUM)
String `"10"` < `"6"` lexicographically, breaking score filtering. OneSignal numeric operators require the tag value to be a number, not a string. Clarify in Section 9.

### 9. CAN-SPAM compliance — unsubscribe + postal address (o3 — MEDIUM)
Every Resend email must have an unsubscribe link and physical address or Resend will block the account. Adding to Section 6.2.

### 10. Service role key leak in n8n logs (o3 — MEDIUM)
Admin SDK calls that log errors will leak user emails to n8n execution logs. Add `try/catch` that explicitly does NOT log user data. Noting in Section 6.1.

### 11. CIK→ticker cache daily refresh (o3 — LOW)
Companies change tickers monthly. The cache shouldn't persist indefinitely. Re-download daily. Adding to Section 2.0.

### 12. n8n parallel execution guard (o3 + Gemini 3 — MEDIUM)
Two instances of the same workflow can overlap if a run takes longer than the cron interval. Enable "Wait till previous execution finishes" in n8n workflow settings. Adding to Section 7.

---

## What I'm NOT Integrating

### Rewrite as per-item n8n nodes (Gemini 3 — NOT INTEGRATING)
Gemini recommends splitting the logic across multiple n8n nodes so n8n handles per-item execution natively. This is architecturally valid but would require a fundamentally different workflow structure than what's planned. The existing `auto-produce.js` codebase uses the same single Code node pattern. The 60-second timeout concern is real but addressed separately (via parallel enrichment with p-limit). Not changing the architecture.

### Advisory lock via pg_advisory_lock (o3 — NOT INTEGRATING)
The overlap concern is valid but the simple fix is the n8n "no parallel" setting which is a single checkbox. The SQL advisory lock is over-engineered for this use case.

### Replace blur with server-side dummy text (Gemini 3 — NOT INTEGRATING)
Interesting V2 idea but out of MVP scope. The CSS blur is intentional for FOMO effect per the spec.

### Stooq/Tiingo instead of Yahoo Finance (o3 — NOT INTEGRATING now)
Yahoo Finance risk is documented. At MVP volumes it's acceptable. Noted as V2 item if Yahoo goes down.

### SECURITY DEFINER Postgres view for user emails (o3 — NOT INTEGRATING)
The log-leak concern is valid and addressed by the simpler fix (don't log user data in catch blocks). The full security-definer view is a good V2 hardening step but adds complexity to MVP.

### Retention policy + GDPR (o3 — NOT INTEGRATING now)
Noted as post-launch compliance item.

---

## Summary of Plan Updates (this iteration)

1. Section 0: Add `cluster_id UUID` + `is_cluster_buy BOOLEAN` to migration SQL
2. Section 2.0: Add daily re-download of CIK ticker map
3. Section 2.1: Narrow EDGAR query (date range + count) + mandatory User-Agent header
4. Section 2.3: Add processed keys to dedup Set during loop
5. Section 5.2: Add `ON CONFLICT (dedup_key) DO NOTHING` to Supabase insert
6. Section 5.3: Add dead-letter pattern (`retry_count > 3` → `status='dead_letter'`)
7. Section 5.4: Defer cluster summary to end of run, deduplicate per cluster_id
8. Section 6.1: Note: never log user data in catch blocks
9. Section 6.2: Require unsubscribe link + postal address in all emails
10. Section 7: Fix market-hours guard — use `Intl.DateTimeFormat` instead of `isDST()`
11. Section 7: Add n8n "no parallel executions" setting
12. Section 9: OneSignal `alert_score_min` tag must be number, not string
