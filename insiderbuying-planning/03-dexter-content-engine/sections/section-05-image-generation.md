# Section 5: W12 — Featured Image Generation

## Context

Each article needs two images: a hero image (AI-generated financial visualization) and an OG card (branded card for social sharing). Both are stored permanently on Cloudflare R2. W12 is a sub-workflow called by W2 (Article Generation) after the article is written to NocoDB. W2 waits for W12 to complete before proceeding to W13 (cross-linking), so the webhook response is critical.

W12 uses:
- **Nano Banana Pro** (kie.ai) for AI-generated hero images
- **Screenshot server** (`host.docker.internal:3456`) for OG card rendering
- **Cloudflare R2** for permanent storage (same bucket/pattern as Toxic or Nah content library)

Code file: `n8n/code/insiderbuying/generate-image.js`
Workflow file: `n8n/workflows/insiderbuying/w12-image-generation.json`

---

## Implementation

### Workflow Design

**Trigger**: Webhook (called by W2 with `{ article_id }`)

**Critical**: The webhook MUST have "Respond to Webhook" set to "When Last Node Finishes" so W2 actually waits for completion. Otherwise n8n fires-and-forgets and W2's Step 11 races ahead.

### Step 1: Fetch Article

GET article from NocoDB by ID. Extract: `title`, `ticker`, `verdict_type`, `key_takeaways[0]`, `blog`, `slug`, `company_name`.

NocoDB API pattern:
- `GET {NOCODB_BASE_URL}/Articles/{article_id}`
- Auth header: `xc-auth: {NOCODB_API_TOKEN}`

### Step 2: Generate Hero Image

POST to Nano Banana Pro (kie.ai) API:
- Prompt: `"Professional financial data visualization for {ticker} {company_name}, showing {verdict_type.toLowerCase()} sentiment. Navy blue background (#002A5E), clean modern style, stock chart elements, no text overlay. 1200x630."`
- Use existing kie.ai API key (`KIE_API_KEY` env var)
- Wait for generation (poll if async — kie.ai uses async task API like the hook generator)

### Step 3: Generate OG Card

POST to screenshot server (`http://host.docker.internal:3456`):

HTML template contents:
- **EarlyInsider logo** (top left)
- **Verdict badge** (color-coded):
  - BUY = green
  - SELL = red
  - CAUTION = amber
  - WAIT = blue
  - NO_TRADE = gray
- **Article title** (Montaga font, white text on navy background)
- **Ticker symbol** (large, Space Mono font)
- **First key takeaway** (truncated to 1 line)
- **URL**: earlyinsider.com

Screenshot server configuration:
- Viewport: 1200x630
- Output format: PNG

**HTML escape requirement**: Company names with special characters (e.g., "AT&T") must be properly HTML-escaped in the template to prevent rendering breakage.

### Step 4: Upload to R2

Upload both images to Cloudflare R2:
- Hero path: `earlyinsider/images/{slug}_hero.png`
- OG path: `earlyinsider/images/{slug}_og.png`
- Public URLs via R2 public bucket URL (`R2_PUBLIC_URL` env var)

Use the same R2 upload pattern as the Toxic or Nah content library:
- S3 API with AWS Sig V4
- Built-in `require('crypto')` module for signing
- Env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_URL`

### Step 5: Update NocoDB

Two NocoDB writes:

1. **PATCH Articles record**: update `hero_image_url` and `og_image_url` fields with the R2 public URLs
   - `PATCH {NOCODB_BASE_URL}/Articles/{article_id}`

2. **POST Published_Images**: create two records (hero + og) linked to the article
   - Record 1: `{ article_id, image_type: 'hero', r2_url: hero_url, prompt_used: hero_prompt }`
   - Record 2: `{ article_id, image_type: 'og', r2_url: og_url, prompt_used: null }`

### Error Handling

- **Nano Banana Pro failure**: Skip hero image. Use a generic fallback image per verdict_type (pre-generated images stored on R2, one per verdict color). The article still publishes with a placeholder hero.
- **Screenshot server failure**: Retry once. If still fails, skip OG card entirely — Next.js generates a basic OG image via next-seo defaults.
- Both failures are non-fatal: the article publishes regardless. Log warnings to Telegram.

### Webhook Response

W12 MUST return a success JSON response so W2 knows it completed:
```json
{
  "success": true,
  "article_id": 123,
  "hero_image_url": "https://...",
  "og_image_url": "https://..."
}
```

On partial failure (e.g., hero skipped but OG succeeded), still return success with null for the missing URL. W2 only needs to know W12 finished, not that every image succeeded.

---

## Tests (TDD)

All tests for W12. n8n Code node tests run via `node` with mock data before embedding.

```
# Test: Article fetch — GET article by ID returns title, ticker, verdict_type, slug, key_takeaways
# Test: Nano Banana Pro — API call with prompt returns image binary (real API call with test prompt)
# Test: Nano Banana Pro failure — graceful fallback to generic verdict-colored placeholder image
# Test: OG card template — HTML renders correctly with title, ticker, verdict badge, key takeaway
# Test: OG card — screenshot server returns 1200x630 PNG
# Test: Screenshot server failure — retry once, then skip OG card (use next-seo default)
# Test: R2 upload — image uploaded to earlyinsider/images/{slug}_hero.png, returns public URL
# Test: R2 upload — image uploaded to earlyinsider/images/{slug}_og.png, returns public URL
# Test: NocoDB update — Articles record patched with hero_image_url and og_image_url
# Test: NocoDB update — Published_Images table gets 2 new records (hero + og)
# Test: HTML escape in OG template — company name "AT&T" doesn't break the template
# Test: Webhook response — W12 returns success JSON so W2 knows it completed
```

---

## Acceptance Criteria

1. W12 webhook accepts `{ article_id }` and returns success JSON after all steps complete
2. Hero image generated via Nano Banana Pro with correct prompt containing ticker, company name, and verdict sentiment
3. OG card generated via screenshot server at 1200x630 with verdict badge, title, ticker, first key takeaway, and EarlyInsider branding
4. Both images uploaded to R2 at `earlyinsider/images/{slug}_hero.png` and `earlyinsider/images/{slug}_og.png`
5. Articles record in NocoDB patched with `hero_image_url` and `og_image_url`
6. Published_Images table has 2 new records linked to the article (hero + og)
7. Nano Banana Pro failure falls back to generic verdict-colored placeholder without crashing
8. Screenshot server failure retries once, then skips gracefully
9. Company names with special characters (e.g., "AT&T") render correctly in OG template
10. W2 receives webhook response and knows W12 is done before proceeding to W13
