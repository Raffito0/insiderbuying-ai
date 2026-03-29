'use strict';

const {
  selectProspects,
  buildEmailPrompt,
  validateEmail,
  validateSubject,
  buildSendPayload,
  buildFollowUpPrompt,
  checkForFollowUps,
  logEmail,
  scrapeRecentArticle,
  generateEmail,
  BANNED_PHRASES,
  FROM_NAME,
} = require('../../n8n/code/insiderbuying/send-outreach');

// ─── selectProspects ──────────────────────────────────────────────────────

describe('selectProspects()', () => {
  const PROSPECTS = [
    { status: 'found', contact_email: 'a@example.com', priority: 80 },
    { status: 'found', contact_email: 'b@example.com', priority: 90 },
    { status: 'sent',  contact_email: 'c@example.com', priority: 95 },
    { status: 'found', contact_email: '',              priority: 70 },
    { status: 'found', contact_email: 'd@example.com', priority: 60 },
  ];

  test('returns only prospects with status "found" and a non-empty email', () => {
    const result = selectProspects(PROSPECTS);
    result.forEach((p) => {
      expect(p.status).toBe('found');
      expect(p.contact_email.length).toBeGreaterThan(0);
    });
  });

  test('sorts by priority descending', () => {
    const result = selectProspects(PROSPECTS);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].priority).toBeGreaterThanOrEqual(result[i].priority);
    }
  });

  test('respects limit parameter', () => {
    const result = selectProspects(PROSPECTS, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  test('defaults limit to 10', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      status: 'found', contact_email: `e${i}@x.com`, priority: i,
    }));
    expect(selectProspects(many).length).toBeLessThanOrEqual(10);
  });

  test('handles null/empty input gracefully', () => {
    expect(selectProspects(null)).toEqual([]);
    expect(selectProspects([])).toEqual([]);
  });
});

// ─── buildEmailPrompt ─────────────────────────────────────────────────────

