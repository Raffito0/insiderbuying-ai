# Section 04 — Outreach Email Rewrite + Prospect Scraping

## Overview

This section fixes a critical deliverability bug in `send-outreach.js` (a URL in the first cold email), reduces word count, adds from-name branding, injects social proof and a CAN-SPAM opt-out line, enforces subject validation, expands the banned-phrase list, and adds Cheerio-based blog scraping for per-prospect personalisation. It also adds an AI retry loop for outreach email generation.

**File to modify:** `n8n/code/insiderbuying/send-outreach.js`
**Test file to extend:** `n8n/tests/send-outreach.test.js`

**Dependencies:** none — this section is independent and can run in parallel with section-01.
**Blocks:** section-05 (follow-up sequence) and section-06 (warm-up and bounce monitoring) both depend on this section being complete first.

---

## Tests First

Extend `n8n/tests/send-outreach.test.js`. Write all of these stubs before touching the implementation.

```js
describe('section-04 — email rewrite + scraping', () => {

  describe('buildEmailPrompt word count', () => {
    it('produces an email body between 100 and 125 words');
    // build a prompt with a mock prospect, generate, count words in email.body
  });

  describe('buildEmailPrompt no URL', () => {
    it('does NOT include http:// or https:// in the email body');
    // regex /https?:\/\// must not match email.body
  });

  describe('buildEmailPrompt social proof', () => {
    it('includes "1,500+" in the email body');
  });

  describe('buildEmailPrompt from name', () => {
    it('uses "Ryan from EarlyInsider" as the from name');
    // assert email.from === '"Ryan from EarlyInsider" <ryan@earlyinsider.com>'
  });

  describe('buildEmailPrompt opt-out footer', () => {
    it('includes "Reply \'stop\'" or equivalent opt-out line in the body');
  });

  describe('validateEmail subject', () => {
    it('rejects subject without a question mark');
    it('accepts subject ending with "?"');
    it('accepts subject containing "?" anywhere');
  });

  describe('validateEmail banned phrases', () => {
    const banned = [
      'just wanted to reach out',
      'I stumbled upon',
      'I am a huge fan',
      'big fan of your work',
      'as per our conversation',
      'circle back',
      'synergy',
      // …plus the 14 existing phrases already in the banned list
    ];
    banned.forEach(phrase => {
      it(`rejects body containing "${phrase}" (case-insensitive)`, () => {
        // pass phrase in UPPER CASE to confirm case-insensitive check
      });
    });
  });

  describe('scrapeRecentArticle HTML mode', () => {
    it('returns { title, url } from HTML blog using article:first-of-type a selector');
    it('falls back to .post:first-of-type a selector when article selector finds nothing');
    it('falls back to h2 a:first-of-type selector as last resort');
    it('returns null gracefully (no throw) when scraping fails entirely');
    it('returns null gracefully when selector finds nothing on the page');
  });

  describe('scrapeRecentArticle XML/RSS mode', () => {
    it('uses xmlMode: true and "item > title" selector when Content-Type is application/xml');
    it('uses xmlMode: true when Content-Type is text/xml');
  });

  describe('buildEmailPrompt with article personalisation', () => {
    it('includes the article title in the prompt when last_article_title is set on prospect');
    it('generates a valid email without article personalisation when last_article_title is null');
  });

  describe('AI retry loop', () => {
    it('retries when AI returns a banned phrase — sends on the third attempt when third is clean');
    it('retries when AI returns a subject without "?"');
    it('retries when AI returns a body over 125 words');
  });

});
```

---

## Implementation Details

### 1. Remove the URL from `buildEmailPrompt()`

The existing prompt includes a link to the EarlyInsider site in the first cold email. This must be removed entirely — a URL in the initial outreach message is a deliverability violation that triggers spam filters.

Locate every `http://` or `https://` occurrence in the prompt string inside `buildEmailPrompt()` and delete them. The prompt must instruct the AI explicitly: "Do not include any URLs or links in this email."

### 2. Reduce word limit to 100–125 words

Change the word-count instruction in the prompt from 150 words to 100–125 words. Shorter cold emails have higher reply rates.

After AI generation, count words in `email.body` (split on whitespace). Throw a retryable error if outside this range.

### 3. From name

Set `email.from` to exactly:

```
"Ryan from EarlyInsider" <ryan@earlyinsider.com>
```

This must be a constant — not AI-generated — set before calling Resend.

### 4. Social proof line

Inject this literal sentence into the email body prompt:

```
We track 1,500+ SEC insider filings per month.
```

The AI must include it verbatim (or very close). After generation, assert `email.body` contains `"1,500+"` as a hard check (no retry — this is a prompt construction guarantee, not an AI generation constraint).

### 5. CAN-SPAM opt-out footer

The initial cold email must include a one-line opt-out. Add this to the prompt instructions and assert it appears in the output:

```
Reply 'stop' to never hear from me again.
```

