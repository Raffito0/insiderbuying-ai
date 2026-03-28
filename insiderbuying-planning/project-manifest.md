# InsiderBuying.ai — Project Manifest

## Project Overview
Automated finance blog + SaaS alert system. InsiderBuying.ai tracks SEC Form 4 insider trading filings, generates AI-powered analysis articles, delivers real-time alerts to subscribers, and runs a complete marketing/outreach engine via 16 n8n workflows.

## Phase 1: Site Build (COMPLETED — units 01-07)

Units 01-07 built the full site and all 16 n8n workflows. 25 JS files, ~7650 lines, 515 tests passing.

## Phase 2: Content Engine Quality Upgrade (units 08-17)

130 quality gaps + 11 infrastructure changes + 27 tools/methodologies + 3 visual systems. Upgrades existing code from functional to production-grade.

## Timeline: ~3-4 hours (sequential /deep-implement, 20-40 min per unit)

## SPLIT_MANIFEST

```
08-nocodb-migration        | P0: Airtable -> NocoDB migration (9 files) + critical fix 12.14
09-data-pipeline           | P1: SEC EDGAR parser + Finnhub + Alpha Vantage earnings integration
10-ai-provider-swap        | P1: Claude Sonnet (CAT 1-7) + DeepSeek V3.2 (CAT 8-12) routing
11-visual-engine           | P1-P2: Chart.js + 15 templates + 4 report covers + logos + insider photos
12-scoring-analysis        | P2: Deterministic scoring formula + alert analysis rewrite
13-reddit-engine           | P2: Reddit replies tone map + daily thread (NEW) + DD posts (NEW)
14-x-engine                | P2-P3: X replies archetypes + X posts media/formats
15-articles-reports        | P3: Article quality gates + premium report 9-section + lead magnet expansion
16-newsletter-outreach     | P3-P4: Newsletter 6 sections + outreach 3 follow-ups + warm-up
17-infra-polish            | P4: SEO swap + X monitoring swap + content calendar + remaining infra
18-e2e-integration         | E2E: Integration tests for all 7 end-to-end pipeline chains
```

## Dependency Graph

```
08-nocodb-migration ──┬──> 09-data-pipeline
                      └──> 10-ai-provider-swap

09-data-pipeline ─────┬──> 11-visual-engine    (insider photos need NocoDB cache)
10-ai-provider-swap ──┘

11-visual-engine ─────┬──> 12-scoring-analysis  (score cards use visual templates)
                      ├──> 13-reddit-engine     (DD posts need visual charts)
                      ├──> 14-x-engine          (X replies/posts need media cards)
                      ├──> 15-articles-reports   (articles need charts, reports need covers)
                      └──> 16-newsletter-outreach (newsletter needs stats visuals)

12-scoring-analysis ──┬──> 15-articles-reports   (articles reference scored alerts)
                      └──> 16-newsletter-outreach (newsletter uses scored data)

17-infra-polish ──────     (independent)
                     ↓
18-e2e-integration ───     (runs LAST — validates all pipelines end-to-end)
```

## Execution Order

### Unit 08: NocoDB Migration (~30 min)
**08-nocodb-migration** — P0 blocker. Migrate all 9 files from Airtable REST API to NocoDB REST API. Fix 12.14 (remove URL from outreach prompt). Grouped by data domain: alerts pipeline (sec-monitor + score-alert + analyze-alert + deliver-alert + write-persistence), social pipeline (x-auto-post + x-engagement + reddit-monitor), outreach pipeline (send-outreach + find-prospects).

### Unit 09: Data Pipeline (~25 min)
**09-data-pipeline** — Create `edgar-parser.js` for SEC Form 4 XML parsing (replacing Financial Datasets dependency). Integrate Finnhub free API for market cap, quotes, earnings dates. Integrate Alpha Vantage free API for earnings calendar. Update `sec-monitor.js` to use EDGAR + Finnhub instead of Financial Datasets.

### Unit 10: AI Provider Swap (~20 min)
**10-ai-provider-swap** — Route CAT 1-7 files through Claude Sonnet 4.6 API (articles, reports, lead magnet, Reddit, X replies). Route CAT 8-12 files through DeepSeek V3.2 API (X posts, scoring, analysis, newsletter, outreach). Implement prompt caching for Claude (90% input cost reduction). Create shared `ai-client.js` abstraction.