describe('buildEmailPrompt()', () => {
  const PROSPECT = {
    contact_name: 'Jane Smith',
    site_name: 'FinanceBlog',
    domain: 'financeblog.com',
    notes: 'Covers insider trading analysis',
  };
  const ARTICLE = {
    title: 'Why Insiders Are Buying AAPL',
    url: 'https://earlyinsider.com/articles/aapl',
    summary: 'Strong insider conviction in AAPL this quarter.',
  };

  test('returns object with prompt and maxTokens', () => {
    const result = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('maxTokens');
  });

  test('prompt includes contact name and site name', () => {
    const result = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(result.prompt).toContain('Jane Smith');
    expect(result.prompt).toContain('FinanceBlog');
  });

  test('prompt includes article title', () => {
    const result = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(result.prompt).toContain(ARTICLE.title);
  });

  // GAP 12.14 — prompt must not include the article URL
  test('GAP 12.14: prompt does NOT contain the article URL', () => {
    const result = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(result.prompt).not.toContain('https://');
    expect(result.prompt).not.toContain(ARTICLE.url);
  });

  test('GAP 12.14: prompt does not contain any http:// or https:// pattern', () => {
    const result = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(result.prompt).not.toMatch(/https?:\/\//);
  });

  test('maxTokens is in a reasonable range (100-500)', () => {
    const result = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(result.maxTokens).toBeGreaterThanOrEqual(100);
    expect(result.maxTokens).toBeLessThanOrEqual(500);
  });

  test('GAP 12.14: article with url passed in — prompt still has no URL', () => {
    // Even if the caller passes a full article object with url, it must not leak into prompt
    const articleWithUrl = { title: 'AAPL Insiders Load Up', url: 'https://earlyinsider.com/aapl', summary: 'Strong buy signal.' };
    const result = buildEmailPrompt(PROSPECT, articleWithUrl);
    expect(result.prompt).not.toContain('https://');
    expect(result.prompt).not.toContain('earlyinsider.com');
  });

  test('handles missing article url gracefully — does not throw', () => {
    const articleNoUrl = { title: 'Test Article', summary: 'Summary here.' };
    expect(() => buildEmailPrompt(PROSPECT, articleNoUrl)).not.toThrow();
  });
});

// ─── validateEmail ────────────────────────────────────────────────────────

describe('validateEmail()', () => {
  const VALID_EMAIL =
    'Subject: AAPL insider data you might find useful\n\n'
    + 'Quick note — I tracked an unusual cluster of AAPL buys by C-suite last month. '
    + 'Would you be interested in a guest post covering the full pattern? '
    + 'Happy to send the draft over if so.';

  test('returns valid:true for a clean email under 150 words', () => {
    const result = validateEmail(VALID_EMAIL);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  test('returns wordCount in result', () => {
    const result = validateEmail(VALID_EMAIL);
    expect(typeof result.wordCount).toBe('number');
    expect(result.wordCount).toBeGreaterThan(0);
  });

  test('flags email over 150 words', () => {
    const long = Array(160).fill('word').join(' ');
    const result = validateEmail(long);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.toLowerCase().includes('150'))).toBe(true);
  });

  test('flags banned phrases', () => {
    const result = validateEmail('I hope this finds you. Would you be interested in a collaboration?');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.toLowerCase().includes('banned'))).toBe(true);
  });

  test('flags email with no CTA', () => {
    const result = validateEmail('AAPL insiders bought a lot last month. That is interesting.');
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.toLowerCase().includes('cta'))).toBe(true);
  });

  test('returns { valid: false } for null/empty input', () => {
    expect(validateEmail(null).valid).toBe(false);
    expect(validateEmail('').valid).toBe(false);
  });

  test('result always has issues array', () => {
    expect(Array.isArray(validateEmail(VALID_EMAIL).issues)).toBe(true);
    expect(Array.isArray(validateEmail(null).issues)).toBe(true);
  });
});

// ─── buildSendPayload ─────────────────────────────────────────────────────

describe('buildSendPayload()', () => {
  test('returns object with from, to, subject, html, text fields', () => {
    const payload = buildSendPayload('to@example.com', 'Subject here', 'Body text', 'from@example.com');
    expect(payload).toHaveProperty('from');
    expect(payload).toHaveProperty('to');
    expect(payload).toHaveProperty('subject');
    expect(payload).toHaveProperty('html');
    expect(payload).toHaveProperty('text');
  });

  test('to field matches input', () => {
    const payload = buildSendPayload('to@example.com', 'Subject', 'Body', 'from@example.com');
    expect(payload.to).toBe('to@example.com');
  });

  test('text field matches raw body', () => {
    const payload = buildSendPayload('to@x.com', 'S', 'My body text', 'from@x.com');
    expect(payload.text).toBe('My body text');
  });

  test('html field wraps lines in <p> tags', () => {
    const payload = buildSendPayload('t@x.com', 'S', 'Line one\nLine two', 'f@x.com');
    expect(payload.html).toContain('<p>');
  });
});

// ─── buildFollowUpPrompt ─────────────────────────────────────────────────

describe('buildFollowUpPrompt()', () => {
  const PROSPECT = { contact_name: 'Bob', site_name: 'TradingBlog', domain: 'tradingblog.com' };
  const SUBJECT = 'AAPL insider conviction last month';

  test('returns object with prompt and maxTokens', () => {
    const result = buildFollowUpPrompt(PROSPECT, SUBJECT);
    expect(result).toHaveProperty('prompt');
    expect(result).toHaveProperty('maxTokens');
  });

  test('prompt includes the original subject line', () => {
    const result = buildFollowUpPrompt(PROSPECT, SUBJECT);
    expect(result.prompt).toContain(SUBJECT);
  });

  test('prompt includes the contact name', () => {
    const result = buildFollowUpPrompt(PROSPECT, SUBJECT);
    expect(result.prompt).toContain('Bob');
  });

  test('maxTokens is reasonable (50-300)', () => {
    const result = buildFollowUpPrompt(PROSPECT, SUBJECT);
    expect(result.maxTokens).toBeGreaterThanOrEqual(50);
    expect(result.maxTokens).toBeLessThanOrEqual(300);
  });
});

