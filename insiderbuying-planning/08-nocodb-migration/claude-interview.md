# Interview Transcript: 08-nocodb-migration

## Q1: HTTP client pattern for nocodb-client.js

**Question:** The spec says `nocodb-client.js` should use `require('https')` (no global fetch). But ALL existing files in the codebase use `fetchFn` dependency injection — the n8n entry block injects `fetchFn: (url, opts) => fetch(url, opts)`. Which pattern should `nocodb-client.js` follow?

**Answer:** Follow existing DI pattern (Recommended)

NocoDB class accepts `fetchFn` in constructor — consistent with all 24 existing files, easier to test, same n8n entry block pattern.

---

## Q2: score-alert.js migration scope

**Question:** The spec says to migrate `score-alert.js` Supabase track record query → NocoDB `Insider_History`. But research shows score-alert.js queries SUPABASE (`/rest/v1/insider_alerts`) with PostgREST syntax — and the spec elsewhere says 'Supabase stays for auth/subscriptions only'. Which queries in score-alert.js actually go to NocoDB?

**Answer:** Track record moves to NocoDB Insider_History

The score-alert track record lookup (currently in Supabase `insider_alerts`) should move to NocoDB `Insider_History` table. This means the trade history / hit rate / track record query migrates to NocoDB, even though it currently lives in Supabase.

---

## Q3: NocoDB column names vs Airtable field names

**Question:** Do the NocoDB column names exactly match the Airtable field names?

**Answer:** Column names are identical

NocoDB columns were created to match Airtable field names exactly. Safe to use the same field names in code with no mapping layer needed.

---

## Q4: deliver-alert.js — which store for eligible users?

**Question:** For `deliver-alert.js`, the spec says `fetchEligibleUsers()` should use 'NocoDB `Users` table (or Supabase — use Supabase for auth-related user data)'. Which data store holds the users/subscribers list?

**Answer:** Supabase — users are auth data

The subscriber/user list comes from Supabase (auth users + subscription_tier). Supabase stays for this, no Airtable migration needed for user fetching in deliver-alert.js.

---

## Q5: NocoDB DI instantiation style

**Question:** Should the NocoDB client be instantiated at the TOP of each file's entry block, then passed to functions — or should each function receive nocodb as a parameter?

**Answer:** Instantiate at entry, pass nocodb to functions (Recommended)

One `const nocodb = new NocoDB(env, fetchFn)` at the entry block top, then functions receive it as `opts.nocodb`. Mirrors how `fetchFn` is currently passed in `opts`.

---

## Key Decisions Summary

| Decision | Choice |
|----------|--------|
| nocodb-client HTTP | `fetchFn` DI, not `require('https')` |
| score-alert track record | Migrates from Supabase → NocoDB `Insider_History` |
| deliver-alert users | Stays in Supabase (auth data) |
| NocoDB column names | Identical to Airtable field names |
| DI instantiation | Once at entry block, `opts.nocodb` pattern |
