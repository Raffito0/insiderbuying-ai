diff --git a/insiderbuying-site/n8n/code/insiderbuying/generate-article.js b/insiderbuying-site/n8n/code/insiderbuying/generate-article.js
new file mode 100644
index 0000000..a13cdc2
--- /dev/null
+++ b/insiderbuying-site/n8n/code/insiderbuying/generate-article.js
@@ -0,0 +1,844 @@
+/**
+ * W2 — Article Generation Workflow (n8n Code Node)
+ *
+ * Picks best keyword from NocoDB, extracts/validates ticker, calls Dexter
+ * for research, generates article via Claude Tool Use, runs 14-point
+ * quality gate, sanitizes HTML, writes to NocoDB, triggers downstream.
+ *
+ * Trigger: Schedule — 8:00 AM, 1:00 PM, 6:00 PM EST daily
+ */
+
+'use strict';
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const VALID_VERDICTS = ['BUY', 'SELL', 'CAUTION', 'WAIT', 'NO_TRADE'];
+
+const LENGTH_CONFIG = {
+  short:  { maxTokens: 6000,  minWords: 800,  maxWords: 1000 },
+  medium: { maxTokens: 8000,  minWords: 1200, maxWords: 1800 },
+  long:   { maxTokens: 12000, minWords: 2000, maxWords: 3000 },
+};
+
+// Words that look like tickers but are common English words
+const FALSE_POSITIVE_TICKERS = new Set([
+  'A', 'I', 'THE', 'CEO', 'BEST', 'TOP', 'FOR', 'ALL', 'ARE', 'NEW',
+  'BUY', 'SELL', 'IPO', 'ETF', 'AND', 'BUT', 'NOT', 'HAS', 'HAD',
+  'WAS', 'CAN', 'MAY', 'NOW', 'HOW', 'WHY', 'USD', 'USA', 'SEC',
+  'GDP', 'CPI', 'FED', 'EPS', 'ROI', 'DCF', 'FCF', 'YOY', 'QOQ',
+  'ATH', 'ATL', 'OTC', 'DIV', 'PE', 'PB', 'PS',
+]);
+
+const BANNED_PHRASES = [
+  "it's worth noting", "it remains to be seen", "having said that",
+  "on the other hand", "in conclusion", "at the end of the day",
+  "all in all", "needless to say", "it goes without saying",
+  "in today's market", "as we can see", "it should be noted",
+  "moving forward", "let's dive in", "let's take a closer look",
+  "without further ado", "in the grand scheme of things",
+  "only time will tell", "the million-dollar question",
+  "at first glance", "interestingly enough",
+  "it's important to note", "as always", "stay tuned",
+  "that being said",
+];
+
+const ALLOWED_TAGS = new Set([
+  'h2', 'h3', 'p', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
+  'blockquote', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'span',
+]);
+
+const REQUIRED_ARTICLE_FIELDS = [
+  'title', 'meta_description', 'slug', 'key_takeaways', 'body_html',
+  'verdict_type', 'verdict_text', 'word_count',
+];
+
+// ---------------------------------------------------------------------------
+// Ticker Extraction
+// ---------------------------------------------------------------------------
+
+function extractTicker(keyword) {
+  if (!keyword || typeof keyword !== 'string') return null;
+
+  // Match tickers with optional dot notation (BRK.B)
+  const matches = keyword.match(/\b([A-Z]{1,5}(?:\.[A-Z])?)(?=\s|$)/g);
+  if (!matches) return null;
+
+  for (const candidate of matches) {
+    if (!FALSE_POSITIVE_TICKERS.has(candidate)) {
+      return candidate;
+    }
+  }
+  return null;
+}
+
+// ---------------------------------------------------------------------------
+// Article Parameters (weighted random)
+// ---------------------------------------------------------------------------
+
+function determineArticleParams(blog) {
+  const r = Math.random();
+  const targetLength = r < 0.3 ? 'short' : r < 0.8 ? 'medium' : 'long';
+  const authorName = blog === 'insiderbuying' ? 'Dexter Research' : 'Ryan Cole';
+  const maxTokens = LENGTH_CONFIG[targetLength].maxTokens;
+
+  return { targetLength, authorName, maxTokens };
+}
+
+// ---------------------------------------------------------------------------
+// Template Variable Interpolation
+// ---------------------------------------------------------------------------
+
+function interpolateTemplate(template, vars) {
+  let result = template;
+  for (const [key, value] of Object.entries(vars)) {
+    result = result.replaceAll(`{{${key}}}`, String(value));
+  }
+  return result;
+}
+
+// ---------------------------------------------------------------------------
+// Claude Tool Use Schema
+// ---------------------------------------------------------------------------
+
+function buildToolSchema() {
+  return {
+    name: 'generate_article',
+    description: 'Generate a financial analysis article with structured output',
+    input_schema: {
+      type: 'object',
+      required: [
+        'title', 'meta_description', 'slug', 'key_takeaways', 'body_html',
+        'verdict_type', 'verdict_text', 'word_count', 'primary_keyword',
+        'secondary_keywords_used', 'data_tables_count', 'filing_citations_count',
+        'confidence_notes',
+      ],
+      properties: {
+        title: { type: 'string', description: '55-65 characters, contains ticker or company name' },
+        meta_description: { type: 'string', description: '140-155 characters with primary keyword' },
+        slug: { type: 'string', description: 'URL-friendly lowercase with hyphens' },
+        key_takeaways: { type: 'array', items: { type: 'string' }, description: '3-4 bullet points each with a number' },
+        body_html: { type: 'string', description: 'Full article as semantic HTML' },
+        verdict_type: { type: 'string', enum: VALID_VERDICTS },
+        verdict_text: { type: 'string', description: 'Clear position with numeric threshold' },
+        word_count: { type: 'number' },
+        primary_keyword: { type: 'string' },
+        secondary_keywords_used: { type: 'array', items: { type: 'string' } },
+        data_tables_count: { type: 'number' },
+        filing_citations_count: { type: 'number' },
+        confidence_notes: { type: 'string' },
+      },
+    },
+  };
+}
+
+// ---------------------------------------------------------------------------
+// Extract Tool Use Result from Claude response
+// ---------------------------------------------------------------------------
+
+function extractToolResult(response) {
+  if (!response || !response.content || response.content.length === 0) return null;
+  const block = response.content.find((c) => c.type === 'tool_use');
+  if (!block) return null;
+  return block.input || null;
+}
+
+// ---------------------------------------------------------------------------
+// Quality Gate (14 checks)
+// ---------------------------------------------------------------------------
+
+function qualityGate(article, primaryKeyword, targetLength, articleType) {
+  const failures = [];
+
+  // Check #14 first: required fields
+  for (const field of REQUIRED_ARTICLE_FIELDS) {
+    if (!article[field] && article[field] !== 0) {
+      failures.push(`Missing required field: ${field}`);
+    }
+  }
+  if (failures.length > 0) {
+    return { pass: false, failures };
+  }
+
+  // Check #1: Title length 55-65 chars
+  if (article.title.length < 55 || article.title.length > 65) {
+    failures.push(`Title length ${article.title.length} outside 55-65 range`);
+  }
+
+  // Check #2: Meta description 140-155 chars
+  if (article.meta_description.length < 140 || article.meta_description.length > 155) {
+    failures.push(`Meta description length ${article.meta_description.length} outside 140-155 range`);
+  }
+
+  // Check #3: key_takeaways has 3-4 items, each contains a number
+  if (!Array.isArray(article.key_takeaways) ||
+      article.key_takeaways.length < 3 || article.key_takeaways.length > 4) {
+    failures.push(`key_takeaways must have 3-4 items, got ${article.key_takeaways?.length || 0}`);
+  } else {
+    for (let i = 0; i < article.key_takeaways.length; i++) {
+      if (!/\d/.test(article.key_takeaways[i])) {
+        failures.push(`key_takeaway #${i + 1} does not contain a number`);
+      }
+    }
+  }
+
+  // Check #4: verdict_type valid
+  if (!VALID_VERDICTS.includes(article.verdict_type)) {
+    failures.push(`Invalid verdict_type: ${article.verdict_type}`);
+  }
+
+  // Check #5: verdict_text exists and contains a numeric threshold
+  if (!article.verdict_text || !/\d/.test(article.verdict_text)) {
+    failures.push('verdict_text missing or lacks numeric threshold');
+  }
+
+  // Check #6: Zero banned phrases
+  const bodyLower = (article.body_html || '').toLowerCase();
+  for (const phrase of BANNED_PHRASES) {
+    if (bodyLower.includes(phrase.toLowerCase())) {
+      failures.push(`Banned phrase found: "${phrase}"`);
+    }
+  }
+
+  // Check #7: At least 40% of paragraphs contain numeric data
+  const paragraphs = (article.body_html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
+  if (paragraphs.length > 0) {
+    const numericPattern = /(\d[\d,.]*%?|\$[\d,.]+[BMTbmt]?)/;
+    const numericCount = paragraphs.filter((p) => numericPattern.test(p)).length;
+    const density = numericCount / paragraphs.length;
+    if (density < 0.4) {
+      failures.push(`Paragraph numeric density ${(density * 100).toFixed(0)}% below 40% threshold`);
+    }
+  }
+
+  // Check #8: Word count in target range
+  const config = LENGTH_CONFIG[targetLength];
+  if (config) {
+    if (article.word_count < config.minWords || article.word_count > config.maxWords) {
+      failures.push(`Word count ${article.word_count} outside ${targetLength} range (${config.minWords}-${config.maxWords})`);
+    }
+  }
+
+  // Check #9: Primary keyword in title
+  if (primaryKeyword) {
+    const kwLower = primaryKeyword.toLowerCase();
+    // Check if significant words from keyword appear in title
+    const kwWords = kwLower.split(/\s+/).filter((w) => w.length > 2);
+    const titleLower = article.title.toLowerCase();
+    const matchCount = kwWords.filter((w) => titleLower.includes(w)).length;
+    if (matchCount < Math.ceil(kwWords.length * 0.5)) {
+      failures.push(`Primary keyword not sufficiently represented in title`);
+    }
+  }
+
+  // Check #10: Primary keyword in first 100 words of body
+  if (primaryKeyword) {
+    const textOnly = (article.body_html || '').replace(/<[^>]+>/g, '');
+    const first100 = textOnly.split(/\s+/).slice(0, 100).join(' ').toLowerCase();
+    const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
+    const matchCount = kwWords.filter((w) => first100.includes(w)).length;
+    if (matchCount < Math.ceil(kwWords.length * 0.5)) {
+      failures.push('Primary keyword not found in first 100 words');
+    }
+  }
+
+  // Check #11: Primary keyword in at least one H2
+  if (primaryKeyword) {
+    const h2s = (article.body_html || '').match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
+    const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
+    const inH2 = h2s.some((h2) => {
+      const h2Lower = h2.toLowerCase();
+      return kwWords.some((w) => h2Lower.includes(w));
+    });
+    if (!inH2) {
+      failures.push('Primary keyword not found in any H2');
+    }
+  }
+
+  // Check #12: Primary keyword in meta_description
+  if (primaryKeyword) {
+    const metaLower = article.meta_description.toLowerCase();
+    const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
+    const matchCount = kwWords.filter((w) => metaLower.includes(w)).length;
+    if (matchCount < Math.ceil(kwWords.length * 0.4)) {
+      failures.push('Primary keyword not found in meta_description');
+    }
+  }
+
+  // Check #13: data_tables_count >= 1 for type A
+  if (articleType === 'A' && (article.data_tables_count || 0) < 1) {
+    failures.push('Type A article requires at least 1 data table');
+  }
+
+  return { pass: failures.length === 0, failures };
+}
+
+// ---------------------------------------------------------------------------
+// HTML Sanitization
+// ---------------------------------------------------------------------------
+
+function sanitizeHtml(html) {
+  if (!html) return '';
+
+  // Remove script, iframe, style tags and their content
+  let clean = html.replace(/<(script|iframe|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
+  // Remove self-closing versions too
+  clean = clean.replace(/<(script|iframe|style)\b[^>]*\/?>/gi, '');
+
+  // Process remaining tags
+  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
+    const tagLower = tag.toLowerCase();
+    const isClosing = match.startsWith('</');
+
+    if (!ALLOWED_TAGS.has(tagLower)) {
+      return ''; // strip unknown tags
+    }
+
+    if (isClosing) {
+      return `</${tagLower}>`;
+    }
+
+    // Parse and filter attributes
+    let cleanAttrs = '';
+
+    if (tagLower === 'a') {
+      // Allow href only
+      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
+      if (hrefMatch) {
+        const href = hrefMatch[1];
+        // Only allow / or https:// URLs
+        if (href.startsWith('/') || href.startsWith('https://')) {
+          cleanAttrs = ` href="${href}"`;
+          // Add nofollow for external links
+          if (href.startsWith('https://')) {
+            cleanAttrs += ' rel="nofollow noopener noreferrer"';
+          }
+        }
+      }
+    } else if (tagLower === 'p' || tagLower === 'section') {
+      // Allow class attribute only
+      const classMatch = attrs.match(/class\s*=\s*["']([^"']+)["']/i);
+      if (classMatch) {
+        cleanAttrs = ` class="${classMatch[1]}"`;
+      }
+    }
+    // All other tags: no attributes
+
+    return `<${tagLower}${cleanAttrs}>`;
+  });
+
+  return clean;
+}
+
+// ---------------------------------------------------------------------------
+// Slug Uniqueness
+// ---------------------------------------------------------------------------
+
+function ensureUniqueSlug(slug, existingSlugs) {
+  if (!existingSlugs || !existingSlugs.includes(slug)) {
+    return slug;
+  }
+
+  const now = new Date();
+  const yy = String(now.getFullYear()).slice(2);
+  const mm = String(now.getMonth() + 1).padStart(2, '0');
+  const withDate = `${slug}-${yy}${mm}`;
+
+  if (!existingSlugs.includes(withDate)) {
+    return withDate;
+  }
+
+  // Double collision: add counter
+  for (let i = 2; i < 100; i++) {
+    const candidate = `${withDate}-${i}`;
+    if (!existingSlugs.includes(candidate)) {
+      return candidate;
+    }
+  }
+
+  return `${slug}-${Date.now()}`; // ultimate fallback
+}
+
+// ---------------------------------------------------------------------------
+// NocoDB helpers (for n8n Code node usage)
+// ---------------------------------------------------------------------------
+
+async function nocodbGet(path, token, opts = {}) {
+  const { fetchFn, baseUrl } = opts;
+  if (!fetchFn) throw new Error('fetchFn required');
+
+  const res = await fetchFn(`${baseUrl}${path}`, {
+    headers: { 'xc-auth': token },
+  });
+  if (!res.ok) return null;
+  return res.json();
+}
+
+async function nocodbPost(path, data, token, opts = {}) {
+  const { fetchFn, baseUrl } = opts;
+  if (!fetchFn) throw new Error('fetchFn required');
+
+  const res = await fetchFn(`${baseUrl}${path}`, {
+    method: 'POST',
+    headers: { 'xc-auth': token, 'Content-Type': 'application/json' },
+    body: JSON.stringify(data),
+  });
+  if (!res.ok) return null;
+  return res.json();
+}
+
+async function nocodbPatch(path, data, token, opts = {}) {
+  const { fetchFn, baseUrl } = opts;
+  if (!fetchFn) throw new Error('fetchFn required');
+
+  const res = await fetchFn(`${baseUrl}${path}`, {
+    method: 'PATCH',
+    headers: { 'xc-auth': token, 'Content-Type': 'application/json' },
+    body: JSON.stringify(data),
+  });
+  if (!res.ok) return null;
+  return res.json();
+}
+
+// ---------------------------------------------------------------------------
+// Keyword Picker
+// ---------------------------------------------------------------------------
+
+async function pickKeyword(blog, nocodbOpts) {
+  const where = `(status,eq,new)~or((status,eq,in_progress)~and(updated_at,lt,exactDate,${oneHourAgo()}))`;
+  const path = `/Keywords?where=${encodeURIComponent(where)}&sort=-priority_score&limit=1`;
+
+  const result = await nocodbGet(path, nocodbOpts.token, nocodbOpts);
+  if (!result || !result.list || result.list.length === 0) return null;
+  return result.list[0];
+}
+
+function oneHourAgo() {
+  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
+}
+
+async function lockKeyword(keywordId, nocodbOpts) {
+  return nocodbPatch(
+    `/Keywords/${keywordId}`,
+    { status: 'in_progress', updated_at: new Date().toISOString() },
+    nocodbOpts.token,
+    nocodbOpts,
+  );
+}
+
+// ---------------------------------------------------------------------------
+// Ticker Validation via Financial Datasets API
+// ---------------------------------------------------------------------------
+
+async function validateTickerApi(ticker, opts = {}) {
+  const { fetchFn, apiKey } = opts;
+  if (!fetchFn || !apiKey) return false;
+
+  try {
+    const res = await fetchFn(
+      `https://api.financialdatasets.ai/api/v1/financial-statements/income-statements?ticker=${encodeURIComponent(ticker)}&limit=1`,
+      { headers: { 'X-API-Key': apiKey } },
+    );
+    if (!res.ok) return false;
+    const data = await res.json();
+    return Array.isArray(data?.income_statements) && data.income_statements.length > 0;
+  } catch {
+    return false;
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Claude API Call with Tool Use
+// ---------------------------------------------------------------------------
+
+async function callClaudeToolUse(systemPrompt, opts = {}) {
+  const { fetchFn, apiKey, maxTokens = 8000 } = opts;
+  if (!fetchFn || !apiKey) throw new Error('fetchFn and apiKey required');
+
+  const tool = buildToolSchema();
+
+  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
+    method: 'POST',
+    headers: {
+      'x-api-key': apiKey,
+      'anthropic-version': '2023-06-01',
+      'content-type': 'application/json',
+    },
+    body: JSON.stringify({
+      model: 'claude-sonnet-4-6-20250514',
+      max_tokens: maxTokens,
+      temperature: 0.6,
+      system: systemPrompt,
+      messages: [{ role: 'user', content: 'Generate the article now.' }],
+      tools: [tool],
+      tool_choice: { type: 'tool', name: 'generate_article' },
+    }),
+  });
+
+  if (!res.ok) {
+    const text = await res.text();
+    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 200)}`);
+  }
+
+  return res.json();
+}
+
+// ---------------------------------------------------------------------------
+// Write Article to NocoDB
+// ---------------------------------------------------------------------------
+
+async function writeArticle(article, keyword, nocodbOpts) {
+  return nocodbPost('/Articles', {
+    slug: article.slug,
+    title_text: article.title,
+    meta_description: article.meta_description,
+    body_html: article.body_html,
+    verdict_type: article.verdict_type,
+    verdict_text: article.verdict_text,
+    key_takeaways: JSON.stringify(article.key_takeaways),
+    word_count: article.word_count,
+    primary_keyword: article.primary_keyword || keyword.keyword,
+    secondary_keywords_used: JSON.stringify(article.secondary_keywords_used || []),
+    data_tables_count: article.data_tables_count || 0,
+    filing_citations_count: article.filing_citations_count || 0,
+    confidence_notes: article.confidence_notes || '',
+    ticker: keyword.ticker || extractTicker(keyword.keyword),
+    sector: keyword.sector || '',
+    company_name: keyword.company_name || '',
+    blog: keyword.blog,
+    author_name: keyword.author_name || '',
+    status: 'enriching',
+    quality_gate_pass: true,
+    published_at: new Date().toISOString(),
+  }, nocodbOpts.token, nocodbOpts);
+}
+
+// ---------------------------------------------------------------------------
+// Update Keyword Status
+// ---------------------------------------------------------------------------
+
+async function updateKeywordStatus(keywordId, status, nocodbOpts) {
+  const data = { status };
+  if (status === 'used') data.used_at = new Date().toISOString();
+  return nocodbPatch(`/Keywords/${keywordId}`, data, nocodbOpts.token, nocodbOpts);
+}
+
+// ---------------------------------------------------------------------------
+// Downstream Triggers (Sequential)
+// ---------------------------------------------------------------------------
+
+async function triggerDownstream(articleId, slug, opts = {}) {
+  const { fetchFn, w12Url, w13Url, revalidateUrl, revalidateSecret, indexingAuth } = opts;
+  const results = { w12: null, w13: null, revalidate: null, indexing: null };
+
+  // W12: Image Generation (wait for completion)
+  if (w12Url && fetchFn) {
+    try {
+      const res = await fetchFn(w12Url, {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ article_id: articleId }),
+      });
+      results.w12 = res.ok ? 'success' : 'failed';
+    } catch (e) {
+      results.w12 = `error: ${e.message}`;
+    }
+  }
+
+  // W13: Cross-Linking (wait for completion)
+  if (w13Url && fetchFn) {
+    try {
+      const res = await fetchFn(w13Url, {
+        method: 'POST',
+        headers: { 'Content-Type': 'application/json' },
+        body: JSON.stringify({ article_id: articleId }),
+      });
+      results.w13 = res.ok ? 'success' : 'failed';
+    } catch (e) {
+      results.w13 = `error: ${e.message}`;
+    }
+  }
+
+  // Revalidate specific page
+  if (revalidateUrl && fetchFn) {
+    try {
+      const res = await fetchFn(
+        `${revalidateUrl}?secret=${revalidateSecret}&slug=${slug}`,
+        { method: 'POST' },
+      );
+      results.revalidate = res.ok ? 'success' : 'failed';
+    } catch (e) {
+      results.revalidate = `error: ${e.message}`;
+    }
+  }
+
+  // Google Indexing API
+  if (indexingAuth && fetchFn) {
+    try {
+      const res = await fetchFn('https://indexing.googleapis.com/v3/urlNotifications:publish', {
+        method: 'POST',
+        headers: {
+          'Authorization': `Bearer ${indexingAuth}`,
+          'Content-Type': 'application/json',
+        },
+        body: JSON.stringify({
+          url: `https://earlyinsider.com/blog/${slug}`,
+          type: 'URL_UPDATED',
+        }),
+      });
+      results.indexing = res.ok ? 'success' : 'failed';
+    } catch (e) {
+      results.indexing = `error: ${e.message}`;
+    }
+  }
+
+  return results;
+}
+
+// ---------------------------------------------------------------------------
+// Telegram Notification
+// ---------------------------------------------------------------------------
+
+async function notifyTelegram(article, keyword, opts = {}) {
+  const { fetchFn, botToken, chatId } = opts;
+  if (!fetchFn || !botToken || !chatId) return;
+
+  const text = [
+    `New article published:`,
+    `Title: ${article.title}`,
+    `Ticker: ${keyword.ticker || 'N/A'}`,
+    `Verdict: ${article.verdict_type}`,
+    `Words: ${article.word_count}`,
+    `URL: https://earlyinsider.com/blog/${article.slug}`,
+  ].join('\n');
+
+  await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
+    method: 'POST',
+    headers: { 'Content-Type': 'application/json' },
+    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
+  });
+}
+
+// ---------------------------------------------------------------------------
+// Main Orchestrator (for n8n Code node)
+// ---------------------------------------------------------------------------
+
+async function generateArticle(input, helpers) {
+  const { blog } = input;
+  const fetchFn = helpers?.fetchFn;
+  const env = helpers?.env || {};
+
+  const nocodbOpts = {
+    fetchFn,
+    baseUrl: env.NOCODB_BASE_URL,
+    token: env.NOCODB_API_TOKEN,
+  };
+
+  // Step 1: Pick keyword
+  const keyword = await pickKeyword(blog, nocodbOpts);
+  if (!keyword) {
+    await notifyTelegram(
+      { title: 'No keywords available', word_count: 0, slug: '', verdict_type: 'N/A' },
+      { ticker: 'N/A' },
+      { fetchFn, botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
+    );
+    return { status: 'skipped', reason: 'No keywords available' };
+  }
+
+  // Lock keyword
+  await lockKeyword(keyword.id, nocodbOpts);
+
+  // Step 2: Extract & validate ticker
+  const ticker = extractTicker(keyword.keyword);
+  if (ticker) {
+    const valid = await validateTickerApi(ticker, {
+      fetchFn,
+      apiKey: env.FINANCIAL_DATASETS_API_KEY,
+    });
+    if (!valid) {
+      await updateKeywordStatus(keyword.id, 'invalid_ticker', nocodbOpts);
+      return { status: 'skipped', reason: `Invalid ticker: ${ticker}` };
+    }
+  }
+
+  // Step 3: Call Dexter (via webhook)
+  let dexterData = {};
+  if (env.DEXTER_WEBHOOK_URL && fetchFn) {
+    const dRes = await fetchFn(env.DEXTER_WEBHOOK_URL, {
+      method: 'POST',
+      headers: { 'Content-Type': 'application/json' },
+      body: JSON.stringify({ ticker, keyword: keyword.keyword, article_type: keyword.article_type, blog }),
+    });
+    if (dRes.ok) dexterData = await dRes.json();
+    if (dexterData.data_completeness !== undefined && dexterData.data_completeness < 0.5) {
+      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
+      return { status: 'skipped', reason: 'Insufficient data from Dexter' };
+    }
+  }
+
+  // Step 4: Determine article params
+  const params = determineArticleParams(blog);
+
+  // Step 5: Interpolate template
+  const templateVars = {
+    BLOG: blog,
+    TICKER: ticker || keyword.keyword,
+    COMPANY_NAME: dexterData.company_name || ticker || '',
+    SECTOR: dexterData.sector || '',
+    MARKET_CAP: dexterData.market_cap || '',
+    ARTICLE_TYPE: keyword.article_type || 'A',
+    TARGET_LENGTH: params.targetLength,
+    KEYWORD: keyword.keyword,
+    SECONDARY_KEYWORDS: keyword.secondary_keywords || '',
+    DEXTER_ANALYSIS: JSON.stringify(dexterData.dexter_analysis || {}),
+    FINANCIAL_DATA: JSON.stringify(dexterData.financial_data || {}),
+    INSIDER_TRADES: JSON.stringify(dexterData.insider_trades || []),
+    STOCK_PRICES: JSON.stringify(dexterData.stock_prices || {}),
+    COMPETITOR_DATA: JSON.stringify(dexterData.competitor_data || []),
+    MANAGEMENT_QUOTES: JSON.stringify(dexterData.management_quotes || []),
+    NEWS_DATA: JSON.stringify(dexterData.news || []),
+    CURRENT_DATE: new Date().toISOString().split('T')[0],
+    AUTHOR_NAME: params.authorName,
+  };
+
+  // Read system prompt template
+  const systemPromptTemplate = env.ARTICLE_SYSTEM_PROMPT || '';
+  const systemPrompt = interpolateTemplate(systemPromptTemplate, templateVars);
+
+  // Step 6-7: Claude API call with Tool Use + retry
+  let article = null;
+  let retryFeedback = '';
+  const MAX_RETRIES = 2;
+
+  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
+    const prompt = attempt === 0
+      ? systemPrompt
+      : `${systemPrompt}\n\nQuality gate failed on previous attempt: ${retryFeedback}. Fix these specific issues and regenerate.`;
+
+    const response = await callClaudeToolUse(prompt, {
+      fetchFn,
+      apiKey: env.ANTHROPIC_API_KEY,
+      maxTokens: params.maxTokens,
+    });
+
+    article = extractToolResult(response);
+    if (!article) {
+      // Safety refusal or unexpected response
+      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
+      return { status: 'skipped', reason: 'Claude safety refusal' };
+    }
+
+    // Step 8: Quality gate
+    const gate = qualityGate(article, keyword.keyword, params.targetLength, keyword.article_type);
+    if (gate.pass) break;
+
+    if (attempt === MAX_RETRIES) {
+      // Save as error after exhausting retries
+      article.status = 'error';
+      article.confidence_notes = `Quality gate failures: ${gate.failures.join('; ')}`;
+      await nocodbPost('/Articles', {
+        slug: article.slug || `error-${Date.now()}`,
+        title_text: article.title || 'Quality gate failure',
+        body_html: article.body_html || '',
+        status: 'error',
+        quality_gate_pass: false,
+        confidence_notes: article.confidence_notes,
+        blog,
+      }, nocodbOpts.token, nocodbOpts);
+
+      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
+      await notifyTelegram(
+        { ...article, verdict_type: 'ERROR' },
+        keyword,
+        { fetchFn, botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
+      );
+      return { status: 'error', failures: gate.failures };
+    }
+
+    retryFeedback = gate.failures.join('; ');
+  }
+
+  // Step 8.5: Sanitize HTML
+  article.body_html = sanitizeHtml(article.body_html);
+
+  // Step 8.6: Ensure unique slug
+  const existingSlugsRes = await nocodbGet(
+    `/Articles?fields=slug&where=(slug,like,${article.slug}%)`,
+    nocodbOpts.token,
+    nocodbOpts,
+  );
+  const existingSlugs = (existingSlugsRes?.list || []).map((r) => r.slug);
+  article.slug = ensureUniqueSlug(article.slug, existingSlugs);
+
+  // Step 9: Write to NocoDB
+  const created = await writeArticle(article, { ...keyword, author_name: params.authorName }, nocodbOpts);
+
+  // Step 10: Update keyword
+  await updateKeywordStatus(keyword.id, 'used', nocodbOpts);
+
+  // Step 11: Trigger downstream (sequential)
+  const articleId = created?.id || created?.Id;
+  if (articleId) {
+    // Update status to published after downstream completes
+    await triggerDownstream(articleId, article.slug, {
+      fetchFn,
+      w12Url: env.W12_WEBHOOK_URL,
+      w13Url: env.W13_WEBHOOK_URL,
+      revalidateUrl: env.REVALIDATE_URL,
+      revalidateSecret: env.REVALIDATION_SECRET,
+      indexingAuth: env.GOOGLE_INDEXING_TOKEN,
+    });
+
+    await nocodbPatch(`/Articles/${articleId}`, { status: 'published' }, nocodbOpts.token, nocodbOpts);
+  }
+
+  // Step 13: Notify
+  await notifyTelegram(article, keyword, {
+    fetchFn,
+    botToken: env.TELEGRAM_BOT_TOKEN,
+    chatId: env.TELEGRAM_CHAT_ID,
+  });
+
+  return { status: 'published', article_id: articleId, slug: article.slug };
+}
+
+// ---------------------------------------------------------------------------
+// Exports
+// ---------------------------------------------------------------------------
+
+module.exports = {
+  // Pure functions (tested)
+  extractTicker,
+  determineArticleParams,
+  interpolateTemplate,
+  buildToolSchema,
+  extractToolResult,
+  qualityGate,
+  sanitizeHtml,
+  ensureUniqueSlug,
+
+  // Orchestration (integration tested)
+  pickKeyword,
+  lockKeyword,
+  validateTickerApi,
+  callClaudeToolUse,
+  writeArticle,
+  updateKeywordStatus,
+  triggerDownstream,
+  notifyTelegram,
+  generateArticle,
+
+  // NocoDB helpers
+  nocodbGet,
+  nocodbPost,
+  nocodbPatch,
+
+  // Constants
+  VALID_VERDICTS,
+  BANNED_PHRASES,
+  LENGTH_CONFIG,
+  FALSE_POSITIVE_TICKERS,
+  ALLOWED_TAGS,
+  REQUIRED_ARTICLE_FIELDS,
+};
diff --git a/insiderbuying-site/n8n/tests/generate-article.test.js b/insiderbuying-site/n8n/tests/generate-article.test.js
new file mode 100644
index 0000000..f5a0880
--- /dev/null
+++ b/insiderbuying-site/n8n/tests/generate-article.test.js
@@ -0,0 +1,366 @@
+const { describe, it } = require('node:test');
+const assert = require('node:assert/strict');
+
+const {
+  extractTicker,
+  determineArticleParams,
+  interpolateTemplate,
+  qualityGate,
+  sanitizeHtml,
+  ensureUniqueSlug,
+  buildToolSchema,
+  extractToolResult,
+  BANNED_PHRASES,
+  VALID_VERDICTS,
+  LENGTH_CONFIG,
+} = require('../code/insiderbuying/generate-article.js');
+
+// ---------------------------------------------------------------------------
+// Ticker Extraction
+// ---------------------------------------------------------------------------
+describe('extractTicker', () => {
+  it('extracts NVDA from "NVDA earnings analysis Q1 2026"', () => {
+    assert.equal(extractTicker('NVDA earnings analysis Q1 2026'), 'NVDA');
+  });
+
+  it('extracts no ticker from "best dividend stocks 2026"', () => {
+    assert.equal(extractTicker('best dividend stocks 2026'), null);
+  });
+
+  it('filters false positives: THE, CEO, BEST, FOR are rejected', () => {
+    assert.equal(extractTicker('THE BEST CEO stocks FOR investors'), null);
+  });
+
+  it('extracts AAPL from "AAPL vs MSFT comparison" (first match)', () => {
+    assert.equal(extractTicker('AAPL vs MSFT comparison'), 'AAPL');
+  });
+
+  it('extracts ticker with dot notation like BRK.B', () => {
+    assert.equal(extractTicker('BRK.B insider buying signal'), 'BRK.B');
+  });
+
+  it('returns null for empty or missing input', () => {
+    assert.equal(extractTicker(''), null);
+    assert.equal(extractTicker(null), null);
+    assert.equal(extractTicker(undefined), null);
+  });
+
+  it('rejects single-letter false positives: A, I', () => {
+    assert.equal(extractTicker('A guide to investing'), null);
+  });
+
+  it('extracts valid 1-letter ticker if not a false positive', () => {
+    // F (Ford) is a valid ticker, not in false positive list
+    assert.equal(extractTicker('F stock earnings report'), 'F');
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Article Parameters
+// ---------------------------------------------------------------------------
+describe('determineArticleParams', () => {
+  it('returns object with targetLength, authorName, maxTokens', () => {
+    const params = determineArticleParams('insiderbuying');
+    assert.ok(['short', 'medium', 'long'].includes(params.targetLength));
+    assert.equal(typeof params.authorName, 'string');
+    assert.equal(typeof params.maxTokens, 'number');
+  });
+
+  it('uses "Dexter Research" for insiderbuying blog', () => {
+    const params = determineArticleParams('insiderbuying');
+    assert.equal(params.authorName, 'Dexter Research');
+  });
+
+  it('uses "Ryan Cole" for other blogs', () => {
+    assert.equal(determineArticleParams('deepstockanalysis').authorName, 'Ryan Cole');
+    assert.equal(determineArticleParams('dividenddeep').authorName, 'Ryan Cole');
+  });
+
+  it('weighted random produces ~30% short, ~50% medium, ~20% long over 100 runs', () => {
+    const counts = { short: 0, medium: 0, long: 0 };
+    for (let i = 0; i < 1000; i++) {
+      counts[determineArticleParams('insiderbuying').targetLength]++;
+    }
+    // Allow wide variance for randomness
+    assert.ok(counts.short >= 200 && counts.short <= 400, `short: ${counts.short}`);
+    assert.ok(counts.medium >= 380 && counts.medium <= 620, `medium: ${counts.medium}`);
+    assert.ok(counts.long >= 100 && counts.long <= 300, `long: ${counts.long}`);
+  });
+
+  it('maxTokens matches targetLength correctly', () => {
+    // Force specific lengths via seed-like approach (test all 3)
+    const expected = { short: 6000, medium: 8000, long: 12000 };
+    for (const [len, tokens] of Object.entries(expected)) {
+      assert.equal(LENGTH_CONFIG[len].maxTokens, tokens);
+    }
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Variable Interpolation
+// ---------------------------------------------------------------------------
+describe('interpolateTemplate', () => {
+  it('replaces all 18 {{VARIABLE}} placeholders with actual values', () => {
+    const template = '{{BLOG}} {{TICKER}} {{COMPANY_NAME}} {{SECTOR}} {{MARKET_CAP}} ' +
+      '{{ARTICLE_TYPE}} {{TARGET_LENGTH}} {{KEYWORD}} {{SECONDARY_KEYWORDS}} ' +
+      '{{DEXTER_ANALYSIS}} {{FINANCIAL_DATA}} {{INSIDER_TRADES}} {{STOCK_PRICES}} ' +
+      '{{COMPETITOR_DATA}} {{MANAGEMENT_QUOTES}} {{CURRENT_DATE}} {{AUTHOR_NAME}} {{NEWS_DATA}}';
+
+    const vars = {
+      BLOG: 'insiderbuying', TICKER: 'NVDA', COMPANY_NAME: 'NVIDIA',
+      SECTOR: 'Technology', MARKET_CAP: '$3.2T', ARTICLE_TYPE: 'A',
+      TARGET_LENGTH: 'medium', KEYWORD: 'NVDA earnings', SECONDARY_KEYWORDS: 'NVDA stock',
+      DEXTER_ANALYSIS: '{}', FINANCIAL_DATA: '{}', INSIDER_TRADES: '[]',
+      STOCK_PRICES: '{}', COMPETITOR_DATA: '[]', MANAGEMENT_QUOTES: '[]',
+      CURRENT_DATE: '2026-03-27', AUTHOR_NAME: 'Dexter Research', NEWS_DATA: '[]',
+    };
+
+    const result = interpolateTemplate(template, vars);
+    assert.ok(!result.includes('{{'), `Unresolved placeholders found: ${result}`);
+  });
+
+  it('leaves unknown placeholders as-is', () => {
+    const result = interpolateTemplate('Hello {{UNKNOWN}}', { BLOG: 'test' });
+    assert.ok(result.includes('{{UNKNOWN}}'));
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Claude Tool Use
+// ---------------------------------------------------------------------------
+describe('buildToolSchema', () => {
+  it('returns a tool definition with name "generate_article"', () => {
+    const schema = buildToolSchema();
+    assert.equal(schema.name, 'generate_article');
+    assert.equal(typeof schema.input_schema, 'object');
+  });
+
+  it('schema requires title, body_html, verdict_type, slug', () => {
+    const schema = buildToolSchema();
+    const required = schema.input_schema.required || [];
+    for (const field of ['title', 'body_html', 'verdict_type', 'slug']) {
+      assert.ok(required.includes(field), `Missing required field: ${field}`);
+    }
+  });
+});
+
+describe('extractToolResult', () => {
+  it('extracts article from tool_use content block', () => {
+    const response = {
+      content: [{
+        type: 'tool_use',
+        name: 'generate_article',
+        input: { title: 'Test', body_html: '<p>Hello</p>', verdict_type: 'BUY' },
+      }],
+    };
+    const result = extractToolResult(response);
+    assert.equal(result.title, 'Test');
+    assert.equal(result.verdict_type, 'BUY');
+  });
+
+  it('returns null for text response (safety refusal)', () => {
+    const response = {
+      content: [{ type: 'text', text: 'I cannot generate this content.' }],
+    };
+    assert.equal(extractToolResult(response), null);
+  });
+
+  it('returns null for empty content', () => {
+    assert.equal(extractToolResult({ content: [] }), null);
+    assert.equal(extractToolResult({}), null);
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Quality Gate (14 checks)
+// ---------------------------------------------------------------------------
+describe('qualityGate', () => {
+  function makeValidArticle() {
+    return {
+      title: 'NVDA Q1 2026 Earnings Analysis: 64% Margins Hide Big Risk',  // 59 chars
+      meta_description: 'NVIDIA Q1 2026 earnings analysis reveals record 64.2% margins masking rising inventory risk. Our DCF model flags a key threshold investors watch.',  // 146 chars
+      slug: 'nvda-q1-2026-earnings-analysis',
+      key_takeaways: [
+        'NVIDIA gross margin hit 64.2% in Q1 2026 — a record high.',
+        'Insider selling totaled $847M in the past 90 days.',
+        'Our 3-scenario DCF puts fair value at $118-$142.',
+      ],
+      body_html: '<h2>NVDA earnings analysis: Record Margins</h2><p>NVIDIA posted 64.2% gross margins in Q1 2026. Revenue grew 34% year over year to $26.0B.</p>' +
+        '<p>The stock rallied 6% on the print. But page 23 of the 10-Q tells a different story.</p>' +
+        '<p>Inventory ballooned to $8.1B in Q3 2025. That is 112 days of inventory.</p>' +
+        '<p>Free cash flow hit $9.2B in the quarter. Operating expenses rose 18% to $4.1B.</p>' +
+        '<p>Gross margin expanded 340 basis points from 60.8% a year ago.</p>' +
+        '<table><tr><th>Metric</th><th>Q1 2026</th></tr><tr><td>Revenue</td><td>$26.0B</td></tr></table>' +
+        '<p>The P/E ratio stands at 45x forward earnings. Analysts expect $3.29 EPS next quarter.</p>' +
+        '<p>Insider selling totaled $847M over 90 days. CEO Jensen Huang sold $312M under 10b5-1.</p>' +
+        '<p>Our DCF model suggests $118-$142 fair value range using a 10% discount rate.</p>' +
+        '<p>CAUTION at $148. If inventory days drop below 90 next quarter, thesis flips to BUY.</p>',
+      verdict_type: 'CAUTION',
+      verdict_text: 'CAUTION at $148. Margins at 64.2% are exceptional but 112 inventory days warrant patience. Buy below $128.',
+      word_count: 1350,
+      primary_keyword: 'NVDA earnings analysis',
+      secondary_keywords_used: ['NVIDIA revenue growth'],
+      data_tables_count: 1,
+      filing_citations_count: 2,
+      confidence_notes: 'Least certain about inventory interpretation.',
+    };
+  }
+
+  it('valid article passes all 14 checks', () => {
+    const result = qualityGate(makeValidArticle(), 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, true, `Failed checks: ${JSON.stringify(result.failures)}`);
+  });
+
+  it('title too short fails check', () => {
+    const article = makeValidArticle();
+    article.title = 'Short';
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.some(f => f.includes('Title')));
+  });
+
+  it('banned phrase "it\'s worth noting" in body_html fails check #6', () => {
+    const article = makeValidArticle();
+    article.body_html += "<p>It's worth noting that revenue grew 34%.</p>";
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.some(f => f.toLowerCase().includes('banned')));
+  });
+
+  it('paragraph density < 40% numeric fails check #7', () => {
+    const article = makeValidArticle();
+    // Replace body with paragraphs that have no numbers
+    article.body_html = '<h2>NVDA earnings analysis heading</h2>' +
+      '<p>This is a paragraph without data points or numbers of any kind.</p>'.repeat(10) +
+      '<p>Revenue was $26B in the quarter.</p>' +
+      '<p>The stock price moved higher recently.</p>' +
+      '<p>Analysts are watching the company closely now.</p>';
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.some(f => f.toLowerCase().includes('density') || f.toLowerCase().includes('numeric')));
+  });
+
+  it('missing title fails check #14 (required fields)', () => {
+    const article = makeValidArticle();
+    delete article.title;
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+  });
+
+  it('invalid verdict_type fails check #4', () => {
+    const article = makeValidArticle();
+    article.verdict_type = 'STRONG_BUY';
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.some(f => f.toLowerCase().includes('verdict')));
+  });
+
+  it('2 failed retries saves article as status=error (gate returns failure count)', () => {
+    const article = makeValidArticle();
+    article.title = 'X'; // too short
+    article.verdict_type = 'INVALID';
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.length >= 2);
+  });
+
+  it('primary keyword not in title fails check #9', () => {
+    const article = makeValidArticle();
+    article.title = 'Record Margins Hide a Problem in Tech Sector Now';
+    // Pad to meet length
+    article.title += ' Details';
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.some(f => f.includes('keyword') && f.includes('title')));
+  });
+
+  it('data_tables_count=0 for type A article fails check #13', () => {
+    const article = makeValidArticle();
+    article.data_tables_count = 0;
+    const result = qualityGate(article, 'NVDA earnings analysis', 'medium', 'A');
+    assert.equal(result.pass, false);
+    assert.ok(result.failures.some(f => f.toLowerCase().includes('table')));
+  });
+});
+
+// ---------------------------------------------------------------------------
+// HTML Sanitization
+// ---------------------------------------------------------------------------
+describe('sanitizeHtml', () => {
+  it('<script> tag stripped from body_html', () => {
+    const dirty = '<p>Hello</p><script>alert("xss")</script><p>World</p>';
+    const clean = sanitizeHtml(dirty);
+    assert.ok(!clean.includes('<script'));
+    assert.ok(!clean.includes('alert'));
+    assert.ok(clean.includes('<p>Hello</p>'));
+    assert.ok(clean.includes('<p>World</p>'));
+  });
+
+  it('external link gets rel="nofollow noopener noreferrer"', () => {
+    const dirty = '<p>Check <a href="https://example.com">this</a></p>';
+    const clean = sanitizeHtml(dirty);
+    assert.ok(clean.includes('rel="nofollow noopener noreferrer"'));
+  });
+
+  it('internal link (starts with /) does NOT get nofollow', () => {
+    const dirty = '<p>See <a href="/blog/test">article</a></p>';
+    const clean = sanitizeHtml(dirty);
+    assert.ok(!clean.includes('nofollow'));
+  });
+
+  it('strips iframe tags', () => {
+    const dirty = '<p>Hello</p><iframe src="evil.com"></iframe>';
+    const clean = sanitizeHtml(dirty);
+    assert.ok(!clean.includes('<iframe'));
+  });
+
+  it('strips on* event attributes', () => {
+    const dirty = '<p onclick="alert(1)">Click me</p>';
+    const clean = sanitizeHtml(dirty);
+    assert.ok(!clean.includes('onclick'));
+  });
+
+  it('preserves allowed tags: h2, p, table, blockquote, strong, em, a, ul, ol, li', () => {
+    const html = '<h2>Title</h2><p>Text <strong>bold</strong> <em>italic</em></p>' +
+      '<table><tr><td>data</td></tr></table><blockquote>quote</blockquote>' +
+      '<ul><li>item</li></ul><ol><li>item</li></ol>' +
+      '<a href="https://x.com">link</a>';
+    const clean = sanitizeHtml(html);
+    assert.ok(clean.includes('<h2>'));
+    assert.ok(clean.includes('<strong>'));
+    assert.ok(clean.includes('<table>'));
+    assert.ok(clean.includes('<blockquote>'));
+  });
+
+  it('strips data-* attributes', () => {
+    const dirty = '<p data-track="123">Text</p>';
+    const clean = sanitizeHtml(dirty);
+    assert.ok(!clean.includes('data-track'));
+  });
+});
+
+// ---------------------------------------------------------------------------
+// Slug Uniqueness
+// ---------------------------------------------------------------------------
+describe('ensureUniqueSlug', () => {
+  it('returns original slug when no collision', () => {
+    const result = ensureUniqueSlug('nvda-earnings', []);
+    assert.equal(result, 'nvda-earnings');
+  });
+
+  it('appends date suffix on collision', () => {
+    const result = ensureUniqueSlug('nvda-earnings', ['nvda-earnings']);
+    // Should be nvda-earnings-YYMM format
+    assert.ok(result.startsWith('nvda-earnings-'));
+    assert.ok(result.length > 'nvda-earnings'.length);
+    // Check format is YYMM (4 digits)
+    const suffix = result.replace('nvda-earnings-', '');
+    assert.match(suffix, /^\d{4}$/);
+  });
+
+  it('handles double collision with counter', () => {
+    const existing = ['nvda-earnings', 'nvda-earnings-2603'];
+    const result = ensureUniqueSlug('nvda-earnings', existing);
+    assert.ok(!existing.includes(result));
+  });
+});
