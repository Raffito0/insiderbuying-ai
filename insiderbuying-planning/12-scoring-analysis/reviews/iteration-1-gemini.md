# Gemini Review

**Model:** gemini-3-pro-preview
**Generated:** 2026-03-28T22:44:16.976401

---

Here is a comprehensive architectural review of your implementation plan. Overall, the separation of deterministic scoring from qualitative AI refinement is an excellent pattern. However, there are several critical edge cases, n8n-specific architectural quirks, and logical contradictions in the validation rules that will cause silent failures or pipeline stalling.

Here is the breakdown of issues and actionable recommendations.

### 1. Architectural & n8n-Specific Issues

**In-Memory Cache Isolation & Memory Leaks (Section 7)**
*   **The Issue:** The plan relies on a module-level `Map` for caching Finnhub responses across executions. First, if your n8n instance scales to use worker threads (Queue mode with Redis/Postgres), memory is *not* shared across workers. Each worker will maintain its own cache, reducing efficiency. Second, an unbounded `Map` will slowly leak memory over the lifetime of the n8n Node.js process as thousands of unique tickers are processed.
*   **Actionable Fix:** 
    1. Implement a cleanup mechanism (e.g., pruning expired keys every 100th call or using a lightweight LRU logic) to prevent memory leaks.
    2. Document that this cache is *per-worker process*. If n8n restarts or scales horizontally, the cache starts cold. (This is acceptable for a 60-call/min limit, but should be explicit).

**Timezone Blindness in Market Hours (Section 7)**
*   **The Issue:** "Caches 60s during market hours, 4h after market close (based on current time ET)." n8n runs in a Node environment where the system time is almost certainly UTC. Native JS `Date` methods will return UTC. 
*   **Actionable Fix:** Explicitly mandate the use of timezone-aware logic (e.g., `Intl.DateTimeFormat` or mapping UTC hours to ET) to determine if the market is open. Also, account for weekends (Saturday/Sunday should default to the 4h cache).

### 2. Scoring Logic & Footguns (Section 1 & 3)

**`detectSameDaySell` Uses the Wrong Date Field**
*   **The Issue:** The plan checks for an overlapping Form 4 S code using `insiderCik` and `filingDate`. Forms are frequently filed days after the trade. An insider might exercise options on Monday, sell on Tuesday, and file *both* on Thursday. Or they might file the exercise on Wednesday and the sale on Thursday.
*   **Actionable Fix:** Match on `transactionDate` (the date the actual trade occurred, which is on the Form 4), not `filingDate` (the date the SEC received the form).

**Partial vs. Full Exercise-and-Sells**
*   **The Issue:** The plan states: "If the shares sold match or overlap the shares from the exercise... bypass with 0." Insiders frequently exercise 10,000 shares and sell exactly 3,500 shares purely to cover the tax obligation, keeping the remaining 6,500 (a bullish signal). Overriding the *entire* trade to 0 because of a partial tax sale destroys valid signal.
*   **Actionable Fix:** Define a threshold. Only classify as a 0-score "exercise-and-sell" if the shares sold are `>= 80%` of the shares exercised. 

**Base Score Inflation (Factor 3)**
*   **The Issue:** The baseline score is 5.0. All market cap adjustments are positive (+1.5 for micro to +0.6 for mega). This means the *actual* baseline before other factors is 5.6 to 6.5, skewing your distribution upward. Mega-caps usually have *less* informational signal.
*   **Actionable Fix:** Center the market cap factor around 0. E.g., Micro/Small: +1.0, Mid: 0, Large: -0.5, Mega: -1.0.

**10b5-1 AI Refinement Override**
*   **The Issue:** The base score is capped at 5.0 for 10b5-1 plans. But the AI refinement layer (Section 2) happens *after* the base score. `final_score = clamp(base_score + ai_adjustment, 1, 10)`. The AI could add +1, making the final score 6.0 for a 10b5-1 plan.
*   **Actionable Fix:** Enforce the 10b5-1 cap at the very end of the pipeline (`final_score`), or explicitly instruct `callDeepSeekForRefinement` to bypass AI processing entirely if `is10b5Plan` is true (saves API calls and enforces the cap).

### 3. AI Prompts & Validation Contradictions (Section 5 & 6)

**Rule 4 Contradicts Graceful Degradation**
*   **The Issue:** Section 6 mandates: "at least one percentage figure must appear". However, Section 5 states that if `sharesOwnedAfter` is missing, the portfolio percentage is omitted. If Finnhub fails, the daily % change is omitted. If both degrade gracefully, the LLM has no legitimate percentage data to write. Rule 4 will fail, trigger a retry, and drop to the fallback template—punishing the AI for handling missing data correctly.
*   **Actionable Fix:** Remove Rule 4, OR make it conditional (only enforce Rule 4 if percentage data was actually injected into the prompt).

**The Fallback Template Fails Its Own Validation**
*   **The Issue:** The plan claims the fallback template (`"{insiderName} {bought/sold} {shares}... Score: {finalScore}/10."`) "always passes validation by design." It actually fails Rule 4 (no percentage) and Rule 5 (no cautionary language).
*   **Actionable Fix:** Explicitly state in the code flow that returning the fallback template *bypasses* `validateAnalysis()`.

**Strict Word Count Limits on LLMs**
*   **The Issue:** Rule 1 enforces a strict `±20%` word count. LLMs are notoriously terrible at exact word counts. With a target of 50 words, an output of 39 words fails. You will burn through retries and hit your fallback template frequently, ruining the quality of your alerts.
*   **Actionable Fix:** Change Rule 1 to a looser boundary: enforce a minimum word count (e.g., > 20 words) and a hard maximum (e.g., < 150 words), rather than a tight `±20%` window.

**LLM JSON Parsing Vulnerability (Section 2)**
*   **The Issue:** Even at temperature 0.0, DeepSeek (and other models) will occasionally wrap JSON in markdown blocks (e.g., ````json { "adjustment": 1 } ````). A raw `JSON.parse()` will throw an error, causing an unnecessary retry or failure.
*   **Actionable Fix:** Ensure the JSON parsing logic strips markdown formatting (e.g., `.replace(/```json|```/g, '')`) before calling `JSON.parse()`.

### 4. Minor Missing Considerations

*   **Handling Negative Historical Returns:** Factor 5 rewards >10% and >20% historical returns with bonuses. It does not specify penalizing negative historical returns (e.g., an insider who averages -15% on previous buys). Consider adding a -0.5 penalty for track records with negative returns over 3+ trades.
*   **Sales vs Disposals:** The plan states `direction = 'D'` (Disposal). Keep in mind that not all Disposals are sales. Disposals include gifts (G), tax withholding (F), and forfeitures. Ensure that the downstream prompt relies on the `transactionCode` ('S') to frame it as a "sell", not just the `direction = 'D'`, because a non-filtered disposal code might bleed through as a "sell".
*   **DeepSeek Prompting for Sells:** Evaluating "conviction" on a sell is inherently different than a buy. Ensure the AI refinement prompt explicitly knows that a CEO selling 5% of their holdings is normal diversification, but selling 80% is high-signal. Without specific bounding, the AI might wrongly assess a standard 5% sale as a "massive dump".
