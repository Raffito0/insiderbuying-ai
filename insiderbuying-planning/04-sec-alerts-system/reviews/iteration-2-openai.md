# Openai Review

**Model:** o3
**Generated:** 2026-03-27T23:15:31.890899

---

Comprehensive and ambitious plan – overall solid, but I see a number of gaps and latent hazards that will bite you in production.  I have grouped them by topic and referenced the section numbers you used so you can patch them quickly.

------------------------------------------------------------------
1. SEC / EDGAR DATA INGESTION
------------------------------------------------------------------
S-2.1  Unbounded search query  
• `q=*` will return **all Forms 4 ever filed**, then the back-end paginates.  
 – At peak hours the first page regularly exceeds 1 MB and you will hit the SEC’s
   60 req/min IP throttle while paging.  
 – Pass **`start=0&count=100&sort=filingDate:desc`** and
   `dateRange=custom&startdt={ISO-last-check}&enddt={today}` to guarantee you
   only fetch what you really need.  
• SEC requires a `User-Agent` header that contains a contact email address
  (otherwise the endpoint will increasingly 403/429 you).  
  Add `User-Agent: EarlyInsiderBot/1.0 (contact@earlyinsider.com)`.

S-2.0  CIK→ticker cache invalidation  
• Companies change tickers (e.g., FB→META) roughly once a month.  A cache that
  survives workflow restarts will go stale.  Re-download the file **daily** or
  add `max-age` logic.

S-2.2  XML fallback contradicts “no xml2js”  
• Your fallback will **still need an XML/XBRL parser**.  Either vendor in
  `fast-xml-parser` (works in n8n sandbox) or drop the fallback and simply mark
  filings as “unenriched”.

S-2.2  100 ms delay is optimistic  
• A full Financial Datasets call + network latency regularly takes
  300-600 ms.  Forty filings × 600 ms = 24 s plus everything else – you will
  blow past the **n8n 60 s Code-node default timeout** on busy runs.
  Raise the timeout or process filings in parallel with
  `Promise.allSettled([...])` + concurrency guard (e.g., p-limit 6).

S-2.3  7-day dedup window too short  
• Same insider can amend a filing months later, or file multiple tranches in an
  ongoing plan.  Duplicate keys older than 7 days will leak through and create
  false alerts.  
  Option: store **permanent `dedup_key` unique index in Supabase** and rely on
  `ON CONFLICT DO NOTHING`.

------------------------------------------------------------------
2. CLUSTER DETECTION & RACE CONDITIONS
------------------------------------------------------------------
S-2.6 / S-5.4  Multiple cluster summaries  
• Every new insider will create a *new* “cluster summary” row – you will spam
  users until the cluster quiets down.  
  Fix: use the `cluster_id` as `dedup_key` for the summary row and
  `ON CONFLICT DO UPDATE` total insiders / score.

S-2.6  Cross-workflow race  
• W4-market and W4-afterhours no longer overlap, but **two parallel market
  workflows instances** *can* overlap if an earlier run takes >15 min.
  Enable “do not run in parallel” in n8n or put a `SELECT pg_advisory_lock()`
  guard in Supabase.

------------------------------------------------------------------
3. SUPABASE / RLS / SECURITY
------------------------------------------------------------------
S-0  UPDATE policy opens entire table  
• `TO service_role USING (true)` is fine, but you should *also* block UPDATE /
  DELETE from anon & authenticated roles or someone can overwrite data through
  public endpoints.

S-6.1  Reading `auth.users`  
• Pulling user emails in a Code node with the **service-role key** is
  dangerous – any `console.log()` on error will leak every user’s email to the
  n8n execution log (plain-text).  Wrap admin SDK calls in a try/catch that
  explicitly `delete userData.email` before logging.

 Alternative (safer): create a **security-definer Postgres function** that
  returns the email and expose it through RPC.  Then you never move the key out
  of Postgres.

S-5.2  Unique index error path  
• No `ON CONFLICT` clause is specified.  Duplicate insert will 409 and abort
  the whole Code node.  Add `supabase.from('insider_alerts').insert(…,
  { onConflict: 'dedup_key' })`.

S-8  Public blur but public data  
• RLS presently allows anonymous `select` (because the JS front-end can read
  it).  Anyone can curl `/rest/v1/insider_alerts` and get the **unblurred full
  text**.  Verify this is an acceptable business risk; if not, move the full
  analysis to a separate column protected by RLS and expose only a truncated
  version publicly.

------------------------------------------------------------------
4. EMAIL / PUSH COMPLIANCE & SCALE
------------------------------------------------------------------
S-6.2  CAN-SPAM / unsubscribe  
• Resend will block you if every email does not contain a postal address and an
  unsubscribe link.  Plan does not mention either.  Add a footer with
  `/preferences` link and physical address.

