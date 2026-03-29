// W11 Outreach Email Sender -- personalized outreach via DeepSeek
// n8n Code Node (CommonJS)

var cheerio = require('cheerio');
var urlMod = require('url');

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

var BANNED_PHRASES = [
  'I hope this finds you',
  'hope this finds you well',
  'just wanted to reach out',
  'reaching out',
  'just checking in',
  'touching base',
  'circle back',
  'per my last email',
  'as per our conversation',
  'I wanted to follow up',
  'quick question for you',
  'hope you are doing well',
  'I came across your',
  'I stumbled upon',
  'I am a huge fan',
  'big fan of your work',
  'synergy',
];

var FROM_NAME = '"Ryan from EarlyInsider" <ryan@earlyinsider.com>';

/**
 * Select top N prospects by priority, filtered to status='found' with email.
 * @param {object[]} prospects
 * @param {number} [limit=10]
 * @returns {object[]}
 */
function selectProspects(prospects, limit) {
  var n = limit || 10;

  var eligible = (prospects || []).filter(function (p) {
    return p.status === 'found' && p.contact_email && p.contact_email.length > 0;
  });

  eligible.sort(function (a, b) {
    return (b.priority || 0) - (a.priority || 0);
  });

  return eligible.slice(0, n);
}

/**
 * Build DeepSeek prompt for a personalized outreach email.
 * @param {object} prospect - { site_name, domain, contact_name, notes, last_article_title }
 * @param {object} ourArticle - { title, summary } (url is intentionally excluded — GAP 12.14)
 * @returns {{ prompt: string, maxTokens: number }}
 */
function buildEmailPrompt(prospect, ourArticle) {
  // GAP 12.14: only extract title and summary — never forward url to the LLM
  var articleTitle = ourArticle ? ourArticle.title : '';
  var articleSummary = ourArticle ? ourArticle.summary : '';

  var personalisation = '';
  if (prospect.last_article_title) {
    // Sanitize: strip newlines and cap at 120 chars to prevent prompt injection
    var safeTitle = (prospect.last_article_title || '')
      .replace(/[\r\n]/g, ' ')
      .trim()
      .slice(0, 120);
    personalisation =
      "I just read your piece: '" +
      safeTitle +
      "'. That's exactly the kind of audience we want to reach.\n\n";
  }

  var prompt =
    'Write a cold outreach email to ' +
    (prospect.contact_name || 'the editor') +
    ' at ' +
    (prospect.site_name || prospect.domain) +
    '.\n\n' +
    'Context about their site: ' +
    (prospect.notes || 'Finance/investing blog') +
    '\n\n' +
    personalisation +
    (articleTitle ? 'We published: "' + articleTitle + '"\n' : '') +
    (articleSummary ? 'Summary: ' + articleSummary + '\n\n' : '') +
    'Rules:\n' +
    '- EXACTLY 100-125 words total in the email body\n' +
    '- Do not include any URLs or links in this email\n' +
    '- Zero template language (no "I hope this finds you", "reaching out", etc.)\n' +
    '- Include exactly 1 specific data point from our article\n' +
    '- One clear CTA (guest post, link swap, or quote request)\n' +
    '- Tone: direct, knowledgeable, peer-to-peer\n' +
    '- Subject line on first line prefixed with "Subject: " (must end with or contain "?")\n' +
    '- Include verbatim in the body: "We track 1,500+ SEC insider filings per month."\n' +
    "- Last line of body must be exactly: Reply 'stop' to never hear from me again.\n" +
    '- Do NOT use any of these phrases: ' +
    BANNED_PHRASES.join(', ') +
    '\n\n' +
    'Output the email only. No explanations.';

  return { prompt: prompt, maxTokens: 350 };
}

/**
 * Validate that an email subject contains a question mark.
 * @param {string} subject
 * @throws {Error} if subject has no "?"
 */
function validateSubject(subject) {
  if (!((subject || '').trim().match(/\?/))) {
    throw new Error('Subject must be a question: "' + (subject || '') + '"');
  }
}

/**
 * Validate an outreach email body draft.
 * @param {string} text
 * @returns {{ valid: boolean, wordCount: number, issues: string[] }}
 */
function validateEmail(text) {
  var issues = [];
  var words = (text || '').trim().split(/\s+/).filter(function (w) {
    return w.length > 0;
  });
  var wordCount = words.length;

  if (wordCount === 0) {
    issues.push('Email body is empty');
    return { valid: false, wordCount: 0, issues: issues };
  }

  if (wordCount > 150) {
    issues.push('Over 150 word limit (' + wordCount + ' words)');
  }

  var lowerText = (text || '').toLowerCase();
  BANNED_PHRASES.forEach(function (phrase) {
    if (lowerText.indexOf(phrase.toLowerCase()) !== -1) {
      issues.push('Contains banned phrase: "' + phrase + '"');
    }
  });

  // Check for one clear ask (question mark or imperative)
  var hasQuestion = (text || '').indexOf('?') !== -1;
  var hasImperative =
    lowerText.indexOf('let me know') !== -1 ||
    lowerText.indexOf('would you') !== -1 ||
    lowerText.indexOf('can we') !== -1 ||
    lowerText.indexOf('interested in') !== -1 ||
    lowerText.indexOf('check it out') !== -1 ||
    lowerText.indexOf('take a look') !== -1;

  if (!hasQuestion && !hasImperative) {
    issues.push('No clear CTA or ask detected');
  }

  return {
    valid: issues.length === 0,
    wordCount: wordCount,
    issues: issues,
  };
}

