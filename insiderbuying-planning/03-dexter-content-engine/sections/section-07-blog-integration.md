# Section 7: Blog Integration (Next.js Site)

## Context

The EarlyInsider site (Next.js on Netlify) has empty `/blog` and `/blog/[slug]` routes. These need to fetch articles from NocoDB and render them with proper SEO. The site runs on Netlify, NOT on the VPS — so NocoDB access requires API proxy routes to keep the NocoDB URL server-side only (Option B from the plan). A read-only NocoDB API token is used for Next.js (Viewer role), separate from the n8n write token.

This section covers:
- `/blog` listing page (SSR + ISR)
- `/blog/[slug]` detail page (SSR + ISR)
- `/api/articles` and `/api/articles/[slug]` proxy routes
- `/api/revalidate` endpoint for on-demand ISR
- SEO integration with `next-seo`
- Related Articles component from JSON field
- Input validation and query sanitization

---

## Implementation

### API Proxy Routes

#### `/api/articles` (GET)

Proxies to NocoDB for the article listing. Keeps `NOCODB_API_URL` and `NOCODB_READONLY_TOKEN` server-side only.

Request handling:
- Accept query params: `blog` (default: 'insiderbuying'), `page` (default: 1), `verdict_type` (optional filter), `sector` (optional filter), `ticker` (optional search)
- **Input validation / query sanitization**: All filter parameters must be sanitized before passing to NocoDB query string. Prevent NocoDB query injection by:
  - Allowlisting `verdict_type` values: only `BUY`, `SELL`, `CAUTION`, `WAIT`, `NO_TRADE`
  - Allowlisting `blog` values: only `insiderbuying`, `deepstockanalysis`, `dividenddeep`
  - Sanitizing `ticker` search: strip non-alphanumeric characters, uppercase, max 5 chars
  - Sanitizing `sector`: strip special characters, max 50 chars
  - Reject any parameter containing NocoDB query operators (`~and`, `~or`, `~not`, parentheses)