// ─── checkForFollowUps ────────────────────────────────────────────────────

describe('checkForFollowUps()', () => {
  const OLD_DATE = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
  const RECENT_DATE = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();

  test('returns empty array for null/empty logs', () => {
    expect(checkForFollowUps(null)).toEqual([]);
    expect(checkForFollowUps([])).toEqual([]);
  });

  test('returns prospect ID when initial was sent over threshold days ago', () => {
    const logs = [{ email_type: 'initial', prospect_id: 'p1', sent_at: OLD_DATE }];
    const result = checkForFollowUps(logs, 5);
    expect(result).toContain('p1');
  });

  test('does not return prospect if followup already sent', () => {
    const logs = [
      { email_type: 'initial', prospect_id: 'p1', sent_at: OLD_DATE },
      { email_type: 'followup', prospect_id: 'p1', sent_at: OLD_DATE },
    ];
    expect(checkForFollowUps(logs, 5)).not.toContain('p1');
  });

  test('does not return prospect if initial was sent recently (under threshold)', () => {
    const logs = [{ email_type: 'initial', prospect_id: 'p2', sent_at: RECENT_DATE }];
    expect(checkForFollowUps(logs, 5)).not.toContain('p2');
  });
});

// ─── logEmail ─────────────────────────────────────────────────────────────

describe('logEmail()', () => {
  test('returns flat object — no { fields: {} } wrapper', () => {
    const record = logEmail('p1', 'initial');
    expect(record.fields).toBeUndefined();
  });

  test('includes prospect_id field', () => {
    const record = logEmail('p1', 'initial');
    expect(record.prospect_id).toBe('p1');
  });

  test('includes email_type field', () => {
    const record = logEmail('p1', 'followup');
    expect(record.email_type).toBe('followup');
  });

  test('status is "sent"', () => {
    expect(logEmail('p1', 'initial').status).toBe('sent');
  });

  test('sent_at is a valid ISO timestamp', () => {
    const record = logEmail('p1', 'initial');
    expect(() => new Date(record.sent_at)).not.toThrow();
    expect(new Date(record.sent_at).toISOString()).toBe(record.sent_at);
  });

  test('defaults email_type to "initial" when not provided', () => {
    const record = logEmail('p1');
    expect(record.email_type).toBe('initial');
  });
});

// ─── BANNED_PHRASES ───────────────────────────────────────────────────────

describe('BANNED_PHRASES', () => {
  test('is a non-empty array', () => {
    expect(Array.isArray(BANNED_PHRASES)).toBe(true);
    expect(BANNED_PHRASES.length).toBeGreaterThan(0);
  });

  test('contains classic template phrases', () => {
    expect(BANNED_PHRASES.some((p) => p.toLowerCase().includes('hope this finds'))).toBe(true);
    expect(BANNED_PHRASES.some((p) => p.toLowerCase().includes('reaching out'))).toBe(true);
  });
});

// ─── section-04: email rewrite + scraping ────────────────────────────────

// Helper: build an AI response that passes all generateEmail validators
function makeValidAiResponse(opts) {
  var subject = (opts && opts.subject) || 'Ready to feature our AAPL insider data?';
  var wordCount = (opts && opts.wordCount) || 110;
  var banned = (opts && opts.bannedPhrase) || '';
  // Build a body with exact word count including required phrases
  // Required phrases: "We track 1,500+" and "Reply 'stop' to never hear from me again."
  var requiredA = "We track 1,500+ SEC insider filings per month.";
  var requiredB = "Reply 'stop' to never hear from me again.";
  var requiredWords = (requiredA + ' ' + requiredB).split(/\s+/).length; // ~15
  var fillerCount = Math.max(0, wordCount - requiredWords);
  var filler = Array(fillerCount).fill('interesting').join(' ');
  var body = requiredA + ' ' + filler + (banned ? ' ' + banned : '') + ' ' + requiredB;
  return 'Subject: ' + subject + '\n\n' + body;
}

