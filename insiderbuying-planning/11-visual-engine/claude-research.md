# Research: Visual Engine (Unit 11)

## Part 1: Codebase Research

### Project Architecture
The insiderbuying project is a **16-workflow n8n content generation pipeline** (25 CommonJS files) that monitors SEC filings, generates articles, creates images, distributes content, and stores data in self-hosted NocoDB (12 core tables). All outputs upload to Cloudflare R2.

### Existing Integration Points

#### uploadToR2() — render-pdf.js
```javascript
async function uploadToR2(buffer, key)
// @param {Buffer} buffer - File buffer (PDF or image PNG)
// @param {string} key - R2 object key (e.g., 'reports/lead-magnet-latest.pdf')
// @returns {Promise<string>} Public URL on R2
```
- Auth: AWS Signature V4 (pure Node.js crypto, no AWS SDK)
- Bucket: `'toxic-or-nah'` (hardcoded)
- Host: `{R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
- Throws `Error('R2 credentials not configured')` if env vars missing
- Throws `Error('R2 upload failed: {statusCode} {responseBody}')` on HTTP error
- Key pattern for images: `earlyinsider/images/${slug}_${imageType}.png`

#### Screenshot Server — Already Running on VPS
```
POST http://host.docker.internal:3456/screenshot
Body: { html, viewport: { width, height }, format: "png" }
Response: PNG buffer (image/png)
```
Usage pattern from generate-image.js:
```javascript
const res = await fetchFn(`${SCREENSHOT_SERVER}/screenshot`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ html, viewport: { width: 1200, height: 630 }, format: 'png' }),
});
const buffer = Buffer.from(await res.arrayBuffer());
```

#### NocoDB API Pattern
- Base URL: configurable (`http://localhost:8080` dev, `http://nocodb:8080` VPS)
- Auth: `xc-token: {NOCODB_API_TOKEN}`
- API v2: `/api/v2/tables/{tableId}/records`
- Filter syntax: `where=(field,eq,value)~and(field2,gt,100)`
- Rate limit: 5 req/s per user, 429 requires 30s backoff

CRUD examples from codebase:
```javascript
// GET with filter
const queryUrl = `${baseUrl}/Articles?where=(status,eq,published)&sort=-published_at&limit=20`;

// POST create
await fetchFn(`${baseUrl}/Table`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify(recordObject),
});

// PATCH update
await fetchFn(`${baseUrl}/Table/${id}`, {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ field1: value1 }),
});
```

#### Existing Image Generation (generate-image.js)
- Hero images: fal.ai Flux (AI-generated)
- OG cards: HTML template → screenshot server → PNG → R2
- Uses `VERDICT_COLORS`: BUY #22C55E, SELL #EF4444, CAUTION #F59E0B, WAIT #3B82F6
- No existing Chart.js or node-canvas code

### Module Patterns
- **CommonJS only**: `module.exports = {...}`, `require()`
- **n8n Code Node pattern**: `async function main(input, helpers) { const { fetchFn, env } = helpers; ... }`
- **Export both orchestrators and pure functions** for testability

### Testing Setup (Jest)
- `jest` 30.3.0 in devDependencies
- Config: `{ testEnvironment: "node", testMatch: ["**/tests/**/*.test.js"] }`
- ~515 passing tests across 10+ test files
- Mock pattern:
```javascript
function makeFetch(responseText, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok, status,
    json: async () => ({ ... }),
    arrayBuffer: async () => Buffer.from('...'),
  });
}
const helpers = { fetchFn: makeFetch(RESPONSE), env: { ... }, _sleep: jest.fn() };
```

### Environment Variables (Already Defined)
```
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_URL
NOCODB_API_URL, NOCODB_API_TOKEN
GOOGLE_KG_API_KEY          # Already exists — for insider photo lookup
FAL_API_KEY                # For hero image generation
ANTHROPIC_API_KEY          # Claude Sonnet for analysis
```

### Dependencies NOT Yet Installed
- `chart.js` (data visualization)
- `canvas` (node-canvas — native binding)
- `chartjs-plugin-annotation` (price chart markers)

---

## Part 2: Web Research

### Topic 1: Chart.js + node-canvas Server-Side Rendering

**Recommended approach**: Use `chartjs-node-canvas` wrapper or direct Chart.js + canvas:

```javascript
const { createCanvas } = require('canvas');
const { Chart } = require('chart.js/auto');

// Register fonts ONCE at startup (never per-render — memory leak)
const { registerFont } = require('canvas');
registerFont('./fonts/Inter-Regular.ttf', { family: 'Inter' });
```

**Dark theme — background plugin** (essential for server-side PNG):
```javascript
const backgroundPlugin = {
  id: 'customCanvasBackgroundColor',
  beforeDraw: (chart) => {
    const { ctx } = chart;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#0A1128';
    ctx.fillRect(0, 0, chart.width, chart.height);
    ctx.restore();
  }
};
```

**Critical settings for server-side**:
- `animation: false` (no requestAnimationFrame in Node)
- `responsive: false` (no window object)
- `devicePixelRatio: 1`
- Always call `chart.destroy()` after `canvas.toBuffer('image/png')` to prevent memory leaks

**Annotation plugin** — must be registered globally:
```javascript
const annotationPlugin = require('chartjs-plugin-annotation');
Chart.register(annotationPlugin);
```
Annotation types: `line` (vertical markers), `box` (highlight regions), `label` (text callouts).