NocoDB query construction:
- Base filter: `(blog,eq,{blog})~and(status,eq,published)`
- Optional filters appended: `~and(verdict_type,eq,{verdict_type})`, `~and(sector,eq,{sector})`, `~and(ticker,like,{ticker})`
- Sort: `-published_at` (newest first)
- Pagination: `limit=12&offset={(page-1)*12}`
- **Important field selection**: `?fields=id,title,slug,hero_image_url,verdict_type,ticker,meta_description,published_at,word_count,key_takeaways` — do NOT fetch `body_html` for the listing page (it's massive and not needed for cards)

Response: pass through NocoDB response with article array and pagination info.

#### `/api/articles/[slug]` (GET)

Proxies to NocoDB for a single article by slug.

NocoDB query:
- `GET {NOCODB_API_URL}/Articles?where=(slug,eq,{slug})~and(status,eq,published)&limit=1`
- Returns full article including `body_html`

Response:
- 200 with article data if found
- 404 if no article matches the slug

**Slug sanitization**: Strip any characters that aren't alphanumeric, hyphens, or underscores. Max length 200 chars.

#### `/api/revalidate` (POST)

On-demand ISR revalidation endpoint. Called by n8n (W2) after article publish to update specific pages without full Netlify rebuild.

Request:
- Query params: `secret` (required), `slug` (required)
- Validates `secret` against `REVALIDATION_SECRET` env var

Behavior:
- If secret is invalid or missing: return 401
- If valid: call `res.revalidate(`/blog/${slug}`)` + `res.revalidate('/blog')` to update both the article page and the blog index
- Return 200 on success

This replaces full Netlify rebuild webhooks. Updates only the specific article page + /blog index in milliseconds.

#### NocoDB Access Security

- Create a **read-only NocoDB API token** (Viewer role) specifically for Next.js. Do NOT reuse the n8n write token.
- The read-only token can GET but cannot POST/PATCH/DELETE
- `NOCODB_API_URL`, `NOCODB_READONLY_TOKEN`, and `REVALIDATION_SECRET` stored as Netlify environment variables

### `/blog` Page (Article Listing)

Server-Side Rendering with Incremental Static Regeneration:
- `revalidate: 300` (every 5 minutes)
- Fetches from `/api/articles` with current page and filters

Page components:
- **Article card grid**: each card shows hero image, title, verdict badge (color-coded), ticker symbol, date, word count, first key takeaway
- **Filter bar**: verdict type dropdown, sector dropdown, ticker search input
- **Pagination**: page numbers with Previous/Next links

### `/blog/[slug]` Page (Article Detail)

Server-Side Rendering with Incremental Static Regeneration:
- `revalidate: 600` (every 10 minutes)
- Fetches single article by slug from `/api/articles/[slug]`

Page components:

1. **Key Takeaways box** (styled, positioned above article body)
   - Rendered from `key_takeaways` JSON array (3-4 items)

2. **Article body** rendered via `dangerouslySetInnerHTML`
   - Safe because HTML is pre-sanitized at write time (W2 Step 8.5 sanitizes with allowlisted tags/attrs)

3. **Verdict section**
   - `verdict_type` badge (color-coded: BUY=green, SELL=red, CAUTION=amber, WAIT=blue, NO_TRADE=gray)
   - `verdict_text` paragraph

4. **Author card**
   - Displays `author_name` (either "Ryan Cole" or "Dexter Research" depending on blog)
   - Author bio/avatar

5. **Table of Contents**
   - Generated client-side from H2 headings found in `body_html`
   - Anchor links to each section

6. **Reading time estimate**
   - Calculated from `word_count / 200` (rounded up to nearest minute)

7. **Share buttons**
   - X (Twitter), LinkedIn, Copy link
   - Share URL = canonical article URL

8. **Newsletter signup CTA**
   - Positioned at bottom of article
   - Non-intrusive design (not a modal/popup)

9. **Related Articles section**
   - Rendered from `related_articles` JSON field (parsed from LongText)
   - Displays up to 4 related articles as cards with: verdict badge, title, meta_description, link to `/blog/{slug}`
   - If `related_articles` is null/empty, section is hidden

### SEO Integration (next-seo)

#### `/blog/[slug]` page:

**ArticleJsonLd** component:
- `authorName`: from article `author_name`
- `datePublished`: from article `published_at`
- `publisherName`: "EarlyInsider"
- `publisherLogo`: EarlyInsider logo URL
- `images`: `[hero_image_url]`
- `description`: from article `meta_description`

**NextSeo** component:
- `title`: article `title`
- `description`: article `meta_description`
- `canonical`: `https://earlyinsider.com/blog/{slug}`
- `openGraph.images`: `[{ url: og_image_url, width: 1200, height: 630 }]`
- `openGraph.type`: 'article'
- `openGraph.article.publishedTime`: `published_at`

#### Sitemap:

next-sitemap generates sitemap including all article slugs. Configuration in `next-sitemap.config.js` to fetch all published article slugs from NocoDB at build time.

### Netlify Environment Variables

```
NOCODB_API_URL=https://nocodb.earlyinsider.com/api/v1/db/data/noco/EarlyInsider/EarlyInsider
NOCODB_READONLY_TOKEN=<read-only token, Viewer role>
REVALIDATION_SECRET=<random secret string for /api/revalidate>
```

---

## Tests (TDD)

Next.js tests via vitest with mock NocoDB responses. API route tests via supertest or direct handler invocation.

```
# Test: /api/articles proxy — returns list of articles from NocoDB with correct fields (no body_html)
# Test: /api/articles proxy — filters by blog, status=published, sorted by published_at DESC
# Test: /api/articles proxy — pagination with limit=12 and offset
# Test: /api/articles/[slug] proxy — returns single article with body_html
# Test: /api/articles/[slug] proxy — 404 for non-existent slug
# Test: /api/revalidate — valid secret token triggers revalidation, returns 200
# Test: /api/revalidate — invalid/missing secret returns 401
# Test: /blog page — renders article cards with title, verdict badge, ticker, date
# Test: /blog page — filter by verdict type returns filtered results
# Test: /blog/[slug] page — renders article body_html, key takeaways, verdict, author card
# Test: /blog/[slug] page — Related Articles section rendered from related_articles JSON
# Test: /blog/[slug] page — ArticleJsonLd present with correct author, datePublished, publisher
# Test: /blog/[slug] page — OG meta tags match article title, meta_description, og_image_url
# Test: NocoDB read-only token — cannot POST/PATCH via the proxy routes
# Test: Input validation — ticker search filter sanitized (no NocoDB query injection)
```

---

## Acceptance Criteria

1. `/api/articles` returns paginated article list (12 per page) with field selection (no `body_html`), filtered by blog + status=published, sorted newest first
2. `/api/articles` supports optional filters: verdict_type (allowlisted), sector (sanitized), ticker (alphanumeric only, max 5 chars)
3. `/api/articles/[slug]` returns full article with body_html, or 404 for non-existent slugs
4. `/api/revalidate` validates secret token (401 if invalid), triggers on-demand ISR for the specific slug + /blog index page
5. `/blog` page renders article card grid with hero images, verdict badges, tickers, dates, word counts, and first key takeaway
6. `/blog` page has filter bar (verdict type dropdown, sector dropdown, ticker search) and pagination
7. `/blog/[slug]` page renders: body_html (dangerouslySetInnerHTML), Key Takeaways box, Verdict section with color-coded badge, Author card, Table of Contents from H2 headings, reading time, share buttons, newsletter CTA
8. `/blog/[slug]` Related Articles section renders from `related_articles` JSON field (not from body_html), hidden when empty
9. `ArticleJsonLd` and `NextSeo` components present on article pages with correct metadata
10. Read-only NocoDB token used for all Next.js queries (cannot write)
11. All query parameters sanitized against NocoDB injection (no `~and`, `~or`, parentheses pass through)
12. ISR configured: /blog revalidates every 5 minutes, /blog/[slug] every 10 minutes
