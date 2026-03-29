# TDD Plan: Visual Engine (Unit 11)

Testing framework: **Jest** (existing project convention). Tests in `tests/insiderbuying/`. Mock pattern: `jest.fn().mockResolvedValue(...)` with helpers object `{ fetchFn, env, _sleep }`.

---

## Section 1: Shared CSS Utilities (visual-css.js)

No separate test file needed — visual-css.js is a pure data/utility module. Test indirectly via template and chart tests.

However, test the utility functions:

```
# Test: escapeHtml escapes & to &amp;
# Test: escapeHtml escapes < to &lt; and > to &gt;
# Test: escapeHtml escapes " to &quot; and ' to &#39;
# Test: escapeHtml returns empty string for null/undefined input
# Test: normalizeVerdict("buy") returns "BUY"
# Test: normalizeVerdict("SELL") returns "SELL"
# Test: normalizeVerdict("unknown") returns "HOLD" (safe default)
# Test: normalizeVerdict(undefined) returns "HOLD"
# Test: wrapTemplate wraps inner HTML in <!DOCTYPE html> with BASE_CSS
# Test: wrapTemplate output contains Inter @font-face declarations
# Test: VERDICTS.BUY.color equals #28A745
# Test: COLORS.bg equals #0A1128
```

---

## Section 2: Chart Generation (generate-chart.js)

File: `tests/insiderbuying/generate-chart.test.js`

### HTML Generation Tests (no screenshot server needed)

```
# Test: renderBarChart returns HTML containing <canvas> element
# Test: renderBarChart HTML contains Chart.js CDN script tag
# Test: renderBarChart HTML contains chart config with type "bar"
# Test: renderBarChart includes dataset labels from input
# Test: renderLineChart includes annotation config when annotations provided
# Test: renderLineChart supports dual-axis (two yAxisID configs in output)
# Test: renderLineChart without annotations omits annotation plugin config
# Test: renderRadarChart uses fixed 600x600 dimensions
# Test: renderRadarChart config has type "radar" with correct axis labels
# Test: renderScatterChart config includes xLabel and yLabel in axis options
# Test: renderTableImage generates HTML table with correct number of rows
# Test: renderTableImage applies green tint class for "purchase" type rows
# Test: renderTableImage applies red tint class for "sale" type rows
# Test: renderTableImage escapes HTML in cell values
```

### Screenshot Server Integration Tests (mocked)

```
# Test: chart render calls fetchFn POST to screenshot server URL
# Test: chart render sends { html, viewport, format: 'png' } in POST body
# Test: chart render returns PNG buffer from screenshot server response
# Test: chart render throws on screenshot server 500 error
# Test: chart render throws on non-image response
```

### Input Validation Tests

```
# Test: width > 3000 gets clamped to 3000
# Test: height < 200 gets clamped to 200
# Test: missing datasets throws descriptive Error
# Test: empty labels array throws descriptive Error
```

### Upload Tests

```
# Test: uploadChart calls uploadToR2 with correct key pattern
# Test: uploadChart key contains random suffix (not just timestamp)
# Test: uploadChart returns R2 public URL string
```

---

## Section 3: Visual Templates 1-8 (visual-templates.js, Part A)

File: `tests/insiderbuying/visual-templates.test.js`

### Template HTML Generation (T1-T8)

```
# Test: T1 Data Card returns HTML containing company name
# Test: T1 Data Card escapes HTML in company name ("O'Reilly" → "O&#39;Reilly")
# Test: T1 Data Card includes verdict badge with correct color for "BUY"
# Test: T2 SEC Filing Mini Card returns HTML with ticker and amount
# Test: T3 Comparison Card includes both current and historical sections
# Test: T4 Transaction Table renders all rows from transactions array
# Test: T4 Transaction Table empty transactions array does not throw
# Test: T5 Price Chart includes Chart.js CDN script and canvas element
# Test: T5 Price Chart includes annotation config for buyDate
# Test: T6 Revenue Trend includes Chart.js config with dual axis
# Test: T7 Football Field renders horizontal bars with correct CSS widths
# Test: T7 Football Field shows current price marker
# Test: T8 Peer Radar includes Chart.js radar config with 6 axes
```

### Defensive Data Handling

```
# Test: T1 with undefined stats array renders without throwing (shows "N/A")
# Test: T2 with null insiderPhotoUrl renders without broken img tag
# Test: T3 with missing historical.outcome shows fallback text
# Test: all templates normalize verdict via normalizeVerdict()
```

---

## Section 4: Visual Templates 9-15 (visual-templates.js, Part B)

Same test file as Section 3.

```
# Test: T9 Market Movers renders all movers in table format
# Test: T10 Contrarian Card includes narrative text and evidence metrics
# Test: T11 Newsletter Stats shows subscriber count and rates
# Test: T12 Sector Heatmap renders grid cells with scaled opacity
# Test: T12 empty sectors array does not throw
# Test: T13 Article Hero is 1200x630 and includes title/category
# Test: T14 Alert Score Badge is 400x400 with score number
# Test: T15 Weekly Leaderboard renders ranked leaders list
```

### renderTemplate Integration (mocked screenshot server)

