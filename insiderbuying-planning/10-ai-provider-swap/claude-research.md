# Research: AI Provider Swap

## Codebase Analysis

### Project Structure

**Directory**: `ryan_cole/insiderbuying-site/n8n/code/insiderbuying/`
**Total Files**: 25 JavaScript files (~7,650 lines of code)

### Files That Call Claude/Anthropic API

Only **3 files** make direct API calls:

| File | Lines | Current Function | Model | Purpose |
|------|-------|-----------------|-------|---------|
| generate-article.js | 1182 | `callClaudeToolUse()` | `claude-sonnet-4-6-20250514` | Article generation with Tool Use |
| score-alert.js | 370 | `callHaiku()` | `claude-haiku-4-5-20251001` | Significance scoring (1-10) |
| analyze-alert.js | 172 | `callClaude()` | `claude-sonnet-4-6` | Filing analysis prose |

### Current API Call Pattern

All files use direct HTTPS calls via `fetchFn` (n8n's injected function):

```javascript
// generate-article.js (line ~758)
const res = await fetchFn('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-6-20250514',
    max_tokens: maxTokens,
    temperature: 0.6,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Generate the article now.' }],
    tools: [tool],
    tool_choice: { type: 'tool', name: 'generate_article' },
  }),
});
```

**Key characteristics:**
- No SDK imports (`@anthropic-ai/sdk` is NOT used)
- API key from `env.ANTHROPIC_API_KEY`
- Header: `x-api-key` (not Bearer)
- Response parsing: `data.content[0].text` or `data.content.find(c => c.type === 'tool_use')`
- No existing abstraction layer

### Error Handling Patterns

**score-alert.js**: 3 attempts with linear backoff (1s, 2s, 3s), returns safe defaults on failure
**analyze-alert.js**: 2 retries with exponential backoff
**generate-article.js**: MAX_RETRIES = 2 for quality gate failures

All use graceful degradation -- failures return safe defaults rather than crashing the workflow.

### Prompt Structures

1. **Template-based** (generate-article.js): System prompt from `env.ARTICLE_SYSTEM_PROMPT` with `{{VARIABLE}}` interpolation (~20+ context variables)
2. **Inline** (score-alert.js): `buildHaikuPrompt(filing, trackRecord)` builds full prompt with filing data
3. **Inline** (analyze-alert.js): `buildAnalysisPrompt(filing)` builds 2-3 paragraph analysis prompt

### Testing Setup

- **Framework**: Jest v30.3.0
- **Test location**: `tests/insiderbuying/`
- **Test files**: `score-alert.test.js` (466 lines), `analyze-alert.test.js`, plus integration tests
- **Mocking pattern**: Mock `fetchFn` to avoid real API calls
- **Command**: `npm test`

```javascript
function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok, status,
    json: async () => response,
  });
}
```

### CommonJS Patterns

All files use CommonJS with n8n-specific patterns:
- `require('https')`, `require('http')`, `require('url')` for polyfills
- Try/catch for optional deps: `try { cheerio = require('cheerio'); } catch { ... }`
- Exports: `module.exports = { functionName, CONSTANT }`
- No top-level SDK imports -- `fetchFn`, `env`, `helpers` injected as parameters

### Cost Tracking (Existing)

```javascript
const CLAUDE_INPUT_PRICE = 3.0;    // $3/M input tokens
const CLAUDE_OUTPUT_PRICE = 15.0;  // $15/M output tokens
```

### Files NOT Using Claude (no changes needed for provider swap)

sec-monitor.js, dexter-research.js, generate-image.js, select-keyword.js, cross-link.js, write-persistence.js, deliver-alert.js, blog-helpers.js, data-study.js, e2e-monitoring.js (monitoring only), and ~12 smaller utility files.

---

## Web Research: Claude API Prompt Caching

### Status: General Availability (no beta header needed)

Prompt caching graduated from beta. The `anthropic-beta: prompt-caching-2024-07-31` header is **no longer required**.

### Two Caching Modes

**1. Automatic (simplest)** -- top-level `cache_control`:
```json
{
  "model": "claude-sonnet-4-20250514",
  "cache_control": {"type": "ephemeral"},
  "system": "Long system prompt...",
  "messages": [{"role": "user", "content": "Question"}]
}
```

**2. Explicit breakpoints (fine-grained)** -- per content block:
```json
{
  "system": [{
    "type": "text",
    "text": "Long system prompt...",
    "cache_control": {"type": "ephemeral"}
  }],
  "messages": [{"role": "user", "content": "..."}]
}
```

### Cache TTL Options

| TTL | Syntax | Write Cost | Read Cost |
|-----|--------|------------|-----------|
| 5 min (default) | `{"type": "ephemeral"}` | 1.25x base | 0.1x base |
| 1 hour | `{"type": "ephemeral", "ttl": "1h"}` | 2x base | 0.1x base |

### Pricing (Claude Sonnet 4)

| Token Type | Cost per 1M |
|-----------|-------------|
| Base input | $3.00 |
| 5-min cache write | $3.75 |
| Cache read | $0.30 |
| Output | $15.00 |

**90% savings on cached reads.**

### Minimum Token Requirements

| Model | Minimum |
|-------|---------|
| Sonnet 4, 4.5, 3.7 | 1,024 |
| Sonnet 4.6 | 2,048 |
| Haiku 3.5, 3, 4.5 | 2,048-4,096 |

### Detecting Cache Hits

```json
{
  "usage": {
    "input_tokens": 50,
    "cache_creation_input_tokens": 248,
    "cache_read_input_tokens": 1800,
    "output_tokens": 503
  }
}
```

- `cache_read_input_tokens > 0` = HIT (0.1x cost)
- `cache_creation_input_tokens > 0` = WRITE (1.25x cost)
- Cache hits don't count against rate limits

### Sources
- [Claude Prompt Caching Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
- [Prompt Caching Cookbook](https://platform.claude.com/cookbook/misc-prompt-caching)

---

## Web Research: DeepSeek V3.2 API

### Model IDs

| API ID | Model | Mode |
|--------|-------|------|
| `deepseek-chat` | V3.2 | Standard chat |
| `deepseek-reasoner` | V3.2 | Chain-of-thought |

### API Format (OpenAI-compatible)

```
Base URL: https://api.deepseek.com
Auth: Authorization: Bearer YOUR_API_KEY
```

```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "max_tokens": 1024,
  "temperature": 0.3,
  "stream": false
}
```

Response: `response.choices[0].message.content`

### Pricing

| Model | Input (miss) | Input (hit) | Output |
|-------|-------------|-------------|--------|
| deepseek-chat | $0.27/1M | $0.028/1M | $1.10/1M |

**Automatic caching** -- no explicit `cache_control` needed. Repeated prefixes cached automatically at 90% discount.

### Key Parameters

- Context: 128K tokens input
- Max output: 8K (chat), 64K (reasoner)
- Temperature: 0-2 (default 1)
- Tools: up to 128 definitions
- No fixed rate limits (but may return empty lines under load)

### Error Codes

| Code | Meaning | Retryable? |
|------|---------|-----------|
| 429 | Too many requests | Yes |
| 500 | Server error | Yes |
| 503 | Overloaded | Yes |
| 401 | Auth failure | No |
| 402 | Insufficient balance | No |

### Quirks
- `finish_reason: "insufficient_system_resource"` -- unique to DeepSeek
- No `x-ratelimit-*` response headers
- Off-peak discounts (16:30-00:30 GMT): up to 50-75% off

### Sources
- [DeepSeek API Docs](https://api-docs.deepseek.com/)
- [Pricing Details USD](https://api-docs.deepseek.com/quick_start/pricing-details-usd)

---

## Web Research: CommonJS Provider Abstraction Patterns

### Recommended: Factory + Strategy Pattern

Each provider gets its own module with a common interface: `chat()`, `parseResponse()`, `isRetryable()`.

### Key Design Decisions

1. **Separate modules per provider** -- do NOT try to unify request formats. Claude's separate `system` field, `x-api-key` header, and `content[0].text` response path are too different from OpenAI/DeepSeek's `messages` array, `Bearer` auth, and `choices[0].message.content`.

2. **Use `https.request()` directly** -- n8n sandbox lacks `fetch` and `axios`. The built-in module is the only option.

3. **Per-provider retryable codes** -- Claude uses 529 (overloaded), DeepSeek uses 503. A shared `isRetryable()` won't work.

4. **Jitter in backoff** -- `random * exponentialDelay` prevents thundering herd on retries.

5. **Response normalization at parse time** -- each provider's `parseResponse()` transforms raw API response to common `{ content, usage }` shape.

### Response Format Differences

| Aspect | Claude Messages API | DeepSeek (OpenAI-compat) |
|--------|-------------------|-------------------------|
| Content | `response.content[0].text` | `response.choices[0].message.content` |
| Input tokens | `usage.input_tokens` | `usage.prompt_tokens` |
| Output tokens | `usage.output_tokens` | `usage.completion_tokens` |
| Cache read | `usage.cache_read_input_tokens` | `usage.prompt_cache_hit_tokens` |
| System prompt | Separate `system` field | In `messages` array |
| Auth | `x-api-key: KEY` | `Authorization: Bearer KEY` |

### HTTPS POST Helper Pattern

```javascript
function httpPost(hostname, path, body, headers, timeout) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
      timeout: timeout || 30000,
    };
    const req = require('https').request(opts, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => { /* parse and resolve/reject based on status */ });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data);
    req.end();
  });
}
```

### Sources
- [LocalSite-ai Provider System](https://deepwiki.com/weise25/LocalSite-ai/2.1-ai-provider-system)
- [Node.js HTTPS Module Docs](https://nodejs.org/api/https.html)
- [Retrying API Calls with Exponential Backoff](https://bpaulino.com/entries/retrying-api-calls-with-exponential-backoff)

---

## Spec vs Reality: Key Discrepancies

1. **Spec says 10 content files need migration** -- only **3** actually call Claude API. The other 7 (generate-lead-magnet, reddit-monitor, x-engagement, x-auto-post, weekly-newsletter, send-outreach) either don't exist yet or don't make AI calls.

2. **Spec says `anthropic-beta: prompt-caching-2024-07-31` header needed** -- this is outdated. Prompt caching is now GA, no beta header required.

3. **Spec says Claude model = `claude-sonnet-4-6`** -- codebase uses `claude-sonnet-4-6-20250514` (dated variant) in some files. Need to standardize.

4. **Spec says DeepSeek pricing = $0.27/1M input** -- confirmed accurate for cache misses. Automatic caching provides additional savings.

5. **Spec assumes `require('https')` for API calls** -- codebase actually uses `fetchFn` (n8n injected). The ai-client.js abstraction should accept `fetchFn` as a parameter for n8n compatibility, OR use raw `https` module.

6. **score-alert.js uses Haiku, not Sonnet** -- spec routes it to DeepSeek, but current model is Haiku. This is correct per the routing table (CAT 9 = classification task).

7. **generate-article.js uses Tool Use** -- ai-client.js abstraction needs to support `tools` and `tool_choice` parameters, not just text completion.
