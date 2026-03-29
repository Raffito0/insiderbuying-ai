warning: in the working copy of 'ryan_cole/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'ryan_cole/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js', LF will be replaced by CRLF the next time Git touches it
diff --git a/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js b/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js
index 369b518..d3efb82 100644
--- a/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js
+++ b/ryan_cole/insiderbuying-site/n8n/code/insiderbuying/analyze-alert.js
@@ -13,6 +13,23 @@ try {
   // finnhub-client.js not yet complete (section 07) — quote/earnings data unavailable
 }
 
+// ─── Constants ────────────────────────────────────────────────────────────────
+
+const BANNED_PHRASES = ["guaranteed", "will moon", "to the moon", "can't lose", "sure thing"];
+const CAUTIONARY_WORDS = ["however", "risk", "caution", "could", "routine", "consider"];
+
+// ─── stripMarkdownFences ─────────────────────────────────────────────────────
+
+/**
+ * Removes markdown code fences (```json ... ``` or ``` ... ```) from a string.
+ * @param {string} text
+ * @returns {string}
+ */
+function stripMarkdownFences(text) {
+  if (!text || typeof text !== 'string') return text;
+  return text.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/s, '$1').trim();
+}
+
 // ─── getWordTarget ────────────────────────────────────────────────────────────
 
 /**
@@ -134,23 +151,66 @@ CRITICAL: Do NOT use generic phrases like "insiders have information about their
 Return ONLY the analysis prose. No JSON, no markdown headers, no bullet points.`;
 }
 
-// ─── validateAnalysis ────────────────────────────────────────────────────────
+// ─── validateAnalysis (S06) ──────────────────────────────────────────────────
 
 /**
- * Basic structural validation of analysis text.
- * Section 06 extends this with additional rules (word count, banned phrases, etc.)
+ * Validates analysis text against 5 rules.
+ * All rules are checked — no short-circuit on first failure.
  *
- * @param {string} text
- * @param {number} [score]         - Alert score (used by S06 extension)
- * @param {string} [direction]     - 'A' or 'D' (used by S06 extension)
- * @param {boolean} [pctAvailable] - Whether percentage data was available (S06)
- * @returns {boolean}
+ * @param {string}  text           - Analysis text to validate
+ * @param {number}  [score]        - Alert score; if undefined, Rule 1 is skipped
+ * @param {string}  [direction]    - 'A' or 'D' (reserved for future use)
+ * @param {boolean} [pctAvailable] - If true, Rule 4 requires a "%" in text
+ * @returns {{ valid: boolean, errors: string[] }}
  */
 function validateAnalysis(text, score, direction, pctAvailable) {
-  if (!text || typeof text !== 'string') return false;
-  if (text.length < 50) return false;
-  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
-  return paragraphs.length >= 2;
+  const errors = [];
+
+  if (!text || typeof text !== 'string') {
+    return { valid: false, errors: ['text is required'] };
+  }
+
+  const stripped = stripMarkdownFences(text);
+  const words = stripped.split(/\s+/).filter(Boolean);
+  const wordCount = words.length;
+
+  // Rule 1 — Word count (skip if score undefined/null)
+  if (score != null) {
+    const { target, max } = getWordTarget(score);
+    const minWords = Math.floor(target * 0.70);
+    if (wordCount < minWords) {
+      errors.push(`too short: ${wordCount} words (minimum ${minWords} for score ${score})`);
+    } else if (wordCount > max) {
+      errors.push(`too long: ${wordCount} words (maximum ${max} for score ${score})`);
+    }
+  }
+
+  // Rule 2 — Banned phrases (case-insensitive)
+  for (const phrase of BANNED_PHRASES) {
+    if (stripped.toLowerCase().includes(phrase.toLowerCase())) {
+      errors.push(`banned phrase detected: "${phrase}"`);
+    }
+  }
+
+  // Rule 3 — Dollar amount present
+  if (!/\$\d/.test(stripped)) {
+    errors.push('missing dollar amount: text must contain at least one "$" followed by a digit');
+  }
+
+  // Rule 4 — Percentage present (conditional)
+  if (pctAvailable) {
+    if (!/%/.test(stripped)) {
+      errors.push('missing percentage: prompt injected percentage data but no "%" found in text');
+    }
+  }
+
+  // Rule 5 — Cautionary language
+  const hasCautionary = CAUTIONARY_WORDS.some(w => stripped.toLowerCase().includes(w.toLowerCase()));
+  if (!hasCautionary) {
+    errors.push(`missing cautionary language: text must contain at least one of [${CAUTIONARY_WORDS.join(', ')}]`);
+  }
+
+  return { valid: errors.length === 0, errors };
 }
 
 // ─── Legacy prompt builder (used by analyze() for backward compat) ────────────
