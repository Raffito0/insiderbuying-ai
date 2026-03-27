/**
 * W2 — Article Generation Workflow (n8n Code Node)
 *
 * Picks best keyword from NocoDB, extracts/validates ticker, calls Dexter
 * for research, generates article via Claude Tool Use, runs 14-point
 * quality gate, sanitizes HTML, writes to NocoDB, triggers downstream.
 *
 * Trigger: Schedule — 8:00 AM, 1:00 PM, 6:00 PM EST daily
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_VERDICTS = ['BUY', 'SELL', 'CAUTION', 'WAIT', 'NO_TRADE'];

const LENGTH_CONFIG = {
  short:  { maxTokens: 6000,  minWords: 800,  maxWords: 1000 },
  medium: { maxTokens: 8000,  minWords: 1200, maxWords: 1800 },
  long:   { maxTokens: 12000, minWords: 2000, maxWords: 3000 },
};

// Words that look like tickers but are common English words
const FALSE_POSITIVE_TICKERS = new Set([
  'A', 'I', 'THE', 'CEO', 'BEST', 'TOP', 'FOR', 'ALL', 'ARE', 'NEW',
  'BUY', 'SELL', 'IPO', 'ETF', 'AND', 'BUT', 'NOT', 'HAS', 'HAD',
  'WAS', 'CAN', 'MAY', 'NOW', 'HOW', 'WHY', 'USD', 'USA', 'SEC',
  'GDP', 'CPI', 'FED', 'EPS', 'ROI', 'DCF', 'FCF', 'YOY', 'QOQ',
  'ATH', 'ATL', 'OTC', 'DIV', 'PE', 'PB', 'PS',
]);

const BANNED_PHRASES = [
  "it's worth noting", "it remains to be seen", "having said that",
  "on the other hand", "in conclusion", "at the end of the day",
  "all in all", "needless to say", "it goes without saying",
  "in today's market", "as we can see", "it should be noted",
  "moving forward", "let's dive in", "let's take a closer look",
  "without further ado", "in the grand scheme of things",
  "only time will tell", "the million-dollar question",
  "at first glance", "interestingly enough",
  "it's important to note", "as always", "stay tuned",
  "that being said",
];

const ALLOWED_TAGS = new Set([
  'h2', 'h3', 'p', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'blockquote', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'span',
]);

const REQUIRED_ARTICLE_FIELDS = [
  'title', 'meta_description', 'slug', 'key_takeaways', 'body_html',
  'verdict_type', 'verdict_text', 'word_count',
];

// ---------------------------------------------------------------------------
// Ticker Extraction
// ---------------------------------------------------------------------------

function extractTicker(keyword) {
  if (!keyword || typeof keyword !== 'string') return null;

  // Match tickers with optional dot notation (BRK.B)
  // Lookahead allows punctuation, whitespace, or end-of-string after ticker
  const matches = keyword.match(/\b([A-Z]{1,5}(?:\.[A-Z])?)(?=[\s,;:!?).\-]|$)/g);
  if (!matches) return null;

  for (const candidate of matches) {
    if (!FALSE_POSITIVE_TICKERS.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Article Parameters (weighted random)
// ---------------------------------------------------------------------------

function determineArticleParams(blog) {
  const r = Math.random();
  const targetLength = r < 0.3 ? 'short' : r < 0.8 ? 'medium' : 'long';
  const authorName = blog === 'insiderbuying' ? 'Dexter Research' : 'Ryan Cole';
  const maxTokens = LENGTH_CONFIG[targetLength].maxTokens;

  return { targetLength, authorName, maxTokens };
}

// ---------------------------------------------------------------------------
// Template Variable Interpolation
// ---------------------------------------------------------------------------

function interpolateTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, String(value));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Claude Tool Use Schema
// ---------------------------------------------------------------------------

function buildToolSchema() {
  return {
    name: 'generate_article',
    description: 'Generate a financial analysis article with structured output',
    input_schema: {
      type: 'object',
      required: [
        'title', 'meta_description', 'slug', 'key_takeaways', 'body_html',
        'verdict_type', 'verdict_text', 'word_count', 'primary_keyword',
        'secondary_keywords_used', 'data_tables_count', 'filing_citations_count',
        'confidence_notes',
      ],
      properties: {
        title: { type: 'string', description: '55-65 characters, contains ticker or company name' },
        meta_description: { type: 'string', description: '140-155 characters with primary keyword' },
        slug: { type: 'string', description: 'URL-friendly lowercase with hyphens' },
        key_takeaways: { type: 'array', items: { type: 'string' }, description: '3-4 bullet points each with a number' },
        body_html: { type: 'string', description: 'Full article as semantic HTML' },
        verdict_type: { type: 'string', enum: VALID_VERDICTS },
        verdict_text: { type: 'string', description: 'Clear position with numeric threshold' },
        word_count: { type: 'number' },
        primary_keyword: { type: 'string' },
        secondary_keywords_used: { type: 'array', items: { type: 'string' } },
        data_tables_count: { type: 'number' },
        filing_citations_count: { type: 'number' },
        confidence_notes: { type: 'string' },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Extract Tool Use Result from Claude response
// ---------------------------------------------------------------------------

function extractToolResult(response) {
  if (!response || !response.content || response.content.length === 0) return null;
  const block = response.content.find((c) => c.type === 'tool_use');
  if (!block) return null;
  return block.input || null;
}

// ---------------------------------------------------------------------------
// Quality Gate (14 checks)
// ---------------------------------------------------------------------------

function qualityGate(article, primaryKeyword, targetLength, articleType) {
  const failures = [];

  // Check #14 first: required fields
  for (const field of REQUIRED_ARTICLE_FIELDS) {
    if (!article[field] && article[field] !== 0) {
      failures.push(`Missing required field: ${field}`);
    }
  }
  if (failures.length > 0) {
    return { pass: false, failures };
  }

  // Check #1: Title length 55-65 chars
  if (article.title.length < 55 || article.title.length > 65) {
    failures.push(`Title length ${article.title.length} outside 55-65 range`);
  }

  // Check #2: Meta description 140-155 chars
  if (article.meta_description.length < 140 || article.meta_description.length > 155) {
    failures.push(`Meta description length ${article.meta_description.length} outside 140-155 range`);
  }

  // Check #3: key_takeaways has 3-4 items, each contains a number
  if (!Array.isArray(article.key_takeaways) ||
      article.key_takeaways.length < 3 || article.key_takeaways.length > 4) {
    failures.push(`key_takeaways must have 3-4 items, got ${article.key_takeaways?.length || 0}`);
  } else {
    for (let i = 0; i < article.key_takeaways.length; i++) {
      if (!/\d/.test(article.key_takeaways[i])) {
        failures.push(`key_takeaway #${i + 1} does not contain a number`);
      }
    }
  }

  // Check #4: verdict_type valid
  if (!VALID_VERDICTS.includes(article.verdict_type)) {
    failures.push(`Invalid verdict_type: ${article.verdict_type}`);
  }

  // Check #5: verdict_text exists and contains a numeric threshold
  if (!article.verdict_text || !/\d/.test(article.verdict_text)) {
    failures.push('verdict_text missing or lacks numeric threshold');
  }

  // Check #6: Zero banned phrases
  const bodyLower = (article.body_html || '').toLowerCase();
  for (const phrase of BANNED_PHRASES) {
    if (bodyLower.includes(phrase.toLowerCase())) {
      failures.push(`Banned phrase found: "${phrase}"`);
    }
  }

  // Check #7: At least 40% of paragraphs contain numeric data
  const paragraphs = (article.body_html || '').match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
  if (paragraphs.length > 0) {
    const numericPattern = /(\d[\d,.]*%?|\$[\d,.]+[BMTbmt]?)/;
    const numericCount = paragraphs.filter((p) => numericPattern.test(p)).length;
    const density = numericCount / paragraphs.length;
    if (density < 0.4) {
      failures.push(`Paragraph numeric density ${(density * 100).toFixed(0)}% below 40% threshold`);
    }
  }

  // Check #8: Word count in target range
  const config = LENGTH_CONFIG[targetLength];
  if (config) {
    if (article.word_count < config.minWords || article.word_count > config.maxWords) {
      failures.push(`Word count ${article.word_count} outside ${targetLength} range (${config.minWords}-${config.maxWords})`);
    }
  }

  // Check #9: Primary keyword in title
  if (primaryKeyword) {
    const kwLower = primaryKeyword.toLowerCase();
    // Check if significant words from keyword appear in title
    const kwWords = kwLower.split(/\s+/).filter((w) => w.length > 2);
    const titleLower = article.title.toLowerCase();
    const matchCount = kwWords.filter((w) => titleLower.includes(w)).length;
    if (matchCount < Math.ceil(kwWords.length * 0.5)) {
      failures.push(`Primary keyword not sufficiently represented in title`);
    }
  }

  // Check #10: Primary keyword in first 100 words of body
  if (primaryKeyword) {
    const textOnly = (article.body_html || '').replace(/<[^>]+>/g, '');
    const first100 = textOnly.split(/\s+/).slice(0, 100).join(' ').toLowerCase();
    const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matchCount = kwWords.filter((w) => first100.includes(w)).length;
    if (matchCount < Math.ceil(kwWords.length * 0.5)) {
      failures.push('Primary keyword not found in first 100 words');
    }
  }

  // Check #11: Primary keyword in at least one H2
  if (primaryKeyword) {
    const h2s = (article.body_html || '').match(/<h2[^>]*>([\s\S]*?)<\/h2>/gi) || [];
    const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const inH2 = h2s.some((h2) => {
      const h2Lower = h2.toLowerCase();
      return kwWords.some((w) => h2Lower.includes(w));
    });
    if (!inH2) {
      failures.push('Primary keyword not found in any H2');
    }
  }

  // Check #12: Primary keyword in meta_description
  if (primaryKeyword) {
    const metaLower = article.meta_description.toLowerCase();
    const kwWords = primaryKeyword.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    const matchCount = kwWords.filter((w) => metaLower.includes(w)).length;
    if (matchCount < Math.ceil(kwWords.length * 0.4)) {
      failures.push('Primary keyword not found in meta_description');
    }
  }

  // Check #13: data_tables_count >= 1 for type A
  if (articleType === 'A' && (article.data_tables_count || 0) < 1) {
    failures.push('Type A article requires at least 1 data table');
  }

  return { pass: failures.length === 0, failures };
}

// ---------------------------------------------------------------------------
// HTML Sanitization
// ---------------------------------------------------------------------------

function escapeAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function sanitizeHtml(html) {
  if (!html) return '';

  // Remove script, iframe, style tags and their content
  let clean = html.replace(/<(script|iframe|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // Remove self-closing and unclosed versions
  clean = clean.replace(/<(script|iframe|style)\b[^>]*>/gi, '');

  // Process remaining tags
  clean = clean.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g, (match, tag, attrs) => {
    const tagLower = tag.toLowerCase();
    const isClosing = match.startsWith('</');

    if (!ALLOWED_TAGS.has(tagLower)) {
      return ''; // strip unknown tags
    }

    if (isClosing) {
      return `</${tagLower}>`;
    }

    // Parse and filter attributes
    let cleanAttrs = '';

    if (tagLower === 'a') {
      // Allow href only
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch) {
        const href = hrefMatch[1];
        // Only allow / or https:// URLs
        if (href.startsWith('/') || href.startsWith('https://')) {
          cleanAttrs = ` href="${escapeAttr(href)}"`;
          // Add nofollow for external links
          if (href.startsWith('https://')) {
            cleanAttrs += ' rel="nofollow noopener noreferrer"';
          }
        }
      }
    } else if (tagLower === 'p' || tagLower === 'section') {
      // Allow class attribute only
      const classMatch = attrs.match(/class\s*=\s*["']([^"']+)["']/i);
      if (classMatch) {
        cleanAttrs = ` class="${escapeAttr(classMatch[1])}"`;
      }
    }
    // All other tags: no attributes

    return `<${tagLower}${cleanAttrs}>`;
  });

  // Final safety pass: strip any remaining dangerous patterns
  clean = clean.replace(/<script\b[^>]*>/gi, '');
  clean = clean.replace(/<\/script>/gi, '');
  clean = clean.replace(/\bon\w+\s*=/gi, '');

  return clean;
}

// ---------------------------------------------------------------------------
// Slug Uniqueness
// ---------------------------------------------------------------------------

function ensureUniqueSlug(slug, existingSlugs) {
  if (!existingSlugs || !existingSlugs.includes(slug)) {
    return slug;
  }

  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const withDate = `${slug}-${yy}${mm}`;

  if (!existingSlugs.includes(withDate)) {
    return withDate;
  }

  // Double collision: add counter
  for (let i = 2; i < 100; i++) {
    const candidate = `${withDate}-${i}`;
    if (!existingSlugs.includes(candidate)) {
      return candidate;
    }
  }

  return `${slug}-${Date.now()}`; // ultimate fallback
}

// ---------------------------------------------------------------------------
// NocoDB helpers (for n8n Code node usage)
// ---------------------------------------------------------------------------

async function nocodbGet(path, token, opts = {}) {
  const { fetchFn, baseUrl } = opts;
  if (!fetchFn) throw new Error('fetchFn required');

  const res = await fetchFn(`${baseUrl}${path}`, {
    headers: { 'xc-auth': token },
  });
  if (!res.ok) return null;
  return res.json();
}

async function nocodbPost(path, data, token, opts = {}) {
  const { fetchFn, baseUrl } = opts;
  if (!fetchFn) throw new Error('fetchFn required');

  const res = await fetchFn(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'xc-auth': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return null;
  return res.json();
}

async function nocodbPatch(path, data, token, opts = {}) {
  const { fetchFn, baseUrl } = opts;
  if (!fetchFn) throw new Error('fetchFn required');

  const res = await fetchFn(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: { 'xc-auth': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) return null;
  return res.json();
}

// ---------------------------------------------------------------------------
// Keyword Picker
// ---------------------------------------------------------------------------

async function pickKeyword(blog, nocodbOpts) {
  const where = `(status,eq,new)~or((status,eq,in_progress)~and(updated_at,lt,exactDate,${oneHourAgo()}))`;
  const path = `/Keywords?where=${encodeURIComponent(where)}&sort=-priority_score&limit=1`;

  const result = await nocodbGet(path, nocodbOpts.token, nocodbOpts);
  if (!result || !result.list || result.list.length === 0) return null;
  return result.list[0];
}

function oneHourAgo() {
  return new Date(Date.now() - 60 * 60 * 1000).toISOString();
}

async function lockKeyword(keywordId, nocodbOpts) {
  return nocodbPatch(
    `/Keywords/${keywordId}`,
    { status: 'in_progress', updated_at: new Date().toISOString() },
    nocodbOpts.token,
    nocodbOpts,
  );
}

// ---------------------------------------------------------------------------
// Ticker Validation via Financial Datasets API
// ---------------------------------------------------------------------------

async function validateTickerApi(ticker, opts = {}) {
  const { fetchFn, apiKey } = opts;
  if (!fetchFn || !apiKey) return false;

  try {
    const res = await fetchFn(
      `https://api.financialdatasets.ai/api/v1/financial-statements/income-statements?ticker=${encodeURIComponent(ticker)}&limit=1`,
      { headers: { 'X-API-Key': apiKey } },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data?.income_statements) && data.income_statements.length > 0;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Claude API Call with Tool Use
// ---------------------------------------------------------------------------

async function callClaudeToolUse(systemPrompt, opts = {}) {
  const { fetchFn, apiKey, maxTokens = 8000 } = opts;
  if (!fetchFn || !apiKey) throw new Error('fetchFn and apiKey required');

  const tool = buildToolSchema();

  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6-20250514',
      max_tokens: maxTokens,
      temperature: 0.6,
      system: systemPrompt,
      messages: [{ role: 'user', content: 'Generate the article now.' }],
      tools: [tool],
      tool_choice: { type: 'tool', name: 'generate_article' },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ---------------------------------------------------------------------------
// Write Article to NocoDB
// ---------------------------------------------------------------------------

async function writeArticle(article, keyword, nocodbOpts) {
  return nocodbPost('/Articles', {
    slug: article.slug,
    title_text: article.title,
    meta_description: article.meta_description,
    body_html: article.body_html,
    verdict_type: article.verdict_type,
    verdict_text: article.verdict_text,
    key_takeaways: JSON.stringify(article.key_takeaways),
    word_count: article.word_count,
    primary_keyword: article.primary_keyword || keyword.keyword,
    secondary_keywords_used: JSON.stringify(article.secondary_keywords_used || []),
    data_tables_count: article.data_tables_count || 0,
    filing_citations_count: article.filing_citations_count || 0,
    confidence_notes: article.confidence_notes || '',
    ticker: keyword.ticker || extractTicker(keyword.keyword),
    sector: keyword.sector || '',
    company_name: keyword.company_name || '',
    blog: keyword.blog,
    author_name: keyword.author_name || '',
    status: 'enriching',
    quality_gate_pass: true,
    published_at: new Date().toISOString(),
  }, nocodbOpts.token, nocodbOpts);
}

// ---------------------------------------------------------------------------
// Update Keyword Status
// ---------------------------------------------------------------------------

async function updateKeywordStatus(keywordId, status, nocodbOpts) {
  const data = { status };
  if (status === 'used') data.used_at = new Date().toISOString();
  return nocodbPatch(`/Keywords/${keywordId}`, data, nocodbOpts.token, nocodbOpts);
}

// ---------------------------------------------------------------------------
// Downstream Triggers (Sequential)
// ---------------------------------------------------------------------------

async function triggerDownstream(articleId, slug, opts = {}) {
  const { fetchFn, w12Url, w13Url, revalidateUrl, revalidateSecret, indexingAuth } = opts;
  const results = { w12: null, w13: null, revalidate: null, indexing: null };

  // W12: Image Generation (wait for completion)
  if (w12Url && fetchFn) {
    try {
      const res = await fetchFn(w12Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      results.w12 = res.ok ? 'success' : 'failed';
    } catch (e) {
      results.w12 = `error: ${e.message}`;
    }
  }

  // W13: Cross-Linking (wait for completion)
  if (w13Url && fetchFn) {
    try {
      const res = await fetchFn(w13Url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      results.w13 = res.ok ? 'success' : 'failed';
    } catch (e) {
      results.w13 = `error: ${e.message}`;
    }
  }

  // Revalidate specific page
  if (revalidateUrl && fetchFn) {
    try {
      const res = await fetchFn(
        `${revalidateUrl}?secret=${revalidateSecret}&slug=${slug}`,
        { method: 'POST' },
      );
      results.revalidate = res.ok ? 'success' : 'failed';
    } catch (e) {
      results.revalidate = `error: ${e.message}`;
    }
  }

  // Google Indexing API
  if (indexingAuth && fetchFn) {
    try {
      const res = await fetchFn('https://indexing.googleapis.com/v3/urlNotifications:publish', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${indexingAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: `https://earlyinsider.com/blog/${slug}`,
          type: 'URL_UPDATED',
        }),
      });
      results.indexing = res.ok ? 'success' : 'failed';
    } catch (e) {
      results.indexing = `error: ${e.message}`;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Telegram Notification
// ---------------------------------------------------------------------------

async function notifyTelegram(article, keyword, opts = {}) {
  const { fetchFn, botToken, chatId } = opts;
  if (!fetchFn || !botToken || !chatId) return;

  const text = [
    `New article published:`,
    `Title: ${article.title}`,
    `Ticker: ${keyword.ticker || 'N/A'}`,
    `Verdict: ${article.verdict_type}`,
    `Words: ${article.word_count}`,
    `URL: https://earlyinsider.com/blog/${article.slug}`,
  ].join('\n');

  await fetchFn(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

// ---------------------------------------------------------------------------
// Main Orchestrator (for n8n Code node)
// ---------------------------------------------------------------------------

async function generateArticle(input, helpers) {
  const { blog } = input;
  const fetchFn = helpers?.fetchFn;
  const env = helpers?.env || {};

  const nocodbOpts = {
    fetchFn,
    baseUrl: env.NOCODB_BASE_URL,
    token: env.NOCODB_API_TOKEN,
  };

  // Step 1: Pick keyword
  const keyword = await pickKeyword(blog, nocodbOpts);
  if (!keyword) {
    await notifyTelegram(
      { title: 'No keywords available', word_count: 0, slug: '', verdict_type: 'N/A' },
      { ticker: 'N/A' },
      { fetchFn, botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
    );
    return { status: 'skipped', reason: 'No keywords available' };
  }

  // Lock keyword
  await lockKeyword(keyword.id, nocodbOpts);

  // Step 2: Extract & validate ticker
  const ticker = extractTicker(keyword.keyword);
  if (ticker) {
    const valid = await validateTickerApi(ticker, {
      fetchFn,
      apiKey: env.FINANCIAL_DATASETS_API_KEY,
    });
    if (!valid) {
      await updateKeywordStatus(keyword.id, 'invalid_ticker', nocodbOpts);
      return { status: 'skipped', reason: `Invalid ticker: ${ticker}` };
    }
  }

  // Step 3: Call Dexter (via webhook)
  let dexterData = {};
  if (env.DEXTER_WEBHOOK_URL && fetchFn) {
    const dRes = await fetchFn(env.DEXTER_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker, keyword: keyword.keyword, article_type: keyword.article_type, blog }),
    });
    if (dRes.ok) dexterData = await dRes.json();
    if (dexterData.data_completeness !== undefined && dexterData.data_completeness < 0.5) {
      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
      return { status: 'skipped', reason: 'Insufficient data from Dexter' };
    }
  }

  // Step 4: Determine article params
  const params = determineArticleParams(blog);

  // Step 5: Interpolate template
  const templateVars = {
    BLOG: blog,
    TICKER: ticker || keyword.keyword,
    COMPANY_NAME: dexterData.company_name || ticker || '',
    SECTOR: dexterData.sector || '',
    MARKET_CAP: dexterData.market_cap || '',
    ARTICLE_TYPE: keyword.article_type || 'A',
    TARGET_LENGTH: params.targetLength,
    KEYWORD: keyword.keyword,
    SECONDARY_KEYWORDS: keyword.secondary_keywords || '',
    DEXTER_ANALYSIS: JSON.stringify(dexterData.dexter_analysis || {}),
    FINANCIAL_DATA: JSON.stringify(dexterData.financial_data || {}),
    INSIDER_TRADES: JSON.stringify(dexterData.insider_trades || []),
    STOCK_PRICES: JSON.stringify(dexterData.stock_prices || {}),
    COMPETITOR_DATA: JSON.stringify(dexterData.competitor_data || []),
    MANAGEMENT_QUOTES: JSON.stringify(dexterData.management_quotes || []),
    NEWS_DATA: JSON.stringify(dexterData.news || []),
    CURRENT_DATE: new Date().toISOString().split('T')[0],
    AUTHOR_NAME: params.authorName,
  };

  // Read system prompt template
  const systemPromptTemplate = env.ARTICLE_SYSTEM_PROMPT || '';
  const systemPrompt = interpolateTemplate(systemPromptTemplate, templateVars);

  // Step 6-7: Claude API call with Tool Use + retry
  let article = null;
  let retryFeedback = '';
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prompt = attempt === 0
      ? systemPrompt
      : `${systemPrompt}\n\nQuality gate failed on previous attempt: ${retryFeedback}. Fix these specific issues and regenerate.`;

    const response = await callClaudeToolUse(prompt, {
      fetchFn,
      apiKey: env.ANTHROPIC_API_KEY,
      maxTokens: params.maxTokens,
    });

    article = extractToolResult(response);
    if (!article) {
      // Safety refusal or unexpected response
      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
      return { status: 'skipped', reason: 'Claude safety refusal' };
    }

    // Sanitize HTML BEFORE quality gate so gate checks post-sanitized content
    article.body_html = sanitizeHtml(article.body_html);

    // Recompute word count from actual body (don't trust Claude's self-report)
    const textOnly = (article.body_html || '').replace(/<[^>]+>/g, '');
    article.word_count = textOnly.split(/\s+/).filter(Boolean).length;

    // Step 8: Quality gate
    const gate = qualityGate(article, keyword.keyword, params.targetLength, keyword.article_type);
    if (gate.pass) break;

    if (attempt === MAX_RETRIES) {
      // Save as error after exhausting retries
      article.status = 'error';
      article.confidence_notes = `Quality gate failures: ${gate.failures.join('; ')}`;
      await nocodbPost('/Articles', {
        slug: article.slug || `error-${Date.now()}`,
        title_text: article.title || 'Quality gate failure',
        body_html: article.body_html || '',
        status: 'error',
        quality_gate_pass: false,
        confidence_notes: article.confidence_notes,
        blog,
      }, nocodbOpts.token, nocodbOpts);

      await updateKeywordStatus(keyword.id, 'skipped', nocodbOpts);
      await notifyTelegram(
        { ...article, verdict_type: 'ERROR' },
        keyword,
        { fetchFn, botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
      );
      return { status: 'error', failures: gate.failures };
    }

    retryFeedback = gate.failures.join('; ');
  }

  // Step 8.6: Ensure unique slug
  const existingSlugsRes = await nocodbGet(
    `/Articles?fields=slug&where=(slug,like,${article.slug}%)`,
    nocodbOpts.token,
    nocodbOpts,
  );
  const existingSlugs = (existingSlugsRes?.list || []).map((r) => r.slug);
  article.slug = ensureUniqueSlug(article.slug, existingSlugs);

  // Step 9: Write to NocoDB
  const created = await writeArticle(article, { ...keyword, author_name: params.authorName }, nocodbOpts);

  // Step 10: Update keyword
  await updateKeywordStatus(keyword.id, 'used', nocodbOpts);

  // Step 11: Trigger downstream (sequential)
  const articleId = created?.id || created?.Id;
  if (articleId) {
    // Update status to published only if downstream succeeded
    const downstream = await triggerDownstream(articleId, article.slug, {
      fetchFn,
      w12Url: env.W12_WEBHOOK_URL,
      w13Url: env.W13_WEBHOOK_URL,
      revalidateUrl: env.REVALIDATE_URL,
      revalidateSecret: env.REVALIDATION_SECRET,
      indexingAuth: env.GOOGLE_INDEXING_TOKEN,
    });

    const downstreamOk = (!downstream.w12 || downstream.w12 === 'success') &&
                          (!downstream.w13 || downstream.w13 === 'success');
    const newStatus = downstreamOk ? 'published' : 'enriching';
    await nocodbPatch(`/Articles/${articleId}`, { status: newStatus }, nocodbOpts.token, nocodbOpts);
  }

  // Step 13: Notify
  await notifyTelegram(article, keyword, {
    fetchFn,
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
  });

  return { status: 'published', article_id: articleId, slug: article.slug };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Pure functions (tested)
  extractTicker,
  determineArticleParams,
  interpolateTemplate,
  buildToolSchema,
  extractToolResult,
  qualityGate,
  sanitizeHtml,
  ensureUniqueSlug,

  // Orchestration (integration tested)
  pickKeyword,
  lockKeyword,
  validateTickerApi,
  callClaudeToolUse,
  writeArticle,
  updateKeywordStatus,
  triggerDownstream,
  notifyTelegram,
  generateArticle,

  // NocoDB helpers
  nocodbGet,
  nocodbPost,
  nocodbPatch,

  // Constants
  VALID_VERDICTS,
  BANNED_PHRASES,
  LENGTH_CONFIG,
  FALSE_POSITIVE_TICKERS,
  ALLOWED_TAGS,
  REQUIRED_ARTICLE_FIELDS,
};
