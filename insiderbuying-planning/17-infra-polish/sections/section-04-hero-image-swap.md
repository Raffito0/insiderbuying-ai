# Section 04 — Hero Image Swap (fal.ai → Template 13)

## Overview

Rewrite `generateHeroImage()` in `generate-image.js` to call `templates.renderTemplate(13, data)` from `visual-templates.js` and upload the resulting buffer to Cloudflare R2, replacing the existing fal.ai Flux async job path. `generateOgCard()` is not touched. No callers of `generateHeroImage()` change — the function signature stays the same.

**File to modify:** `n8n/code/insiderbuying/generate-image.js`

**Dependencies:** None. This section is fully parallelizable with all others.

---

## Tests First

Test file: `n8n/tests/generate-image.test.js` (create or update)

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
```

### generateHeroImage — test stubs

**T1 — calls renderTemplate(13, ...) with correct fields**
Mock `templates.renderTemplate` to record call arguments. Pass a minimal article object with `headline`, `ticker`, `verdict`, `insiderName`, `date`, `slug`. Assert `renderTemplate` was called with `13` as first arg and that the data object contains all five fields above.

**T2 — uploads buffer to R2 with correct key**
Mock `uploadToR2` to capture the key argument. Assert the key is `hero-${article.slug}.png`. Assert `uploadToR2` received the buffer returned by `renderTemplate`.

**T3 — returns the R2 URL string**
Mock `uploadToR2` to return `'https://r2.example.com/hero-test.png'`. Assert `generateHeroImage(article)` resolves to that URL string.

**T4 — guard: throws if renderTemplate is not a function**
Pass `templates = {}` (no `renderTemplate` method). Assert the function throws with a message containing `'renderTemplate not found'`.

**T5 — no fal.ai calls**
Mock a spy on any function containing `queue.fal.run`. Assert it is never called during `generateHeroImage()`. Alternatively, assert no `fetch` call is made to a URL matching `queue.fal.run`.

### generateOgCard — regression test stub

**T6 — still calls screenshot server**
Mock the screenshot server HTTP call. Assert `generateOgCard()` calls the screenshot server endpoint (not `renderTemplate`). Assert `renderTemplate` is NOT called.

### Static check (run in CI, not node:test)

```bash
grep -ri "queue.fal.run" n8n/code/insiderbuying/generate-image.js
# expected: 0 matches within the generateHeroImage function
```

---

## Implementation

### Pre-check: Does Template 13 exist?

Before writing any code, open `n8n/code/insiderbuying/visual-templates.js` and search for the template registered as `13` (or `'13'`). If Template 13 does not exist, add it first — see the Template 13 spec below.

### Template 13 spec (add if missing)

Template 13 is the "Article Hero" template. Dimensions: **1200 × 630 px**.

Visual layout:
- Dark navy background
- Abstract financial pattern (subtle lines/grid) in background
- Ticker badge with verdict color accent (top-left or prominent area)
- Headline text (large, white or near-white)
- EarlyInsider logo bottom-right

The data object passed to `renderTemplate(13, data)` must include:

| Field | Source |
|-------|--------|
| `headline` | `article.headline` or `article.title` |
| `ticker` | `article.ticker` |
| `verdict` | `article.verdict` (used for badge accent color) |
| `insiderName` | `article.insiderName` or `article.insider_name` |
| `date` | `article.date` or `article.published_at` |

Map `article` fields to these keys inside `generateHeroImage()` before calling `renderTemplate`.

### Rewriting generateHeroImage()

Replace the current function body with:

1. **Guard check** — verify `templates` is imported and `renderTemplate` is callable:
   ```
   if (!templates || typeof templates.renderTemplate !== 'function') {
     throw new Error('visual-templates.js renderTemplate not found');
   }
   ```

2. **Build data object** — map article fields to the five required keys (headline, ticker, verdict, insiderName, date).

3. **Render** — call `templates.renderTemplate(13, data)`. This returns a Buffer (PNG/JPEG).

4. **Upload** — call `uploadToR2(buffer, `hero-${article.slug}.png`)`. The `uploadToR2` helper already exists in `generate-image.js` (used by `generateOgCard`). Re-use it as-is.

5. **Return** the R2 URL string returned by `uploadToR2`.

The function signature is unchanged:
```
async function generateHeroImage(article) { ... }
```

### What NOT to change

- `generateOgCard()` — leave completely untouched.
- The `uploadToR2()` helper — do not modify.
- Any caller of `generateHeroImage()` — the function contract (takes article, returns URL) is preserved.

### FAL_KEY cleanup

After rewriting `generateHeroImage()`, grep the entire `n8n/code/insiderbuying/` directory for remaining fal.ai references:

```bash
grep -ri "queue.fal.run\|fal-ai\|FAL_KEY\|fal\.run" n8n/code/insiderbuying/
```

- If `FAL_KEY` appears **only** in `generate-image.js` and nowhere else: remove it from `.env.example`.
- If `FAL_KEY` appears in **any other file**: keep it in `.env.example` with a comment noting which file(s) still use it.
- Do NOT remove `FAL_KEY` from `.env.example` until the grep confirms zero other usages.

---

## Definition of Done

- [ ] `generateHeroImage()` calls `templates.renderTemplate(13, data)` — not `queue.fal.run`
- [ ] Template 13 exists in `visual-templates.js`
- [ ] Guard throws a descriptive error if `renderTemplate` is not a function
- [ ] R2 key is `hero-${article.slug}.png`
- [ ] `generateOgCard()` is unchanged and T6 passes
- [ ] `grep -ri "queue.fal.run" n8n/code/insiderbuying/generate-image.js` within hero-related code = 0 matches
- [ ] `FAL_KEY` removed from `.env.example` if no other callers remain (or kept with comment if other callers exist)
- [ ] All six tests pass: `node --test n8n/tests/generate-image.test.js`
