# Integration Notes: External Review Feedback

## What I'm Integrating

### 1. Email Threading — CRITICAL FIX (Gemini)

**Issue:** The plan states adding "Re:" to a subject line creates a thread. This is wrong. Threading in Gmail/Outlook depends entirely on SMTP headers (`In-Reply-To`, `References`), not subject prefix.

**Action:** Add `resend_message_id` field to `Outreach_Prospects` NocoDB schema. When sending the initial email via Resend, store the returned email ID. When sending FU1 and FU3 (same-thread follow-ups), include `In-Reply-To: {resend_message_id}` and `References: {resend_message_id}` in the Resend headers object. Update schema migration section.

### 2. Bounce Tracking — Async Reality (Gemini + o3)

**Issue:** The plan describes checking bounce status synchronously from the SMTP send response. Gemini correctly identifies this as technically impossible — Resend's API only confirms the message is queued. Hard bounces happen asynchronously at the receiving server (minutes to hours later).

**User preference:** User chose "Telegram alert only" (no webhook). This preference was about not wanting a persistent webhook endpoint — it wasn't informed by the technical limitation.

**Resolution (webhook-free):** Store the Resend `email_id` (returned in the 201 response) in `Outreach_Prospects.last_resend_id`. Add a daily polling job that calls `GET https://api.resend.com/emails/{id}` for emails sent 24-48h ago. If `last_event === 'bounced'`, update `status='bounced'` and cancel follow-ups. This achieves asynchronous bounce detection without a webhook server. Update the Bounce handling section to describe polling, not synchronous detection.

### 3. Threshold-Based Follow-Up Logic (Gemini + o3)

**Issue:** "Days 4-6 → FU1" breaks if n8n is down over a weekend or the job runs more than once per day (double-fire risk).

**Action:** Change to threshold-based: `days >= 5 AND followup_count == 0`, `days >= 10 AND followup_count == 1`, `days >= 16 AND followup_count == 2`. Simpler and more resilient. Remove the day-window concept from the plan.

### 4. DOMAIN_SETUP_DATE — Throw if Missing (o3)

**Issue:** The plan says default to today if unset. This resets the warm-up counter on every container restart.

**Action:** Throw a clear startup error if `DOMAIN_SETUP_DATE` is missing. This matches the user's answer (they said to set it explicitly at first send). Document in the env vars section.

### 5. Timezone — Use Intl.DateTimeFormat for DST (o3)

**Issue:** Node's `Date.getHours()` uses the process timezone, not EST. DST makes EST/EDT differ by 1 hour — Tuesday 10 AM EST in summer is 11 AM EDT.

**Action:** Use `Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', weekday: 'short' })` to get the correct local hour and day regardless of DST. Update `isValidSendTime()` spec.

### 6. Beehiiv Referral Merge Tag (Gemini)

**Issue:** The plan says embed the referral URL as static HTML. But Beehiiv referral links are unique per subscriber. A static URL won't work for thousands of readers.

**Action:** Inject Beehiiv's merge tag `{{rp_refer_url}}` into the referral block HTML. Beehiiv's send engine replaces this per-subscriber. Update the referral block spec.

### 7. Beehiiv Plan Behavior — Handle 201 Without Send (o3)

**Issue:** If the account is not Enterprise, Beehiiv's `/posts` may return 201 (draft created) instead of 403 (unauthorized). The plan only triggers Resend fallback on error codes.

**Action:** After Beehiiv POST, check that the response indicates the post was actually scheduled/sent (not just drafted). If the response shows `status: 'draft'` without a send, treat it as a failed send and trigger Resend fallback. Update the send logic description.

### 8. AI JSON Retry Loop (Gemini + o3)

**Issue:** The plan says "throw" if the AI violates word count or content rules. In an n8n Code node, throwing halts execution without retry.

