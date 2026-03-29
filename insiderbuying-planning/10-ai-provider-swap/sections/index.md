<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-ai-client
section-02-ai-client-tests
section-03-migrate-generate-article
section-04-migrate-score-alert
section-05-migrate-analyze-alert
section-06-validation-docs
END_MANIFEST -->

# Implementation Sections Index

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-ai-client | - | 02, 03, 04, 05 | Yes |
| section-02-ai-client-tests | 01 | 03, 04, 05 | No |
| section-03-migrate-generate-article | 02 | 06 | Yes |
| section-04-migrate-score-alert | 02 | 06 | Yes |
| section-05-migrate-analyze-alert | 02 | 06 | Yes |
| section-06-validation-docs | 03, 04, 05 | - | No |

## Execution Order

1. section-01-ai-client (no dependencies -- foundation)
2. section-02-ai-client-tests (validates foundation)
3. section-03-migrate-generate-article, section-04-migrate-score-alert, section-05-migrate-analyze-alert (parallel after 02)
4. section-06-validation-docs (final verification)

## Section Summaries

### section-01-ai-client
Create `n8n/code/insiderbuying/ai-client.js` with AIClient class, Claude + DeepSeek provider support, text + Tool Use + cached completion methods, retry with backoff + jitter, per-provider timeouts, cost logging, and factory functions. Accepts `fetchFn` as HTTP client.

### section-02-ai-client-tests
Create `tests/insiderbuying/ai-client.test.js` with comprehensive tests: Claude text/cache/Tool Use, DeepSeek text, retry logic (including network errors), cost logging, factory functions, edge cases (missing tool_use block, missing usage fields).

### section-03-migrate-generate-article
Migrate `generate-article.js` from direct Anthropic API calls to `createClaudeClient()`. Replace `callClaudeToolUse()` with `client.completeToolUse()` with `cache: true`. Update response handling to use `result.toolResult`. Update tests.

### section-04-migrate-score-alert
Migrate `score-alert.js` from Haiku to `createDeepSeekClient()`. Replace `callHaiku()` with `client.complete()`. Add DeepSeek JSON sanitization (strip markdown fences). Remove old retry loop. Update `score-alert.test.js`.

### section-05-migrate-analyze-alert
Migrate `analyze-alert.js` from Claude Sonnet to `createDeepSeekClient()`. Replace `callClaude()` with `client.complete()`. Remove old retry loop. Update `analyze-alert.test.js`.

### section-06-validation-docs
Verify no direct Anthropic references remain (grep check). Add `DEEPSEEK_API_KEY` to `validateEnv()`. Add usage documentation to ai-client.js header. Verify cost logging works for all 3 migrated files.