// ── section-04: buildEmailPrompt enhancements ─────────────────────────────

describe('section-04: buildEmailPrompt no URL', () => {
  const PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
  const ARTICLE  = { title: 'AAPL Insiders Load Up', url: 'https://earlyinsider.com/aapl', summary: 'CEO bought $5M.' };

  test('does NOT include http:// or https:// in the prompt', () => {
    const { prompt } = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(prompt).not.toMatch(/https?:\/\//);
  });

  test('prompt explicitly instructs AI not to include URLs', () => {
    const { prompt } = buildEmailPrompt(PROSPECT, ARTICLE);
    expect(prompt.toLowerCase()).toContain('url');
  });
});

describe('section-04: buildEmailPrompt social proof', () => {
  const PROSPECT = { contact_name: 'Bob', site_name: 'TradeBlog', domain: 'tradeblog.com' };

  test('includes "1,500+" in the prompt', () => {
    const { prompt } = buildEmailPrompt(PROSPECT, null);
    expect(prompt).toContain('1,500+');
  });
});

describe('section-04: buildEmailPrompt word count instruction', () => {
  const PROSPECT = { contact_name: 'Bob', site_name: 'TradeBlog', domain: 'tradeblog.com' };

  test('prompt instructs AI to write 100-125 words', () => {
    const { prompt } = buildEmailPrompt(PROSPECT, null);
    expect(prompt).toMatch(/100.{0,5}125/);
  });
});

describe('section-04: buildEmailPrompt opt-out footer', () => {
  const PROSPECT = { contact_name: 'Bob', site_name: 'TradeBlog', domain: 'tradeblog.com' };

  test("prompt includes \"Reply 'stop'\" instruction", () => {
    const { prompt } = buildEmailPrompt(PROSPECT, null);
    expect(prompt.toLowerCase()).toContain("reply 'stop'");
  });
});

describe('section-04: buildEmailPrompt article personalisation', () => {
  const BASE_PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };

  test('includes article title in prompt when last_article_title is set', () => {
    const prospect = Object.assign({}, BASE_PROSPECT, { last_article_title: 'Why CEOs Buy In Q4' });
    const { prompt } = buildEmailPrompt(prospect, null);
    expect(prompt).toContain('Why CEOs Buy In Q4');
  });

  test('generates prompt without article reference when last_article_title is null', () => {
    const { prompt } = buildEmailPrompt(BASE_PROSPECT, null);
    expect(prompt).not.toContain("I just read your piece");
  });
});

// ── section-04: validateSubject ───────────────────────────────────────────

describe('section-04: validateSubject()', () => {
  test('throws when subject has no question mark', () => {
    expect(() => validateSubject('Insider buying update')).toThrow();
    expect(() => validateSubject('Insider buying update')).toThrow(/question/i);
  });

  test('does not throw when subject ends with "?"', () => {
    expect(() => validateSubject('Did you see the latest AAPL data?')).not.toThrow();
  });

  test('does not throw when subject contains "?" in the middle', () => {
    expect(() => validateSubject('Is AAPL a buy? Here is the data')).not.toThrow();
  });
});

// ── section-04: validateEmail new banned phrases ──────────────────────────

