<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: node --test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-nocodb-setup
section-02-dexter-research
section-03-keyword-selection
section-04-article-generation
section-05-image-generation
section-06-cross-linking
section-07-blog-integration
section-08-e2e-monitoring
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-nocodb-setup | - | all | Yes |
| section-02-dexter-research | 01 | 04 | Yes |
| section-03-keyword-selection | 01 | 04 | Yes |
| section-04-article-generation | 01, 02, 03 | 05, 06, 07 | No |
| section-05-image-generation | 01, 04 | 08 | Yes |
| section-06-cross-linking | 01, 04 | 08 | Yes |
| section-07-blog-integration | 01 | 08 | Yes |
| section-08-e2e-monitoring | all | - | No |

## Execution Order

1. section-01-nocodb-setup (foundation, no dependencies)
2. section-02-dexter-research, section-03-keyword-selection (parallel after 01)
3. section-04-article-generation (after 02 AND 03)
4. section-05-image-generation, section-06-cross-linking, section-07-blog-integration (parallel after 04)
5. section-08-e2e-monitoring (final, after all)

## Section Summaries

### section-01-nocodb-setup
Start NocoDB Docker, create project and 4 tables (Keywords, Articles, Financial_Cache, Published_Images), add indexes, create read-only token for Next.js.

### section-02-dexter-research
Build the Dexter n8n sub-workflow: Financial Datasets API calls (7 parallel), cache layer, price data aggregation, LLM pre-analysis, webhook response. Code file: `dexter-research.js`.

### section-03-keyword-selection
Build W1 n8n workflow: DataForSEO integration, seed keyword generation per blog, intent classification, priority scoring, dedup, NocoDB write. Code file: `select-keyword.js`. Includes manual fallback mode.

### section-04-article-generation
Build W2 n8n workflow: keyword picker with lock timeout, ticker extraction + validation, Dexter call, Claude Tool Use API call, 14-point quality gate, HTML sanitization, slug uniqueness, sequential downstream triggers (W12 wait, W13 wait, revalidate, Google Indexing), Telegram alerts. Code file: `generate-article.js`.

### section-05-image-generation
Build W12 n8n workflow: Nano Banana Pro hero image, screenshot server OG card with HTML template, R2 upload, NocoDB update. Code file: `generate-image.js`. Webhook responds only when complete.

### section-06-cross-linking
Build W13 n8n workflow: related articles query, Cheerio-based inline link injection (with safety checks), related_articles JSON field population, NocoDB PATCH for bidirectional links. Code file: `cross-link.js`. Webhook responds only when complete.

### section-07-blog-integration
Wire Next.js /blog and /blog/[slug] pages to NocoDB: API proxy routes with read-only token, /api/revalidate endpoint, ArticleJsonLd via next-seo, article card rendering, filters, pagination, Related Articles component from JSON field.

### section-08-e2e-monitoring
Full pipeline end-to-end test, schedule verification (3x/day), Telegram monitoring setup, cost tracking, error recovery validation.
