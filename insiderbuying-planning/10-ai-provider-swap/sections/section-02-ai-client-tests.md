# Section 02: ai-client.js Test Suite

## Overview

This section creates `tests/insiderbuying/ai-client.test.js` -- a comprehensive test suite for the `AIClient` class and its factory functions (`createClaudeClient`, `createDeepSeekClient`) built in Section 01. The tests validate request formatting, response parsing, retry logic, cost logging, caching, Tool Use, and edge cases for both Claude and DeepSeek providers.

**File to create**: `tests/insiderbuying/ai-client.test.js`

**Depends on**: Section 01 (ai-client.js must exist with `AIClient`, `createClaudeClient`, `createDeepSeekClient` exports)

**Blocks**: Sections 03, 04, 05 (migrations should not begin until these tests pass)

---

## Testing Framework and Conventions

- **Framework**: Jest v30.3.0 (already in project)
- **Location**: `tests/insiderbuying/ai-client.test.js`
- **Module format**: CommonJS (`require`/`module.exports`)
- **Mocking pattern**: Mock `fetchFn` as a `jest.fn()` returning shaped responses. This is the same pattern used across all existing `tests/insiderbuying/` test files.

### Mock Helper

All tests share a `makeFetch` helper that creates a mock `fetchFn`:

```javascript
function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  });
}
```

For retry and error tests, use `jest.fn()` with `.mockResolvedValueOnce()` / `.mockRejectedValueOnce()` chains to simulate sequences of failures then success.

### Imports

```javascript
const { AIClient, createClaudeClient, createDeepSeekClient } = require('../../n8n/code/insiderbuying/ai-client');
```

---

## Test Categories

### 1. Claude Text Completion

**Purpose**: Verify `complete()` on a Claude-configured client sends correctly formatted requests and parses responses.

Tests to write:

- **Correct request URL and headers**: `complete()` sends POST to `https://api.anthropic.com/v1/messages`. Headers include `x-api-key` set to the API key, `anthropic-version: 2023-06-01`, and `content-type: application/json`. Assert by inspecting `fetchFn.mock.calls[0]` for URL and the options object.

- **System prompt in separate field**: The request body must have `system` as a top-level field (string), NOT inside the `messages` array. The user prompt goes in `messages` as `[{ role: "user", content: userPrompt }]`. Parse the body from `fetchFn.mock.calls[0][1].body` (JSON string) and assert structure.

- **Response parsing**: Mock a Claude response shaped as `{ content: [{ type: "text", text: "Hello world" }], usage: { input_tokens: 100, output_tokens: 50 } }`. Assert `result.content === "Hello world"`.

- **Token usage mapping**: Assert `result.usage.inputTokens === 100`, `result.usage.outputTokens === 50`. Claude uses snake_case (`input_tokens`) -- the client maps to camelCase.

- **Cached flag false**: When the response has no `cache_read_input_tokens` or it is 0, assert `result.cached === false`.

### 2. Claude Prompt Caching

**Purpose**: Verify `completeWithCache()` enables prompt caching and cost calculations adjust accordingly.

Tests to write:

- **Cache control in request**: `completeWithCache()` must include `cache_control: { type: "ephemeral" }` in the request body. Assert its presence by parsing the body from `fetchFn`.

- **Regular complete() has no cache_control**: Call `complete()` on the same client and assert the request body does NOT contain `cache_control`.

- **Cache hit detection**: Mock a response with `usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 2000 }`. Assert `result.cached === true` and `result.usage.cacheReadTokens === 2000`.

- **Cost calculation with cache**: When cache read tokens are present, cost must use $0.30/1M for cached read tokens and $3.75/1M for cache write tokens, NOT the standard $3/1M input rate. Mock a response with `cache_read_input_tokens: 2000, cache_creation_input_tokens: 500, input_tokens: 100, output_tokens: 50`. Compute expected cost: `(100 * 3/1e6) + (2000 * 0.30/1e6) + (500 * 3.75/1e6) + (50 * 15/1e6)`. Assert `result.estimatedCost` is within 0.0001 of that value.

### 3. Claude Tool Use

**Purpose**: Verify `completeToolUse()` passes tool definitions and extracts structured output.

