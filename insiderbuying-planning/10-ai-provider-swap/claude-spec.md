# Combined Spec: AI Provider Swap

## Purpose

Route all AI calls through the optimal provider for cost/quality via a shared `ai-client.js` abstraction. Migrate existing Claude calls to the abstraction. Add DeepSeek V3.2 support for future data-driven tasks. Implement Claude prompt caching for 90% input cost reduction.

## Current State (from codebase research)

### Files calling Claude API today

| File | Lines | Function | Model | Purpose |
|------|-------|----------|-------|---------|
| generate-article.js | 1182 | `callClaudeToolUse()` | `claude-sonnet-4-6-20250514` | Article generation with Tool Use + quality gates |
| score-alert.js | 370 | `callHaiku()` | `claude-haiku-4-5-20251001` | Significance scoring (1-10 JSON) |
| analyze-alert.js | 172 | `callClaude()` | `claude-sonnet-4-6` | Filing analysis (2-3 paragraph prose) |

### API call pattern

All use `fetchFn` (n8n's injected HTTP function), direct HTTPS to `https://api.anthropic.com/v1/messages`, with `x-api-key` header. No SDK. No abstraction layer.

### Error handling

- score-alert.js: 3 attempts, linear backoff (1s, 2s, 3s), returns safe defaults
- analyze-alert.js: 2 retries with exponential backoff
- generate-article.js: MAX_RETRIES = 2 for quality gate failures

### Testing

Jest v30.3.0. Tests mock `fetchFn`. Key test files: `score-alert.test.js` (466 lines), `analyze-alert.test.js`. Tests verify correct headers, model names, request body, retry logic.

## Target State

### ai-client.js Abstraction

A single `ai-client.js` file in `n8n/code/insiderbuying/` that:

1. **Accepts `fetchFn` as constructor parameter** (n8n compatibility)
2. **Supports Claude and DeepSeek** with provider-specific request/response handling
3. **Supports text completion AND Tool Use** (tools + tool_choice params)
4. **Implements automatic prompt caching** for Claude (top-level `cache_control: {type: "ephemeral"}`)
5. **Retry with exponential backoff + jitter** per provider (Claude retries on 429/529, DeepSeek on 429/500/503)
6. **Console cost logging** per call (provider, model, tokens, estimated cost)
7. **Factory functions** for preconfigured instances

### Provider Routing Table

| File | Category | Provider | Model | Reason |
|------|----------|----------|-------|--------|
| generate-article.js | CAT 1 | Claude | claude-sonnet-4-6-20250514 | Human-read content, AI detection risk, Tool Use |
| generate-report.js | CAT 2 | Claude | claude-sonnet-4-6 | Paid product, max quality |
| generate-lead-magnet.js | CAT 3 | Claude | claude-sonnet-4-6 | Trust-building content |
| reddit-monitor.js | CAT 4-6 | Claude | claude-sonnet-4-6 | Detection-hotbed subreddits |
| x-engagement.js | CAT 7 | Claude | claude-sonnet-4-6 | High-follower audience |
| x-auto-post.js | CAT 8 | DeepSeek | deepseek-chat | Numbers do the work |
| score-alert.js | CAT 9 | DeepSeek | deepseek-chat | Pure classification |
| analyze-alert.js | CAT 10 | DeepSeek | deepseek-chat | Structured data text |
| weekly-newsletter.js | CAT 11 | DeepSeek | deepseek-chat | Template-driven |
| send-outreach.js | CAT 12 | DeepSeek | deepseek-chat | Formula email |

### Claude Prompt Caching

- **Mode**: Automatic (top-level `cache_control: {type: "ephemeral"}`)
- **No beta header needed** (GA since late 2024)
- **Pricing**: Write = 1.25x base ($3.75/1M), Read = 0.1x base ($0.30/1M)
- **Minimum tokens**: 1,024 for Sonnet 4, 2,048 for Sonnet 4.6
- **Best candidates for caching**: generate-article.js system prompt (~3K tokens, reused across articles), reddit-monitor.js subreddit tone prompts, x-engagement.js archetype prompts

### DeepSeek V3.2

- **Endpoint**: `https://api.deepseek.com/chat/completions` (OpenAI-compatible)
- **Auth**: `Authorization: Bearer {key}`
- **Model**: `deepseek-chat`
- **Pricing**: Input $0.27/1M (cache miss), $0.028/1M (auto-cached), Output $1.10/1M
- **Automatic caching**: No explicit config needed, repeated prefixes cached at 90% discount
- **Context**: 128K input, 8K output
- **Response**: `response.choices[0].message.content`

### Response Format Differences

| Aspect | Claude | DeepSeek |
|--------|--------|----------|
| Content path | `content[0].text` | `choices[0].message.content` |
| Tool Use path | `content.find(c => c.type === 'tool_use').input` | `choices[0].message.tool_calls` |
| Input tokens | `usage.input_tokens` | `usage.prompt_tokens` |
| Output tokens | `usage.output_tokens` | `usage.completion_tokens` |
| Cache read | `usage.cache_read_input_tokens` | `usage.prompt_cache_hit_tokens` |
| System prompt | Separate `system` field | In `messages` array as role=system |
| Auth header | `x-api-key: KEY` | `Authorization: Bearer KEY` |

## Constraints

- CommonJS only (`require`/`module.exports`)
- `fetchFn` as HTTP client (n8n injected), NOT raw `https` or `fetch`
- Env vars: `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`
- No external dependencies beyond what n8n provides
- Budget target: Claude ~$11/month, DeepSeek ~$1/month
- Tests must pass at every commit (no temporary breakage)
- Future files (7 of 10) get documented patterns, not stub implementations

## Scope

### In scope

1. Create `ai-client.js` with AIClient class, factory functions, cost logging
2. Migrate `generate-article.js` to use `claude` client (with Tool Use)
3. Migrate `score-alert.js` from Haiku to `deepseek` client
4. Migrate `analyze-alert.js` to `deepseek` client
5. Create `ai-client.test.js` with comprehensive tests
6. Update existing tests (`score-alert.test.js`, `analyze-alert.test.js`) to mock ai-client
7. Document usage patterns for future files

### Out of scope

- Creating the 7 future content files
- Changing any prompts (preserved exactly as-is)
- Adding Airtable cost tracking
- A/B testing DeepSeek vs Claude quality
- SDK migration (staying with raw HTTP via fetchFn)

## Risk: DeepSeek Quality

score-alert.js and analyze-alert.js are being moved from Claude to DeepSeek based on cost projections only, without quality validation. The abstraction makes it trivial to switch back if quality degrades -- just change the factory function call. But initial deployment should include manual quality checks on the first ~50 scored/analyzed filings.

## Definition of Done

1. `ai-client.js` exists with Claude + DeepSeek support, text + Tool Use, caching, retry, cost logging
2. `ai-client.test.js` passes with mocked fetchFn for both providers
3. generate-article.js uses `claude` client from ai-client.js (Tool Use mode)
4. score-alert.js uses `deepseek` client from ai-client.js
5. analyze-alert.js uses `deepseek` client from ai-client.js
6. All existing tests updated and passing
7. `grep -r "anthropic\|claude-haiku\|claude-3" n8n/code/insiderbuying/ --include="*.js"` returns only ai-client.js
8. Console cost logging works for each call
