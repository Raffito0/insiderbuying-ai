# Interview Transcript: 14-x-engine

## Round 1

### Q1: NocoDB call pattern in JS modules
The spec shows `nocodb.list('Insider_Alerts', {...})` inside the JS module. In the existing codebase, NocoDB queries come from n8n NocoDB nodes (upstream), and JS modules receive data as input. Which pattern?

**Answer:** Keep the n8n node pattern. JS module receives pre-fetched filing data as input. NocoDB queries stay in n8n workflow nodes.

### Q2: visual-templates.js status
Is visual-templates.js (from unit 11) already deployed and working?

**Answer:** Not built yet. Unit 11 is pending — media attachment sections should add a stub/mock and note the dependency.

### Q3: DeepSeek integration pattern
Is there an existing DeepSeek helper to follow?

**Answer:** ai-client.js from unit 10 already handles both Claude and DeepSeek. Use `const { deepseek } = require('./ai-client')`. (Note: ai-client.js not found in current codebase — likely not deployed yet.)

### Q4: Human review for replies
Does Telegram review still happen before posting?

**Answer:** Auto-post, no human review. `sendToTelegramReview()` is removed from the reply flow.

---

## Round 2

### Q5: ai-client.js not found — how to handle DeepSeek calls?
ai-client.js is not yet in the codebase. How should x-engine handle DeepSeek calls?

**Answer:** Build a minimal ai-client.js stub that exports `{claude, deepseek}` functions. Unit 10 can expand it later.

### Q6: X API auth for media upload
Does n8n have Twitter OAuth 1.0a credentials set up? Media upload requires OAuth 1.0a.

**Answer:** Not sure. Flag OAuth 1.0a as a dependency in the plan. Include setup instructions in implementation notes.

### Q7: Quote-retweet price data source
Where does price movement data come from for the QRT "moved X% since this buy" text?

**Answer:** Fetch from an existing price API (Finnhub/Financial Datasets). The scheduler job queries current price vs price-at-buy to calculate movement.

---

## Key Decisions Summary

| Decision | Choice |
|----------|--------|
| NocoDB calls | n8n node pattern (data received as input, not direct HTTP calls) |
| visual-templates.js | Not yet built — implement as dependency stub |
| DeepSeek | Build minimal ai-client.js stub in this unit |
| Human reply review | Removed — auto-post after 3-5 min delay |
| X media upload auth | Flag OAuth 1.0a as required dependency |
| QRT price data | Fetch from price API (Finnhub/Financial Datasets) at queue processing time |