### Unit 11: Visual Engine (~40 min)
**11-visual-engine** — Install Chart.js + node-canvas. Create `generate-chart.js` with dark navy design system (`#0A1128` bg, `#1A2238` secondary, Inter font). Implement 15 data visualization templates (data cards, filing cards, price charts, revenue trends, peer radar, market movers, etc.). Create 4 report cover templates (Single Stock, Sector, Bundle, Hero Featured) as HTML/CSS -> Puppeteer -> PNG. Implement Company Logo System via Brandfetch API (free) with text abbreviation fallback. Implement CEO/Insider Photo System with 3-tier cascade (Wikidata P18 -> Google Knowledge Graph -> UI Avatars initials) and NocoDB caching via `getInsiderPhoto()`.

### Unit 12: Scoring + Analysis (~25 min)
**12-scoring-analysis** — Replace Haiku-only scoring with deterministic `computeBaseScore()` formula (6 weighted factors: transaction value 30%, insider role 25%, market cap 20%, cluster 15%, track record 5%, timing 5%). Add AI refinement layer (DeepSeek, +/-1 only). 10b5-1 hard cap at 5. Gift/tax exclusion. Weekly calibration check. Rewrite alert analysis with score-based word targets, Hook/Context/What-to-Watch structure, current price lookup, days-to-earnings, banned phrase validation.

### Unit 13: Reddit Engine (~35 min)
**13-reddit-engine** — CAT 4: Implement `SUBREDDIT_TONE_MAP` (5 tones: WSB degen, ValueInvesting academic, stocks balanced, Dividends conservative, InsiderTrades technical). Per-sub word limits. Structure rotation (Q-A-D / Agreement-However / Data-Q). Daily cap 5-7. Timing delay 10-30 min. Upvoting + "Edit: update". CAT 5 (NEW): `buildDailyThreadComment()` with 3 templates, pre-market scheduling 7AM EST, skip 2 random days, weekend recap. CAT 6 (NEW): `buildDDPost()` with multi-step generation (outline -> draft -> bear case review -> TLDR last), Imgur image upload, AMA comment, frequency limiter 1/3-4 days.

### Unit 14: X Engine (~30 min)
**14-x-engine** — CAT 7: Data enrichment (filing context in prompt), 3 archetype rotation (Data Bomb 40% / Contrarian 30% / Pattern 30%), SEC filing screenshot 40% of time, $CASHTAG enforcement, engagement farming (like original + 2-3 replies before posting), daily cap 15-20, timing 3-5 min delay. CAT 8: 4 format rotation (breaking/thread/commentary/poll), media attachment always (Twitter media upload API), 4 time slots (9:30/12:00/15:30/18:00 EST), quote-retweet scheduling 2-3h later, MAX_DAILY=4.

### Unit 15: Articles + Reports + Lead Magnet (~40 min)
**15-articles-reports** — CAT 1: Named persona "Ryan Chen, ex-Goldman", multi-step outline->draft, 14-point quality gate hardened (FK Ease 30-50, 3+ visuals, 4-6 internal links, CTA placement, Schema.org, track record, social proof, timeliness), visual `{{VISUAL_N}}` placeholders, content freshness checker. CAT 2: Sequential 9-section generation (each receives all previous as context), executive summary generated LAST, bear case in separate call, 5 chart types via generate-chart.js, 4 report cover templates, Puppeteer PDF + WeasyPrint for complex, 5-page preview generation, price tier logic ($14.99/$19.99/$29.99). CAT 3: Expand to 4000-5000 words (12-15 pages), losers section >500 words, math verification in Code Node, 3 charts, CTA every 3 pages, Quick Wins page, dynamic title.

### Unit 16: Newsletter + Outreach (~35 min)
**16-newsletter-outreach** — CAT 11: Implement real `gatherWeeklyContent()` (NocoDB queries), 6-section structure (opener/move-of-week/scorecard/patterns/watching/wrap+PS), AI generation for each section (DeepSeek), A/B subject lines, Free vs Pro segmentation, P.S. CTA, 1000-1400 word target, max 5-7 links, mobile 16px font. CAT 12: Reduce to 100-125 words, add 5+ banned phrases, subject must have "?", "Ryan from EarlyInsider" from name, Cheerio scraping for prospect's recent article, 3 follow-ups (day 5 same thread / day 10 new angle / day 16 one-sentence), Tue-Thu 10AM timing, warm-up progressive (5->10->20->50/day), email verification (QuickEmailVerification), bounce tracking.

