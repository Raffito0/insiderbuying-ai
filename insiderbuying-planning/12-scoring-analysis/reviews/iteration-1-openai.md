# Openai Review

**Model:** o3
**Generated:** 2026-03-28T22:44:16.977609

---

Implementation-Plan Review  
Project: “12-scoring-analysis”

==================================================================
Top-level verdict
------------------------------------------------------------------
The plan is solid and well thought-out, but a handful of blind
spots, edge cases, and operational risks could bite you in
production.  Most items are easily fixable if addressed up-front.

==================================================================
1. Deterministic Scoring ‑ Section 1
------------------------------------------------------------------
1.1 Direction symmetry may be wrong  
    • A USD 10 M buy and a USD 10 M sell currently receive the
      same positive lift.  For many users (and most research) a
      huge sale is actually a bearish signal.  Either:
        – Advertise clearly that “high score = high *signal*,
          irrespective of bullish/bearish”, or
        – Flip the sign on the quota factors for ‘D’ direction,
          or
        – Provide two separate scores (bullishScore /
          bearishScore).  Decide now; changing later will break
          consumer expectations.

1.2 Unknown / exotic transaction codes  
    • Codes C (conversion), L (small acquisition), K, O, etc. are
      still routed to the formula.  Some of these are also
      housekeeping and should be hard-coded to 0 like G/F or at
      least heavily penalised.  List all §240.16a-3 codes once and
      treat each deliberately.

1.3 “Unknown title” default bonus  
    • Giving +0.5 for unmapped titles incentivises sloppy parsing.
      Treat “unknown” as 0 or even ‑0.2 and log a WARN instead.

1.4 Market-cap null handling  
    • “Skip silently” biases the score upward because you still
      award the other four factor groups.  Consider:
        – Apply a neutral 0 (not the micro-cap bonus) *and*
          surface a WARN metric you can alert on if >X% of filings
          are missing market-cap.

1.5 Track-record sample size  
    • You use “>10 % regardless of count”.  A single profitable
      trade can accidentally inflate signal.  Require ≥2 trades or
      raise the threshold when count <3.

1.6 Exercise-and-sell heuristic  
    • Matching only on `filingDate` (YYYY-MM-DD) breaks for
      late-evening filings that straddle UTC dates.  Use the full
      EDGAR `acceptanceDatetime`.  
    • Partial match (“overlap”) is underspecified.  Spell out
      algorithm: same share amount? ≥90 %?  Clarify.

1.7 Transaction-value scaling  
    • “Interpolated discrete steps” – provide the exact brackets
      in the repo or calibration will be guesswork.  Unit-tests
      reference “~8.x” etc.; deterministic expectations need exact
      numbers.

1.8 10b5-1 plan on sells  
    • The plan caps *buys* at 5, but a 10b5-1 *sale* can also be
      pre-scheduled/benign.  Cap both directions or justify why
      not.

==================================================================
2. AI Refinement Layer ‑ Section 2
------------------------------------------------------------------
2.1 Prompt injection / supply-chain attack  
    • Because you relay un-escaped EDGAR footnotes into the
      prompt, an adversary could inject
      `"} ] } BCC: system_message:` style payloads.  Sanitise
      newline + brace characters or send them in a JSON field and
      *not* inside the natural-language prompt block.

2.2 Retry path w/ identical prompt  
    • A transient model glitch often keeps repeating when the
      exact same prompt is resent.  Add a throw-away token
      (`"retry":1`) on 2nd attempt so the model gets a new cache
      key.

==================================================================
3. Weekly Calibration ‑ Section 4
------------------------------------------------------------------
3.1 Division by zero  
    • If no alerts in a quiet holiday week the code divides by 0
      when computing percentages.  Guard and log “no-alerts”.

3.2 Manual not automatic tuning  
    • You alert when buckets are off but nobody/nowhere adjusts
      the weights.  Capture the proposed next action in the alert
      (e.g., “suggest lower TransactionValueBracket_X by 0.2”).

3.3 Concurrency  
    • The calibration node and the main pipeline both write to
      NocoDB; wrap writes in transactions or at least use row
      level locking (`if-match` header) to prevent race conditions
      during heavy after-hours filing bursts.

==================================================================
4. Analysis Generation ‑ Section 5-6
------------------------------------------------------------------
4.1 Hard word-count ±20 %  
    • DeepSeek with temperature 0 often repeats or shortens a
      single sentence; you will see chronic “word count low-by-1
      word” failures.  Either allow ±25 % or count **tokens**, not
      words.

