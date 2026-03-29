# Spec: 10-ai-provider-swap

## Purpose
Route all AI calls through a 2-tier provider system for maximum quality at minimum cost. Create a shared `ai-client.js` abstraction with 3 providers: Claude Opus 4.6 via kie.ai (primary — highest quality, cheaper than Sonnet direct), DeepSeek V3.2 (data-driven tasks), and Claude Sonnet direct as optional fallback. Implement prompt caching for Opus calls.

## Scope
**Files modified**: All 10 content generation files (generate-article.js, generate-report.js, generate-lead-magnet.js, reddit-monitor.js, x-engagement.js, x-auto-post.js, score-alert.js, analyze-alert.js, weekly-newsletter.js, send-outreach.js)
**Files created**: `ai-client.js` — provider abstraction with Opus/DeepSeek + caching
**Tests created**: ai-client.test.js

## Constraints
- CommonJS only, `require('https')` for API calls
- kie.ai API: Anthropic-compatible endpoint (same request/response format as `api.anthropic.com`). Headers: `x-api-key` with kie.ai API key
- DeepSeek API: `https://api.deepseek.com/v1/chat/completions` — `Authorization: Bearer` header, OpenAI-compatible format
- Prompt caching: Claude `cache_control: {type: "ephemeral"}` on system prompt blocks (works through kie.ai proxy)
- Model IDs: Opus = `claude-opus-4-6`, DeepSeek = `deepseek-chat` (V3.2)
- Env vars: `KIEAI_API_KEY`, `DEEPSEEK_API_KEY`, `ANTHROPIC_API_KEY` (fallback only)
- Budget target: Opus via kie.ai ~$7.50/month, DeepSeek ~$1/month. Total ~$8.50/month

## Routing Table — 2 Tier System

### Tier 1: Claude Opus 4.6 via kie.ai ($1.75/$8.75 per 1M tokens)
Maximum quality for all human-facing content. Cheaper than Sonnet direct ($3/$15).

