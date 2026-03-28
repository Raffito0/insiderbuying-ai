<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-00-schema-migration
section-01-airtable-setup
section-02-sec-monitor
section-03-score-alert
section-04-analyze-alert
section-05-write-persistence
section-06-deliver-alert
section-07-n8n-workflow-config
section-08-frontend-blur
section-09-frontend-onesignal
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-00-schema-migration | — | 01, 02, 05, 06 | No |
| section-01-airtable-setup | 00 | 02, 05, 06 | Yes |
| section-02-sec-monitor | 00, 01 | 03 | No |
| section-03-score-alert | 02 | 04 | No |
| section-04-analyze-alert | 03 | 05 | No |
| section-05-write-persistence | 00, 01, 04 | 06, 07 | No |
| section-06-deliver-alert | 00, 01, 05 | 07 | No |
| section-07-n8n-workflow-config | 05, 06 | — | No |
| section-08-frontend-blur | 00 | — | Yes |
| section-09-frontend-onesignal | — | — | Yes |

## Execution Order

1. **section-00-schema-migration** — blocker for everything else
2. **section-01-airtable-setup** — after 00
3. **section-02-sec-monitor** — after 01
4. **section-03-score-alert** — after 02
5. **section-04-analyze-alert** — after 03
6. **section-05-write-persistence** — after 04
7. **section-06-deliver-alert** — after 05
8. **section-07-n8n-workflow-config** — after 05 + 06 (wires everything together)
9. **section-08-frontend-blur**, **section-09-frontend-onesignal** — parallel, independent of backend sections, can start after 00

## Section Summaries

### section-00-schema-migration
SQL migration file adding missing columns (`cluster_id`, `is_cluster_buy`, `dedup_key`, `retry_count`, etc.) to `insider_alerts`, fixing the `transaction_type` CHECK constraint to include `'cluster'`, and adding the `service_role` UPDATE policy needed for cluster detection. Blocker for all other sections.

### section-01-airtable-setup
Create the "InsiderBuying.ai" Airtable base with two tables: `Insider_Alerts` (all filing fields + delivery tracking) and `Monitor_State` (one record per workflow tracking last check timestamp). Includes field definitions, select options, and initial seed records for Monitor_State.

### section-02-sec-monitor
`n8n/code/insiderbuying/sec-monitor.js` — the core data acquisition node. Pre-loads dedup Set + CIK ticker map, fetches from SEC EDGAR JSON endpoint (narrow query + User-Agent header), enriches via Financial Datasets (100ms delay, retry), deduplicates (in-memory Set, adds to Set after pass), filters buys-only (`P - Purchase`), classifies insider role, detects clusters (7-day window, immediate Supabase write per filing).

### section-03-score-alert
`n8n/code/insiderbuying/score-alert.js` — significance scoring. Computes insider track record from Supabase history + Yahoo Finance price data (normalizes insider name, graceful fallback on Yahoo failure). Calls Claude Haiku for 1-10 score + reasoning. Clamps score to [1,10]. Defaults to score=5 on Haiku failure.

### section-04-analyze-alert
`n8n/code/insiderbuying/analyze-alert.js` — AI analysis prose generation. Skips if score < 4. Calls Claude Sonnet 4.6 for 2-3 paragraph analysis referencing actual numbers and insider specifics. Validates output length and paragraph count. Falls back to `ai_analysis = null` on failure.

### section-05-write-persistence
Write each filing individually (not batch-at-end) to Airtable then Supabase. Supabase insert uses `ON CONFLICT (dedup_key) DO NOTHING`. Stores returned UUID back in Airtable. Updates Monitor_State after all filings: rolls back timestamp to min(failed_filing.filing_date) on partial failure. Dead-letter pattern for filings failing > 3 times. Cluster summary creation at end of run (one per cluster_id, deduped).

### section-06-deliver-alert
`n8n/code/insiderbuying/deliver-alert.js` — W5 alert delivery. Fetches eligible users (Supabase: preferences + profiles + admin API for email, never logging email in errors). Builds Resend email batch per user (free=truncated, pro=full), includes unsubscribe link + postal address (CAN-SPAM). Sends in chunks of 100 with 200ms delay. Sends OneSignal push with numeric tag filter. Updates Airtable with delivery stats.

### section-07-n8n-workflow-config
N8n workflow JSON configuration for W4-market (15 min cron, market hours) and W4-afterhours (60 min cron, "wait for previous execution" enabled, market-hours early-exit guard using `Intl.DateTimeFormat('America/New_York')`). Node chain: sec-monitor → score-alert → analyze-alert → IF score>=6 → deliver-alert. Environment variable list for docker-compose.yml.

### section-08-frontend-blur
`/alerts` page subscription-aware blur. Adds `profiles` query alongside existing alerts query. Stores `isPro` in state. Conditionally applies `blur-[4px] select-none` only for free users. Shows "Upgrade to Pro" CTA only for free users. Unauthenticated users treated as free (blur + signup CTA).

### section-09-frontend-onesignal
`OneSignalInit.tsx` additions: `useEffect` that calls `OneSignal.login(session.user.id)` on auth session load and on `onAuthStateChange`. Preference save handler sets `alert_score_min` tag as number (not string) and `plan` tag. Verify `OneSignalSDKWorker.js` present in `/public`.
