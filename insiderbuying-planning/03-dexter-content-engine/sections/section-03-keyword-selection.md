# Section 3: W1 -- Keyword Selection Workflow

## Context

Weekly workflow that uses DataForSEO to find the best keywords for each active blog. Produces 21 keywords per blog (3/day * 7 days). These keywords feed W2 (Article Generation), which picks the highest-priority keyword each time it runs.

This section depends on Section 1 (NocoDB Keywords table must exist).

## Implementation

### Workflow Design

**Trigger**: Schedule -- every Sunday at midnight EST

**Pipeline**:

### Step 1: Determine Active Blogs

Query NocoDB or config: which blogs are currently active? Day 1: only `insiderbuying`. Future: all 3 blogs.

For each active blog, run the keyword pipeline:

### Step 2: Generate Seed Keywords (Code Node -- `select-keyword.js`)

Per blog, generate seed keyword list:

- **insiderbuying**: "insider buying {trending_tickers}", "insider selling {sector}", "Form 4 filing {ticker}", "insider trading signal {ticker}"
- **deepstockanalysis**: "{ticker} earnings analysis", "{ticker} stock forecast", "{sector} stock comparison"
- **dividenddeep**: "{ticker} dividend safety", "best dividend stocks {sector}", "{ticker} payout ratio"

Trending tickers: query NocoDB Financial_Cache for tickers with recent insider activity (last 7 days), or use a static watchlist initially.

### Step 3: DataForSEO API Calls

For each seed keyword, call DataForSEO:

**Endpoint 1 -- Search Volume**: POST `https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live`
- Auth: Basic auth (login:password base64)
- Body: `{ "keywords": [array of seeds], "location_code": 2840, "language_code": "en" }`
- Returns: search_volume, competition, cpc, monthly_searches[]

**Endpoint 2 -- Related Keywords**: POST `https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live`
- Body: `{ "keywords": [array of seeds], "location_code": 2840 }`
- Returns: related keywords with volume/difficulty

**Endpoint 3 -- SERP Analysis**: POST `https://api.dataforseo.com/v3/serp/google/organic/live/regular`
- Body: `{ "keyword": "seed", "location_code": 2840 }`
- Returns: top 10 SERP results (for gap analysis)

### Step 4: Intent Classification (Code Node)

Map each keyword to article type using signal words:

```
TYPE_MAP = {
  A (data-heavy): earnings, analysis, forecast, valuation, revenue, results, financials
  B (narrative): why, how, signal, insider, buying, selling, pattern, meaning
  C (comparative): vs, compare, best, top, alternative, which
  D (editorial): strategy, guide, opinion, approach, should, when
}
```

Default to type A if no signal word matches. Set `intent_multiplier` accordingly:
- A = 1.0
- B = 1.2
- C = 0.8
- D = 0.9

### Step 5: Priority Scoring + Dedup

```
priority_score = search_volume * (1 - keyword_difficulty/100) * intent_multiplier
```

Check NocoDB Keywords table: skip any keyword already present (by exact match or fuzzy similarity > 0.8).

### Step 6: Write to NocoDB

Insert top 21 keywords per blog into Keywords table, status='new'.

### Fallback Mode (if DataForSEO unavailable)

Manual mode: user enters keywords directly into NocoDB Keywords table (via NocoDB UI or CSV import). W2 reads from the same table regardless of source. Log a warning if Keywords table has < 7 'new' keywords for any active blog.

### Code File

`n8n/code/insiderbuying/select-keyword.js` -- W1 seed generation + DataForSEO integration + scoring

### Workflow JSON

`n8n/workflows/insiderbuying/w1-keyword-selection.json`

## Tests (TDD)

```
# Test: DataForSEO keyword suggestions -- real API call returns volume, difficulty, CPC for seed "insider buying AAPL"
# Test: Intent classification -- "NVDA earnings analysis" maps to type A, "why insiders are buying" maps to type B
# Test: Intent classification -- keyword with no signal words defaults to type A
# Test: Priority scoring -- volume=1000, difficulty=30, multiplier=1.2 -> score = 1000 * 0.7 * 1.2 = 840
# Test: Dedup -- keyword already in NocoDB (exact match, case-insensitive) is skipped
# Test: Dedup -- keyword NOT in NocoDB is inserted
# Test: Batch output -- produces exactly 21 keywords per active blog
# Test: Multi-blog -- with 2 active blogs, produces 42 total keywords (21 each)
# Test: Fallback mode -- when DataForSEO unavailable, manual keyword entry in NocoDB works and W2 picks it up
# Test: Seed generation -- insiderbuying blog seeds contain "insider buying" / "Form 4" / "insider trading" patterns
# Test: Schedule timezone -- verify n8n schedule fires at Sunday midnight EST (not UTC)
```

### Test Implementation Notes

- **DataForSEO real API test**: Call the search_volume endpoint with a known seed keyword. Verify the response contains `search_volume` (number), `competition` (number), `cpc` (number). Use the insiderbuying credentials.
- **Intent classification tests**: Create a test array of keywords with known expected types. Run the classification function. Assert each maps to the correct type. Specifically: "NVDA earnings analysis" -> A, "why insiders are buying" -> B, "NVDA vs AMD" -> C, "insider buying strategy guide" -> D, "AAPL stock" -> A (default).
- **Priority scoring test**: Hardcoded inputs: volume=1000, difficulty=30, multiplier=1.2. Expected output: 1000 * (1 - 30/100) * 1.2 = 1000 * 0.7 * 1.2 = 840. Assert exact value.
- **Dedup test**: Pre-insert a keyword "insider buying AAPL" into NocoDB Keywords table. Run the pipeline with a seed that produces the same keyword (and also a variation like "INSIDER BUYING AAPL" for case-insensitivity). Verify it is skipped. Insert a genuinely new keyword and verify it is written.
- **Batch output test**: Run the full pipeline for 1 blog. Count keywords written to NocoDB with status='new' and the current batch timestamp. Assert exactly 21.
- **Multi-blog test**: Configure 2 active blogs. Run the pipeline. Assert 42 total keywords (21 per blog), each tagged with the correct `blog` field.
- **Fallback test**: Disable DataForSEO (mock 500 response). Manually insert 5 keywords into NocoDB. Trigger W2 and verify it picks from the manual keywords.
- **Seed generation test**: Call the seed generation function for blog='insiderbuying'. Assert at least one seed contains "insider buying", at least one contains "Form 4", at least one contains "insider trading".
- **Timezone test**: Check the n8n schedule node configuration. The cron expression must use EST timezone, not UTC. Verify by checking the next scheduled execution time.

## Acceptance Criteria

1. W1 workflow triggers every Sunday at midnight EST
2. Seed keywords are generated per blog with correct patterns (insider buying/Form 4/insider trading for insiderbuying blog)
3. DataForSEO API calls return search volume, difficulty, CPC for each seed
4. Related keywords from DataForSEO are included in the candidate pool
5. Intent classification correctly maps keywords to types A/B/C/D using the TYPE_MAP signal words
6. Keywords with no signal words default to type A with intent_multiplier=1.0
7. Priority score formula: `volume * (1 - difficulty/100) * intent_multiplier` is computed correctly
8. Duplicate keywords (exact match, case-insensitive) against existing NocoDB entries are skipped
9. Exactly 21 keywords per active blog are written to NocoDB with status='new'
10. Fallback mode: manually entered keywords in NocoDB are picked up by W2 without W1
11. Warning logged if any active blog has < 7 'new' keywords after the run
12. All 11 test stubs pass
