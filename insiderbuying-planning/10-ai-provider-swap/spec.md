# Spec: 10-ai-provider-swap

## Purpose
Route all AI calls through the optimal provider for cost/quality. Create a shared `ai-client.js` abstraction. Switch CAT 1-7 files to Claude Sonnet 4.6 (human-facing content where tone matters). Switch CAT 8-12 files to DeepSeek V3.2 (data-driven tasks where structure > prose). Implement Claude prompt caching (90% input cost reduction on repeated system prompts).

## Scope
**Files modified**: All 10 content generation files (generate-article.js, generate-report.js, generate-lead-magnet.js, reddit-monitor.js, x-engagement.js, x-auto-post.js, score-alert.js, analyze-alert.js, weekly-newsletter.js, send-outreach.js)
**Files created**: `ai-client.js` — provider abstraction with Claude + DeepSeek + caching
**Tests created**: ai-client.test.js

## Constraints
- CommonJS only, `require('https')` for API calls
- Claude API: `https://api.anthropic.com/v1/messages` — `x-api-key` header
- DeepSeek API: `https://api.deepseek.com/v1/chat/completions` — `Authorization: Bearer` header, OpenAI-compatible format
- Prompt caching: Claude `cache_control: {type: "ephemeral"}` on system prompt blocks (cached for 5 min, 90% cheaper reads)
- Model IDs: Claude = `claude-sonnet-4-6`, DeepSeek = `deepseek-chat` (V3.2)
- Env vars: `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`
- Budget target: Claude ~$11/month, DeepSeek ~$1/month

## Routing Table
| File | Category | Provider | Reason |
|------|----------|----------|--------|
| generate-article.js | CAT 1 | Claude Sonnet | Human-read, AI detection risk |
| generate-report.js | CAT 2 | Claude Sonnet | Paid product, max quality |
| generate-lead-magnet.js | CAT 3 | Claude Sonnet | Trust-building, transparency |
| reddit-monitor.js | CAT 4+5+6 | Claude Sonnet | WSB/ValueInvesting detection-hotbed |
| x-engagement.js | CAT 7 | Claude Sonnet | High-follower audience |
| x-auto-post.js | CAT 8 | DeepSeek V3.2 | Numbers do the work |
| score-alert.js | CAT 9 | DeepSeek V3.2 | Pure classification |
| analyze-alert.js | CAT 10 | DeepSeek V3.2 | Structured data text |
| weekly-newsletter.js | CAT 11 | DeepSeek V3.2 | Template-driven |
| send-outreach.js | CAT 12 | DeepSeek V3.2 | Formula email |

## Sections

### Section 1: ai-client.js — Provider Abstraction
Create `n8n/code/insiderbuying/ai-client.js`:

```javascript
class AIClient {
  constructor(provider, opts) {
    // provider: 'claude' | 'deepseek'
    // opts: { apiKey, model, maxTokens, temperature }
  }

  async complete(systemPrompt, userPrompt, opts) {
    // Returns: { content: string, inputTokens: number, outputTokens: number, cached: boolean }
  }

  async completeWithCache(systemPrompt, userPrompt, opts) {
    // Same as complete() but marks systemPrompt for caching (Claude only)
    // DeepSeek: falls back to regular complete()
  }
}
```

Claude implementation:
- POST to `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-beta: prompt-caching-2024-07-31`
- Prompt caching: wrap system in `{type: "text", text: "...", cache_control: {type: "ephemeral"}}`
- Retry on 529 (overloaded): 2 retries with 2s backoff
- Response: `response.content[0].text`

DeepSeek implementation:
- POST to `https://api.deepseek.com/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`, `Content-Type: application/json`
- OpenAI-compatible: `{model, messages: [{role: "system", ...}, {role: "user", ...}], max_tokens, temperature}`
- Response: `response.choices[0].message.content`

Factory functions:
- `createClaudeClient(apiKey)` — returns AIClient for Claude Sonnet, temp 0.7
- `createDeepSeekClient(apiKey)` — returns AIClient for DeepSeek V3.2, temp 0.3
- Pre-configured instances exported: `claude`, `deepseek`

Tests: mock HTTPS for both providers, verify correct request format, retry logic, caching headers

### Section 2: Claude Files Migration (CAT 1-3)
Update generate-article.js:
- Replace `callClaude()` / any direct Anthropic API calls → `const { claude } = require('./ai-client')`
- Use `claude.completeWithCache(SYSTEM_PROMPT, userPrompt)` — SYSTEM_PROMPT is the named-persona block (~3K tokens), cached
- Log token usage for cost tracking

Update generate-report.js:
- Each of 9 sequential section calls → `claude.complete()`
- Executive summary call → `claude.complete()`
- Bear case separate call → `claude.complete()`

Update generate-lead-magnet.js:
- Content generation calls → `claude.complete()`

### Section 3: Claude Files Migration (CAT 4-7)
Update reddit-monitor.js:
- All reply generation calls (CAT 4+5+6) → `claude.complete()`
- SUBREDDIT_TONE_MAP prompts are the system prompts (to be cacheble per subreddit)

Update x-engagement.js:
- Reply generation → `claude.complete()`
- Archetype prompts as system (cacheable)

### Section 4: DeepSeek Files Migration (CAT 8-12)
Update x-auto-post.js → `deepseek.complete()`
Update score-alert.js → `deepseek.complete()` (for the AI refinement ±1 step)
Update analyze-alert.js → `deepseek.complete()`
Update weekly-newsletter.js → `deepseek.complete()`
Update send-outreach.js → `deepseek.complete()`

For each file:
- Remove hardcoded Anthropic API call patterns
- Remove any references to `claude-haiku-*` model strings
- Replace with appropriate client call
- Preserve all prompt text exactly as-is (prompts are upgraded in later units)

## Cost Validation
After migration, add cost logging to ai-client.js:
```javascript
// Log each call: provider, model, inputTokens, outputTokens, cached, estimatedCost
// Claude: input $3/1M ($0.30/1M cached), output $15/1M
// DeepSeek: input $0.27/1M, output $1.10/1M
```
Monthly projections at expected volume should match: Claude ~$11, DeepSeek ~$1.

## Test Requirements
- ai-client.test.js: Claude request format, DeepSeek request format, caching header presence, retry on 529
- Each migrated file: existing tests pass with ai-client mock replacing direct Anthropic mock
- No file should import `@anthropic-ai/sdk` or make direct fetch to Anthropic/DeepSeek

## Definition of Done
- `grep -r "anthropic\|claude-haiku\|claude-3" n8n/code/insiderbuying/ --include="*.js"` returns only ai-client.js
- All 10 content files use ai-client.js
- Cost logger outputs reasonable estimates for test calls
- All existing tests pass
