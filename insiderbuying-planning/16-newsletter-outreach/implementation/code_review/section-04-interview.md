# Code Review Interview — section-04: outreach-email-rewrite

## Summary

All fixes applied. 74/74 tests pass.

---

## H-1 — URL resolution used string concatenation (HIGH) — AUTO-FIX

**Finding**: `href = siteUrl + href` broke for protocol-relative (`//cdn.example.com/...`), relative paths (`../post`), and trailing-slash cases.

**Fix applied**: Replaced with `urlMod.resolve(siteUrl + '/blog', href)` (WHATWG-compatible resolution). Two regression tests added for protocol-relative and root-relative hrefs.

---

## H-2 — HTML injection in `buildSendPayload` (HIGH) — AUTO-FIX

**Finding**: AI-generated email body was injected raw into `<p>` tags without escaping. Any `<`, `>`, `&`, `"`, `'` in the AI output would produce broken or potentially malicious HTML.

**Fix applied**: Added `escapeHtml(line)` call inside `.map()` in `buildSendPayload`. Added `escapeHtml()` utility function at module top.

---

## H-3 — Social proof and opt-out not validated in `generateEmail` (HIGH) — AUTO-FIX

**Finding**: Spec required "1,500+" and "Reply 'stop'" to be validated as hard checks in the generation loop. The checks existed in `validateEmail()` but `generateEmail()` did not call it — only the retry tests exercised this path.

**Fix applied**: Added two explicit hard checks inside the `generateEmail` loop body:
```js
if (body.indexOf('1,500+') === -1) {
  throw new Error('Missing required social proof "1,500+"');
}
if (body.toLowerCase().indexOf("reply 'stop'") === -1) {
  throw new Error("Missing required CAN-SPAM opt-out \"Reply 'stop'\"");
}
```
These throw immediately (not retried) as they are prompt construction guarantees.

---

## M-1 — Redundant `require('url')` inside `_defaultFetch` (MEDIUM) — AUTO-FIX

**Finding**: `_defaultFetch` contained `var urlMod = require('url');` shadowing the top-level declaration added for `scrapeRecentArticle`. Harmless but confusing.

**Fix applied**: Removed the inner declaration; `_defaultFetch` now uses the module-level `urlMod`.

---

## M-2 — `maxRetries` renamed to `maxAttempts` (MEDIUM) — AUTO-FIX

**Finding**: Error message said "attempts" but variable was named `maxRetries` — inconsistent. Test was checking `/retries/i` which would match neither.

**Fix applied**: Renamed variable to `maxAttempts` throughout `generateEmail`. Updated test regex from `/retries/i` to `/attempts/i`.

---

## L-10 — No test for `generateEmail` without `_aiClient` (LOW) — TEST ADDED

**Finding**: Code threw "AI client not provided" but no test covered this path.

**Fix applied**: Added test in new `describe('section-04: generateEmail — no AI client', ...)` block.

---

## L-11 — URL edge case tests missing (LOW) — TESTS ADDED

**Finding**: `scrapeRecentArticle` URL resolution had no tests for protocol-relative (`//`) or root-relative (`/blog/...`) hrefs.

**Fix applied**: Added two tests in new `describe('section-04: scrapeRecentArticle URL edge cases', ...)` block.

---

## Final state

| Item | Severity | Action | Result |
|------|----------|--------|--------|
| URL resolution string concat | HIGH | Auto-fix + tests | Fixed |
| HTML injection in buildSendPayload | HIGH | Auto-fix | Fixed |
| Social proof / opt-out not validated in generateEmail | HIGH | Auto-fix | Fixed |
| Redundant `require('url')` in `_defaultFetch` | MEDIUM | Auto-fix | Fixed |
| `maxRetries` → `maxAttempts` rename | MEDIUM | Auto-fix + test update | Fixed |
| No test for generateEmail without _aiClient | LOW | Test added | Fixed |
| URL edge case tests missing | LOW | Tests added | Fixed |

Tests: 74/74 pass.