This is the minimal CAN-SPAM compliance footer for cold outreach. Place it as the last line of the email body.

### 6. Subject "?" validation

After AI generates the email, validate the subject with a regex — not `includes()`:

```js
function validateSubject(subject) {
  if (!subject.trim().match(/\?/)) {
    throw new Error(`Subject must be a question: "${subject}"`);
  }
}
```

Using regex handles trailing whitespace and Unicode question marks correctly. This check triggers a retry in the AI retry loop.

### 7. Expand banned phrases to 21

The existing banned-phrase list has 14 entries. Add these 7 (run check on `email.body.toLowerCase()`):

- `just wanted to reach out`
- `i stumbled upon`
- `i am a huge fan`
- `big fan of your work`
- `as per our conversation`
- `circle back`
- `synergy`

The check must be case-insensitive: compare against `email.body.toLowerCase()` and lowercase versions of all phrases. Any match throws a retryable error.

### 8. `scrapeRecentArticle(siteUrl)` — new function

Add this new exported function before `buildEmailPrompt()`:

```js
async function scrapeRecentArticle(siteUrl) { /* ... */ }
```

**Signature:** accepts a base URL string (e.g. `https://example.com`), returns `{ title: string, url: string }` or `null`.

**Logic:**
1. Fetch `siteUrl + '/blog'` with a 5-second timeout using `require('https')` (no npm fetch).
2. If the response `Content-Type` header contains `application/xml` or `text/xml`, parse as RSS: load with `cheerio.load(data, { xmlMode: true })` and use selector `item > title` to get the article title. The URL is the content of the `link` sibling element.
3. Otherwise, parse as HTML: try selectors in priority order — `article:first-of-type a`, then `.post:first-of-type a`, then `h2 a:first-of-type`. Use the first one that returns a non-empty result.
4. Return `{ title: $el.text().trim(), url: $el.attr('href') }`. If `href` is relative, prepend `siteUrl`.
5. If the fetch times out, returns a non-2xx status, or no selector matches, catch the error and `return null`. Do not throw — the caller must proceed without personalisation.

**Caching:** after a successful scrape, store `title` in `Outreach_Prospects.last_article_title` for the prospect (PATCH via NocoDB API). On subsequent runs, if `prospect.last_article_title` is already set, skip the fetch and use the cached value directly.

**Integration with `buildEmailPrompt()`:** if `last_article_title` is non-null, inject this line into the email prompt:

```
I just read your piece: '{title}'. That's exactly the kind of audience we want to reach.
```

If `last_article_title` is null (scrape failed or not cached yet), generate the email without any article reference — do not skip the prospect.

### 9. AI retry loop

Wrap the DeepSeek call in a `maxRetries = 3` loop. On each failure (banned phrase, no "?" in subject, word count out of range, JSON parse failure), append the specific constraint violation as feedback to the prompt before retrying:

```js
messages.push({ role: 'assistant', content: rawResponse });
messages.push({ role: 'user', content: `That email failed validation: ${error.message}. Fix it and try again.` });
```

After 3 consecutive failures, throw a descriptive error with the last violation. Do not send a Telegram alert on outreach retry failure (unlike the newsletter module) — the individual prospect is simply skipped and can be retried on the next cron run.

---

## Env Vars

No new env vars needed for this section. The following are already required and must be present:

- `RESEND_API_KEY` — used in the send step (section-05)
- `NOCODB_API_URL` / `NOCODB_API_TOKEN` — for caching scraped article titles

`DEEPSEEK_API_KEY` is assumed to already be in use in the existing module.

---

## NocoDB — `last_article_title` Field

This section uses the `last_article_title` field on `Outreach_Prospects`. The migration SQL for this field is documented in section-05 (follow-up sequence), which adds all new fields at once. This section can be developed and tested without the field existing in production — the scraper simply does not cache if the PATCH fails.

---

## Summary Checklist

- [ ] Remove URL from `buildEmailPrompt()` prompt
- [ ] Change word limit instruction to 100–125 words; add post-generation word count check
- [ ] Set `email.from = '"Ryan from EarlyInsider" <ryan@earlyinsider.com>'` as a constant
- [ ] Inject `"We track 1,500+ SEC insider filings per month."` into prompt; assert in body post-generation
- [ ] Add `"Reply 'stop' to never hear from me again."` as last line of email body
- [ ] Add subject "?" validation using `/\?/` regex
- [ ] Expand banned-phrase list to 21 entries; enforce case-insensitive
- [ ] Implement `scrapeRecentArticle(siteUrl)` with HTML + XML/RSS modes and graceful fallback
- [ ] Cache scraped title in `Outreach_Prospects.last_article_title`
- [ ] Inject article title into prompt when cached; omit when null
- [ ] Wrap DeepSeek call in `maxRetries = 3` retry loop with constraint feedback
- [ ] All tests in `send-outreach.test.js` for this section pass
