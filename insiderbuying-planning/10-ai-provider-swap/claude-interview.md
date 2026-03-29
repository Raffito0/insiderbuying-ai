# Interview Transcript: AI Provider Swap

## Q1: Scope -- Which files to migrate?

**Q:** The spec lists 10 content files to migrate, but codebase research found only 3 files that actually call Claude API (generate-article.js, score-alert.js, analyze-alert.js). The other 7 don't exist yet or don't make AI calls. Should ai-client.js be built for only the 3 existing files, or all 10?

**A:** All 10 files (build for future). Create ai-client.js ready for all 10 files, migrate the 3 that exist now, document patterns for future files.

## Q2: Tool Use support in ai-client.js?

**Q:** generate-article.js uses Claude Tool Use (tools + tool_choice) for structured output, not just text completion. Should ai-client.js support Tool Use calls too?

**A:** ai-client.js supports Tool Use. complete() should accept optional tools/tool_choice params, handling both text and tool responses.

## Q3: HTTP client -- fetchFn vs require('https')?

**Q:** The codebase uses n8n's injected fetchFn for HTTP calls. The spec says ai-client.js should use require('https'). How should ai-client.js handle this?

**A:** Accept fetchFn as parameter. ai-client.js receives fetchFn from n8n, uses it internally. Most compatible with n8n patterns.

## Q4: Cost logging destination?

**Q:** Where should cost logs go -- console, Airtable, or both?

**A:** Console only. console.log each call with cost estimate. Simple, visible in n8n execution logs.

## Q5: DeepSeek validation for scoring tasks?

**Q:** The spec routes score-alert.js (currently Haiku) to DeepSeek. Have you tested DeepSeek for classification tasks?

**A:** Cost projection only. Haven't tested, routing based on expected cost savings.

## Q6: Prompt caching mode?

**Q:** Research shows the beta header is no longer needed and there's a simpler automatic caching mode. Which approach?

**A:** Automatic (simplest). Top-level cache_control on request. System handles breakpoints.

## Q7: Future files -- stubs or documentation?

**Q:** Should the plan include stub implementations for the 7 future files, or just document the pattern?

**A:** Document pattern only. Show usage examples in ai-client.js docs/comments. Files created when needed.

## Q8: Test strategy during migration?

**Q:** Should tests be updated alongside each file migration, or in a separate pass?

**A:** Update tests in same PR. Each file migration includes updating its tests. No broken tests at any point.
