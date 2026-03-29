# Section 05 — Outreach Follow-Up Sequence

**File:** `n8n/code/insiderbuying/send-outreach.js`
**Test file:** `n8n/tests/send-outreach.test.js`
**Depends on:** section-04 (outreach email rewrite, initial send stores Resend ID)
**Blocks:** nothing (parallelizable with section-06 after section-04)

---

## What This Section Does

The current `send-outreach.js` has a single follow-up at day 5. This section replaces it with a professional 3-stage sequence at days 5, 10, and 16 — with correct SMTP threading so Gmail and Outlook group messages into a single conversation thread.

The key deliverability detail: `In-Reply-To` and `References` headers are what actually thread emails in clients. Writing `Re:` in the subject line is cosmetic only. FU1 and FU3 use these headers (same thread). FU2 deliberately uses a new thread with a fresh angle.

---

## NocoDB Schema Migration

Run this SQL before deploying the code. The fields do not exist in the current schema.

```sql
ALTER TABLE Outreach_Prospects
  ADD COLUMN followup_count INTEGER DEFAULT 0,
  ADD COLUMN sent_at DATETIME,
  ADD COLUMN replied BOOLEAN DEFAULT FALSE,
  ADD COLUMN last_resend_id VARCHAR(255),
  ADD COLUMN last_article_title TEXT;
```

`followup_count` tracks which stage has been sent (0 = none, 1 = FU1 sent, 2 = FU2 sent, 3 = FU3 sent, 99 = cancelled). `last_resend_id` stores the Resend `email.id` from the initial send — required for threading headers. `last_article_title` is the cached Cheerio scrape result from section-04 (avoids re-scraping the same site for follow-ups).

---

## Tests — Write These First

File: `n8n/tests/send-outreach.test.js` (extend existing file)

```js
describe('checkFollowUpsDue', () => {
  // Stage selection
  test('selects prospect at day 5 with followup_count=0 as FU1');
  test('selects prospect at day 10 with followup_count=1 as FU2');
  test('selects prospect at day 16 with followup_count=2 as FU3');

  // Threshold logic — resilient to missed cron runs
  test('selects FU1 for prospect at day 7 with followup_count=0 (days >= 5, not just day 5)');
  test('selects FU2 for prospect at day 12 with followup_count=1 (days >= 10)');

  // Exclusions
  test('does NOT select prospect with followup_count=99 (cancelled)');
  test('does NOT select prospect with replied=true');
  test('does NOT select prospect where sent_at is NULL');
})

describe('follow-up send payloads', () => {
  // FU1 — same thread
  test('FU1 payload includes In-Reply-To: <{last_resend_id}> header');
  test('FU1 payload includes References: <{last_resend_id}> header');
  test('FU1 subject is "Re: {original subject}"');
  test('FU1 body is 50-75 words');

  // FU2 — new thread
  test('FU2 payload does NOT include In-Reply-To header');
  test('FU2 subject does NOT start with "Re:"');
  test('FU2 body is 30-50 words');

  // FU3 — same thread again
  test('FU3 payload includes In-Reply-To header');
  test('FU3 body is approximately 25 words (1 sentence after greeting)');
  test('FU3 subject is "Re: {original subject}"');
})

describe('initial send and state tracking', () => {
  test('initial send stores Resend response id in Outreach_Prospects.last_resend_id');
  test('after FU1 send, followup_count is incremented to 1');
  test('after FU2 send, followup_count is incremented to 2');
  test('after FU3 send, followup_count is incremented to 3');
})

describe('cancelFollowUps', () => {
  test('sets followup_count=99 on the given prospect ID');
})
```

---

## Implementation

### `checkFollowUpsDue(nocodbApi)`

Query `Outreach_Prospects` with this NocoDB filter:

```
WHERE followup_count < 3 AND replied = false AND sent_at IS NOT NULL
```

For each returned prospect, compute `days = Math.floor((Date.now() - new Date(prospect.sent_at).getTime()) / 86400000)`.

Map to stage using threshold logic (this handles cron downtime gracefully — if the cron missed day 5 and runs on day 7, it still sends FU1):

```js
function getFollowUpStage(days, followupCount) {
  if (days >= 16 && followupCount === 2) return 3;
  if (days >= 10 && followupCount === 1) return 2;
  if (days >= 5  && followupCount === 0) return 1;
  return null; // not due yet
}
```

Return an array of `{ prospect, stage }` objects for the caller to iterate.

### Storing the Resend ID on Initial Send

When the initial email is sent via Resend, the API returns an object with an `id` field. Store it:

```js
// After Resend send succeeds:
await nocodbApi.updateRecord('Outreach_Prospects', prospect.id, {
  last_resend_id: resendResponse.id,
  sent_at: new Date().toISOString(),
  followup_count: 0
});
```

Without `last_resend_id`, FU1 and FU3 cannot thread. If it is missing when a follow-up is due, skip threading headers rather than failing the send.

### Follow-Up 1 — Same Thread, Soft Check-in (days >= 5, followup_count == 0)

