# TDD Plan: AI Provider Swap

Testing framework: Jest v30.3.0, existing in project. Tests at `tests/insiderbuying/`. Mocking pattern: mock `fetchFn` via `jest.fn().mockResolvedValue(...)`.

---

## Section 1: ai-client.js -- Provider Abstraction

Tests go in `tests/insiderbuying/ai-client.test.js`.

### Claude text completion
- Test: `complete()` sends POST to correct URL with `x-api-key` header and `anthropic-version`
- Test: `complete()` sends system prompt in separate `system` field, user prompt in `messages` array
- Test: `complete()` parses `content[0].text` into `result.content`
- Test: `complete()` maps `usage.input_tokens` → `inputTokens`, `usage.output_tokens` → `outputTokens`
- Test: `complete()` returns `cached: false` when no cache tokens in response

### Claude prompt caching
- Test: `completeWithCache()` includes `cache_control: {type: "ephemeral"}` in request body
- Test: `complete()` does NOT include `cache_control`
- Test: response with `cache_read_input_tokens > 0` returns `cached: true`
- Test: cost calculation uses $0.30/1M for cached read tokens, $3.75/1M for cache write tokens

### Claude Tool Use
- Test: `completeToolUse()` includes `tools` and `tool_choice` in request body
- Test: `completeToolUse()` extracts `tool_use` content block → `toolResult`
- Test: `completeToolUse()` with `opts.cache: true` includes `cache_control`
- Test: response with text blocks before tool_use block still extracts tool result correctly
- Test: response with NO `tool_use` block (safety refusal) throws error with text content

### DeepSeek text completion
- Test: `complete()` sends POST to `https://api.deepseek.com/chat/completions` with `Authorization: Bearer` header
- Test: `complete()` puts system prompt in messages array as `role: "system"`, not separate field
- Test: `complete()` parses `choices[0].message.content` into `result.content`
- Test: `complete()` maps `prompt_tokens` → `inputTokens`, `completion_tokens` → `outputTokens`
- Test: `complete()` maps `prompt_cache_hit_tokens` → `cacheReadTokens`

### DeepSeek JSON safety
- Test: `complete()` response content wrapped in ```json ... ``` is returned as-is (ai-client does not strip -- caller strips if needed)
- Test: `response_format: {type: "json_object"}` is passed through when set in opts

### Retry logic
- Test: fetchFn returning 429 triggers retry with delay
- Test: Claude fetchFn returning 529 triggers retry
- Test: DeepSeek fetchFn returning 503 triggers retry
- Test: fetchFn returning 401 throws immediately (no retry)
- Test: fetchFn returning 400 throws immediately (no retry)
- Test: max retries exceeded throws the last error
- Test: fetchFn throwing network error (not HTTP response) triggers retry
- Test: fetchFn throwing network error after max retries surfaces original error
- Test: DeepSeek uses max 3 retries (not 2)
- Test: retry delays include jitter (allow ±20% tolerance in timing assertions)

### Cost logging
- Test: `console.log` called with provider name and model after each call
- Test: `console.log` includes token counts (input, output, cache read/write)
- Test: `console.log` includes estimated cost in USD
- Test: Claude cost uses $3/1M input, $15/1M output
- Test: DeepSeek cost uses $0.27/1M input, $1.10/1M output

### Factory functions
- Test: `createClaudeClient()` returns client with Claude defaults (temperature 0.7)
- Test: `createDeepSeekClient()` returns client with DeepSeek defaults (temperature 0.3)
- Test: per-call opts override factory defaults

### Edge cases
- Test: missing `usage` fields in response default to 0
- Test: empty `content` array in Claude response returns empty string
- Test: null/undefined system prompt is handled (no system field sent)

---

## Section 2: ai-client.test.js -- Test Suite

This IS the test file -- Section 1 tests ARE Section 2. The tests defined above are written in this section. No separate tests for the test file itself.

---

## Section 3: Migrate generate-article.js to Claude Client

Tests in existing `tests/insiderbuying/generate-article.test.js` (if exists) or alongside Section 2.

### Integration with ai-client
- Test: `generateArticle()` calls `client.completeToolUse()` (not direct fetchFn)
- Test: `generateArticle()` passes tools and tool_choice to completeToolUse
- Test: `generateArticle()` uses `result.toolResult` for article extraction
- Test: `generateArticle()` passes `cache: true` in opts
- Test: `generateArticle()` passes `temperature: 0.6` override

### Backward compatibility
- Test: quality gates still work with ai-client response format
- Test: retry on quality gate failure still works (article re-generation)
- Test: `extractToolResult` is removed or unused (no direct API response parsing)

### No direct API calls
- Test: no direct fetchFn call to anthropic.com in generate-article.js
- Test: no `x-api-key` or `anthropic-version` headers in generate-article.js

---

## Section 4: Migrate score-alert.js to DeepSeek Client

Tests in existing `tests/insiderbuying/score-alert.test.js`.

### Provider switch
- Test: `runScoreAlert()` calls DeepSeek client (not Claude/Haiku)
- Test: `runScoreAlert()` uses `env.DEEPSEEK_API_KEY` (not ANTHROPIC)
- Test: response JSON parsing handles markdown-fenced JSON from DeepSeek
- Test: `buildHaikuPrompt()` output is unchanged (prompt preservation)

### Safe defaults
- Test: AI client error → returns `HAIKU_DEFAULT` (score 5, generic reasoning)
- Test: JSON parse failure → returns `HAIKU_DEFAULT`
- Test: network error → returns `HAIKU_DEFAULT`

### No retry duplication
- Test: score-alert.js does NOT have its own retry loop (delegated to ai-client)

### No direct API calls
- Test: no direct fetchFn call to anthropic.com in score-alert.js
- Test: no `claude-haiku` or `claude-3` model strings in score-alert.js

---

## Section 5: Migrate analyze-alert.js to DeepSeek Client

Tests in existing `tests/insiderbuying/analyze-alert.test.js`.

### Provider switch
- Test: `analyze()` calls DeepSeek client (not Claude)
- Test: `analyze()` uses `env.DEEPSEEK_API_KEY`
- Test: `result.content` used directly (prose, no JSON parsing)
- Test: `buildAnalysisPrompt()` output is unchanged

### Error handling
- Test: AI client error → filing analysis skipped gracefully (returns null/undefined)
- Test: network error → filing analysis skipped gracefully

### No direct API calls
- Test: no direct fetchFn call to anthropic.com in analyze-alert.js
- Test: no `claude-sonnet` model strings in analyze-alert.js

---

## Section 6: Cost Validation and Documentation

### Integration validation (manual + automated)
- Test: grep for `anthropic\|claude-haiku\|claude-3` in all `.js` files except `ai-client.js` returns nothing
- Test: `DEEPSEEK_API_KEY` is in `validateEnv()` required list in e2e-monitoring.js
- Test: ai-client.js has usage documentation comment block at top

### Cost logging spot check
- Test: run generate-article with mock → console shows Claude cost log
- Test: run score-alert with mock → console shows DeepSeek cost log
- Test: run analyze-alert with mock → console shows DeepSeek cost log