/**
 * Build SMTP-compatible email payload.
 * @param {string} to
 * @param {string} subject
 * @param {string} body
 * @param {string} fromEmail
 * @returns {{ from: string, to: string, subject: string, html: string, text: string }}
 */
function buildSendPayload(to, subject, body, fromEmail) {
  var htmlBody = (body || '')
    .split('\n')
    .map(function (line) {
      return '<p>' + escapeHtml(line) + '</p>';
    })
    .join('\n');

  return {
    from: fromEmail,
    to: to,
    subject: subject,
    html: htmlBody,
    text: body,
  };
}

/**
 * Build DeepSeek prompt for a follow-up email.
 * @param {object} prospect
 * @param {string} originalSubject
 * @returns {{ prompt: string, maxTokens: number }}
 */
function buildFollowUpPrompt(prospect, originalSubject) {
  var prompt =
    'Write a follow-up email to ' +
    (prospect.contact_name || 'the editor') +
    ' at ' +
    (prospect.site_name || prospect.domain) +
    '.\n\n' +
    'Original subject line was: "' +
    originalSubject +
    '"\n\n' +
    'Rules:\n' +
    '- 2-3 sentences MAX\n' +
    '- NOT "just checking in" or "following up"\n' +
    '- Add one new piece of value (new data, new angle, or new reason)\n' +
    '- Keep the same subject line with "Re: " prefix\n' +
    '- Tone: casual, brief, zero desperation\n\n' +
    'Output the email body only. No subject line. No explanations.';

  return { prompt: prompt, maxTokens: 150 };
}

/**
 * Find prospects needing a follow-up email.
 * @param {object[]} logs - Outreach_Log entries
 * @param {number} [daysSince=5]
 * @returns {string[]} prospect IDs needing follow-up
 */
function checkForFollowUps(logs, daysSince) {
  var threshold = daysSince || 5;
  var now = Date.now();
  var msThreshold = threshold * 24 * 60 * 60 * 1000;

  // Build sets of who got initial vs follow-up
  var initialSent = {};
  var followUpSent = {};

  (logs || []).forEach(function (entry) {
    if (entry.email_type === 'initial' && entry.prospect_id) {
      initialSent[entry.prospect_id] = entry.sent_at || entry.created_at;
    }
    if (entry.email_type === 'followup' && entry.prospect_id) {
      followUpSent[entry.prospect_id] = true;
    }
  });

  var needsFollowUp = [];
  Object.keys(initialSent).forEach(function (pid) {
    if (followUpSent[pid]) return; // already followed up

    var sentTime = new Date(initialSent[pid]).getTime();
    if (now - sentTime >= msThreshold) {
      needsFollowUp.push(pid);
    }
  });

  return needsFollowUp;
}

/**
 * Build an Outreach_Log record.
 * @param {string} prospectId
 * @param {string} emailType - 'initial' or 'followup'
 * @returns {object} record ready for NocoDB insert
 */
function logEmail(prospectId, emailType) {
  return {
    prospect_id: prospectId,
    email_type: emailType || 'initial',
    sent_at: new Date().toISOString(),
    status: 'sent',
  };
}

/**
 * Scrape the most recent article from a site's /blog page.
 * Supports HTML (CSS selectors) and XML/RSS (Cheerio xmlMode).
 * Caches result in prospect.last_article_title via NocoDB PATCH (best-effort).
 * @param {string} siteUrl - base URL, e.g. "https://example.com"
 * @param {object} [_opts] - { _fetchFn } for testing
 * @returns {Promise<{title: string, url: string}|null>}
 */