**Action:** Implement a `maxRetries = 3` loop for the DeepSeek call. On validation failure (word count, banned phrases, missing subject "?"), append the failure reason to the prompt and retry. After 3 failures, send a Telegram alert and throw. Also: strip markdown ` ```json ``` ` wrapper before `JSON.parse()` (LLMs often wrap JSON in markdown blocks).

### 9. Cheerio RSS/XML Mode (Gemini)

**Issue:** Falling back to `/feed` or `/rss` with standard Cheerio HTML selectors will fail — RSS is XML with `<item>` and `<title>` tags, not `<article>` or `<h2>`.

**Action:** Add RSS detection: if the Content-Type is `application/xml` or `text/xml`, use `cheerio.load(data, { xmlMode: true })` with the selector `item > title`. Document this in the scraping section.

### 10. Empty State AI Prompt Handling (Gemini)

**Issue:** If `topAlerts` is empty (slow market week), passing an empty array to DeepSeek without guidance will cause hallucinated data.

**Action:** Before the DeepSeek call, check for empty arrays and inject appropriate context: if `topAlerts.length === 0`, add a prompt prefix "No major insider moves this week — focus section 2 on macro trends and market context instead of a specific ticker." Document empty state handling.

### 11. Finnhub Rate Limiting (Gemini + o3)

**Issue:** 5 serial Finnhub calls in a loop may hit rate limits on the free tier.

**Action:** Add 250ms delay between calls (or use `Promise.allSettled` with concurrency limit). Document in the `computeAlertPerformance()` description.

### 12. `sent_today` Counter in NocoDB (o3)

**Issue:** The warm-up limit (`getWarmupLimit()`) is computed per-run but not tracked across runs. Two workflow invocations in the same day could each send the full daily limit.

**Action:** Add `sent_today` and `sent_date` columns to a `Outreach_Daily_Stats` NocoDB table (or use an existing stats table). Before each send batch, read today's count. Cap at `dailyLimit - sent_today`. After sending, increment by actual sent count.

### 13. Case-Insensitive Banned Phrase Check (o3)

**Issue:** Current spec doesn't mention case sensitivity. `validateEmail()` should catch "Just Wanted to Reach Out" as well as lowercase.

**Action:** Explicitly call out `email.toLowerCase()` before banned phrase checking. Update the validation description.

### 14. CAN-SPAM Unsubscribe Footer (Gemini + o3)

**Issue:** Both outreach emails and the newsletter need an unsubscribe mechanism for legal compliance. Even cold outreach should have "reply with 'stop' to opt out."

**Action:** Add unsubscribe footer requirement to both modules. Newsletter uses Beehiiv's native unsubscribe (auto-handled). Resend fallback must include a `List-Unsubscribe` header and a visible unsubscribe link. Outreach initial email must include a one-line opt-out: "Reply 'stop' to never hear from me again." Add this to the requirements list.

---

## What I'm NOT Integrating

**Mutex/Redis lock for parallel n8n executions (o3):** The system runs weekly newsletters and daily outreach with modest volume. Race conditions between parallel n8n instances are unlikely and Redis adds infrastructure complexity. Not needed for this scale.

**SSRF guard for Cheerio (o3):** Prospect URLs come from a curated NocoDB table of known domains. The SSRF risk is negligible in this context.

**AI XSS sanitization (o3):** Beehiiv and Resend both sanitize HTML on ingestion. Adding a custom sanitization step adds complexity without meaningful protection here.

**Puppeteer fallback for JS-heavy blogs (o3):** Puppeteer is a heavy dependency. If a blog uses React rendering, the scraper will return null, and the email falls back to non-personalized copy. Acceptable tradeoff for now.

**n8n Code node split into multiple nodes (o3):** Implementation architecture decision, not a plan-level change. Document the timeout risk and leave the implementation choice to the developer.

**Idempotency DB lock for newsletter (o3):** Weekly sends are triggered manually or on a known schedule. Duplicate send risk is low. Document as "verify no duplicate trigger" in the deployment notes rather than adding infrastructure.