### Unit 17: Infrastructure Polish (~20 min)
**17-infra-polish** — A1: Remove W3 data study (redundant). A2: Report catalog generator (W17 new). A5: DataForSEO -> Ahrefs Free + Google KP. A6: twitterapi.io List polling with variable frequency (5min/15min/60min). A7: kie.ai -> Puppeteer OG cards. A9: Verify shared VPS RAM >=4GB. A10: Reddit volume 17->8-10/day. A11: Remove duplicate sitemap. D7: Content calendar NocoDB table + competitive intelligence RSS. D4.1: Content freshness checker. D4.2: Cosine similarity (optional).

### Unit 18: E2E Integration (~30 min)
**18-e2e-integration** — Integration tests (NOT unit tests) for 7 complete pipeline chains using mocked external APIs. Verifies pieces communicate correctly. Chains: (1) Alert: EDGAR filing -> edgar-parser -> score-alert (deterministic + AI) -> analyze-alert -> deliver-alert -> x-auto-post. (2) Article: keyword -> generate-article (multi-step) -> generate-chart -> NocoDB publish -> GSC index request. (3) Reddit: daily thread post -> reply with tone map -> DD post with bear case + Imgur. (4) X: tweet monitoring -> archetype reply + screenshot -> post with media -> quote-retweet. (5) Report: data gather -> 9-section sequential -> chart generate -> cover generate -> PDF assemble -> publish. (6) Newsletter: gather weekly content -> 6 sections AI -> A/B subject -> Free/Pro -> Beehiiv send. (7) Outreach: prospect scraping -> email generate -> send -> follow-up day 5/10/16 -> bounce tracking. A1: Remove W3 data study (redundant). A2: Report catalog generator (W17 new). A5: DataForSEO -> Ahrefs Free + Google KP. A6: twitterapi.io List polling with variable frequency (5min/15min/60min). A7: kie.ai -> Puppeteer OG cards. A9: Verify shared VPS RAM >=4GB. A10: Reddit volume 17->8-10/day. A11: Remove duplicate sitemap. D7: Content calendar NocoDB table + competitive intelligence RSS. D4.1: Content freshness checker. D4.2: Cosine similarity (optional).

## Split Details

### 08-nocodb-migration
**Purpose**: Unblock all other work by migrating from rate-limited Airtable to self-hosted NocoDB.
**Files modified**: write-persistence.js, sec-monitor.js, score-alert.js, analyze-alert.js, deliver-alert.js, x-auto-post.js, x-engagement.js, reddit-monitor.js, send-outreach.js, find-prospects.js
**Files created**: nocodb-client.js (shared NocoDB REST helper)
**Sections**: ~5 (schema mapping, alerts group migration, social group migration, outreach group migration, validation + 12.14 fix)
**Key risk**: NocoDB API differences from Airtable (field names, filter syntax, linked records)
**Test coverage**: Each migration group gets integration tests verifying CRUD operations

### 09-data-pipeline
**Purpose**: Replace paid Financial Datasets API with free SEC EDGAR + Finnhub + Alpha Vantage.
**Files modified**: sec-monitor.js, dexter-research.js
**Files created**: edgar-parser.js (XML Form 4 parser)
**Sections**: ~5 (EDGAR RSS + XML parser, Form 4/A + derivatives + gifts handling, Finnhub integration, Alpha Vantage earnings, sec-monitor rewrite)
**Key risk**: EDGAR XML edge cases (amended filings, $0 transactions, multiple transactions per filing)
**Test coverage**: Parser tests with real Form 4 XML samples

### 10-ai-provider-swap
**Purpose**: Route AI calls through optimal provider for cost/quality balance.
**Files modified**: All 10 content generation files
**Files created**: ai-client.js (provider abstraction)
**Sections**: ~4 (ai-client abstraction, Claude Sonnet routing CAT 1-7, DeepSeek routing CAT 8-12, prompt caching setup)
**Cost target**: Claude ~$11/mo + DeepSeek ~$1/mo = $12/mo AI total

### 11-visual-engine
**Purpose**: Create complete visual generation system for data cards, charts, report covers, and identity assets.
**Files created**: generate-chart.js, visual-templates.js, report-covers.js, identity-assets.js (logos + photos)
**Sections**: ~7 (Chart.js setup + dark theme, data card templates 1-4, chart templates 5-8, content templates 9-15, report cover templates A-D, company logo system Brandfetch, CEO/insider photo cascade + NocoDB cache)
**Key dependencies**: Chart.js + node-canvas must be installed on VPS
**Design system**: `#0A1128` bg, `#1A2238` secondary, Inter font, glassmorphism cards, green #28A745, red #DC3545, yellow #FFC107

