# Integration Notes — External Review Feedback

## Reviews Read

- `reviews/iteration-1-gemini.md` (Gemini 3 Pro Preview)
- `reviews/iteration-1-openai.md` (o3)

---

## INTEGRATING

### 1. 10b5-1 cap applies to final_score, not base_score (Gemini + o3)
Both reviewers caught this: AI refinement happens after the base score, so +1 adjustment could push a 10b5-1 plan to 6.
**Fix**: Apply the 10b5-1 cap to `final_score` at the end of the pipeline, or skip AI refinement entirely when `is10b5Plan = true`.
**Why integrate**: Logical correctness bug. A 10b5-1 trade scoring 6 would be misleading to users.

### 2. detectSameDaySell should use transactionDate, not filingDate (Gemini + o3)
EDGAR filings are frequently filed days after the actual trade. Exercise on Monday, sell on Tuesday, both filed Thursday — using `filingDate` would miss the match.
**Fix**: Match on `transactionDate` (the date the actual trade occurred, from the Form 4 body).
**Why integrate**: Real data correctness. filingDate is wrong here.

### 3. Partial exercise-and-sell threshold (Gemini + o3)
Insiders often exercise options and sell only enough shares to cover taxes, keeping the rest (bullish signal). Zeroing out the entire trade because of a partial sell destroys valid signal.
**Fix**: Only classify as exercise-and-sell (score=0) if shares sold >= 80% of shares exercised.
**Why integrate**: The current "any overlap" logic is too aggressive and would false-positive on routine tax sales.

### 4. validateAnalysis % rule made conditional (Gemini)
Rule 4 (percentage required) contradicts graceful degradation — if Finnhub fails and sharesOwnedAfter is absent, there's no % data to write. The LLM would be penalized for correct fallback behavior.
**Fix**: Only enforce Rule 4 if percentage data was actually injected into the prompt context. Track this via a boolean flag passed to validateAnalysis().
**Why integrate**: Otherwise Rule 4 causes chronic fallback template use, degrading every alert where data is missing.

### 5. Fallback template bypasses validateAnalysis() explicitly (Gemini + o3)
The plan claimed the fallback "always passes validation by design" — this is incorrect (it has no % and no cautionary language).
**Fix**: Explicitly document and code that returning the fallback template bypasses validation. It is returned directly without calling validateAnalysis().
**Why integrate**: Prevents an accidental infinite validation loop in future refactors.

### 6. LLM JSON parsing strips markdown blocks (Gemini)
DeepSeek occasionally wraps JSON in ```json ... ``` blocks even at temperature 0. `JSON.parse()` will throw.
**Fix**: Strip markdown code fences before calling JSON.parse().
**Why integrate**: Low effort, prevents unnecessary retries.

### 7. Word count validation loosened (Gemini + o3)
Both reviewers flagged ±20% as too strict for LLMs. Will cause chronic failures for short-target scores.
**Fix**: Enforce a minimum floor (target * 0.7) and hard max only. Remove the upper tight bound.
**Why integrate**: Prevents excessive retry + fallback template use.

### 8. Cache cleanup in finnhub-client.js (Gemini + o3)
Unbounded Map will slowly grow over weeks. n8n processes are long-lived.
**Fix**: Add TTL-based expiry check on reads (lazy cleanup) — when reading, if entry is expired, delete it and re-fetch. This avoids a separate setInterval and is simpler.
**Why integrate**: Simple fix, prevents memory leak over long-running n8n instances.

### 9. Market hours check uses Intl.DateTimeFormat for ET timezone (Gemini)
n8n runs in UTC. Market hours logic based on `new Date().getHours()` would be wrong.
**Fix**: Use `Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York'})` to get ET hour before computing market status.
**Why integrate**: Correctness bug. Easy fix.

### 10. Track record sample size: require ≥2 trades for >10% bonus (o3)
Single profitable trade can inflate track record signal.
**Fix**: The existing condition for >20% already requires count ≥3. Add count ≥2 requirement for the >10% bonus too.
**Why integrate**: Small fix, prevents noise from single-trade track records.

### 11. Division by zero guard in calibration (o3)
Empty weeks (holidays, quiet periods) produce no alerts and divide-by-zero in percentage computation.
**Fix**: Return early with "no alerts this week" Telegram message if total count is 0.
**Why integrate**: Will crash in production during holiday weeks without this.

### 12. Add detectSameDaySell tests explicitly (o3)
The testing section did not explicitly mention this function.
**Fix**: Add test cases for: same-day full sell (score=0), partial sell below threshold (normal score), NocoDB failure (graceful fallback).
**Why integrate**: Without specific tests this logic is untested.