Tests to write:

- **Tools and tool_choice in request**: `completeToolUse(systemPrompt, userPrompt, tools, toolChoice)` must include `tools` and `tool_choice` in the request body exactly as passed.

- **Tool result extraction**: Mock a response with `content: [{ type: "text", text: "thinking..." }, { type: "tool_use", id: "xyz", name: "extract_article", input: { title: "Test", body: "Content" } }]`. Assert `result.toolResult` equals `{ title: "Test", body: "Content" }` and `result.content` is null (or the text, depending on design -- check Section 01 spec: `content` is null for Tool Use).

- **Cache opt-in for Tool Use**: `completeToolUse(system, user, tools, choice, { cache: true })` must include `cache_control` in the request. Without `{ cache: true }`, it must not.

- **Mixed text + tool_use**: Response with multiple text blocks before the tool_use block still extracts the tool result correctly. The `find(c => c.type === 'tool_use')` approach handles this.

- **No tool_use block (safety refusal)**: Mock a response with ONLY text blocks (no `tool_use` type). Assert that `completeToolUse()` throws an error. The error message must include the text content so the caller can diagnose why the model refused the tool call. Do NOT assert for a generic "undefined" or "TypeError" -- the error must be descriptive.

### 4. DeepSeek Text Completion

**Purpose**: Verify `complete()` on a DeepSeek-configured client uses the correct endpoint and response format.

Tests to write:

- **Correct request URL and headers**: POST to `https://api.deepseek.com/chat/completions`. Header `Authorization: Bearer {apiKey}`. Header `Content-Type: application/json`.

- **System prompt in messages array**: Unlike Claude, DeepSeek uses OpenAI-compatible format. System prompt goes as `{ role: "system", content: systemPrompt }` in the `messages` array, followed by `{ role: "user", content: userPrompt }`. Assert there is NO top-level `system` field.

- **Response parsing**: Mock `{ choices: [{ message: { content: "DeepSeek response" } }], usage: { prompt_tokens: 200, completion_tokens: 80 } }`. Assert `result.content === "DeepSeek response"`.

- **Token usage mapping**: Assert `result.usage.inputTokens === 200`, `result.usage.outputTokens === 80`. DeepSeek uses `prompt_tokens` / `completion_tokens`.

- **Cache read mapping**: DeepSeek reports cache hits as `prompt_cache_hit_tokens`. Mock a response with `usage: { prompt_tokens: 200, completion_tokens: 80, prompt_cache_hit_tokens: 150 }`. Assert `result.usage.cacheReadTokens === 150`.

### 5. DeepSeek JSON Safety

**Purpose**: Verify the client does not silently corrupt DeepSeek responses, and passes through format options.

Tests to write:

- **Markdown-fenced JSON returned as-is**: ai-client returns `result.content` verbatim. It does NOT strip markdown fences -- that is the caller's responsibility. Mock content as `` "```json\n{\"score\":7}\n```" ``. Assert `result.content` equals exactly that string.

- **response_format passthrough**: When `opts` includes `response_format: { type: "json_object" }`, assert the request body contains this field. This lets callers opt into DeepSeek's structured JSON mode.

### 6. Retry Logic

**Purpose**: Verify retries fire on the correct status codes, respect per-provider config, and surface errors correctly.

Tests to write:

- **429 triggers retry**: Mock `fetchFn` to return 429 on first call, then 200 on second. Assert the final result is from the successful call and `fetchFn` was called twice.

- **Claude 529 triggers retry**: Same pattern with status 529 on first call. Only valid for Claude client.

- **DeepSeek 503 triggers retry**: Same pattern with status 503 on first call. Only valid for DeepSeek client.

- **401 does NOT retry**: Mock `fetchFn` to return 401. Assert error is thrown immediately and `fetchFn` was called exactly once.

- **400 does NOT retry**: Same pattern with status 400. Assert no retry.

- **Max retries exceeded throws**: For Claude (max 2 retries = 3 total attempts), mock `fetchFn` to return 429 three times. Assert error is thrown after 3 calls. For DeepSeek (max 3 retries = 4 total attempts), mock 429 four times. Assert error after 4 calls.