**Gotchas**:
- `registerFont()` + `deregisterAllFonts()` in a loop leaks memory severely (~10x)
- Reuse ChartJSNodeCanvas instances, don't create per render
- Canvas size limit ~4000px per dimension
- Sources: [Chart.js Node.js docs](https://www.chartjs.org/docs/latest/getting-started/using-from-node-js.html), [chartjs-plugin-annotation](https://www.chartjs.org/chartjs-plugin-annotation/latest/guide/)

### Topic 2: Wikidata SPARQL Person Image Queries

**Correct SPARQL query**:
```sparql
SELECT ?person ?personLabel ?image WHERE {
  ?person wdt:P31 wd:Q5 .
  ?person rdfs:label "Jensen Huang"@en .
  OPTIONAL { ?person wdt:P18 ?image . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}
LIMIT 1
```

**Commons URL construction** — use `Special:FilePath` (simplest):
```
https://commons.wikimedia.org/wiki/Special:FilePath/{filename}?width=300
```

**Rate limits**: 60s processing time per minute per IP+UA. Hard query timeout: 60s. Concurrent: 5 parallel.

**CRITICAL: User-Agent required**. Wikimedia blocks clients without descriptive UA:
```
User-Agent: InsiderBuyingBot/1.0 (contact@earlyinsider.com) node-fetch/3.0
```

**Edge cases**:
- Multiple images: use `LIMIT 1` or `SAMPLE(?image)`
- No image: `OPTIONAL` returns NULL — check in code
- Disambiguation: filter by `wdt:P31 wd:Q5` (human)
- Spaces vs underscores in filenames: encode properly

**Verification**: HEAD request → check `response.ok` + `content-type: image/*`

Sources: [Wikidata SPARQL examples](https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/queries/examples), [P18 property](https://www.wikidata.org/wiki/Property:P18)

### Topic 3: Puppeteer HTML-to-PNG Template Rendering

**Font loading** — inline `@import` in HTML + wait for ready:
```html
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
</style>
```
```javascript
await page.evaluateHandle('document.fonts.ready');
```

**Glassmorphism**: `backdrop-filter: blur()` works in headless Chrome out of the box. No special flags needed.

**Quality settings**:
- `--font-render-hinting=none` improves kerning
- `--force-color-profile=srgb` consistent colors
- `deviceScaleFactor: 2` for retina-quality output

**Memory management**:
- Reuse ONE browser instance, create/close pages per render
- Page pool pattern (5-10 pages max)
- Restart browser after ~500-1000 renders
- Always `page.close()` in try/finally

**Gotchas**:
- Variable fonts (.ttf) don't render correctly — use static weight files
- `networkidle0` hangs on long-polling pages — use `networkidle2` or timeout
- Large pages (6000x6000+) produce incomplete screenshots

Sources: [Puppeteer screenshots guide](https://pptr.dev/guides/screenshots), [Puppeteer memory management](https://medium.com/@matveev.dina/the-hidden-cost-of-headless-browsers-a-puppeteer-memory-leak-journey-027e41291367)

### Topic 4: NocoDB API Caching Patterns

**REST API v2 endpoints**:
```
GET    /api/v2/tables/{tableId}/records?where=...&limit=...
POST   /api/v2/tables/{tableId}/records         (body: object or array for bulk)
PATCH  /api/v2/tables/{tableId}/records         (body: { Id, ...fields })
DELETE /api/v2/tables/{tableId}/records         (body: { Id })
```

**Cache table schema**:
| Column | Type | Purpose |
|--------|------|---------|
| cache_key | SingleLineText (indexed) | Unique lookup key |
| cache_data | LongText | JSON string payload |
| cached_at | DateTime | Write timestamp |
| ttl_seconds | Number | Expiry duration |

**TTL check on read**:
```javascript
const age = (Date.now() - new Date(row.cached_at).getTime()) / 1000;
if (age > row.ttl_seconds) { /* expired — delete and return null */ }
```

**Batch prefetch**: Use `~or` filter to check multiple keys in one query:
```javascript
const whereClause = keys.map(k => `(cache_key,eq,${k})`).join('~or');
```

**Gotchas**:
- Rate limit: 5 req/s, 429 requires 30s backoff
- No native JSON column — store as LongText string
- No native TTL — must implement in application code
- Bulk operations use same endpoint as single (array vs object body)

Sources: [NocoDB REST APIs](https://nocodb.com/docs/product-docs/developer-resources/rest-apis), [NocoDB API v2](https://nocodb.com/apis/v2/data)

---

## Testing Approach Notes

The project uses **Jest** (`jest@30.3.0`) with `testEnvironment: "node"`. Tests live in `tests/insiderbuying/`. Mock pattern: `jest.fn().mockResolvedValue(...)` for `fetchFn`, with helpers object `{ fetchFn, env, _sleep }`.

For Unit 11 tests:
- Chart tests: verify PNG buffer output (magic bytes `\x89PNG`, length > 1KB)
- Template tests: mock screenshot server, verify HTML generation doesn't throw
- Identity tests: mock fetch cascades (tier 1 fail → tier 2 fail → tier 3 fallback)
- Cover tests: mock screenshot server, verify HTML generation
