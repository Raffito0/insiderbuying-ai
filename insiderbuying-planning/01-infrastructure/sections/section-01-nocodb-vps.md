# Section 01: NocoDB + PostgreSQL on VPS

## Objective
Deploy NocoDB with PostgreSQL backend on the Hostinger VPS (72.62.61.93) via docker-compose. Create all 12 database tables. Verify n8n can connect via Docker internal network.

## Context
The VPS already runs:
- n8n (Docker, at `/docker/n8n/docker-compose.yml`)
- Traefik reverse proxy (at `/root/docker-compose.yml`, network `root_default`)

NocoDB will join the same Traefik network for HTTPS access and the same Docker network as n8n for internal API calls.

## Implementation

### 1. Docker-compose file
Create `/docker/nocodb/docker-compose.yml` with:
- `nocodb` service: image `nocodb/nocodb:latest`
  - Environment: `NC_DB=pg://nocodb_db:5432?u=nocodb&p=<secure_password>&d=nocodb`
  - Environment: `NC_AUTH_JWT_SECRET=<random_64_char_string>`
  - Volume: `nocodb_data:/usr/app/data`
  - Traefik labels for HTTPS at `db.insiderbuying.ai` (or subdomain of choice)
  - Networks: `root_default` (external, Traefik) + internal network for PostgreSQL
- `nocodb_db` service: image `postgres:16`
  - Environment: `POSTGRES_USER=nocodb`, `POSTGRES_PASSWORD=<same_password>`, `POSTGRES_DB=nocodb`
  - Volume: `nocodb_pg:/var/lib/postgresql/data`
  - Only on internal network (not exposed to Traefik)
- Networks: declare `root_default` as external (`name: root_default`), create internal network

### 2. Deploy
SSH to VPS, create directory, copy docker-compose.yml, run `docker-compose up -d`. Verify both containers running with `docker ps`.

### 3. Create API token
Access NocoDB UI via HTTPS. Create an API token in NocoDB settings (Team & Auth → API Tokens). Store the token — it will be used by n8n and the setup script.

### 4. Create tables
Create all 12 tables via NocoDB REST API (or UI). For each table:

**Articles**: title (SingleLineText), slug (SingleLineText), meta_description (SingleLineText), body_html (LongText), key_takeaways (LongText), verdict_type (SingleSelect: BUY/SELL/CAUTION/WAIT/NO_TRADE), verdict_text (LongText), word_count (Number), primary_keyword (SingleLineText), secondary_keywords (SingleLineText), article_type (SingleSelect: A/B/C/D), target_length (SingleSelect: short/medium/long), ticker (SingleLineText), company_name (SingleLineText), sector (SingleLineText), author_name (SingleLineText), hero_image_url (URL), og_image_url (URL), status (SingleSelect: draft/review/published), published_at (DateTime), dexter_analysis (LongText), financial_data (LongText), filing_citations_count (Number), data_tables_count (Number), confidence_notes (LongText)

**Keywords**: keyword (SingleLineText), secondary_keywords (SingleLineText), search_volume (Number), keyword_difficulty (Number), intent_type (SingleSelect: A/B/C/D), ticker (SingleLineText), company_name (SingleLineText), status (SingleSelect: new/assigned/used/exhausted), priority_score (Number), last_checked (DateTime), source (SingleSelect: dataforseo/manual)

**Data_Studies**: title (SingleLineText), study_type (SingleLineText), data_period (SingleLineText), key_findings (LongText), methodology (LongText), charts_data (JSON), status (SingleSelect: draft/published), published_at (DateTime)

**Insider_Alerts**: ticker (SingleLineText), company_name (SingleLineText), insider_name (SingleLineText), insider_title (SingleLineText), transaction_type (SingleSelect: buy/sell), shares (Number), price_per_share (Number), total_value (Number), filing_date (DateTime), significance_score (Number), ai_analysis (LongText), cluster_id (SingleLineText), is_cluster (Checkbox), raw_data (JSON), status (SingleSelect: new/processed/delivered), delivered_at (DateTime)

**Outreach_Prospects**: name (SingleLineText), email (Email), website (URL), domain_authority (Number), type (SingleSelect: blogger/newsletter/podcast), relevance_score (Number), status (SingleSelect: found/contacted/replied/linked), notes (LongText)

**Outreach_Log**: email_type (SingleSelect: initial/followup), sent_at (DateTime), opened_at (DateTime), replied_at (DateTime), result (SingleSelect: no_reply/positive/negative/linked) — plus Link to Outreach_Prospects

**X_Engagement_Log**: tweet_id (SingleLineText), tweet_text (LongText), type (SingleSelect: post/reply), likes (Number), retweets (Number), replies (Number), impressions (Number), posted_at (DateTime) — plus Link to Articles

**Reddit_Log**: post_url (URL), subreddit (SingleLineText), comment_text (LongText), type (SingleSelect: value/mention), upvotes (Number), posted_at (DateTime), status (SingleSelect: drafted/approved/posted)

**Financial_Cache**: ticker (SingleLineText), data_type (SingleSelect: income/balance/cashflow/ratios/prices/insider/competitor), data_json (JSON), fetched_at (DateTime), expires_at (DateTime)

**Published_Images**: image_type (SingleSelect: hero/og), image_url (URL), prompt_used (LongText), created_at (DateTime) — plus Link to Articles

**Lead_Magnet_Versions**: month (SingleLineText), title (SingleLineText), pdf_url (URL), backtest_period (SingleLineText), key_stats (JSON), beehiiv_updated (Checkbox), created_at (DateTime)

**SEO_Rankings**: date (Date), position (Number), clicks (Number), impressions (Number), ctr (Number) — plus Link to Keywords

### 5. Verify n8n connectivity
In n8n, create a NocoDB credential:
- API URL: `http://nocodb:8080` (Docker internal)
- API Token: the token from step 3
Test with a simple NocoDB node that lists records from Articles table.

## Tests
```
# Test: NocoDB health endpoint responds (GET /api/v1/health → 200)
# Test: API token authentication works (GET /api/v2/meta/tables → 200 with table list)
# Test: All 12 tables exist (count tables from meta API)
# Test: Articles table has all expected fields (verify field names and types)
# Test: Link fields resolve (create test record in Articles + Published_Images, verify link)
# Test: JSON fields accept valid JSON (create record in Financial_Cache with data_json)
# Test: n8n NocoDB node lists tables successfully
```

## Acceptance Criteria
- [ ] NocoDB accessible via HTTPS (Traefik)
- [ ] PostgreSQL data persisted in Docker volume
- [ ] All 12 tables created with correct field types
- [ ] Link fields work between related tables
- [ ] n8n connects via Docker internal network
- [ ] API token stored securely
