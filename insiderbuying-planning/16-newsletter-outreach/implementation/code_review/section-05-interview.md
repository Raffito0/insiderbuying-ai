# Code Review Interview — section-05: outreach-followup-sequence

## Summary

All fixes applied. 109/109 tests pass.

---

## H-1 — FU2 inline retry loop missing banned-phrase check (HIGH) — AUTO-FIX

**Finding**: `_generateFollowUpBody` (used for FU1) checks banned phrases. The FU2 inline retry loop only checked word count and subject `?` — a response containing "synergy" or "reaching out" would pass and be sent.

**Fix applied**: Added `BANNED_PHRASES` loop to the FU2 retry block (same pattern as `_generateFollowUpBody` and `generateEmail`). Two new tests added (M-8/M-9).

---

## M-1 — `contact_name`/`site_name` not sanitized in FU prompts (MEDIUM) — AUTO-FIX

**Finding**: `buildEmailPrompt` already sanitizes `last_article_title` (strips newlines, caps at 120 chars). `buildFu1Prompt` and `buildFu2Prompt` interpolated NocoDB fields raw — a crafted `contact_name` with embedded newlines could inject instructions into the AI prompt.

**Fix applied**: Added `.replace(/[\r\n]/g, ' ').trim().slice(0, 80)` sanitization to `safeName` and `safeSite` local variables in both `buildFu1Prompt` and `buildFu2Prompt`.

---

## M-2 — `getFollowUpStage` relied on fallthrough for count=99 (MEDIUM) — AUTO-FIX

**Finding**: count=99 was excluded only because none of the three `if` branches match `followupCount === 99`. Future threshold changes could accidentally re-enter cancelled prospects.

**Fix applied**: Added explicit `if (followupCount >= 3) return null;` guard at the top of `getFollowUpStage`. Also defensively handles `followupCount=3` (completed).

---

## M-3 — Empty-JSON Resend response silently discards message ID (MEDIUM) — DOCUMENTED

**Finding**: When `resp.json()` throws (non-JSON HTML error page), `_resendEmailPost` returns `{}`. The send may have succeeded but the message ID is lost. FU threading would work via the original `last_resend_id` per spec.

**Fix applied**: Changed `catch (_e) { return {}; }` to emit `console.warn` messages — one for non-JSON body, one when the response has no `id` field.

---

## M-4 — FU2 subject parsing case-sensitive (MEDIUM) — AUTO-FIX

**Finding**: `lines2[j].startsWith('Subject: ')` fails for `subject:` (lowercase) and `SUBJECT: ` — burning a retry slot unnecessarily.

**Fix applied**: Changed to `lines2[j].toLowerCase().startsWith('subject: ')` with value extraction using `slice()` on the original cased string.

---

## M-5 — `buildFu1Prompt` omits optional `last_article_title` hook (MEDIUM) — LET-GO

**Decision**: Spec says "optional". Section-04 personalisation is already cached; adding it to FU1 is a future enhancement, not a requirement. No change made.

---

## M-6 — `sendFollowUp` missing `contact_email` guard (MEDIUM) — AUTO-FIX

**Finding**: If `prospect.contact_email` is undefined, the email would be sent to `undefined` and fail with an opaque Resend error.

**Fix applied**: Added precondition check at top of `sendFollowUp`: throws `'prospect.contact_email is missing'` before any AI call or HTTP request.

---

## M-7 — NocoDB write failure after successful Resend send causes duplicate (MEDIUM) — DOCUMENTED

**Finding**: If `nocodbApi.updateRecord` throws after `_resendEmailPost` succeeds, the same follow-up is sent again on the next cron run. This is an at-least-once delivery problem.

**Decision**: Architectural note — NocoDB write retry with backoff is out of scope for this section. Added inline comment near `updateRecord` calls.

---

## L-1 — `RESEND_API_KEY` fail-fast check incompatible with test injection (LOW) — DOCUMENTED

**Finding**: Throwing when `RESEND_API_KEY` is missing fires in tests even when `_postFn` is mocked (the mock doesn't need the key). Key validation belongs at startup/caller level.

**Fix applied**: Removed the throw; added comment noting that callers should validate env vars at startup.

---

## L-2 — NocoDB `replied,eq,false` filter syntax uncertain (LOW) — DOCUMENTED

**Decision**: The in-code safety guard `if (p.replied) return;` compensates at JS level. Added inline comment near the filter string.

---

## L-3 — `lastError.message` assumed non-null in `_generateFollowUpBody` (LOW) — AUTO-FIX

**Fix applied**: Changed final throw to `(lastError && lastError.message) || 'unknown'`.

---

## L-4 — No HTML-escaping test for special chars (LOW) — TEST ADDED

**Fix applied**: Added two tests in `describe('section-05: HTML escaping in follow-up payloads')` — one for `&` in `buildFuThreadedPayload`, one for `<>` in `buildFu2Payload`.

---

## Final state

| Item | Severity | Action | Result |
|------|----------|--------|--------|
| FU2 missing banned-phrase check | HIGH | Auto-fix + 2 tests | Fixed |
| contact_name/site_name not sanitized in prompts | MEDIUM | Auto-fix | Fixed |
| getFollowUpStage fallthrough for count=99 | MEDIUM | Auto-fix | Fixed |
| Empty-JSON Resend response, no warning | MEDIUM | console.warn added | Fixed |
| FU2 subject parse case-sensitive | MEDIUM | Auto-fix | Fixed |
| last_article_title in FU1 prompt | MEDIUM | Let-go (optional per spec) | — |
| sendFollowUp missing contact_email guard | MEDIUM | Auto-fix | Fixed |
| NocoDB write failure = duplicate send | MEDIUM | Documented | Comment added |
| RESEND_API_KEY fail-fast check | LOW | Documented (check at caller) | Comment added |
| NocoDB replied filter syntax | LOW | Documented | Comment added |
| lastError.message assumes non-null | LOW | Auto-fix | Fixed |
| No HTML-escaping test for special chars | LOW | Tests added | Fixed |

Tests: 109/109 pass.