- **DeepSeek uses 3 retries, not 2**: Mock DeepSeek `fetchFn` to return 429 three times then succeed on 4th. Assert success and `fetchFn` called 4 times. Same scenario with Claude should fail after 3 calls.

- **Retry delays include jitter**: Use `jest.useFakeTimers()` or measure elapsed time. Assert delays are not exactly equal (jitter adds 0-100% randomness). Allow +/-20% tolerance in timing assertions. (Note: if retry uses `setTimeout` and tests use fake timers, advance timers manually between retries.)

### 7. Network Error Handling

**Purpose**: Verify that `fetchFn` throwing JavaScript errors (not HTTP responses) is handled as retryable.

Tests to write:

- **Network error triggers retry**: Mock `fetchFn` to throw `new Error('ECONNRESET')` on first call, then return 200 on second. Assert success and `fetchFn` called twice. The key behavior: the retry loop must catch the thrown error before trying to access `response.status`, which would cause a `TypeError`.

- **Network error after max retries surfaces original error**: Mock `fetchFn` to throw `new Error('ETIMEDOUT')` on every call. Assert the thrown error message contains `ETIMEDOUT`, not `TypeError` or `Cannot read properties of undefined`.

### 8. Cost Logging

**Purpose**: Verify `console.log` output format, correct pricing, and security (no sensitive data).

Tests to write (spy on `console.log` with `jest.spyOn(console, 'log')`):

- **Log format**: After a successful Claude call, `console.log` is called with a string containing: provider name (`claude`), model name (`sonnet-4`), token counts (`in:`, `out:`), and cost (`$`).

- **Claude pricing**: Mock a response with `input_tokens: 1000, output_tokens: 500`. Expected cost: `(1000 * 3/1e6) + (500 * 15/1e6) = 0.003 + 0.0075 = $0.0105`. Assert the logged cost matches.

- **DeepSeek pricing**: Mock `prompt_tokens: 1000, completion_tokens: 500`. Expected cost: `(1000 * 0.27/1e6) + (500 * 1.10/1e6) = 0.00027 + 0.00055 = $0.00082`. Assert the logged cost matches.

- **Cache pricing in log**: Mock a Claude response with `cache_read_input_tokens: 2000`. The log must show `cache:2000r` (or similar cache indicator) and the cost must use $0.30/1M for those tokens.

- **Security: no sensitive data**: After a call, join all `console.log` call arguments into a string. Assert it does NOT contain: the API key value, the system prompt text, the user prompt text, or the response content text. Only provider, model, token counts, and cost.

### 9. Factory Functions

**Purpose**: Verify factory convenience functions create correctly configured clients.

Tests to write:

- **createClaudeClient defaults**: Create via `createClaudeClient(fetchFn, 'test-key')`. Call `complete('sys', 'user')`. Parse the request body and assert `temperature === 0.7` and `model` starts with `claude`.

- **createDeepSeekClient defaults**: Create via `createDeepSeekClient(fetchFn, 'test-key')`. Call `complete('sys', 'user')`. Parse request body and assert `temperature === 0.3` and `model === 'deepseek-chat'`.

- **Per-call opts override**: Create Claude client (default temp 0.7). Call `complete('sys', 'user', { temperature: 0.2, max_tokens: 1024 })`. Assert the request body has `temperature: 0.2` and `max_tokens: 1024`, not the factory defaults.

### 10. Edge Cases

**Purpose**: Defensive handling of malformed or unexpected responses.

Tests to write:

- **Missing usage fields default to 0**: Mock a response with `usage: {}` (no token fields). Assert `result.usage.inputTokens === 0`, `outputTokens === 0`, `cacheReadTokens === 0`, `cacheWriteTokens === 0`. No `TypeError` on missing fields.

- **Empty content array in Claude response**: Mock `{ content: [], usage: { input_tokens: 0, output_tokens: 0 } }`. Assert `result.content` is an empty string (not undefined, not crash).

- **Null system prompt**: Call `complete(null, 'user prompt')`. Assert the request body either omits the `system` field entirely (Claude) or omits the system message from the messages array (DeepSeek). No crash.

