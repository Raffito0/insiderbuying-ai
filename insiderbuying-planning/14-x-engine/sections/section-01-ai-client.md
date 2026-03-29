# Section 01: ai-client.js — Shared LLM Client

## Overview

Create a new file `n8n/code/insiderbuying/ai-client.js` that exports two async functions: `claude()` and `deepseek()`. These are the shared LLM entry points used by `x-engagement.js` (section 03) and `x-auto-post.js` (section 06). This section is fully independent and can be implemented in parallel with sections 02, 04, and 07.

## Files to Create

- `n8n/code/insiderbuying/ai-client.js` — new module
- `n8n/tests/ai-client.test.js` — new test file

## Tests First

Write `n8n/tests/ai-client.test.js` before implementing. Use Node.js native `node:test` + `node:assert/strict`. All tests are fixture-based — no live API calls. Pass a mock `fetchFn` via the `helpers` argument.

### Test cases to implement

**claude() — happy path and API key**
- With mock `fetchFn` returning a fixture JSON response shaped like the Anthropic messages API → `claude()` returns the expected text string
- `claude()` reads the API key from `helpers.anthropicApiKey` (not from a hardcoded constant or environment variable)
- `opts.maxTokens` is forwarded to the request body when provided
- When `opts.maxTokens` is omitted, the default value (300) is used in the request body

**claude() — retry behavior**
- Mock `fetchFn` returns HTTP 429 on first call, then succeeds on second call → `claude()` returns the text (retried successfully)
- Mock `fetchFn` returns HTTP 500 on all three calls → `claude()` throws after exhausting max retries
- After 3 failures the thrown error must be catchable by the caller (not an unhandled rejection)

**deepseek() — happy path**
- With mock `fetchFn` returning a fixture JSON response → `deepseek()` returns the expected text string
- Mock `fetchFn` returning HTTP 503 on first call, success on second → `deepseek()` returns the text
- Request uses the correct DeepSeek endpoint (`https://api.deepseek.com/chat/completions`) and correct model name (`deepseek-chat`)

**opts.maxTokens**
- `buildBreakingAlert` passes `maxTokens: 400` to `deepseek()` — verify the request body contains `max_tokens: 400`
- When `maxTokens` is omitted, `deepseek()` uses default 400 (for post prompts)

Run tests:
```bash
node --test n8n/tests/ai-client.test.js
```

## Implementation

### Function signatures

```javascript
// n8n/code/insiderbuying/ai-client.js
async function claude(prompt, opts, helpers) { /* → string */ }
async function deepseek(prompt, opts, helpers) { /* → string */ }

module.exports = { claude, deepseek };
```

### Arguments

**`prompt`** — string. The full prompt text to send. For `claude()` this becomes a user message. For `deepseek()` this becomes the content of the first user message.

**`opts`** — optional object. Recognized keys:
- `maxTokens` (number) — overrides the default `max_tokens` in the request body
- `systemPrompt` (string) — for `claude()`, sets the system field. Not used by `deepseek()` directly — the caller incorporates system context into `prompt` for DeepSeek.

**`helpers`** — required object, injected by n8n. Must contain:
- `fetchFn` — the fetch function (polyfilled in n8n Code nodes via `require('https')`)
- `anthropicApiKey` — string, for `claude()` calls
- `deepseekApiKey` — string, for `deepseek()` calls

The `helpers` object must not be included in any thrown error message or error payload — it contains credentials. If rethrowing after max retries, include only the HTTP status and attempt count.

### claude() behavior

Endpoint: `POST https://api.anthropic.com/v1/messages`

Required headers:
```
x-api-key: <helpers.anthropicApiKey>
anthropic-version: 2023-06-01
content-type: application/json
```

Request body shape:
```javascript
{
  model: 'claude-haiku-20240307',
  max_tokens: opts.maxTokens || 300,
  system: opts.systemPrompt || undefined,
  messages: [{ role: 'user', content: prompt }]
}
```

Response parsing: `response.content[0].text`

### deepseek() behavior

Endpoint: `POST https://api.deepseek.com/chat/completions`

Required headers:
```
Authorization: Bearer <helpers.deepseekApiKey>
content-type: application/json
```

Request body shape:
```javascript
{
  model: 'deepseek-chat',
  max_tokens: opts.maxTokens || 400,
  messages: [{ role: 'user', content: prompt }]
}
```

Response parsing: `response.choices[0].message.content`

### Retry logic (both functions)

- Maximum 3 attempts
- Retry on: HTTP status >= 500, or HTTP status 429
- Backoff delays: attempt 1 = 2000ms, attempt 2 = 4000ms, attempt 3 = 8000ms (do not retry after attempt 3)
- If the response includes a `Retry-After` header (seconds), use that value instead of the default backoff
- After 3 failures: throw an error containing the last HTTP status and number of attempts. Do not include `helpers` in the error.
- Do not retry on 4xx statuses other than 429 (e.g. 401, 400 are permanent failures — throw immediately)

### Retry-After header

When the response has `Retry-After: 30` (numeric seconds), wait that many milliseconds (`30 * 1000`) instead of the exponential backoff value. Clamp to a maximum of 60 seconds to prevent blocking the n8n execution indefinitely.

### Default maxTokens by call context

The defaults are chosen per call type. Callers may override:

| Call type | Default maxTokens |
|-----------|-------------------|
| reply prompt (claude) | 300 |
| post format (deepseek) | 400 |

These defaults are set inside `claude()` and `deepseek()` respectively when `opts.maxTokens` is absent.

## Usage pattern (for callers in sections 03 and 06)

```javascript
const { claude, deepseek } = require('./ai-client');

// In x-engagement.js section-03:
const replyText = await claude(composedPrompt, { maxTokens: 300, systemPrompt: archetype.systemPrompt }, helpers);

// In x-auto-post.js section-06:
const postText = await deepseek(composedPrompt, { maxTokens: 400 }, helpers);
```

## Dependencies

None. This section has no dependency on other sections in this plan. It can be implemented and tested immediately.

## What this section does NOT include

- OAuth 1.0a signing — that is in section-05 (media upload)
- Any NocoDB interaction — all DB reads/writes remain in n8n nodes
- The `visual-templates.js` integration — section-05
- Prompt construction logic — sections 03 and 06 build prompts and call these functions

## Definition of Done

- `n8n/tests/ai-client.test.js` exists and all tests pass: `node --test n8n/tests/ai-client.test.js`
- `n8n/code/insiderbuying/ai-client.js` exports `{ claude, deepseek }`
- `require('./ai-client')` in both `x-engagement.js` and `x-auto-post.js` resolves without error
- No credentials appear in thrown error messages
- Existing tests still pass: `node --test n8n/tests/x-engagement.test.js n8n/tests/x-auto-post.test.js`

## Implementation Notes

Implemented as standalone functions added to the existing `ai-client.js` (unit 10 factory-based API preserved unchanged). New exports: `claude`, `deepseek` alongside existing `AIClient`, `createOpusClient`, etc.

**Actual changes from plan:**
- `claude()` response parsing uses `content.find(b => b.type === 'text')` (safe, matches AIClient class) instead of `content[0].text` — handles empty content array from policy stops
- Both functions: `parseInt(Retry-After)` NaN guard added — HTTP-date format headers fall back to `_RETRY_DELAYS[attempt-1]`
- `deepseek()` intentionally has no `systemPrompt` path (by spec: callers embed system context in prompt string)
- `helpers._sleep` injection used for testable retry path (no real delays in tests)

**Tests: 17 new tests in 4 describe blocks, all passing.**