@@ -212,7 +272,7 @@ async function analyze(filing, helpers) {
     let result = await client.complete(null, prompt);
     let text = result.content;
 
-    if (validateAnalysis(text)) {
+    if (validateAnalysis(text).valid) {
       return text;
     }
 
@@ -223,7 +283,7 @@ async function analyze(filing, helpers) {
     result = await client.complete(null, prompt);
     text = result.content;
 
-    if (validateAnalysis(text)) {
+    if (validateAnalysis(text).valid) {
       return text;
     }
 
@@ -293,30 +353,70 @@ async function runAnalyzeAlert(alert, deps = {}) {
   const apiKey = deps.deepSeekApiKey || (env && env.DEEPSEEK_API_KEY);
   const client = createDeepSeekClient(fetchFn, apiKey);
 
+  const insiderName = alert.insiderName || alert.insider_name || 'The insider';
+  const actionVerb = direction === 'A' ? 'bought' : 'sold';
+  const priceStr = alert.pricePerShare || alert.price_per_share || '';
+
   let text = null;
   let attemptCount = 0;
 
   try {
+    // Attempt 1
     attemptCount++;
     let result = await client.complete(null, promptString, { temperature: 0.3 });
     text = result.content;
 
-    // Step 8: Validate (S06 extends this to use score/direction/pctAvailable)
-    if (!validateAnalysis(text, finalScore, direction, percentageDataAvailable)) {
-      attemptCount++;
-      if (sleep) await sleep(2000);
-      result = await client.complete(null, promptString, { temperature: 0.3 });
-      text = result.content;
-
-      if (!validateAnalysis(text, finalScore, direction, percentageDataAvailable)) {
-        // Minimal fallback template (S06 provides richer fallback)
-        const insiderName = alert.insiderName || alert.insider_name || 'The insider';
-        const actionVerb = direction === 'A' ? 'bought' : 'sold';
-        const sharesStr = sharesTraded != null ? sharesTraded + ' shares' : 'shares';
-        const priceStr = alert.pricePerShare || alert.price_per_share || '';
-        text = `${insiderName} ${actionVerb} ${sharesStr} at $${priceStr}. Score: ${finalScore}/10.`;
-      }
+    const v1 = validateAnalysis(text, finalScore, direction, percentageDataAvailable);
+    console.log(JSON.stringify({
+      event: 'analysis_validation',
+      attempt: 1,
+      valid: v1.valid,
+      errors: v1.errors,
+      wordCount: (text || '').split(/\s+/).filter(Boolean).length,
+      ticker,
+      timestamp: new Date().toISOString(),
+    }));
+
+    if (v1.valid) {
+      return { analysisText: text, percentageDataAvailable, wordTarget, attemptCount };
     }
+
+    // Attempt 2 — append error list to prompt
+    attemptCount++;
+    if (sleep) await sleep(2000);
+    const retryPrompt = promptString +
+      `\n\nPrevious attempt failed validation: [${v1.errors.join(', ')}]. Fix these issues.`;
+    result = await client.complete(null, retryPrompt, { temperature: 0.3 });
+    text = result.content;
+
+    const v2 = validateAnalysis(text, finalScore, direction, percentageDataAvailable);
+    console.log(JSON.stringify({
+      event: 'analysis_validation',
+      attempt: 2,
+      valid: v2.valid,
+      errors: v2.errors,
+      wordCount: (text || '').split(/\s+/).filter(Boolean).length,
+      ticker,
+      timestamp: new Date().toISOString(),
+    }));
+
+    if (v2.valid) {
+      return { analysisText: text, percentageDataAvailable, wordTarget, attemptCount };
+    }
+
+    // Both attempts failed — use fallback template (no third validateAnalysis call)
+    console.log(JSON.stringify({
+      event: 'analysis_fallback_used',
+      reason: 'double_validation_failure',
+      attempt1Errors: v1.errors,
+      attempt2Errors: v2.errors,
+      ticker,
+      timestamp: new Date().toISOString(),
+    }));
+
+    const sharesStr = sharesTraded != null ? sharesTraded + ' shares' : 'shares';
+    text = `${insiderName} ${actionVerb} ${sharesStr} at $${priceStr}. Score: ${finalScore}/10.`;
+
   } catch (err) {
     console.warn(`[analyze-alert] runAnalyzeAlert error for ${ticker}: ${err.message}`);
     return null;
diff --git a/ryan_cole/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js b/ryan_cole/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js
index 83fa77e..7efb804 100644
--- a/ryan_cole/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js
+++ b/ryan_cole/insiderbuying-site/tests/insiderbuying/analyze-alert.test.js
@@ -286,22 +286,22 @@ describe('analyze-alert', () => {
 
   // ── validateAnalysis unit tests ────────────────────────────────────────
 
-  test('validateAnalysis accepts 2+ paragraphs > 50 chars', () => {
-    expect(validateAnalysis(GOOD_ANALYSIS)).toBe(true);
+  test('validateAnalysis accepts text with dollar amount and cautionary language', () => {
+    expect(validateAnalysis(GOOD_ANALYSIS).valid).toBe(true);
   });
 
-  test('validateAnalysis rejects < 50 chars', () => {
-    expect(validateAnalysis('Short.')).toBe(false);
+  test('validateAnalysis rejects text with no dollar amount', () => {
+    expect(validateAnalysis('Short.').valid).toBe(false);
   });
 
-  test('validateAnalysis rejects single paragraph', () => {
+  test('validateAnalysis rejects text with no dollar amount (long single block)', () => {
     const single = 'A'.repeat(100);
-    expect(validateAnalysis(single)).toBe(false);
+    expect(validateAnalysis(single).valid).toBe(false);
   });
 
   test('validateAnalysis rejects null/undefined', () => {
-    expect(validateAnalysis(null)).toBe(false);
-    expect(validateAnalysis(undefined)).toBe(false);
+    expect(validateAnalysis(null).valid).toBe(false);
+    expect(validateAnalysis(undefined).valid).toBe(false);
   });
 });
 
@@ -519,3 +519,348 @@ describe('Structured Analysis (Section 05)', () => {
     });
   });
 });
+
+// ─── Analysis Validation (Section 06) ────────────────────────────────────────
+
+describe('Analysis Validation (Section 06)', () => {
+  // Helper: build analysis text with controlled word count and features
+  function makeAnalysis(wordCount, options = {}) {
+    const { dollar = true, cautionary = true, banned = null, pct = false } = options;
+    const parts = [];
+    if (dollar) parts.push('$45.20 was the price per share.');
+    if (cautionary) parts.push('However, risk factors should be considered.');
+    if (banned) parts.push(`This trade is ${banned}.`);
+    if (pct) parts.push('Represents 15% of current holdings.');
+    const prefix = parts.length > 0 ? parts.join(' ') + ' ' : '';
+    const prefixWords = prefix.split(/\s+/).filter(Boolean).length;
+    const fillCount = Math.max(0, wordCount - prefixWords);
+    return prefix + Array(fillCount).fill('word').join(' ');
+  }
+
+  beforeEach(() => {
+    jest.clearAllMocks();
+  });
+
+  // ── Rule 1 — Word count ────────────────────────────────────────────────────
+  // score=7: target=200, max=275, min=Math.floor(200*0.70)=140
+
+  describe('Rule 1 — word count', () => {
+    test('150 words, score=7 → valid (within range)', () => {
+      const text = makeAnalysis(150);
+      expect(validateAnalysis(text, 7).valid).toBe(true);
+    });
+
+    test('139 words, score=7 → invalid, error contains "too short"', () => {
+      const text = makeAnalysis(139);
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e => e.toLowerCase().includes('too short'))).toBe(true);
+    });
+
+    test('276 words, score=7 → invalid, error contains "too long"', () => {
+      const text = makeAnalysis(276);
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e => e.toLowerCase().includes('too long'))).toBe(true);
+    });
+
+    test('140 words, score=7 → valid (exactly at floor boundary, inclusive)', () => {
+      const text = makeAnalysis(140);
+      expect(validateAnalysis(text, 7).valid).toBe(true);
+    });
+
+    test('275 words, score=7 → valid (exactly at max, inclusive)', () => {
+      const text = makeAnalysis(275);
+      expect(validateAnalysis(text, 7).valid).toBe(true);
+    });
+
+    test('276 words, score=7 → invalid (max + 1)', () => {
+      const text = makeAnalysis(276);
+      expect(validateAnalysis(text, 7).valid).toBe(false);
+    });
+
+    test('Rule 1 skipped when score is undefined — short text with dollar+cautionary passes', () => {
+      const text = makeAnalysis(10);
+      const result = validateAnalysis(text, undefined);
+      const hasWordCountError = result.errors.some(e =>
+        e.toLowerCase().includes('too short') || e.toLowerCase().includes('too long')
+      );
+      expect(hasWordCountError).toBe(false);
+    });
+  });
+
+  // ── Rule 2 — Banned phrases ───────────────────────────────────────────────
+
+  describe('Rule 2 — banned phrases', () => {
+    test('"guaranteed" in text → invalid, error names the phrase', () => {
+      const text = makeAnalysis(150, { banned: 'guaranteed' });
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e => e.includes('guaranteed'))).toBe(true);
+    });
+
+    test('"will moon" in text → invalid', () => {
+      const text = makeAnalysis(150, { banned: 'will moon' });
+      expect(validateAnalysis(text, 7).valid).toBe(false);
+    });
+
+    test('"to the moon" in text → invalid', () => {
+      const text = makeAnalysis(150, { banned: 'to the moon' });
+      expect(validateAnalysis(text, 7).valid).toBe(false);
+    });
+
+    test('"GUARANTEED" uppercase → invalid (case-insensitive check)', () => {
+      const text = makeAnalysis(150) + ' GUARANTEED returns ahead.';
+      expect(validateAnalysis(text, 7).valid).toBe(false);
+    });
+
+    test('"guaranteed" as substring of phrase → fails (substring match, documented behavior)', () => {
+      const text = makeAnalysis(150) + ' guaranteed-return strategy.';
+      expect(validateAnalysis(text, 7).valid).toBe(false);
+    });
+
+    test('no banned phrases → Rule 2 passes', () => {
+      const text = makeAnalysis(150);
+      const result = validateAnalysis(text, 7);
+      expect(result.errors.some(e => e.toLowerCase().includes('banned'))).toBe(false);
+    });
+  });
+
+  // ── Rule 3 — Dollar amount present ────────────────────────────────────────
+
+  describe('Rule 3 — dollar amount', () => {
+    test('"$45.20" in text → Rule 3 passes', () => {
+      const text = makeAnalysis(150, { dollar: true });
+      const result = validateAnalysis(text, 7);
+      expect(result.errors.some(e => e.toLowerCase().includes('dollar') || e.toLowerCase().includes('amount'))).toBe(false);
+    });
+
+    test('"$1,200" in text → passes', () => {
+      const text = makeAnalysis(150, { dollar: false }) + ' priced at $1,200 per share.';
+      const result = validateAnalysis(text, 7);
+      expect(result.errors.some(e => e.toLowerCase().includes('dollar') || e.toLowerCase().includes('amount'))).toBe(false);
+    });
+
+    test('no "$" character → Rule 3 fails', () => {
+      const text = makeAnalysis(150, { dollar: false });
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e =>
+        e.toLowerCase().includes('dollar') || e.toLowerCase().includes('amount') || e.includes('$')
+      )).toBe(true);
+    });
+
+    test('"$" not followed by digit (e.g. "the $ amount") → Rule 3 fails', () => {
+      const text = makeAnalysis(150, { dollar: false }) + ' the $ amount was high.';
+      const result = validateAnalysis(text, 7);
+      expect(result.errors.some(e =>
+        e.toLowerCase().includes('dollar') || e.toLowerCase().includes('amount') || e.includes('$')
+      )).toBe(true);
+    });
+  });
+
+  // ── Rule 4 — Percentage present (conditional) ─────────────────────────────
+
+  describe('Rule 4 — percentage (conditional)', () => {
+    test('percentageDataAvailable=true, text contains "15%" → Rule 4 passes', () => {
+      const text = makeAnalysis(150, { pct: true });
+      const result = validateAnalysis(text, 7, 'A', true);
+      expect(result.errors.some(e => e.toLowerCase().includes('percent'))).toBe(false);
+    });
+
+    test('percentageDataAvailable=true, no "%" → fails with percentage error', () => {
+      const text = makeAnalysis(150, { pct: false });
+      const result = validateAnalysis(text, 7, 'A', true);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e => e.toLowerCase().includes('percent'))).toBe(true);
+    });
+
+    test('percentageDataAvailable=false → Rule 4 skipped entirely', () => {
+      const text = makeAnalysis(150, { pct: false });
+      const result = validateAnalysis(text, 7, 'A', false);
+      expect(result.errors.some(e => e.toLowerCase().includes('percent'))).toBe(false);
+    });
+
+    test('percentageDataAvailable=false, no "%" → still passes Rule 4 (rule was skipped)', () => {
+      const text = makeAnalysis(150, { pct: false });
+      const result = validateAnalysis(text, 7, 'A', false);
+      expect(result.errors.filter(e => e.toLowerCase().includes('percent'))).toHaveLength(0);
+    });
+  });
+
+  // ── Rule 5 — Cautionary language ─────────────────────────────────────────
+
+  describe('Rule 5 — cautionary language', () => {
+    test('"however" → passes', () => {
+      const text = makeAnalysis(150, { cautionary: false }) + ' However this is notable.';
+      expect(validateAnalysis(text, 7).errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(false);
+    });
+
+    test('"could" → passes', () => {
+      const text = makeAnalysis(150, { cautionary: false }) + ' The stock could decline.';
+      expect(validateAnalysis(text, 7).errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(false);
+    });
+
+    test('"routine" → passes', () => {
+      const text = makeAnalysis(150, { cautionary: false }) + ' This may be routine selling.';
+      expect(validateAnalysis(text, 7).errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(false);
+    });
+
+    test('"caution" → passes', () => {
+      const text = makeAnalysis(150, { cautionary: false }) + ' Investors should exercise caution.';
+      expect(validateAnalysis(text, 7).errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(false);
+    });
+
+    test('"consider" → passes', () => {
+      const text = makeAnalysis(150, { cautionary: false }) + ' Investors should consider context.';
+      expect(validateAnalysis(text, 7).errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(false);
+    });
+
+    test('"risk" → passes', () => {
+      const text = makeAnalysis(150, { cautionary: false }) + ' Risk factors apply here.';
+      expect(validateAnalysis(text, 7).errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(false);
+    });
+
+    test('no cautionary words → Rule 5 fails', () => {
+      const text = makeAnalysis(150, { cautionary: false });
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(true);
+    });
+
+    test('"recover" does not trigger Rule 5 (documented: no cautionary word is a substring)', () => {
+      // "recover" does not contain however/risk/caution/could/routine/consider
+      const text = makeAnalysis(150, { cautionary: false }) + ' The stock may recover soon.';
+      const result = validateAnalysis(text, 7);
+      expect(result.errors.some(e => e.toLowerCase().includes('cautionary'))).toBe(true);
+    });
+  });
+
+  // ── All rules together ────────────────────────────────────────────────────
+
+  describe('all rules together', () => {
+    test('failing Rules 1 and 3 simultaneously → both errors present', () => {
+      const text = makeAnalysis(139, { dollar: false });
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(false);
+      expect(result.errors.some(e => e.toLowerCase().includes('too short'))).toBe(true);
+      expect(result.errors.some(e =>
+        e.toLowerCase().includes('dollar') || e.toLowerCase().includes('amount') || e.includes('$')
+      )).toBe(true);
+    });
+
+    test('text passing all applicable rules → { valid: true, errors: [] }', () => {
+      const text = makeAnalysis(150);
+      const result = validateAnalysis(text, 7);
+      expect(result.valid).toBe(true);
+      expect(result.errors).toEqual([]);
+    });
+  });
+
+  // ── Retry flow integration ────────────────────────────────────────────────
+
+  describe('retry flow integration', () => {
+    const SAMPLE_ALERT_S06 = {
+      ticker: 'MSFT',
+      insiderName: 'Satya Nadella',
+      canonicalRole: 'CEO',
+      insiderCategory: 'C-Suite',
+      sharesTraded: 5000,
+      pricePerShare: 420.00,
+      transactionValue: 2100000,
+      transactionDate: '2026-03-15',
+      finalScore: 7,
+      direction: 'A',
+      sharesOwnedAfter: null,
+    };
+
+    test('first response fails validation → second call made, prompt contains error list', async () => {
+      const badText = makeAnalysis(50, { dollar: false, cautionary: false });
+      const goodText = makeAnalysis(150);
+      const mockClient = { complete: jest.fn() };
+      mockClient.complete
+        .mockResolvedValueOnce({ content: badText, usage: {}, cached: false, estimatedCost: 0 })
+        .mockResolvedValueOnce({ content: goodText, usage: {}, cached: false, estimatedCost: 0 });
+      createDeepSeekClient.mockReturnValue(mockClient);
+
+      await runAnalyzeAlert(SAMPLE_ALERT_S06, {
+        fetchFn: jest.fn(),
+        sleep: () => Promise.resolve(),
+        env: { DEEPSEEK_API_KEY: 'test-key' },
+      });
+
+      expect(mockClient.complete).toHaveBeenCalledTimes(2);
+      const secondCallPrompt = mockClient.complete.mock.calls[1][1];
+      expect(secondCallPrompt).toContain('Previous attempt failed validation');
+    });
+
+    test('second attempt passes → returns second response with attemptCount=2', async () => {
+      const badText = makeAnalysis(50, { dollar: false, cautionary: false });
+      const goodText = makeAnalysis(150);
+      const mockClient = { complete: jest.fn() };
+      mockClient.complete
+        .mockResolvedValueOnce({ content: badText, usage: {}, cached: false, estimatedCost: 0 })
+        .mockResolvedValueOnce({ content: goodText, usage: {}, cached: false, estimatedCost: 0 });
+      createDeepSeekClient.mockReturnValue(mockClient);
+
+      const result = await runAnalyzeAlert(SAMPLE_ALERT_S06, {
+        fetchFn: jest.fn(),
+        sleep: () => Promise.resolve(),
+        env: { DEEPSEEK_API_KEY: 'test-key' },
+      });
+
+      expect(result.analysisText).toBe(goodText);
+      expect(result.attemptCount).toBe(2);
+    });
+
+    test('both attempts fail → fallback template returned, only 2 complete() calls made', async () => {
+      const badText = makeAnalysis(50, { dollar: false, cautionary: false });
+      const mockClient = makeMockClient(badText);
+      createDeepSeekClient.mockReturnValue(mockClient);
+
+      const result = await runAnalyzeAlert(SAMPLE_ALERT_S06, {
+        fetchFn: jest.fn(),
+        sleep: () => Promise.resolve(),
+        env: { DEEPSEEK_API_KEY: 'test-key' },
+      });
+
+      expect(mockClient.complete).toHaveBeenCalledTimes(2);
+      expect(result).not.toBeNull();
+      expect(result.analysisText).toContain('Satya Nadella');
+    });
+
+    test('fallback template contains insiderName, "bought", share count, price, and score', async () => {
+      const badText = makeAnalysis(50, { dollar: false, cautionary: false });
+      const mockClient = makeMockClient(badText);
+      createDeepSeekClient.mockReturnValue(mockClient);
+
+      const result = await runAnalyzeAlert(SAMPLE_ALERT_S06, {
+        fetchFn: jest.fn(),
+        sleep: () => Promise.resolve(),
+        env: { DEEPSEEK_API_KEY: 'test-key' },
+      });
+
+      const t = result.analysisText;
+      expect(t).toContain('Satya Nadella');
+      expect(t).toContain('bought');
+      expect(t).toContain('5000');
+      expect(t).toContain('420');
+      expect(t).toContain('7/10');
+    });
+
+    test('fallback uses "sold" for direction=D', async () => {
+      const badText = makeAnalysis(50, { dollar: false, cautionary: false });
+      const mockClient = makeMockClient(badText);
+      createDeepSeekClient.mockReturnValue(mockClient);
+
+      const sellAlert = { ...SAMPLE_ALERT_S06, direction: 'D' };
+      const result = await runAnalyzeAlert(sellAlert, {
+        fetchFn: jest.fn(),
+        sleep: () => Promise.resolve(),
+        env: { DEEPSEEK_API_KEY: 'test-key' },
+      });
+
+      expect(result.analysisText).toContain('sold');
+    });
+  });
+});
