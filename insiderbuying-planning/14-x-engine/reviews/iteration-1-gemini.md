# Gemini Review

**Model:** gemini-3-pro-preview
**Generated:** 2026-03-28T23:01:00.006858

---

Here is a comprehensive architectural review of the `14-x-engine` implementation plan. 

Removing the Telegram review bottleneck and going fully autonomous is a significant step. While the plan is generally well-structured and aligns nicely with n8n’s paradigm of using Code nodes for data transformation, there are several critical footguns, edge cases, and API limitations that need to be addressed before implementation.

---

### 1. High-Risk Reputational & Autonomous Footguns

*   **Liking Random Replies (`buildEngagementSequence`):** 
    *   **The Risk:** The plan dictates liking 2–3 randomly selected replies in a thread. Finance/Crypto Twitter is plagued by spam bots, crypto scams, and offensive content in the replies of large accounts. If your bot autonomously "likes" a crypto scam or hate speech, the account will lose credibility instantly and could be reported/banned.
    *   **Action:** Change this to only like the original tweet, or strictly limit reply likes to replies authored by the *original account holder* (reading the `author_id` of the replies). Do not like random user replies.
*   **The "Contrarian" Archetype (`selectArchetype`):**
    *   **The Risk:** Instructing an LLM to be "contrarian" and respectfully disagree on autopilot is dangerous. If a large account posts about a tragedy, a CEO stepping down for health reasons, or a market crash, an automated "Interesting, but..." reply will look incredibly tone-deaf and invite mass blocking/reporting.
    *   **Action:** Include a strict "vibe check" in the prompt or upstream n8n filter. Do not use the contrarian archetype if the original tweet contains negative sentiment keywords (e.g., bankruptcy, death, resignation, fraud). 
*   **Missing LLM Semantic Validation:**
    *   **The Risk:** `validateReply` only checks syntax (length, emojis, URLs, cashtags). It does not check if the LLM hallucinated, output a system error ("As an AI language model..."), or forgot to actually use the filing data.
    *   **Action:** Add a regex check in `validateReply` to reject standard AI refusal phrases (e.g., `/(as an AI|language model|I cannot|I apologize)/i`).

### 2. X API & Integration Specifics

*   **X API Poll Constraints (`buildPoll`):**
    *   **The Risk:** The X API has very strict limits on polls: Labels cannot exceed 25 characters, and you can only have a maximum of 4 options. LLMs are notoriously bad at adhering to strict character limits. If DeepSeek generates an option label with 26 characters, the X API will reject the entire post.
    *   **Action:** Add a `validatePoll` step that explicitly truncates or rejects poll options exceeding 25 characters and enforces an array length of 2 to 4. 
    *   **Note:** Also verify that your n8n X OAuth app has the "User authentication setup" correctly configured for v2 Poll creation, as polls cannot be created with standard app-only Bearer tokens.
*   **Media Upload API Limitations (`uploadMediaToX`):**
    *   **The Risk:** The plan implies a single `POST` to `upload.json`. While this works for tiny images, X heavily prefers (and sometimes mandates) the `INIT`, `APPEND`, `FINALIZE` chunked upload sequence for media. If visual templates generate rich PNGs, a single-shot upload might randomly fail with cryptic API errors.
    *   **Action:** Explicitly define whether `uploadMediaToX` implements the 3-step chunked upload or single-shot. If single-shot, verify the exact byte limit with the current X API docs (usually < 5MB).
*   **Cashtag Regex Flaw (`validateReply`):**
    *   **The Risk:** The regex `\$[A-Z]{1,5}` will fail to match valid standard tickers that include dots or dashes (e.g., `$BRK.B`, `$CRWD`, `$JWN`). 
    *   **Action:** Update the regex to support standard financial ticker suffixes: `\$[A-Z]{1,5}([.-][A-Z]{1,2})?`.

### 3. Logic & Financial Data Edge Cases

