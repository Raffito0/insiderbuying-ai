# Section 05 — VPS Docs, Reddit Cap, Sitemap

## Overview

Three small, independent tasks grouped together because none requires new modules or NocoDB tables. Each can be completed in under an hour. No inter-section dependencies — this section can be implemented any time.

Tasks:
- **A9** — Add VPS setup documentation to `.env.example`
- **A10** — Verify Reddit daily volume cap and add a unit test that enforces it
- **A11** — Remove the duplicate Next.js static sitemap and consolidate to `next-sitemap.config.js`

---

## Tests First

File: `n8n/tests/reddit-monitor.test.js` (add to existing test file)

### A10 — Reddit Volume Cap Test

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { SUBREDDIT_TONE_MAP } = require('../code/insiderbuying/reddit-monitor');

describe('Reddit volume cap', () => {
  it('SUBREDDIT_TONE_MAP daily limits sum to 10 or fewer', () => {
    const total = Object.values(SUBREDDIT_TONE_MAP)
      .reduce((sum, config) => sum + (config.dailyLimit ?? config.daily_limit ?? 0), 0);
    assert.ok(total <= 10, `Daily limit sum is ${total}, expected <= 10`);
  });
});
```

The exact field name (`dailyLimit` vs `daily_limit`) should match whatever is used in the existing `SUBREDDIT_TONE_MAP` structure — inspect the file before writing the test. The test guards against future edits that silently push the total above the safe cap.

### A11 — Manual Verification Checklist (no unit tests)

- [ ] `src/app/sitemap.ts` no longer exists in the repo
- [ ] `next.config.ts` contains the redirect `{ source: '/sitemap', destination: '/sitemap.xml', permanent: true }`
- [ ] `npm run build` completes without errors
- [ ] `public/sitemap.xml` exists after build
- [ ] No duplicate sitemap files exist (no `public/sitemap-0.xml` alongside `public/sitemap.xml` from a double-registration)

---

## A9 — VPS Setup Documentation

**File:** `.env.example`

**Change:** Add the following comment block near the top of the file, before or after existing infrastructure comments. No env var values change — this is documentation only.

```
# VPS Setup (run once on Hostinger VPS after provisioning):
# free -h  → must show >= 4GB RAM available
# Shared VPS services: Toxic or Nah n8n, InsiderBuying n8n, NocoDB
# If < 4GB: upgrade VPS tier or reduce via EXECUTIONS_DATA_PRUNE and EXECUTIONS_PROCESS_TIMEOUT
```

This is the complete A9 change. No code modifications, no n8n workflow changes.

---

## A10 — Reddit Volume Cap Verification

**File to read first:** `n8n/code/insiderbuying/reddit-monitor.js`

**What to check:** Locate `SUBREDDIT_TONE_MAP`. It is a constant (object or Map) that maps subreddit names to configuration objects. Each configuration object has a field representing the maximum daily comment count for that subreddit.

**Required action:**

1. Open `reddit-monitor.js` and confirm `SUBREDDIT_TONE_MAP` exists and is exported (either `module.exports.SUBREDDIT_TONE_MAP` or as part of `module.exports`). If it is not exported, export it so the test can import it.

2. Sum all daily limit values across all active subreddits. If the sum is already ≤ 10, no business logic change is needed.

3. If the sum exceeds 10, reduce the individual limits until the total is ≤ 10. The 8–10 comment cap was established in unit 13 to avoid Reddit rate-limiting and shadowban risk.

4. Add the unit test from the Tests section above to `n8n/tests/reddit-monitor.test.js`. This test runs automatically on `node --test n8n/tests/*.test.js` and will fail if a future edit pushes the total above 10.

**Definition of done for A10:**
- `SUBREDDIT_TONE_MAP` is exported from `reddit-monitor.js`
- Sum of all daily limits ≤ 10
- Unit test passes

---

## A11 — Sitemap Deduplication

**Background:** Two sitemap systems currently coexist. The Next.js App Router file (`src/app/sitemap.ts`) produces a static sitemap baked into the build output. The `next-sitemap.config.js` plugin produces a dynamic sitemap with robots.txt and is the correct long-term solution. Having both active causes duplicate sitemap registrations and potential Google Search Console conflicts.

### Step 1 — Delete the static sitemap file

```
src/app/sitemap.ts
```

Delete this file entirely. No replacement needed — `next-sitemap.config.js` handles sitemap generation.

### Step 2 — Update `next.config.ts`

Make the following changes in `next.config.ts`:

**Check for `output: 'export'`:** If this key is present in the config, add an inline comment:
```typescript
// WARNING: output: 'export' is incompatible with next-sitemap dynamic generation.
// If static export is required, switch to next-sitemap's staticSitemapPaths option.
```
Do not remove `output: 'export'` if it exists — just flag it.

**Check for `generateSitemaps()` override:** If this function is defined anywhere in the config, remove it. It conflicts with next-sitemap's registration.

**Add the `/sitemap` redirect** to the `redirects()` array (create the function if it doesn't exist):
```typescript
async redirects() {
  return [
    {
      source: '/sitemap',
      destination: '/sitemap.xml',
      permanent: true,
    },
  ];
},
```
If a `redirects()` function already exists, append the new entry to the returned array.

**Add a clarifying comment** near the top of the config object or near the redirects:
```typescript
// next-sitemap.config.js is the single sitemap source — do not add App Router sitemap.ts
```

### Step 3 — Verify the build

Run locally:
```bash
npm run build
```

Confirm:
- Build completes without errors
- `public/sitemap.xml` exists
- No second sitemap file exists (e.g., `public/sitemap-0.xml` from a duplicate registration)
- `public/robots.txt` is present and references `sitemap.xml` (generated by next-sitemap)

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `.env.example` | Modify | Add VPS setup comment block (A9) |
| `n8n/code/insiderbuying/reddit-monitor.js` | Possibly modify + export | Ensure `SUBREDDIT_TONE_MAP` is exported; reduce limits if sum > 10 (A10) |
| `n8n/tests/reddit-monitor.test.js` | Modify (add test) | Add daily limit sum assertion (A10) |
| `src/app/sitemap.ts` | Delete | Remove duplicate Next.js App Router sitemap (A11) |
| `next.config.ts` | Modify | Add `/sitemap` redirect, remove `generateSitemaps()` if present, add comment (A11) |

---

## No Dependencies

This section has no dependencies on other sections in this unit. It can be implemented in any order or in parallel with sections 01–04 and 06.

No NocoDB tables are required. No new environment variables are added (`.env.example` gains a comment, not a new variable). No npm packages are added.