```
# Test: renderTemplate(1, data, {}, helpers) calls screenshot server
# Test: renderTemplate invalid templateId (0, 16, "foo") throws Error
# Test: renderTemplate with opts.upload=true calls uploadChart and returns URL
# Test: renderTemplate with opts.upload=false returns PNG buffer directly
# Test: renderTemplate passes correct viewport dimensions per template ID
```

---

## Section 5: Report Covers (report-covers.js)

File: `tests/insiderbuying/report-covers.test.js`

```
# Test: renderCoverA returns HTML with ticker and company name
# Test: renderCoverA escapes HTML in thesis text
# Test: renderCoverA uses 1240x1754 viewport for A4
# Test: renderCoverA screenshot request includes deviceScaleFactor: 2
# Test: renderCoverB renders 6 stock cards in data grid
# Test: renderCoverB with fewer than 6 stocks does not throw
# Test: renderCoverC renders 10 ticker pills in 2 rows
# Test: renderCoverC includes metric bar with stats
# Test: renderCoverD uses 1200x675 viewport (web size)
# Test: renderCoverD does NOT use deviceScaleFactor: 2 (web only)
# Test: renderCoverD includes mesh gradient CSS
# Test: all covers call uploadChart and return R2 URL on success
# Test: cover render propagates screenshot server error
```

---

## Section 6: Identity Assets — Logos (identity-assets.js, Part A)

File: `tests/insiderbuying/identity-assets.test.js`

### Logo Cascade Tests

```
# Test: getCompanyLogo checks NocoDB cache first
# Test: cache hit (valid TTL) returns cached URL without calling Brandfetch
# Test: cache expired re-fetches from Brandfetch
# Test: Brandfetch 200 + image/png content-type → uploads to R2, caches, returns R2 URL
# Test: Brandfetch 200 + image/svg+xml → rasterizes via screenshot server then uploads PNG
# Test: Brandfetch 404 → falls through to UI Avatars
# Test: Brandfetch timeout → falls through to UI Avatars
# Test: Brandfetch response > 500KB → rejected, falls through to UI Avatars
# Test: UI Avatars URL returned contains tickerAbbrev
# Test: UI Avatars result cached in NocoDB with source 'ui_avatars'
# Test: NocoDB PATCH called on cache update (not duplicate POST)
```

### Batch Prefetch Tests

```
# Test: prefetchLogos deduplicates input array (['nvidia.com', 'nvidia.com'] → 1 fetch)
# Test: prefetchLogos skips already-cached domains
# Test: prefetchLogos fetches missing domains in parallel
# Test: prefetchLogos limits concurrency to 3
```

---

## Section 7: Identity Assets — Insider Photos (identity-assets.js, Part B)

Same test file as Section 6.

### Photo Cascade Tests

```
# Test: getInsiderPhoto checks NocoDB cache first
# Test: cache hit returns cached URL without calling Wikidata
# Test: Wikidata SPARQL returns image → verifies via HEAD → caches with source 'wikidata'
# Test: Wikidata request includes descriptive User-Agent header
# Test: Wikidata HEAD request uses redirect: 'follow'
# Test: Wikidata SPARQL no image → falls to Google KG
# Test: Wikidata SPARQL timeout → falls to Google KG
# Test: Google KG returns image → verifies via HEAD → caches with source 'google_kg'
# Test: Google KG image URL returns 403 → falls to UI Avatars
# Test: Google KG timeout → falls to UI Avatars
# Test: UI Avatars URL includes firstName+lastName
# Test: UI Avatars result cached with source 'ui_avatars'
```

### Name Normalization Tests

```
# Test: "Dr. Jensen Huang Jr." → "jensen huang"
# Test: "Mr. John Smith III" → "john smith"
# Test: "Elon Musk" → "elon musk"
# Test: "mary-jane o'connor" → "mary-jane o'connor"
# Test: unicode accented names normalized via NFKD
# Test: empty string → empty string
# Test: null/undefined → empty string
```

---

## Section 8: NocoDB Table Setup + Integration Wiring

### Cache Helper Tests (internal functions, tested via identity-assets)

```
# Test: _cacheGet returns null for non-existent key
# Test: _cacheGet returns null for expired entry (age > ttl_seconds)
# Test: _cacheGet returns data for valid entry
# Test: _cacheSet creates new row (POST) when key doesn't exist
# Test: _cacheSet updates existing row (PATCH) when key exists
# Test: _cacheSet handles NocoDB 429 with retry
# Test: NocoDB fetchFn includes xc-token header
```

### Integration Wiring Tests

```
# Test: visual-engine.js exports charts, templates, covers, identity modules
# Test: each module's functions accept (data, helpers) signature
# Test: uploadChart key pattern includes random suffix
```

---

## Section 9: Tests (Meta)

This section IS the tests. No additional TDD layer needed. The test stubs above define what to write BEFORE implementing each section. Implementation order:

1. Write visual-css.js utility tests → implement visual-css.js
2. Write generate-chart.js tests → implement generate-chart.js
3. Write visual-templates.js tests → implement templates
4. Write report-covers.js tests → implement covers
5. Write identity-assets.js tests → implement identity cascade
6. Create NocoDB tables, wire exports, run all tests