async function scrapeRecentArticle(siteUrl, _opts) {
  var fetchFn = (_opts && _opts._fetchFn) ? _opts._fetchFn : _defaultFetch;

  try {
    var result = await fetchFn(siteUrl + '/blog', 5000);
    if (!result || result.statusCode < 200 || result.statusCode >= 300) {
      return null;
    }

    var contentType = ((result.headers && result.headers['content-type']) || '').toLowerCase();
    var isXml =
      contentType.indexOf('application/xml') !== -1 ||
      contentType.indexOf('text/xml') !== -1;

    var $ = cheerio.load(result.body, { xmlMode: isXml });

    if (isXml) {
      var titleEl = $('item > title').first();
      var linkEl = $('item > link').first();
      if (!titleEl.length) return null;
      return { title: titleEl.text().trim(), url: linkEl.text().trim() };
    }

    // HTML: try selectors in priority order
    var selectors = ['article:first-of-type a', '.post:first-of-type a', 'h2 a:first-of-type'];
    for (var i = 0; i < selectors.length; i++) {
      var el = $(selectors[i]).first();
      if (el.length && el.text().trim()) {
        var href = el.attr('href') || '';
        if (href) {
          // Use WHATWG URL resolution to handle relative, protocol-relative, and absolute hrefs
          href = urlMod.resolve(siteUrl + '/blog', href);
        }
        return { title: el.text().trim(), url: href };
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

function _defaultFetch(url, timeout) {
  return new Promise(function (resolve, reject) {
    var _https = require('https');
    var _http = require('http');
    var urlMod = require('url');
    var parsed = urlMod.parse(url);
    var transport = parsed.protocol === 'https:' ? _https : _http;
    var timer = setTimeout(function () {
      reject(new Error('Timeout fetching ' + url));
    }, timeout);

    transport
      .get(url, function (res) {
        clearTimeout(timer);
        var chunks = [];
        res.on('data', function (c) {
          chunks.push(c);
        });
        res.on('end', function () {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          });
        });
        res.on('error', function (e) {
          reject(e);
        });
      })
      .on('error', function (e) {
        clearTimeout(timer);
        reject(e);
      });
  });
}

/**
 * Generate an outreach email with AI, with up to 3 retries on validation failure.
 * @param {object} prospect
 * @param {object|null} ourArticle
 * @param {object} [_opts] - { _aiClient: { call(messages): Promise<string> } }
 * @returns {Promise<{subject: string, body: string, from: string}>}
 */
async function generateEmail(prospect, ourArticle, _opts) {
  var aiCall =
    _opts && _opts._aiClient && typeof _opts._aiClient.call === 'function'
      ? function (msgs) {
          return _opts._aiClient.call(msgs);
        }
      : function () {
          throw new Error('AI client not provided — wire _opts._aiClient in production');
        };

  var promptResult = buildEmailPrompt(prospect, ourArticle);
  var messages = [{ role: 'user', content: promptResult.prompt }];
  var maxAttempts = 3;
  var lastError = null;

  for (var attempt = 0; attempt < maxAttempts; attempt++) {
    var raw = await aiCall(messages);

    try {
      var lines = (raw || '').trim().split('\n');
      var subject = '';
      var bodyLines = [];

      for (var j = 0; j < lines.length; j++) {
        if (!subject && lines[j].startsWith('Subject: ')) {
          subject = lines[j].replace('Subject: ', '').trim();
        } else {
          bodyLines.push(lines[j]);
        }
      }

      var body = bodyLines.join('\n').replace(/^\n+/, '').replace(/\n+$/, '');

      validateSubject(subject);

      var words = body.trim().split(/\s+/).filter(function (w) {
        return w.length > 0;
      });
      if (words.length < 100 || words.length > 125) {
        throw new Error(
          'Body word count out of range: ' + words.length + ' (expected 100-125)'
        );
      }

      // Hard checks (prompt construction guarantees — throw immediately, no retry)
      if (body.indexOf('1,500+') === -1) {
        throw new Error('Missing required social proof "1,500+"');
      }
      if (body.toLowerCase().indexOf("reply 'stop'") === -1) {
        throw new Error("Missing required CAN-SPAM opt-out \"Reply 'stop'\"");
      }

      var lowerBody = body.toLowerCase();
      for (var k = 0; k < BANNED_PHRASES.length; k++) {
        if (lowerBody.indexOf(BANNED_PHRASES[k].toLowerCase()) !== -1) {
          throw new Error('Contains banned phrase: "' + BANNED_PHRASES[k] + '"');
        }
      }

      return { subject: subject, body: body, from: FROM_NAME };
    } catch (err) {
      lastError = err;
      messages.push({ role: 'assistant', content: raw });
      messages.push({
        role: 'user',
        content:
          'That email failed validation: ' + err.message + '. Fix it and try again.',
      });
    }
  }

  throw new Error(
    'generateEmail failed after ' + maxAttempts + ' attempts. Last: ' + lastError.message
  );
}

module.exports = {
  selectProspects: selectProspects,
  buildEmailPrompt: buildEmailPrompt,
  validateEmail: validateEmail,
  validateSubject: validateSubject,
  buildSendPayload: buildSendPayload,
  buildFollowUpPrompt: buildFollowUpPrompt,
  checkForFollowUps: checkForFollowUps,
  logEmail: logEmail,
  scrapeRecentArticle: scrapeRecentArticle,
  generateEmail: generateEmail,
  BANNED_PHRASES: BANNED_PHRASES,
  FROM_NAME: FROM_NAME,
};