- **Undefined system prompt**: Same behavior as null -- treated as "no system prompt".

---

## Test Structure

Organize tests with `describe` blocks:

```javascript
const { createClaudeClient, createDeepSeekClient } = require('../../n8n/code/insiderbuying/ai-client');

function makeFetch(response, ok = true, status = 200) {
  return jest.fn().mockResolvedValue({
    ok,
    status,
    json: async () => response,
  });
}

describe('ai-client', () => {
  describe('Claude', () => {
    describe('text completion', () => { /* tests 1 */ });
    describe('prompt caching', () => { /* tests 2 */ });
    describe('Tool Use', () => { /* tests 3 */ });
  });

  describe('DeepSeek', () => {
    describe('text completion', () => { /* tests 4 */ });
    describe('JSON safety', () => { /* tests 5 */ });
  });

  describe('retry logic', () => { /* tests 6 */ });

  describe('network errors', () => { /* tests 7 */ });

  describe('cost logging', () => { /* tests 8 */ });

  describe('factory functions', () => { /* tests 9 */ });

  describe('edge cases', () => { /* tests 10 */ });
});
```

---

## Mock Response Shapes Reference

These are the response shapes to use when building mocks. Copy-paste into individual tests.

**Claude text response:**
```javascript
{
  content: [{ type: 'text', text: 'Response text here' }],
  model: 'claude-sonnet-4-6-20250514',
  usage: {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  },
}
```

**Claude Tool Use response:**
```javascript
{
  content: [
    { type: 'text', text: 'I will extract the article.' },
    { type: 'tool_use', id: 'toolu_abc123', name: 'extract_article', input: { title: 'Test Title', body: 'Test body content' } },
  ],
  model: 'claude-sonnet-4-6-20250514',
  usage: { input_tokens: 200, output_tokens: 150 },
}
```

**Claude safety refusal (no tool_use):**
```javascript
{
  content: [{ type: 'text', text: 'I cannot help with that request.' }],
  model: 'claude-sonnet-4-6-20250514',
  usage: { input_tokens: 50, output_tokens: 20 },
}
```

**DeepSeek text response:**
```javascript
{
  choices: [{ message: { content: 'DeepSeek response text' } }],
  model: 'deepseek-chat',
  usage: {
    prompt_tokens: 200,
    completion_tokens: 80,
    prompt_cache_hit_tokens: 0,
  },
}
```

**DeepSeek with cache hit:**
```javascript
{
  choices: [{ message: { content: '{"score": 7, "reasoning": "Good insider buy"}' } }],
  model: 'deepseek-chat',
  usage: {
    prompt_tokens: 200,
    completion_tokens: 80,
    prompt_cache_hit_tokens: 150,
  },
}
```

---

## Implementation Checklist

1. Create `tests/insiderbuying/ai-client.test.js`
2. Add `makeFetch` helper and imports
3. Write Claude text completion tests (5 tests)
4. Write Claude prompt caching tests (4 tests)
5. Write Claude Tool Use tests (5 tests)
6. Write DeepSeek text completion tests (5 tests)
7. Write DeepSeek JSON safety tests (2 tests)
8. Write retry logic tests (8 tests)
9. Write network error tests (2 tests)
10. Write cost logging tests (5 tests)
11. Write factory function tests (3 tests)
12. Write edge case tests (4 tests)
13. Run `npm test -- tests/insiderbuying/ai-client.test.js` -- all tests should pass against the Section 01 implementation
14. Commit: `test: add ai-client test suite (43 tests)`

**Total**: ~43 tests across 10 categories.

---

## Pricing Constants Reference

Used for cost assertion calculations:

| Provider | Token Type | Rate ($/1M tokens) |
|----------|-----------|-------------------|
| Claude Sonnet | Input | $3.00 |
| Claude Sonnet | Output | $15.00 |
| Claude Sonnet | Cache Read | $0.30 |
| Claude Sonnet | Cache Write | $3.75 |
| DeepSeek Chat | Input | $0.27 |
| DeepSeek Chat | Output | $1.10 |

Cost formula: `sum(token_count * rate / 1_000_000)` for each token type present in the response.