describe('section-04: validateEmail new banned phrases (case-insensitive)', () => {
  const newPhrases = [
    'just wanted to reach out',
    'I stumbled upon',
    'I am a huge fan',
    'big fan of your work',
    'as per our conversation',
    'circle back',
    'synergy',
  ];

  newPhrases.forEach((phrase) => {
    test(`rejects body containing "${phrase}" (passed in UPPER CASE)`, () => {
      const body = phrase.toUpperCase() + ' Would you be interested in a guest post?';
      const result = validateEmail(body);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.toLowerCase().includes('banned'))).toBe(true);
    });
  });
});

// ── section-04: FROM_NAME constant ────────────────────────────────────────

describe('section-04: FROM_NAME constant', () => {
  test('equals "Ryan from EarlyInsider" <ryan@earlyinsider.com>', () => {
    expect(FROM_NAME).toBe('"Ryan from EarlyInsider" <ryan@earlyinsider.com>');
  });
});

// ── section-04: generateEmail from name ──────────────────────────────────

describe('section-04: generateEmail from name', () => {
  test('sets email.from to FROM_NAME constant', async () => {
    const prospect = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
    const mockAi = { call: jest.fn().mockResolvedValue(makeValidAiResponse({})) };
    const result = await generateEmail(prospect, null, { _aiClient: mockAi });
    expect(result.from).toBe(FROM_NAME);
  });
});

// ── section-04: generateEmail word count ─────────────────────────────────

describe('section-04: generateEmail word count', () => {
  test('produces an email body between 100 and 125 words', async () => {
    const prospect = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
    const mockAi = { call: jest.fn().mockResolvedValue(makeValidAiResponse({ wordCount: 110 })) };
    const result = await generateEmail(prospect, null, { _aiClient: mockAi });
    const words = result.body.trim().split(/\s+/).filter((w) => w.length > 0);
    expect(words.length).toBeGreaterThanOrEqual(100);
    expect(words.length).toBeLessThanOrEqual(125);
  });
});

// ── section-04: AI retry loop ────────────────────────────────────────────

describe('section-04: generateEmail retry loop', () => {
  const PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };

  test('retries when AI returns a banned phrase — succeeds on clean 3rd attempt', async () => {
    let calls = 0;
    const mockAi = {
      call: jest.fn().mockImplementation(async () => {
        calls++;
        if (calls <= 2) {
          // synergy is banned
          return makeValidAiResponse({ bannedPhrase: 'synergy great idea' });
        }
        return makeValidAiResponse({});
      }),
    };
    const result = await generateEmail(PROSPECT, null, { _aiClient: mockAi });
    expect(result.subject).toBeTruthy();
    expect(calls).toBe(3);
  });

  test('retries when AI returns subject without "?"', async () => {
    let calls = 0;
    const mockAi = {
      call: jest.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) return makeValidAiResponse({ subject: 'No question mark here' });
        return makeValidAiResponse({});
      }),
    };
    const result = await generateEmail(PROSPECT, null, { _aiClient: mockAi });
    expect(result.subject).toContain('?');
    expect(calls).toBe(2);
  });

  test('retries when AI returns body over 125 words', async () => {
    let calls = 0;
    const mockAi = {
      call: jest.fn().mockImplementation(async () => {
        calls++;
        if (calls === 1) return makeValidAiResponse({ wordCount: 140 });
        return makeValidAiResponse({});
      }),
    };
    const result = await generateEmail(PROSPECT, null, { _aiClient: mockAi });
    const words = result.body.trim().split(/\s+/).filter((w) => w.length > 0);
    expect(words.length).toBeLessThanOrEqual(125);
    expect(calls).toBe(2);
  });

  test('throws after 3 failed attempts', async () => {
    const mockAi = {
      call: jest.fn().mockResolvedValue(makeValidAiResponse({ subject: 'No question mark' })),
    };
    await expect(generateEmail(PROSPECT, null, { _aiClient: mockAi })).rejects.toThrow(/attempts/i);
  });
});

// ── section-04: scrapeRecentArticle HTML mode ────────────────────────────