| File | Category | Why Opus |
|------|----------|----------|
| generate-article.js | CAT 1 | Article outline + full draft — natural prose, passes AI detection |
| generate-report.js | CAT 2 | Premium reports — 9 sections + bear case + exec summary. Paid product |
| generate-lead-magnet.js | CAT 3 | Trust-building lead magnet, honest losers section |
| reddit-monitor.js | CAT 4+5+6 | Replies + daily thread + DD posts. Tone authenticity critical on Reddit |
| x-engagement.js | CAT 7 | Replies to high-follower accounts. Must feel human in 30s |
| x-auto-post.js | CAT 8 | X posts — better hooks, more engaging copy |
| analyze-alert.js | CAT 10 (score >= 9) | High-conviction alerts — the content users pay for |
| weekly-newsletter.js | CAT 11 | All 6 sections — "smart friend" tone throughout |
| send-outreach.js | CAT 12 (email #1) | First contact with prospects — personalization matters |
| ALL files | Anti-AI review | "Rate human-likeness 1-10" calls |

### Tier 2: DeepSeek V3.2 ($0.27/$1.10 per 1M tokens)
Data-driven tasks where structure matters more than prose.

| File | Category | Why DeepSeek |
|------|----------|--------------|
| score-alert.js | CAT 9 | Pure classification: adjust score ±1 |
| analyze-alert.js | CAT 10 (score < 9) | Brief structured text, data-driven |
| send-outreach.js | CAT 12 (follow-up 2/3) | Short formulaic follow-ups |

## Sections

### Section 1: ai-client.js — Provider Abstraction
Create `n8n/code/insiderbuying/ai-client.js`:

```javascript
class AIClient {
  constructor(provider, opts) {
    // provider: 'opus' | 'deepseek' | 'sonnet-fallback'
    // opts: { apiKey, baseUrl, model, maxTokens, temperature }
  }

  async complete(systemPrompt, userPrompt, opts) {
    // Returns: { content: string, inputTokens: number, outputTokens: number, cached: boolean }
  }

  async completeWithCache(systemPrompt, userPrompt, opts) {
    // Same as complete() but marks systemPrompt for caching (Claude/kie.ai only)
    // DeepSeek: falls back to regular complete()
  }
}
```

**Opus via kie.ai implementation:**
- POST to kie.ai API endpoint (Anthropic-compatible format)
- Headers: `x-api-key: {KIEAI_API_KEY}`, `anthropic-version: 2023-06-01`
- Model: `claude-opus-4-6`
- Prompt caching: wrap system in `{type: "text", text: "...", cache_control: {type: "ephemeral"}}`
- Retry on 529 (overloaded): 2 retries with 2s backoff
- Response: `response.content[0].text`
- **Fallback**: if kie.ai fails 3 times consecutively, auto-switch to Anthropic direct for that call using `ANTHROPIC_API_KEY` with Sonnet model (graceful degradation)

**DeepSeek implementation:**
- POST to `https://api.deepseek.com/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`, `Content-Type: application/json`
- OpenAI-compatible: `{model, messages: [{role: "system", ...}, {role: "user", ...}], max_tokens, temperature}`
- Response: `response.choices[0].message.content`

**Factory functions:**
- `createOpusClient(apiKey)` — returns AIClient for Opus via kie.ai, temp 0.7
- `createDeepSeekClient(apiKey)` — returns AIClient for DeepSeek V3.2, temp 0.3
- Pre-configured instances exported: `opus`, `deepseek`
- `opus` is the default for all content generation

Tests: mock HTTPS for both providers, verify correct request format, retry logic, caching headers, fallback to Anthropic direct on kie.ai failure

### Section 2: Opus Files Migration (CAT 1-3)
Update generate-article.js:
- Replace `callClaude()` / any direct Anthropic API calls → `const { opus } = require('./ai-client')`
- Use `opus.completeWithCache(SYSTEM_PROMPT, userPrompt)` — SYSTEM_PROMPT is the named-persona block (~3K tokens), cached
- Log token usage for cost tracking

Update generate-report.js:
- Each of 9 sequential section calls → `opus.complete()`
- Executive summary call → `opus.complete()`
- Bear case separate call → `opus.complete()`

Update generate-lead-magnet.js:
- Content generation calls → `opus.complete()`

### Section 3: Opus Files Migration (CAT 4-8, 11)
Update reddit-monitor.js:
- All reply generation calls (CAT 4+5+6) → `opus.complete()`
- SUBREDDIT_TONE_MAP prompts are the system prompts (cacheable per subreddit)

Update x-engagement.js:
- Reply generation → `opus.complete()`
- Archetype prompts as system (cacheable)

Update x-auto-post.js:
- All 4 post format generators → `opus.complete()`

Update weekly-newsletter.js:
- All 6 sections generated via → `opus.complete()`

### Section 4: DeepSeek Files Migration + Split Routing
Update score-alert.js → `deepseek.complete()` (for the AI refinement ±1 step)

Update analyze-alert.js — **split routing by score**:
```javascript
const { opus, deepseek } = require('./ai-client');
const ai = filing.score >= 9 ? opus : deepseek;
const analysis = await ai.complete(systemPrompt, userPrompt);
```

Update send-outreach.js — **split routing by follow-up stage**:
```javascript
const { opus, deepseek } = require('./ai-client');
const ai = prospect.followup_count === 0 ? opus : deepseek;
const email = await ai.complete(systemPrompt, userPrompt);
```

For each file:
- Remove hardcoded Anthropic API call patterns
- Remove any references to `claude-haiku-*` model strings
- Replace with appropriate client call
- Preserve all prompt text exactly as-is (prompts are upgraded in later units)

## Cost Validation
After migration, add cost logging to ai-client.js:
```javascript
// Log each call: provider, model, inputTokens, outputTokens, cached, estimatedCost
// Opus via kie.ai: input $1.75/1M ($0.175/1M cached), output $8.75/1M
// DeepSeek: input $0.27/1M, output $1.10/1M
```

Monthly projections at expected volume:

| Tier | Volume | Cost |
|------|--------|------|
| Opus kie.ai | ~45 articles + 8 reports + 1 lead magnet + 250 Reddit replies + 30 daily threads + 8 DD posts + 525 X replies + 120 X posts + 10 high-score analyses + 4 newsletters + 200 first emails + review calls | ~$7.50 |
| DeepSeek | ~1500 score refinements + ~90 low-score analyses + ~400 follow-up emails | ~$1.00 |
| **Total** | | **~$8.50/month** |

## Test Requirements
- ai-client.test.js: kie.ai request format, DeepSeek request format, caching header presence, retry on 529, fallback to Anthropic direct
- Each migrated file: existing tests pass with ai-client mock replacing direct Anthropic mock
- Split routing: analyze-alert routes to opus for score>=9, deepseek for score<9
- Split routing: send-outreach routes to opus for email #1, deepseek for follow-ups
- No file should import `@anthropic-ai/sdk` or make direct fetch to Anthropic/DeepSeek

## Definition of Done
- `grep -r "anthropic\|claude-haiku\|claude-3" n8n/code/insiderbuying/ --include="*.js"` returns only ai-client.js
- All 10 content files use ai-client.js with `opus` or `deepseek`
- Cost logger outputs reasonable estimates for test calls
- Fallback to Anthropic direct works when kie.ai is down
- All existing tests pass