### 13. Score = 0 alerts — clarify they ARE stored (o3)
The plan was ambiguous about whether score=0 (gift, tax, exercise-and-sell) records are stored or dropped.
**Fix**: Clarify: score=0 records are logged and returned as null from `runScoreAlert()` — they do NOT get stored in NocoDB or reach the analysis pipeline. The log entry captures why.
**Why integrate**: Avoids confusion in deliver-alert.js integration.

---

## NOT INTEGRATING

### Market cap factor centering (Gemini)
Gemini suggested centering the market cap factor around 0 (micro: +1.0, mid: 0, large: -0.5, mega: -1.0) to avoid upward bias.
**Why not**: The spec and PROMPT-WORKFLOW-FRAMEWORK.md define the exact factor values. Changing the weights risks misalignment with the calibration targets. If distribution drift occurs, the weekly calibration will detect it and the user can manually adjust. Not changing pre-defined weights from the framework.

### Direction symmetry inversion for sells (o3)
o3 suggested inverting factor signs for D (disposal) direction — high sale = bearish, so formula should score it differently.
**Why not**: The spec and interview explicitly state: "score represents conviction of the sell signal — high score = significant insider sale." The score means "significance" not "bullishness." The direction-aware analysis prompt handles the interpretation. Score symmetry is intentional by design.

### Handling exotic transaction codes (C, L, K, O) (o3)
Suggested auditing all SEC §240.16a-3 codes and handling each deliberately.
**Why not**: This is unit 09 scope (edgar-parser.filterScorable). This unit handles what arrives from upstream. Adding edge case filtering here would duplicate logic. Log a WARN for unexpected codes and score them with default 0.5 role bonus — acceptable for now.

### Unknown title default from +0.5 to 0 (o3)
Suggested that unknown titles should give 0 or -0.2 to avoid rewarding sloppy parsing.
**Why not**: The spec from PROMPT-WORKFLOW-FRAMEWORK.md specifies +0.5 for unknown. The user defined this. Changing default behavior silently could reduce scores for real titles not yet in the map. Log WARN for unmapped titles for monitoring, but keep +0.5 per spec.

### Prompt injection sanitization for EDGAR footnotes (o3)
Suggested sanitizing newlines/braces in EDGAR footnotes before prompt injection.
**Why not**: The AI refinement prompt does not inject raw EDGAR footnotes — it injects structured fields (ticker, base_score, direction). The scoring prompt is minimal by design. No user-generated content flows into it. Low risk.

### Retry token for DeepSeek (o3)
Suggested adding a dummy token on retry for a new cache key.
**Why not**: DeepSeek API doesn't have prompt caching in the same way as Anthropic. The retry is primarily for rate limits and transient errors, not cache hits. The existing 2s backoff is sufficient.

### Finnhub rate limit pooling for proxy season (o3)
Suggested persisting quotes to Redis or backing up to IEX Cloud for 200+/day spikes.
**Why not**: The baseline volume is 50/day configurable. 50 Finnhub calls/day with 60s caching is far under the 60/min limit. Even at 100/day, it's fine. If volume grows to 200+, this becomes relevant — track it in SOLUTIONS.md when it happens.

### Earnings cache staleness fallback to Finnhub (o3)
Suggested fallback to Finnhub calendar endpoint when NocoDB cache is >30 days old.
**Why not**: The earnings calendar is populated daily by unit 09's scheduled job. Staleness is unit 09's responsibility. If the daily job fails, a 30-day stale date is still better than a live API call that burns Alpha Vantage's 25/day quota. The plan correctly says "return null if no upcoming earnings within 90 days."

### API keys redaction from logs (o3)
Suggested redacting env vars before logging.
**Why not**: The plan doesn't specify logging the full deps.env object. The structured score log includes only business data fields. This is an implementation detail to handle during coding, not a plan change.

### DeepSeek daily cost ceiling (o3)
Suggested adding a max-daily-calls guardrail.
**Why not**: At 50 alerts/day with ~4 DeepSeek calls each (score + analysis, each with 1 possible retry) = 200 calls/day max. At $0.00007/call, that's $0.014/day = ~$0.42/month. Not worth adding infrastructure for this.

### Hedging words rule buy-only (o3)
Suggested Rule 5 (cautionary language) apply to buys only, not sells.
**Why not**: Sells absolutely need cautionary framing — "could be routine diversification", "tax plan", "portfolio rebalancing." The cautionary language is actually more important for sells to avoid alarmist framing. Keep Rule 5 for both directions.