4.2 Hedging-word requirement + Sell direction  
    • Sells already carry an implicit negative bias.  Forcing
      additional hedging words can make copy read awkward:
      “Routine insiders can however possibly…”.  Consider making
      Rule 5 buy-only.

4.3 Fallback template may still fail rule 4  
    • Template lacks a % figure, so if you call `validateAnalysis`
      again (future refactor) the fallback will start failing.
      Put “0 % change” placeholder just in case.

4.4 Banned-phrases list management  
    • Keep the list in environment or JSON config, not hard-coded,
      so editorial can tweak without redeploy.

==================================================================
5. finnhub-client.js ‑ Section 7
------------------------------------------------------------------
5.1 Memory leak / process churn  
    • Entries never get evicted, only time-checked.  Add
      `setInterval(purgeExpired, 10 min)` to cap memory footprint
      if n8n stays up for weeks.

5.2 Pre-market / post-market gap  
    • 4-h TTL after close leaves 13 h stale window until next
      open.  Either:
        – After 20:00 ET set TTL to 15 min until 07:00 ET, or  
        – Always hit API once at 09:00 ET to refresh.

5.3 Symbol vs. Finnhub “exchange” suffix  
    • Finnhub differentiates e.g. `RY.TO` vs `RY`.  Make sure your
      ticker normalisation matches unit 09; otherwise cache misses
      and duplicate quota hits will occur.

5.4 getNextEarningsDate() staleness  
    • You never invalidate NocoDB cache; earnings dates change
      (rescheduled).  On a miss older than 30 d, fallback to
      Finnhub’s /calendar endpoint once so the article copy
      doesn’t omit key info.

==================================================================
6. Security / Secrets
------------------------------------------------------------------
6.1 API keys in logs  
    • Several log snippets include entire `deps.env`.  Redact
      keys before JSON-stringifying.

6.2 Telegram alert surface  
    • Calibration bot posts an entire distribution table.  Limit
      to the harmless percent values; no ticker/insider PII so the
      Telegram token does not create leakage risk if chat is
      compromised.

==================================================================
7. Performance & Rate-limits
------------------------------------------------------------------
7.1 Worst-case API fan-out  
    • A day with 200+ after-hours filings is common during proxy
      season.  Each `analyze-alert` hits Finnhub once → 200 calls
      inside seconds, busting the free 60/min quota despite 60-s
      cache.  Suggestions:
        – Persist quote data to Redis/Postgre in unit 09 and
          reuse;  
        – Throttle analyze workflow to 1 req / second;  
        – Upgrade to paid Finnhub or backup to IEX Cloud.

7.2 DeepSeek cost explosion  
    • ±1 refinement seems cheap, but two retries × two calls
      (score + analysis) × 200 filings/day ~ 1200 calls/day.
      Price this out; add metering and max-daily-calls guardrail.

==================================================================
8. Tests
------------------------------------------------------------------
8.1 detectSameDaySell() not covered  
    • Add dedicated tests with multi-filing same insider same day.

8.2 Timezone / DST unit test  
    • Force clock to `2026-03-10T02:00Z` vs `2026-11-05T02:00Z`
      to prove market-hours cache behaves across DST change.

8.3 Race-conditions in cache  
    • Simulate two parallel `getQuote()` calls on a cold ticker
      and ensure the second waits for / reuses the first
      in-flight promise to avoid double API hits (“stampede
      protection”).

==================================================================
9. Ambiguities / Clarifications needed
------------------------------------------------------------------
A. “discrete steps” brackets – list concrete table.  
B. Partial overlap logic in same-day sell.  
C. Expected *absolute* bucket counts vs. percents when total alerts <20.  
D. Whether score 0 alerts are *saved* (with score 0) or fully
   dropped from downstream deliver-alert; impacts statistics.

==================================================================
Actionable next steps (TL;DR)
------------------------------------------------------------------
1. Decide how high-score vs. bullish/ bearish is communicated and,
   if needed, invert sell factor signs.  
2. Expand / audit transaction-code handling.  
3. Harden prompt inputs against injection and add retry jitter.  
4. Add purge to in-memory cache and revisit post-close TTL.  
5. Throttle or pool Finnhub calls for proxy-season spikes.  
6. Cover missing tests (same-day sell, DST, cache stampede).  
7. Adjust unknown-title and null-field behaviours to avoid silent
   optimistic bias.  
8. Clarify overlap algorithm and bracket tables in docs.  
9. Redact secrets from logs and right-size DeepSeek and Finnhub
   cost ceilings.

Addressing the above before merge will avert several nasty
production surprises and keep analyst trust in the scoring
credible.
