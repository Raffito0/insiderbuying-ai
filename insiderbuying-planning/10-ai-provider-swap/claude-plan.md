# Implementation Plan: AI Provider Swap

## Overview

This plan creates a shared `ai-client.js` abstraction that routes AI calls to either Claude Sonnet 4 or DeepSeek V3.2, depending on the task category. It migrates the 3 existing API-calling files (`generate-article.js`, `score-alert.js`, `analyze-alert.js`) to use the abstraction, implements Claude prompt caching for 90% input cost reduction, and documents patterns for 7 future files.

### Why

Currently, each file makes direct HTTPS calls to the Anthropic API with duplicated retry logic, error handling, and response parsing. The abstraction provides:

1. **Cost optimization**: DeepSeek V3.2 at $0.27/1M input vs Claude at $3/1M for data-driven tasks
2. **Prompt caching**: 90% input cost reduction on repeated Claude system prompts
3. **Single point of change**: New providers, model upgrades, or API changes happen in one file
4. **Consistent error handling**: Retry with backoff, cost logging, and graceful degradation

### Context

**Codebase**: `n8n/code/insiderbuying/` -- 25 CommonJS files running in n8n Code node sandbox. All HTTP calls use `fetchFn` (n8n's injected function). Tests use Jest v30.3.0 with mocked `fetchFn`.

**Current API calls**: 3 files call Claude directly. `generate-article.js` uses Tool Use (structured output via `tools` + `tool_choice`). `score-alert.js` uses Haiku for 1-10 scoring. `analyze-alert.js` uses Sonnet for prose analysis.

**Constraints**: CommonJS only, `fetchFn` as HTTP client, no external deps, tests must pass at every commit.

---

## Section 1: ai-client.js -- Provider Abstraction

### Architecture

`ai-client.js` exports an `AIClient` class and two factory functions. The class accepts `fetchFn` and provider config, then handles request formatting, response parsing, retry, caching, and cost logging per provider.

```javascript
class AIClient {
  constructor(fetchFn, config)
  async complete(systemPrompt, userPrompt, opts)
  async completeWithCache(systemPrompt, userPrompt, opts)
  async completeToolUse(systemPrompt, userPrompt, tools, toolChoice, opts)  // opts.cache: boolean enables caching
}

function createClaudeClient(fetchFn, apiKey)
function createDeepSeekClient(fetchFn, apiKey)
```

### Provider-specific request formatting

**Claude requests** go to `https://api.anthropic.com/v1/messages` with:
- Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Body: separate `system` field (not in messages), `model`, `max_tokens`, `temperature`, `messages`
- Caching: top-level `cache_control: {type: "ephemeral"}` on `completeWithCache()` calls
- Tool Use: `tools` array and `tool_choice` object passed through on `completeToolUse()`
- Response: `data.content[0].text` for text, `data.content.find(c => c.type === 'tool_use').input` for Tool Use. **Must handle missing tool_use block**: if model refuses the tool call or returns text-only, `find()` returns undefined. Throw descriptive error with the text content instead of crashing on `.input`

**DeepSeek requests** go to `https://api.deepseek.com/chat/completions` with:
- Headers: `Authorization: Bearer {key}`, `Content-Type: application/json`
- Body: OpenAI-compatible `messages` array (system prompt as `role: "system"` message), `model: "deepseek-chat"`, `max_tokens`, `temperature`, `stream: false`
- No explicit caching config needed (automatic)
- Response: `data.choices[0].message.content`
- **JSON response safety**: DeepSeek often wraps JSON in markdown fences (```json ... ```). Any code parsing JSON from DeepSeek responses must strip markdown fences first. For scoring calls, also consider `response_format: {type: "json_object"}` in the request body (requires "json" in the prompt text)
- **Language safety**: Prompts sent to DeepSeek should include "Respond in English only" as part of the system message to prevent Chinese-language responses

### Retry logic

Retry with exponential backoff + jitter. Per-provider retryable status codes:
- Claude: 429 (rate limit), 529 (overloaded)
- DeepSeek: 429 (rate limit), 500 (server error), 503 (overloaded)

Config per provider:
- Claude: max 2 retries, base delay 500ms, max delay 10s
- DeepSeek: max 3 retries, base delay 1000ms, max delay 30s (DeepSeek V3 has current instability, needs more generous retry)

Jitter: random 0-100% of calculated delay added to each retry delay.

**Network error handling**: The `fetchFn` call must be wrapped in try/catch within the retry loop. Network-level errors (`ECONNRESET`, `ETIMEDOUT`, connection refused) throw JavaScript errors before any HTTP response exists. These must be caught and treated as retryable -- otherwise `response.status` throws `TypeError`.

Non-retryable HTTP errors (401, 402, 400) throw immediately.

### Timeouts

Each provider has an explicit timeout passed to `fetchFn`:
- Claude: 30s (typical response 5-15s)
- DeepSeek: 60s (can be slow under load)

If `fetchFn` supports a timeout option, pass it. If not, document that n8n's default timeout applies.

### Cost logging

Each call logs to console:
```
[ai-client] claude sonnet-4 | in:2450 out:830 cache:1800r | $0.0087
[ai-client] deepseek chat | in:450 out:120 | $0.0003
```

Pricing constants:
- Claude Sonnet: input $3/1M, cached read $0.30/1M, cached write $3.75/1M, output $15/1M
- DeepSeek Chat: input $0.27/1M, output $1.10/1M

**Security discipline**: Cost logging must ONLY output provider name, model, token counts, and cost. Never log prompts, API keys, request bodies, or response content. n8n execution logs are visible to workspace users.

### Return shape

All methods return a normalized object:

```javascript
{
  content: string,           // text response or null for tool use
  toolResult: object | null, // parsed tool use input (only for completeToolUse)
  usage: {
    inputTokens: number,
    outputTokens: number,
    cacheReadTokens: number,
    cacheWriteTokens: number,
  },
  cached: boolean,           // true if cache_read > 0
  estimatedCost: number,     // USD
}
```

### Factory functions

```javascript
function createClaudeClient(fetchFn, apiKey)
  // Returns AIClient configured for Claude Sonnet 4, temperature 0.7, max_tokens 4096

function createDeepSeekClient(fetchFn, apiKey)
  // Returns AIClient configured for DeepSeek V3.2, temperature 0.3, max_tokens 2048
```

Callers can override temperature, max_tokens, and model per-call via `opts`.

---

## Section 2: ai-client.test.js -- Test Suite

Test file at `tests/insiderbuying/ai-client.test.js`.

### Test categories

**Claude text completion:**
- Correct request format (URL, headers, body structure with separate `system` field)
- Response parsing (`content[0].text` → `content` field)
- Token usage mapping (`input_tokens` → `inputTokens`, etc.)

**Claude prompt caching:**
- `completeWithCache()` adds `cache_control: {type: "ephemeral"}` to request
- `complete()` does NOT add cache_control
- Cache hit detection (`cache_read_input_tokens > 0` → `cached: true`)
- Cost calculation uses cached pricing when cache hit

**Claude Tool Use:**
- `completeToolUse()` includes `tools` and `tool_choice` in request
- Response parsing: extracts `tool_use` content block → `toolResult`
- Handles mixed text + tool_use responses (extracts tool result only)

**DeepSeek text completion:**
- Correct request format (URL, `Authorization: Bearer`, body with system in messages array)
- Response parsing (`choices[0].message.content` → `content`)
- Token usage mapping (`prompt_tokens` → `inputTokens`, etc.)

**Retry logic:**
- Retries on 429 with increasing delay
- Claude retries on 529
- DeepSeek retries on 503
- Does NOT retry on 401/400
- Returns after max retries exceeded (throws error)

**Cost logging:**
- Verify `console.log` called with provider, model, token counts, cost
- Verify correct pricing applied per provider
- Verify NO prompts, API keys, or response content in logs

**Network errors:**
- fetchFn throwing `ECONNRESET` triggers retry (not TypeError)
- fetchFn throwing after max retries surfaces the original error

**Edge cases:**
- Tool Use with no `tool_use` block in response (safety refusal) throws descriptive error
- DeepSeek JSON response wrapped in markdown fences parses correctly
- Missing `usage` fields default to 0 (defensive null-coalescing)
- Timeout handling (if fetchFn supports it)

### Mocking approach

Mock `fetchFn` (same pattern as existing tests):
```javascript
function makeFetch(response, ok = true, status = 200)
  // Returns jest.fn().mockResolvedValue({ ok, status, json: async () => response })
```

---

## Section 3: Migrate generate-article.js to Claude Client

### Current state

`callClaudeToolUse()` (lines ~750-820) makes a direct `fetchFn` call to Anthropic API with Tool Use parameters. Uses `claude-sonnet-4-6-20250514`, temperature 0.6, includes `tools` and `tool_choice`.

### Changes

1. Import `createClaudeClient` from `./ai-client`
2. Create client instance at module level or in the main function, passing `fetchFn` and `env.ANTHROPIC_API_KEY`
3. Replace `callClaudeToolUse()` body with `client.completeToolUse(systemPrompt, userPrompt, tools, toolChoice, { temperature: 0.6, model: 'claude-sonnet-4-6-20250514', cache: true })`
4. Update response handling: instead of `extractToolResult(response)`, use `result.toolResult` directly
5. Use `completeWithCache()` for the system prompt (generate-article.js has a ~3K token system prompt that's reused across articles -- prime caching candidate)
6. Remove the old `callClaudeToolUse()` function and any direct Anthropic URL/header references
7. Preserve all prompt text, quality gates, and business logic exactly as-is

### Caching opportunity

The `ARTICLE_SYSTEM_PROMPT` template is ~3K tokens after interpolation. With prompt caching, the first call per 5-minute window pays 1.25x ($3.75/1M), subsequent calls pay 0.1x ($0.30/1M).

**Cache economics warning**: Cache TTL is 5 minutes. If articles are generated more than 5 minutes apart (e.g., triggered by individual webhooks spread throughout the day), cache writes cost 25% MORE than uncached calls with zero cache hits. Caching only saves money when multiple calls happen within a 5-minute window (batch processing). After deployment, monitor the cache hit rate via `usage.cache_read_input_tokens` in cost logs. If hit rate is below 50%, disable caching to save 25% on input costs.

### Test updates

Update any generate-article tests that mock `fetchFn` to instead mock `createClaudeClient` or the `AIClient` methods.

---

## Section 4: Migrate score-alert.js to DeepSeek Client

### Current state

`callHaiku()` (lines ~253-290) calls Anthropic API with `claude-haiku-4-5-20251001`. Returns `{ score: 1-10, reasoning: string }` JSON. Has 3-attempt retry with linear backoff.

### Changes

1. Import `createDeepSeekClient` from `./ai-client`
2. Create client instance passing `fetchFn` and `env.DEEPSEEK_API_KEY`
3. Replace `callHaiku()` body with `client.complete(null, prompt, { temperature: 0.3 })`
4. Parse `result.content` as JSON. **Strip markdown fences first**: DeepSeek frequently wraps JSON in ```json ... ``` blocks. Use a sanitizer (regex strip of code fences) before `JSON.parse()`. Alternatively, pass `response_format: {type: "json_object"}` in the request opts (requires "json" to appear in the prompt text -- `buildHaikuPrompt` already says "Return ONLY JSON")
5. Remove the old retry loop (ai-client handles retries)
6. Keep the `HAIKU_DEFAULT` fallback object -- if `client.complete()` throws after retries, catch and return defaults
7. Remove all Anthropic URL/header/model references
8. Add `DEEPSEEK_API_KEY` to the env var requirements in e2e-monitoring.js's `validateEnv()`

### Prompt preservation

The `buildHaikuPrompt(filing, trackRecord)` function stays unchanged. It builds a prompt that asks for JSON `{ score, reasoning }`. This works identically with DeepSeek -- the model change is transparent.

### Risk mitigation

DeepSeek quality for this scoring task is untested (cost projection only). The abstraction makes switching back trivial: change `createDeepSeekClient` → `createClaudeClient` and `DEEPSEEK_API_KEY` → `ANTHROPIC_API_KEY`. Recommend manual quality check on first ~50 scored filings after deployment.

### Test updates

`score-alert.test.js` (466 lines) currently mocks `fetchFn` to return Claude-format responses. Changes needed:
- Mock `createDeepSeekClient` instead of `fetchFn` for the scoring call
- Update expected response format (DeepSeek's `choices[0].message.content` instead of Claude's `content[0].text`)
- Retry tests: verify ai-client retry behavior is trusted (don't re-test retry in score-alert tests)
- Keep safe-default tests (verify score-alert still returns `HAIKU_DEFAULT` on errors)

---

## Section 5: Migrate analyze-alert.js to DeepSeek Client

### Current state

`callClaude()` (lines ~54-66) calls Anthropic API with `claude-sonnet-4-6`. Returns prose analysis (2-3 paragraphs). Has 2 retries with exponential backoff.

### Changes

1. Import `createDeepSeekClient` from `./ai-client`
2. Create client instance passing `fetchFn` and `env.DEEPSEEK_API_KEY`
3. Replace `callClaude()` body with `client.complete(null, prompt)`
4. Use `result.content` directly (prose text, no JSON parsing needed)
5. Remove old retry loop and Anthropic references
6. Keep error handling: if `client.complete()` throws, the filing analysis is skipped gracefully (existing behavior)

### Prompt preservation

`buildAnalysisPrompt(filing)` stays unchanged. It asks for 2-3 paragraphs of analysis prose. Works identically with DeepSeek.

### Test updates

`analyze-alert.test.js` currently mocks `fetchFn` with Claude-format response. Update to mock `createDeepSeekClient` and DeepSeek response format.

---

## Section 6: Cost Validation and Documentation

### Cost logging verification

After all migrations, run each file manually (or via n8n test execution) and verify console output shows correct:
- Provider name and model
- Token counts (input, output, cache read/write for Claude)
- Estimated cost in USD

### Monthly projections

At expected volumes:
- **Claude** (~30 articles/day × 2500 input + 2000 output per article, cached after first): ~$11/month
- **DeepSeek** (~100 scores/day × 500 tokens each + ~50 analyses/day × 1000 tokens each): ~$1/month

### Usage pattern documentation

Add a comment block at the top of `ai-client.js` documenting:
- How to create clients for each provider
- Example text completion, cached completion, and Tool Use calls
- How to switch a file from one provider to another
- Environment variables required

---

## Implementation Order

The sections should be implemented in this order due to dependencies:

1. **Section 1** (ai-client.js) -- foundation, all others depend on it
2. **Section 2** (ai-client.test.js) -- validates the foundation before using it
3. **Section 3** (generate-article.js) -- most complex migration (Tool Use + caching)
4. **Section 4** (score-alert.js) -- provider switch (Claude → DeepSeek)
5. **Section 5** (analyze-alert.js) -- simplest migration
6. **Section 6** (validation + docs) -- final verification

Each section includes its test updates. Tests must pass after each section.

---

## Environment Variables

After migration, the following env vars are required in n8n:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | ai-client.js (Claude) | Claude API authentication |
| `DEEPSEEK_API_KEY` | ai-client.js (DeepSeek) | DeepSeek API authentication (NEW) |

The `DEEPSEEK_API_KEY` must be added to the n8n environment before deploying. Add it to `e2e-monitoring.js`'s `validateEnv()` required list.

---

## Rollback Plan

If DeepSeek quality is unacceptable for scoring or analysis:

1. In `score-alert.js`: change `createDeepSeekClient(fetchFn, env.DEEPSEEK_API_KEY)` → `createClaudeClient(fetchFn, env.ANTHROPIC_API_KEY)`
2. In `analyze-alert.js`: same change
3. No other code changes needed -- the abstraction makes provider switching a one-line change

If ai-client.js itself has issues, each file can revert to its original direct API calls since the prompt and business logic are untouched.