### 12-scoring-analysis
**Purpose**: Replace AI-only scoring with deterministic formula + targeted analysis structure.
**Files modified**: score-alert.js, analyze-alert.js
**Sections**: ~6 (computeBaseScore formula, transaction filtering + 10b5-1 cap, AI refinement layer, weekly calibration, analysis restructure Hook/Context/Watch, validation hardening)
**Formula**: base=5, adjusted by 6 weighted factors, clamped 1-10, AI +/-1 only

### 13-reddit-engine
**Purpose**: Transform generic Reddit presence into subreddit-native engagement + two new content types.
**Files modified**: reddit-monitor.js
**Files created**: None (all in reddit-monitor.js)
**Sections**: ~7 (SUBREDDIT_TONE_MAP + word limits, structure rotation + daily cap + timing, upvoting + edit:update, daily thread system, DD post generation, DD bear case + TLDR + Imgur, engagement methods AMA + reply-to-replies)

### 14-x-engine
**Purpose**: Upgrade X from text-only generic posts to data-rich multimedia presence.
**Files modified**: x-engagement.js, x-auto-post.js
**Sections**: ~6 (reply data enrichment + archetypes, reply media + $CASHTAG + engagement farming, reply caps + timing, post format rotation + media, post timing + threading, quote-retweet scheduling)

### 15-articles-reports
**Purpose**: Elevate content quality to professional finance publication standard.
**Files modified**: generate-article.js, generate-report.js, generate-lead-magnet.js
**Sections**: ~7 (article multi-step + persona, article quality gate hardening, article visual placeholders + freshness, report 9-section sequential + covers, report PDF + preview + pricing, lead magnet expansion + math verification, Schema.org + social proof)

### 16-newsletter-outreach
**Purpose**: Complete the distribution layer with full newsletter + professional outreach.
**Files modified**: weekly-newsletter.js, send-outreach.js
**Sections**: ~7 (newsletter data layer, newsletter 6 sections + AI, newsletter A/B + segmentation + mobile, outreach word limit + banned phrases + from name, outreach Cheerio scraping + personalization, outreach 3 follow-ups + timing, outreach warm-up + email verification + bounce tracking)

### 17-infra-polish
**Purpose**: Cost optimizations + content operations tooling.
**Files modified**: select-keyword.js, generate-image.js, reddit-monitor.js, x-engagement.js
**Files created**: content-calendar.js
**Sections**: ~6 (remove W3 + add W17 catalog, SEO tool swap, X monitoring List poll, image swap to Puppeteer OG, content calendar + freshness checker, VPS check + sitemap fix + Reddit volume cap)

### 18-e2e-integration
**Purpose**: Verify that all pipeline chains work end-to-end after the 10-unit upgrade. Catch integration bugs that pass unit tests but break at chain boundaries.
**Files created**: tests/insiderbuying/e2e/ directory with 7 integration test files
**Sections**: ~6 (alert pipeline chain, article pipeline chain, Reddit pipeline chain, X pipeline chain, report pipeline chain, newsletter + outreach pipeline chains)
**Test strategy**: Mock external APIs (EDGAR, X API, Reddit API, Beehiiv, Claude/DeepSeek, Puppeteer) via Jest mocks. Real NocoDB helper calls (test DB). Verify: output shape, field propagation between stages, error handling at each handoff, mock call counts match expected API usage.
**Pass criteria**: All 7 chains produce correctly shaped final output with no uncaught errors. Each chain's mock API calls match the expected call signatures.

---

## Phase 1 Split Reference (COMPLETED)

```
01-infrastructure          | Foundation: Supabase + NocoDB + SSR + Stripe + env
02-figma-site-pages        | All site pages pixel-perfect from Figma designs
03-dexter-content-engine   | Dexter agent + W1 keywords + W2 articles + W12 images + W13 cross-link
04-sec-alerts-system       | W4 SEC monitor + W5 alert delivery (email + push + real-time)
05-data-studies-reports    | W3 data studies + W15 report PDF + W16 lead magnet PDF
06-newsletter-social       | W6 newsletter + W7 X auto-post + W8 X engagement + W9 Reddit
07-outreach-seo            | W10 prospect finder + W11 email sender + W14 SEO monitoring
```