S-6.2  100-recipient batch  
• `/emails/batch` actually counts *each object* as one API request *and* one
  delivered email.  To avoid leaking all recipients, keep **one** recipient per
  object.  Your chunking is fine but verify you are not putting `[]` of 100
  addresses in the single `to` field.

S-6.3  OneSignal tag type  
• You store `alert_score_min` as a string.  Numeric comparison filters interpret
  strings lexicographically (“10” < “6”).  Cast to number in the tag or prefix
  with zeroes.

S-6.1  Cost explosion  
• At 50 users × 10 alerts/day you already exceed Resend free tier *and* hit
  OneSignal’s 6 k/1 hr notification cap.  Budget line mentions Resend Pro but
  ignores OneSignal.  The next tier is **$99/mo**.

------------------------------------------------------------------
5. AI SCORING / ANALYSIS
------------------------------------------------------------------
S-3.1  Name matching  
• `insider_name` string comparison will treat “John A. Smith” and
  “John Smith” as different.  Normalise (uppercase, strip middle initials,
  collapse whitespace) before using as join key.

S-3.1  Yahoo Finance API stability  
• The anonymous endpoints rotate cookies; in the last 60 days they have shipped
  CORS pre-flight changes twice.  Consider **caching prices** or switch to
  Stooq or Tiingo (free key) sooner.

S-3.2  Prompt injection / model error  
• You parse Haiku JSON with `repairJson()`.  If Anthropic returns
  “{"score": 11}” or negative values you may create out-of-range scores that
  skew everything.  Clamp `score = Math.min(10, Math.max(1, parsed.score))`.

------------------------------------------------------------------
6. PERFORMANCE / RELIABILITY
------------------------------------------------------------------
n8n Code node memory leaks  
• Long-running loops + large SEC responses can exceed the
  `--max_old_space_size=512` default in n8n’s sandbox.  Explicitly
  `delete largeVar` or process filings stream-wise.

Cron overlap  
• If an after-hours run is delayed by 20 min (network), the next cron fires
  while the previous instance is still active – duplicate processing.
  Enable “Wait Till Previous Execution Finishes” in n8n or check `global.isRunning` flag in Redis.

Monitor_State rollback logic  
• When some filings fail you roll the pointer back to the **earliest failed**.
  If a later retry succeeds for a subset but not all, you will keep re-queueing
  already-processed filings every hour – exponential email duplicates.
  Instead, store an explicit “retry queue” table keyed by accession number.

------------------------------------------------------------------
7. LEGAL & COMPLIANCE
------------------------------------------------------------------
• Storing executive names + trades in Airtable (U.S. servers) may trigger
  privacy concerns for EU users.  Put a privacy-policy update on the roadmap.

• SEC restricts “bulk download” to personal-use.  Your service is commercial;
  add the mandated “fair-access” headers and, if volume > 10 requests/second,
  request a formal access letter.

------------------------------------------------------------------
8. AMBIGUITIES / UNSPECIFIED
------------------------------------------------------------------
• What is the throttling policy when CLAUDE or Financial Datasets is down for
  > 15 min?  (Current flow will retry forever and block the workflow.)

• No retention-policy specified.  How long will you keep full AI analysis in
  Supabase?  Storage costs and GDPR delete requests need a process.

• Cluster “summary” alert email subject/HTML template unspecified (only push).

------------------------------------------------------------------
9. QUICK WINS
------------------------------------------------------------------
✅ Add `SELECT pg_advisory_lock(42);` to sec-monitor — eliminates all parallel-run races with two lines of SQL.  
✅ Create a single Postgres `view_user_emails` SECURITY DEFINER to pull user
   emails, remove admin SDK + env var leakage risk entirely.  
✅ Put `unsubscribe` + postal address in the HTML template now – prevents Resend account suspension later.

------------------------------------------------------------------
10. HIGH-PRIORITY ACTION LIST
------------------------------------------------------------------
1. Harden SEC fetch: narrow query + proper headers (S-2.1).  
2. Add `ON CONFLICT` handling for `dedup_key` in Supabase insert (S-5.2).  
3. Prevent duplicate cluster summaries (S-2.6).  
4. Implement advisory lock or n8n “no parallel” (Performance section).  
5. Add unsubscribe/footer to all Resend emails (S-6.2).  
6. Guard service-role key leakage in logs / or replace with SQL view (S-6.1).  
7. Raise Code-node timeout or parallelise enrichment (S-2.2 performance).  

Tackle these before going live; the rest can follow in hardening sprints.
