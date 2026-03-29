# Section 01: ai-client.js -- Provider Abstraction

## Overview

Create `n8n/code/insiderbuying/ai-client.js` -- a shared AI client abstraction that routes calls to either Claude Sonnet 4 or DeepSeek V3.2 depending on task category. This is the foundation file; all other sections depend on it.

The codebase is `n8n/code/insiderbuying/` -- 25 CommonJS files running inside the n8n Code node sandbox. All HTTP calls must use `fetchFn` (n8n's injected function). No external dependencies are allowed.

## Dependencies

None. This is the first section and has no prerequisites.

## Blocked by this section

- section-02-ai-client-tests (test suite for this file)
- section-03-migrate-generate-article
- section-04-migrate-score-alert
- section-05-migrate-analyze-alert

---

## Tests First

Test file: `tests/insiderbuying/ai-client.test.js`

All tests mock `fetchFn` using this helper pattern (same as existing project tests):

```javascript
function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  });
}
```

### Claude text completion tests

- `complete()` sends POST to `https://api.anthropic.com/v1/messages` with headers `x-api-key`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- `complete()` sends system prompt in a separate top-level `system` field (NOT inside messages array), user prompt in `messages` array as `{role: "user", content: userPrompt}`
- `complete()` parses `content[0].text` from response into `result.content`
- `complete()` maps `usage.input_tokens` to `inputTokens`, `usage.output_tokens` to `outputTokens`
- `complete()` returns `cached: false` when no cache tokens present in response

### Claude prompt caching tests

- `completeWithCache()` includes `cache_control: {type: "ephemeral"}` in the request body
- `complete()` does NOT include `cache_control` in the request body
- Response with `cache_read_input_tokens > 0` returns `cached: true`
- Cost calculation uses $0.30/1M for cached read tokens, $3.75/1M for cache write tokens

### Claude Tool Use tests

- `completeToolUse()` includes `tools` and `tool_choice` in request body
- `completeToolUse()` extracts the `tool_use` content block from the response and places it in `result.toolResult`
- `completeToolUse()` with `opts.cache: true` includes `cache_control`
- Response with text blocks before the `tool_use` block still extracts the tool result correctly
- Response with NO `tool_use` block (safety refusal) throws a descriptive error including the text content

### DeepSeek text completion tests

- `complete()` sends POST to `https://api.deepseek.com/chat/completions` with `Authorization: Bearer {key}` header
- `complete()` puts system prompt in the messages array as `{role: "system", content: systemPrompt}` -- NOT as a separate field
- `complete()` parses `choices[0].message.content` from response into `result.content`
- `complete()` maps `prompt_tokens` to `inputTokens`, `completion_tokens` to `outputTokens`
- `complete()` maps `prompt_cache_hit_tokens` to `cacheReadTokens`

### DeepSeek JSON safety tests

- `complete()` response content wrapped in ` ```json ... ``` ` is returned as-is (ai-client does NOT strip markdown fences -- the caller is responsible for stripping if needed)
- `response_format: {type: "json_object"}` is passed through when set in opts

### Retry logic tests

- `fetchFn` returning 429 triggers retry with increasing delay
- Claude: `fetchFn` returning 529 triggers retry
- DeepSeek: `fetchFn` returning 503 triggers retry
- `fetchFn` returning 401 throws immediately (no retry)
- `fetchFn` returning 400 throws immediately (no retry)
- Max retries exceeded throws the last error
- `fetchFn` throwing a network error (JavaScript error, not HTTP response) triggers retry
- `fetchFn` throwing a network error after max retries surfaces the original error
- DeepSeek uses max 3 retries (not 2 like Claude)
- Retry delays include jitter (allow +/-20% tolerance in timing assertions)

### Cost logging tests

- `console.log` is called with provider name and model after each successful call
- `console.log` includes token counts (input, output, cache read/write)
- `console.log` includes estimated cost in USD
- Claude cost uses $3/1M input, $15/1M output
- DeepSeek cost uses $0.27/1M input, $1.10/1M output

### Factory function tests

- `createClaudeClient()` returns a client with Claude defaults (temperature 0.7)
- `createDeepSeekClient()` returns a client with DeepSeek defaults (temperature 0.3)
- Per-call opts override factory defaults (e.g., passing `{temperature: 0.2}` to `complete()` overrides the default)

### Edge case tests

- Missing `usage` fields in response default to 0 (defensive null-coalescing)
- Empty `content` array in Claude response returns empty string for `result.content`
- Null or undefined system prompt is handled gracefully (no system field sent for Claude, no system message for DeepSeek)

---

## Implementation

### File location

`n8n/code/insiderbuying/ai-client.js` -- CommonJS module.

### Exports

```javascript
class AIClient {
  constructor(fetchFn, config)
  async complete(systemPrompt, userPrompt, opts)
  async completeWithCache(systemPrompt, userPrompt, opts)
  async completeToolUse(systemPrompt, userPrompt, tools, toolChoice, opts)
}

function createClaudeClient(fetchFn, apiKey)
function createDeepSeekClient(fetchFn, apiKey)

module.exports = { AIClient, createClaudeClient, createDeepSeekClient };
```

### Constructor config shape

The `config` object passed to `AIClient` contains all provider-specific details:

- `provider`: `"claude"` or `"deepseek"` -- determines request/response formatting
- `apiKey`: the API key string
- `baseUrl`: the API endpoint URL
- `model`: default model string
- `temperature`: default temperature
- `maxTokens`: default max_tokens
- `timeout`: request timeout in milliseconds
- `maxRetries`: maximum retry attempts
- `baseDelay`: base retry delay in milliseconds
- `maxDelay`: maximum retry delay in milliseconds
- `retryableStatuses`: array of HTTP status codes that trigger retry

### Provider-specific request formatting

**Claude** requests go to `https://api.anthropic.com/v1/messages`:

- Headers: `x-api-key: {apiKey}`, `anthropic-version: 2023-06-01`, `content-type: application/json`
- Body structure: `system` as a separate top-level field (NOT inside messages), `model`, `max_tokens`, `temperature`, `messages: [{role: "user", content: userPrompt}]`
- Caching: when `completeWithCache()` is called, add `cache_control: {type: "ephemeral"}` at the top level of the request body
- Tool Use: when `completeToolUse()` is called, include `tools` array and `tool_choice` object in the request body. If `opts.cache` is true, also add `cache_control`
- Response parsing: `data.content[0].text` for text completions. For Tool Use, find the content block with `type === "tool_use"` and return its `input` field as `toolResult`. If no `tool_use` block exists (safety refusal), throw an error that includes whatever text the model returned so the caller can debug

**DeepSeek** requests go to `https://api.deepseek.com/chat/completions`:

- Headers: `Authorization: Bearer {apiKey}`, `Content-Type: application/json`
- Body structure: OpenAI-compatible `messages` array where system prompt goes as `{role: "system", content: systemPrompt}` followed by `{role: "user", content: userPrompt}`. Also: `model: "deepseek-chat"`, `max_tokens`, `temperature`, `stream: false`
- No explicit caching config needed (DeepSeek caches automatically)
- If `opts.response_format` is set, pass it through in the request body (used for JSON mode -- requires the word "json" to appear somewhere in the prompt text)
- Response parsing: `data.choices[0].message.content`
- DeepSeek often wraps JSON in markdown fences (` ```json ... ``` `). The ai-client does NOT strip these -- callers must handle it if they need JSON parsing. This design decision keeps the client simple and lets callers decide when/how to sanitize

### Retry logic

Implement retry with exponential backoff plus jitter inside the `complete`/`completeWithCache`/`completeToolUse` methods. The retry loop wraps the entire `fetchFn` call in a try/catch.

Per-provider retry configuration:

| Setting | Claude | DeepSeek |
|---------|--------|----------|
| maxRetries | 2 | 3 |
| baseDelay | 500ms | 1000ms |
| maxDelay | 10s | 30s |
| retryableStatuses | 429, 529 | 429, 500, 503 |

Backoff formula: `delay = min(baseDelay * 2^attempt, maxDelay)`. Jitter: add random 0-100% of the calculated delay.

**Network error handling**: The `fetchFn` call itself can throw JavaScript errors for network-level failures (ECONNRESET, ETIMEDOUT, connection refused). These errors happen before any HTTP response exists, so checking `response.status` would throw `TypeError`. The try/catch inside the retry loop must catch these and treat them as retryable. After max retries, surface the original network error to the caller.

**Non-retryable errors**: HTTP status codes 401 (unauthorized), 402 (payment required), and 400 (bad request) must throw immediately without any retry. These indicate configuration problems, not transient failures.

### Timeouts

Pass an explicit timeout to `fetchFn` for each provider:

- Claude: 30s (typical responses take 5-15s)
- DeepSeek: 60s (can be slow under load, V3.2 has current instability)

If `fetchFn` does not support a timeout option, document this limitation but do not fail -- n8n's default timeout will apply.

### Cost logging

After each successful API call, log one line to console with:

```
[ai-client] claude sonnet-4 | in:2450 out:830 cache:1800r | $0.0087
[ai-client] deepseek chat | in:450 out:120 | $0.0003
```

Pricing constants to use:

| Provider | Input | Cached Read | Cached Write | Output |
|----------|-------|-------------|--------------|--------|
| Claude Sonnet | $3.00/1M | $0.30/1M | $3.75/1M | $15.00/1M |
| DeepSeek Chat | $0.27/1M | -- | -- | $1.10/1M |

**Security rule**: cost logging must ONLY output provider name, model, token counts, and cost. Never log prompts, API keys, request bodies, or response content. n8n execution logs are visible to workspace users.

### Return shape

All three methods (`complete`, `completeWithCache`, `completeToolUse`) return a normalized object:

```javascript
{
  content: string,           // text response (empty string if Tool Use only)
  toolResult: object | null, // parsed tool_use input (only for completeToolUse)
  usage: {
    inputTokens: number,     // 0 if missing from response
    outputTokens: number,    // 0 if missing from response
    cacheReadTokens: number, // 0 if missing from response
    cacheWriteTokens: number,// 0 if missing from response
  },
  cached: boolean,           // true if cacheReadTokens > 0
  estimatedCost: number,     // USD as float
}
```

Fields that are missing from the provider response must default to 0 (use `?? 0` or `|| 0`). This prevents crashes when providers change their response format.

### Factory functions

```javascript
function createClaudeClient(fetchFn, apiKey) {
  // Returns new AIClient(fetchFn, {
  //   provider: 'claude',
  //   apiKey,
  //   baseUrl: 'https://api.anthropic.com/v1/messages',
  //   model: 'claude-sonnet-4-6-20250514',
  //   temperature: 0.7,
  //   maxTokens: 4096,
  //   timeout: 30000,
  //   maxRetries: 2,
  //   baseDelay: 500,
  //   maxDelay: 10000,
  //   retryableStatuses: [429, 529],
  // })
}

function createDeepSeekClient(fetchFn, apiKey) {
  // Returns new AIClient(fetchFn, {
  //   provider: 'deepseek',
  //   apiKey,
  //   baseUrl: 'https://api.deepseek.com/chat/completions',
  //   model: 'deepseek-chat',
  //   temperature: 0.3,
  //   maxTokens: 2048,
  //   timeout: 60000,
  //   maxRetries: 3,
  //   baseDelay: 1000,
  //   maxDelay: 30000,
  //   retryableStatuses: [429, 500, 503],
  // })
}
```

Callers can override `temperature`, `maxTokens`, and `model` per-call via the `opts` parameter on any method. Per-call opts take precedence over factory defaults.

### Usage documentation header

Add a comment block at the top of `ai-client.js` documenting:

1. How to create clients for each provider
2. Example text completion call
3. Example cached completion call
4. Example Tool Use call
5. How to switch a file from one provider to another (one-line change)
6. Required environment variables (`ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`)

### Internal method structure

The class should have a single private `_call(requestBody, opts)` method that handles:

1. Building provider-specific headers
2. Making the `fetchFn` call inside a try/catch
3. Retry loop with backoff + jitter
4. Parsing the provider-specific response into the normalized return shape
5. Computing cost and logging

The three public methods (`complete`, `completeWithCache`, `completeToolUse`) build the provider-specific request body and delegate to `_call()`. This avoids duplicating retry, parsing, and logging logic across methods.

### Key implementation gotchas

1. **Claude `system` field**: Claude API requires the system prompt as a separate top-level field, NOT as a message in the messages array. DeepSeek uses the opposite pattern (system prompt IS a message). The provider check must route correctly.

2. **Tool Use response extraction**: Claude returns an array of content blocks. A successful Tool Use response may include both `text` blocks AND a `tool_use` block. Use `data.content.find(c => c.type === 'tool_use')` to find it. If `find()` returns `undefined`, the model refused the tool call -- throw an error with the text content (from `data.content.filter(c => c.type === 'text').map(c => c.text).join('')`) so the caller can see why.

3. **DeepSeek does NOT support Tool Use**: The `completeToolUse()` method should throw immediately if called on a DeepSeek client. This prevents silent bugs.

4. **Cache control placement**: For Claude, `cache_control: {type: "ephemeral"}` goes at the top level of the request body alongside `system`, `messages`, etc.

5. **Network errors vs HTTP errors**: `fetchFn` can throw JavaScript errors (no `.status` property) OR return HTTP error responses (`.ok === false`, `.status` exists). The retry logic must handle both paths. Check `instanceof Error` or absence of `.status` to distinguish.

6. **Null system prompt**: If `systemPrompt` is null/undefined, Claude requests should omit the `system` field entirely. DeepSeek requests should omit the system message from the messages array. Do not send `system: null` or `{role: "system", content: null}`.