**Length:** 50–75 words.
**Subject:** `Re: {prospect.original_subject}`
**Content:** soft check-in with one new small data point from your data set. No URL. No phrase "just following up" (it is in the banned list from section-04 — run the same `validateEmail` check here).
**Headers:** include SMTP threading headers in the Resend payload:

```js
headers: {
  'In-Reply-To': `<${prospect.last_resend_id}>`,
  'References': `<${prospect.last_resend_id}>`
}
```

After successful send, increment `followup_count` to 1 in NocoDB.

**Example prompt instruction for AI:**
> "Write a 50–75 word follow-up to a cold outreach email sent 5+ days ago. Mention one new data point (e.g. a specific recent insider buy). Do not include any URL. Do not say 'just following up'. End with a soft, low-pressure question."

### Follow-Up 2 — New Thread, Different Angle (days >= 10, followup_count == 1)

**Length:** 30–50 words.
**Subject:** a completely different subject line — not "Re:". Something like a new hook or a different angle on the value proposition.
**Content:** the prompt must explicitly say: "Write about a completely different angle than the first email. Do not reference it."
**Headers:** do NOT include `In-Reply-To` or `References`. This is intentionally a new thread.

After successful send, increment `followup_count` to 2 in NocoDB.

### Follow-Up 3 — Same Thread, Final (days >= 16, followup_count == 2)

**Length:** ~25 words (1 sentence after greeting).
**Subject:** `Re: {prospect.original_subject}`
**Content (fixed copy, no AI needed):**

```
Hi {prospect.first_name}, last note from me on this — the data offer stands whenever insider trading coverage is relevant for your readers.
```

**Headers:** include `In-Reply-To` + `References` same as FU1:

```js
headers: {
  'In-Reply-To': `<${prospect.last_resend_id}>`,
  'References': `<${prospect.last_resend_id}>`
}
```

After successful send, increment `followup_count` to 3 in NocoDB. At 3, the prospect exits the sequence naturally (the query filter `followup_count < 3` stops selecting them).

### `cancelFollowUps(prospectId, nocodbApi)`

Sets `followup_count = 99`. This exits the prospect from the sequence permanently. Called externally by the IMAP polling cron when a reply is detected.

```js
async function cancelFollowUps(prospectId, nocodbApi) {
  // Sets followup_count = 99 to permanently exclude from checkFollowUpsDue query
  await nocodbApi.updateRecord('Outreach_Prospects', prospectId, { followup_count: 99 });
}
```

---

## Integration Notes

- The `validateEmail()` function from section-04 (banned phrases, word count, "?" subject validation) applies to FU1 and FU2 as well. FU3 uses fixed copy so validation is not needed, but keep word count within 30 words.
- FU1 and FU2 AI generation should use the same retry loop pattern as the initial email (max 3 retries with constraint feedback appended).
- `last_article_title` (cached from section-04 scraping) is available on the prospect record — FU1 can optionally reference it as a callback: "I mentioned your piece on X earlier…" but this is optional. The scraping is not re-run during follow-ups.
- Send rate limits and `isValidSendTime()` from section-06 apply to follow-up sends as well. Follow-up sends count toward the daily warm-up limit tracked in `Outreach_Daily_Stats`.
- Follow-up sends store their own Resend IDs back in `last_resend_id` only if you need to support threading beyond FU3. For 3 stages this is not needed — keep `last_resend_id` as the initial email ID throughout the sequence.

---

## Deviations from Plan

1. **FU2 banned-phrase check added**: Code review finding (H-1) — plan was silent. Added `BANNED_PHRASES` loop to FU2 retry block, consistent with `generateEmail` and `_generateFollowUpBody`.

2. **Prompt injection sanitization**: Plan was silent. Code review finding (M-1) — `contact_name`/`site_name` stripped of newlines and capped at 80 chars before AI prompt interpolation. Same pattern as `buildEmailPrompt` for `last_article_title`.

3. **`getFollowUpStage` explicit guard for `followupCount >= 3`**: Plan showed fallthrough-only logic. Code review (M-2) — added `if (followupCount >= 3) return null;` guard at function top.

4. **`sendFollowUp` contact_email guard**: Plan was silent. Code review (M-6) — throws early with descriptive message when `contact_email` is missing.

5. **FU2 subject parsing case-insensitive**: Plan used `startsWith('Subject: ')`. Code review (M-4) — changed to `toLowerCase().startsWith('subject: ')`.

6. **`RESEND_API_KEY` fail-fast behavior**: Attempted as L-1 fix but incompatible with test injection pattern. Documented in comment at caller level instead.

7. **Test file location**: Tests in `tests/insiderbuying/send-outreach.test.js` (109 total — sections 01-05).

8. **Functions added to exports**: `getFollowUpStage`, `checkFollowUpsDue`, `buildFu3Body`, `buildFuThreadedPayload`, `buildFu2Payload`, `sendInitialOutreach`, `sendFollowUp`, `cancelFollowUps`.
