# Section 1: NocoDB Setup & Table Schema

## Context

NocoDB replaces Airtable (1000 API calls/month too restrictive). Docker compose exists on VPS but is not started. NocoDB runs on the same Docker network as n8n — localhost access, zero latency, no rate limits.

All content data lives in NocoDB (self-hosted PostgreSQL on the same VPS as n8n). The site (Next.js on Netlify) reads articles via NocoDB's REST API.

## Implementation

### Start NocoDB

`docker-compose up -d` on VPS. Create a project called `EarlyInsider`.

### Create 4 Tables

#### Keywords Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| keyword | Text | Target keyword |
| ticker | Text | Extracted ticker symbol |
| blog | Text | 'insiderbuying' / 'deepstockanalysis' / 'dividenddeep' |
| article_type | SingleSelect | A / B / C / D |
| search_volume | Number | Monthly search volume |
| difficulty | Number | 0-100 keyword difficulty |
| cpc | Decimal | Cost per click |
| intent_multiplier | Decimal | A=1.0, B=1.2, C=0.8, D=0.9 |
| priority_score | Decimal | Computed: volume * (1 - difficulty/100) * intent_multiplier |
| secondary_keywords | LongText | JSON array of related keywords |
| status | SingleSelect | new / used / skipped / in_progress / invalid_ticker |
| updated_at | DateTime | Auto-updated on every write (for lock timeout) |
| created_at | DateTime | Auto |
| used_at | DateTime | Set when W2 picks this keyword |

#### Articles Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| slug | Text | URL-friendly, unique index |
| title | Text | 55-65 chars |
| meta_description | Text | 140-155 chars |
| body_html | LongText | Full article HTML |
| verdict_type | SingleSelect | BUY / SELL / CAUTION / WAIT / NO_TRADE |
| verdict_text | LongText | Verdict paragraph |
| key_takeaways | LongText | JSON array of 3-4 strings |
| word_count | Number | |
| primary_keyword | Text | |
| secondary_keywords_used | LongText | JSON array |
| data_tables_count | Number | |
| filing_citations_count | Number | |
| confidence_notes | LongText | |
| ticker | Text | |
| sector | Text | |
| company_name | Text | |
| blog | Text | insiderbuying / deepstockanalysis / dividenddeep |
| hero_image_url | URL | R2 permanent URL |
| og_image_url | URL | R2 permanent URL |
| author_name | Text | |
| status | SingleSelect | published / draft / error |
| quality_gate_pass | Checkbox | |
| related_articles | LongText | JSON array of linked article IDs |
| published_at | DateTime | |
| created_at | DateTime | Auto |

#### Financial_Cache Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| ticker | Text | Indexed |
| data_type | SingleSelect | income_stmt / balance_sheet / cash_flow / ratios / insider_trades / prices / competitors / transcripts / news |
| data_json | LongText | Raw API response JSON |
| fetched_at | DateTime | |
| expires_at | DateTime | fetched_at + 24h |

Composite unique index on `(ticker, data_type)` — upsert on refresh.

#### Published_Images Table
| Field | Type | Notes |
|-------|------|-------|
| id | Auto-increment PK | |
| article_id | Link to Articles | |
| image_type | SingleSelect | hero / og |
| r2_url | URL | Permanent CDN URL |
| prompt_used | LongText | For hero images |
| created_at | DateTime | Auto |

### Database Indexes

Add these indexes after table creation for query performance:

- **Keywords**: composite index on `(status, priority_score DESC, blog)` — used by W2 keyword picker
- **Articles**: composite index on `(status, published_at DESC, blog)` — used by /blog listing
- **Articles**: composite index on `(ticker, sector)` — used by W13 related articles finder
- **Financial_Cache**: composite unique index on `(ticker, data_type)` — for upsert operations

### NocoDB API Pattern for n8n Code Nodes

All n8n Code nodes access NocoDB via REST:
- Base URL: `http://nocodb:8080/api/v1/db/data/noco/EarlyInsider/EarlyInsider`
- Auth header: `xc-auth: <NOCODB_API_TOKEN>`
- CRUD: standard REST (GET list, GET by ID, POST create, PATCH update)
- Filter: `?where=(status,eq,new)~and(blog,eq,insiderbuying)`
- Sort: `?sort=-priority_score`
- Limit: `?limit=1`

Store `NOCODB_API_TOKEN` and `NOCODB_BASE_URL` as n8n environment variables.

### Read-Only Token

Create a **read-only NocoDB API token** (Viewer role) specifically for the Next.js site. Do NOT reuse the n8n write token. This token will be stored as `NOCODB_READONLY_TOKEN` in Netlify environment variables.

### NocoDB Access from Netlify

The Next.js site runs on Netlify, not on the VPS. To access NocoDB:
- **Option A**: Expose NocoDB via Traefik reverse proxy (e.g., `nocodb.earlyinsider.com`) — simple but security risk
- **Option B**: Create Next.js API routes `/api/articles` and `/api/articles/[slug]` that proxy to NocoDB — keeps NocoDB URL server-side only
- **Recommended**: Option B — more secure, allows input validation and caching, NocoDB stays unexposed

Add `NOCODB_API_URL`, `NOCODB_READONLY_TOKEN`, and `REVALIDATION_SECRET` to Netlify environment variables.

## Tests (TDD)

All tests run against the live NocoDB instance on the VPS after docker-compose up.

```
# Test: NocoDB Docker container starts and API responds at http://nocodb:8080/api/v1/health
# Test: Create Keywords table via API, verify all 15 fields exist with correct types
# Test: Create Articles table via API, verify all 25 fields exist
# Test: Create Financial_Cache table with composite unique index on (ticker, data_type)
# Test: Upsert to Financial_Cache: insert then update same (ticker, data_type) — verify update replaces, doesn't duplicate
# Test: Keywords composite index exists: query with status + priority_score sort + blog filter returns results in <50ms
# Test: Articles composite index exists: query with status + published_at sort + blog filter returns results in <50ms
# Test: NocoDB API token auth: request without token returns 401, with token returns 200
# Test: Read-only token: can GET but cannot POST/PATCH/DELETE
```

### Test Implementation Notes

- **Health check test**: `curl http://nocodb:8080/api/v1/health` must return 200 with JSON body
- **Schema verification tests**: After creating each table, GET the table metadata endpoint and assert field count + field types match the schema above
- **Upsert test**: INSERT a row with `(ticker='TEST', data_type='income_stmt')`, then INSERT again with same key but different `data_json` — verify only 1 row exists with the updated data
- **Index performance tests**: Insert 1000 dummy rows into Keywords, then time a filtered+sorted query — must complete in <50ms
- **Auth tests**: Make the same GET request with and without the `xc-auth` header, assert 401 vs 200
- **Read-only token test**: Attempt POST with the read-only token — must return 403 or equivalent error

## Acceptance Criteria

1. NocoDB Docker container is running and accessible at `http://nocodb:8080` from n8n's Docker network
2. All 4 tables (Keywords, Articles, Financial_Cache, Published_Images) exist with exact schemas as defined above
3. All 4 database indexes are created and verified via query performance
4. Composite unique index on Financial_Cache `(ticker, data_type)` prevents duplicates and supports upsert
5. Write API token works for full CRUD from n8n Code nodes
6. Read-only API token works for GET only from the Next.js site
7. NocoDB filter/sort/limit query syntax is verified working (the `?where=` pattern)
8. All 9 test stubs pass