*   **Multiple Tickers in One Tweet (`extractTicker`):**
    *   **The Risk:** If a user tweets "Rotation out of $NVDA into $AMD looks imminent," which ticker does `extractTicker` return? If it returns an array, `buildFilingContext` will break if it expects a string.
    *   **Action:** Define fallback logic. E.g., `extractTicker` returns the *first* matching ticker found in the tweet, or returns an array and `buildFilingContext` checks the database for the first one that has filing data.
*   **Quote-Retweet Timing & Market Hours (`buildQuoteRetweetJob`):**
    *   **The Risk:** The job runs 2-3 hours after posting. If the original post happens at 5:00 PM (after market close) or on a weekend, the current price fetched 2 hours later will be identical to the price at posting. An update saying "Update: $TICKER has moved 0.0%..." is a waste of a post.
    *   **Action:** The cron scheduler must check if the market is/was open. Alternatively, only schedule QRTs for breaking alerts that happen during market hours.
*   **Thread Failure Handling (`buildThread`):**
    *   **The Risk:** Posting a thread requires chaining API requests where Tweet 2 relies on Tweet 1's ID. If Tweet 2 triggers an X rate limit or spam filter, Tweet 1 is left stranded without context.
    *   **Action:** Ensure the n8n workflow uses the `Catch` node gracefully. However, there is no easy rollback for X posts. Ensure the thread texts are strictly validated *before* the first tweet is posted.

### 4. Code & Architectural Considerations

*   **API Client Retry Loop (`ai-client.js`):**
    *   **The Risk:** Hardcoded 5s waits for 429s without a maximum retry counter can cause n8n execution timeouts. Furthermore, Claude and DeepSeek return a `Retry-After` header.
    *   **Action:** Implement a maximum retry limit (e.g., 3 attempts). Ideally, read the `Retry-After` header instead of defaulting to 5s. If it exceeds n8n's acceptable wait time, fail gracefully and let n8n skip the generation.
*   **Concurrency with Daily Caps (`checkDailyReplyCap`):**
    *   **The Risk:** If two n8n triggers fire at exactly the same time, both read 14 replies from NocoDB, both proceed, and you end up with 16 replies. 
    *   **Action:** Accept this slight overage as a known architectural trade-off. 15 vs 16 won't get the account banned. Just document that this is a soft limit based on database polling, not an atomic lock.
*   **Zombie QRT Jobs (`buildQuoteRetweetJob`):**
    *   **The Risk:** The 15-minute cron checks if `execute_after` has passed AND if the tweet has >20 likes. If a tweet gets 5 likes, it will fail the condition. Does it stay "pending" forever? Over months, the `X_Scheduled_Jobs` table will bloat with thousands of dead pending queries, slowing down the NocoDB query.
    *   **Action:** Add an expiration condition. If `now > execute_after + 24 hours` and it still doesn't have 20 likes, update status to `expired` or `skipped` so the query stops fetching it.
*   **Flaky Tests due to Randomness:**
    *   **The Risk:** The test approach states: "tested by running `selectArchetype` 100 times and checking that each archetype's count falls within ±5%". Mathematically, a pure RNG will fail this margin of error somewhat frequently due to standard deviation. This will result in flaky CI/CD pipelines.
    *   **Action:** Do not use live `Math.random()` to test statistical distribution in automated tests. Instead, mock `Math.random()` to return predetermined values (`0.1`, `0.6`, `0.9`) and assert that it maps to the correct archetype boundaries. 

### Summary of Recommendations to add to the Plan:
1.  **Drop random reply likes; only like the original tweet.**
2.  **Add semantic checks (AI refusal catch) to `validateReply`.**
3.  **Enforce X API Poll string limits (<25 chars per option) in JS.**
4.  **Fix cashtag Regex to include dots and dashes.**
5.  **Add `expired` status logic to the QRT scheduler so jobs don't queue forever.**
6.  **Mock `Math.random()` in tests rather than testing statistical probability.**