describe('section-04: scrapeRecentArticle HTML mode', () => {
  function mockFetch(body, contentType) {
    return jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': contentType || 'text/html' },
      body: body,
    });
  }

  test('returns title and url from article:first-of-type a selector', async () => {
    const html = '<html><body><article><a href="/post/1">AAPL Insiders Buy</a></article></body></html>';
    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
    expect(result).not.toBeNull();
    expect(result.title).toBe('AAPL Insiders Buy');
    expect(result.url).toContain('/post/1');
  });

  test('falls back to .post:first-of-type a when article selector finds nothing', async () => {
    const html = '<html><body><div class="post"><a href="/p/2">Insider Move</a></div></body></html>';
    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
    expect(result).not.toBeNull();
    expect(result.title).toBe('Insider Move');
  });

  test('falls back to h2 a:first-of-type as last resort', async () => {
    const html = '<html><body><h2><a href="/p/3">Deep Dive</a></h2></body></html>';
    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
    expect(result).not.toBeNull();
    expect(result.title).toBe('Deep Dive');
  });

  test('returns null gracefully when scraping fails entirely', async () => {
    const throwFn = jest.fn().mockRejectedValue(new Error('network error'));
    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: throwFn });
    expect(result).toBeNull();
  });

  test('returns null gracefully when no selector matches', async () => {
    const html = '<html><body><p>No links here</p></body></html>';
    const result = await scrapeRecentArticle('https://example.com', { _fetchFn: mockFetch(html) });
    expect(result).toBeNull();
  });
});

// ── section-04: generateEmail — no AI client throws (L-10) ──────────────

describe('section-04: generateEmail — no AI client', () => {
  const PROSPECT = { contact_name: 'Jane', site_name: 'FinBlog', domain: 'finblog.com' };
  test('throws immediately when no _aiClient provided', async () => {
    await expect(generateEmail(PROSPECT, null, {})).rejects.toThrow(/AI client not provided/i);
  });
});

// ── section-04: scrapeRecentArticle URL edge cases (L-11) ─────────────────

describe('section-04: scrapeRecentArticle URL edge cases', () => {
  function mockFetch(href) {
    return jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html><body><article><a href="' + href + '">Article Title</a></article></body></html>',
    });
  }

  test('resolves protocol-relative href (//cdn.example.com/post)', async () => {
    const result = await scrapeRecentArticle('https://example.com', {
      _fetchFn: mockFetch('//cdn.example.com/post'),
    });
    expect(result).not.toBeNull();
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/post/);
  });

  test('resolves relative href (/blog/post-1)', async () => {
    const result = await scrapeRecentArticle('https://example.com', {
      _fetchFn: mockFetch('/blog/post-1'),
    });
    expect(result).not.toBeNull();
    expect(result.url).toMatch(/^https:\/\/example\.com\/blog\/post-1/);
  });
});

// ── section-04: scrapeRecentArticle XML/RSS mode ─────────────────────────

describe('section-04: scrapeRecentArticle XML/RSS mode', () => {
  const RSS_BODY = '<?xml version="1.0"?><rss><channel><item><title>CEO Buys Big</title><link>https://blog.com/1</link></item></channel></rss>';

  test('uses xmlMode when Content-Type is application/xml', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'application/xml; charset=utf-8' },
      body: RSS_BODY,
    });
    const result = await scrapeRecentArticle('https://blog.com', { _fetchFn: fetchFn });
    expect(result).not.toBeNull();
    expect(result.title).toBe('CEO Buys Big');
  });

  test('uses xmlMode when Content-Type is text/xml', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      statusCode: 200,
      headers: { 'content-type': 'text/xml' },
      body: RSS_BODY,
    });
    const result = await scrapeRecentArticle('https://blog.com', { _fetchFn: fetchFn });
    expect(result).not.toBeNull();
    expect(result.title).toBe('CEO Buys Big');
  });
});
