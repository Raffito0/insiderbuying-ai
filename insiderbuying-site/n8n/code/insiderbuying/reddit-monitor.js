'use strict';

// Fetch polyfill for n8n sandbox
const _https = require('https');
const _http = require('http');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// W9 Reddit Monitoring
// ---------------------------------------------------------------------------

var SUBREDDITS = [
  'wallstreetbets',
  'stocks',
  'investing',
  'SecurityAnalysis',
  'stockmarket',
];

var SEARCH_KEYWORDS = [
  'insider buying',
  'insider selling',
  'SEC filing',
  'Form 4',
  'insider trading',
  'insider purchase',
  'officer bought',
  'director bought',
  'CEO bought shares',
  'insider activity',
];

var CAT5_SUBREDDITS = ['stocks', 'investing', 'ValueInvesting'];

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

var NOCODB_BASE_URL = process.env.NOCODB_BASE_URL || 'http://nocodb:8080';
var NOCODB_TOKEN = process.env.NOCODB_TOKEN || '';
var NOCODB_PROJECT_ID = process.env.NOCODB_PROJECT_ID || '';
var REDDIT_CLIENT_ID = process.env.REDDIT_CLIENT_ID || '';
var REDDIT_CLIENT_SECRET = process.env.REDDIT_CLIENT_SECRET || '';
var REDDIT_REFRESH_TOKEN = process.env.REDDIT_REFRESH_TOKEN || '';

// ---------------------------------------------------------------------------
// HTTP helper (n8n sandbox-compatible)
// ---------------------------------------------------------------------------

function _httpFetch(url, opts) {
  return new Promise(function(resolve, reject) {
    var parsedUrl = new URL(url);
    var lib = parsedUrl.protocol === 'https:' ? _https : _http;
    var method = (opts && opts.method) || 'GET';
    var headers = (opts && opts.headers) ? Object.assign({}, opts.headers) : {};
    var body = (opts && opts.body) || null;
    if (body && !headers['Content-Length']) {
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    var reqOpts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + (parsedUrl.search || ''),
      method: method,
      headers: headers,
    };
    var req = lib.request(reqOpts, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        var status = res.statusCode;
        var bodyText = data;
        resolve({
          status: status,
          ok: status >= 200 && status < 300,
          json: function() { try { return JSON.parse(bodyText); } catch (e) { return {}; } },
          text: function() { return bodyText; },
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Test seams
// ---------------------------------------------------------------------------

var _deps = { fetch: _httpFetch };
function _setDeps(overrides) { _deps = overrides || { fetch: _httpFetch }; }

var _nowFn = function() { return new Date(); };
function _setNow(fn) { _nowFn = fn || function() { return new Date(); }; }
function _now() { return _nowFn(); }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns an ISO week key like "2026-W13" for the given date.
 */
function getISOWeekKey(date) {
  var d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  var yearStart = new Date(d.getFullYear(), 0, 1);
  var week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return d.getFullYear() + '-W' + String(week).padStart(2, '0');
}

/**
 * Returns "YYYY-MM-DD" for the given date in EST (America/New_York).
 */
function getESTDateString(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
}

// ---------------------------------------------------------------------------
// NocoDB state helpers
// ---------------------------------------------------------------------------

async function getState(key) {
  try {
    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
      + '/Reddit_State?where=(key,eq,' + encodeURIComponent(key) + ')&limit=1';
    var r = await _deps.fetch(url, { headers: { 'xc-token': NOCODB_TOKEN } });
    if (r.status === 200) {
      var data = r.json();
      var items = (data && data.list) ? data.list : [];
      if (items.length > 0 && items[0].value !== undefined) {
        try { return JSON.parse(items[0].value); } catch (_) { return items[0].value; }
      }
    }
    return null;
  } catch (_) { return null; }
}

async function setState(key, value) {
  try {
    var serialized = typeof value === 'string' ? value : JSON.stringify(value);
    var checkUrl = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
      + '/Reddit_State?where=(key,eq,' + encodeURIComponent(key) + ')&limit=1';
    var checkR = await _deps.fetch(checkUrl, { headers: { 'xc-token': NOCODB_TOKEN } });
    var checkData = (checkR.status === 200) ? checkR.json() : { list: [] };
    var existing = ((checkData && checkData.list) || [])[0];
    if (existing && existing.Id) {
      var patchUrl = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
        + '/Reddit_State/' + existing.Id;
      await _deps.fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: serialized }),
      });
    } else {
      var postUrl2 = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
        + '/Reddit_State';
      await _deps.fetch(postUrl2, {
        method: 'POST',
        headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: key, value: serialized }),
      });
    }
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Reddit auth
// ---------------------------------------------------------------------------

async function getRedditToken() {
  try {
    var cached = await getState('reddit_token');
    if (cached && cached.access_token && cached.expires_at > Date.now()) {
      return cached.access_token;
    }
  } catch (_) {}

  try {
    var creds = Buffer.from(REDDIT_CLIENT_ID + ':' + REDDIT_CLIENT_SECRET).toString('base64');
    var r = await _deps.fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + creds,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'EarlyInsider/1.0',
      },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(REDDIT_REFRESH_TOKEN),
    });
    if (r.status === 200) {
      var data = r.json();
      if (data && data.access_token) {
        await setState('reddit_token', {
          access_token: data.access_token,
          expires_at: Date.now() + ((data.expires_in || 3600) * 1000),
        });
        return data.access_token;
      }
    }
  } catch (_) {}

  return '';
}

// ---------------------------------------------------------------------------
// Skip day check
// ---------------------------------------------------------------------------

async function shouldSkipToday() {
  try {
    var stored = await getState('week_skip_days');
    if (!stored || !Array.isArray(stored.days)) return { skip: false };
    var dayOfWeek = _now().getDay();
    return { skip: stored.days.indexOf(dayOfWeek) !== -1 };
  } catch (_) { return { skip: false }; }
}

// ---------------------------------------------------------------------------
// Job scheduling stub
// ---------------------------------------------------------------------------

async function scheduleThreadReply(commentName, subreddit, threadName) {
  try {
    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID + '/Scheduled_Jobs';
    await _deps.fetch(url, {
      method: 'POST',
      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_type: 'reddit_thread_reply',
        comment_name: commentName,
        subreddit: subreddit,
        thread_name: threadName,
        status: 'pending',
        created_at: new Date().toISOString(),
      }),
    });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Reddit_Log helper
// ---------------------------------------------------------------------------

async function _logToRedditLog(postUrl, subreddit, text, status) {
  try {
    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID + '/Reddit_Log';
    await _deps.fetch(url, {
      method: 'POST',
      headers: { 'xc-token': NOCODB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        post_url: postUrl || '',
        subreddit: subreddit || '',
        comment_text: text || '',
        status: status || 'posted',
        posted_at: new Date().toISOString(),
      }),
    });
  } catch (_) {}
}

// ---------------------------------------------------------------------------
// Filings data fetch
// ---------------------------------------------------------------------------

async function _fetchFilingsForPeriod(days) {
  try {
    var cutoff = new Date(_now().getTime() - days * 86400000).toISOString().split('T')[0];
    var url = NOCODB_BASE_URL + '/api/v1/db/data/noco/' + NOCODB_PROJECT_ID
      + '/Insider_Filings?where=(date,gte,' + cutoff + ')&sort=-value_usd&limit=10';
    var r = await _deps.fetch(url, { headers: { 'xc-token': NOCODB_TOKEN } });
    if (r.status === 200) {
      var data = r.json();
      return (data && data.list) ? data.list : [];
    }
  } catch (_) {}
  return [];
}

// ---------------------------------------------------------------------------
// Section 00 stubs — existing helpers
// ---------------------------------------------------------------------------

/**
 * Combine SEARCH_KEYWORDS with recent ticker names for Reddit search queries.
 */
function buildSearchQueries(recentTickers) {
  var queries = SEARCH_KEYWORDS.slice();

  if (recentTickers && Array.isArray(recentTickers)) {
    recentTickers.forEach(function(ticker) {
      if (ticker && typeof ticker === 'string') {
        queries.push('$' + ticker + ' insider');
        queries.push(ticker + ' insider buying');
      }
    });
  }

  return queries;
}

/**
 * Filter posts by minimum score.
 */
function filterByScore(posts, minScore) {
  if (!posts || !Array.isArray(posts)) return [];
  var threshold = (typeof minScore === 'number') ? minScore : 7;

  return posts.filter(function(post) {
    return post && (post.score || 0) >= threshold;
  });
}

/**
 * Build Claude prompt for drafting a Reddit comment.
 */
function draftComment(post, insiderData) {
  var postTitle = (post && post.title) || '';
  var postBody = (post && post.selftext) || '';
  var subreddit = (post && post.subreddit) || '';

  var ticker = (insiderData && insiderData.ticker) || '';
  var insider = (insiderData && insiderData.insider_name) || '';
  var txType = (insiderData && insiderData.transaction_type) || 'purchased';
  var shares = (insiderData && insiderData.shares) || 0;
  var value = (insiderData && insiderData.value_usd) || 0;
  var date = (insiderData && insiderData.date) || '';

  var dataContext = '';
  if (ticker) {
    dataContext = 'Relevant insider data: ' + insider + ' ' + txType + ' '
      + shares.toLocaleString() + ' shares of $' + ticker;
    if (value > 0) {
      dataContext += ' worth $' + value.toLocaleString();
    }
    if (date) {
      dataContext += ' on ' + date;
    }
    dataContext += '.';
  }

  var prompt = 'You are a knowledgeable retail investor who closely follows SEC insider filings. '
    + 'Write a Reddit comment for r/' + subreddit + ' in response to this post:\n\n'
    + 'Title: "' + postTitle + '"\n'
    + (postBody ? 'Body: "' + postBody.slice(0, 500) + '"\n' : '')
    + '\n'
    + (dataContext ? dataContext + '\n\n' : '')
    + 'RULES:\n'
    + '- 80% genuine value (share the insider data as your own DD/research)\n'
    + '- 20% soft organic (naturally position yourself as someone who tracks this data)\n'
    + '- ABSOLUTELY NO brand names (never mention InsiderBuying, EarlyInsider, or any website)\n'
    + '- ABSOLUTELY NO links or URLs\n'
    + '- Sound like a real Reddit user, match r/' + subreddit + ' tone\n'
    + '- 3-5 sentences only\n'
    + '- If you mention insider filing data, present it as something you found in SEC filings yourself\n'
    + '- Do not say "I track insider buying" or anything that sounds like a pitch\n\n'
    + 'Comment:';

  return {
    prompt: prompt,
    maxTokens: 200,
  };
}

/**
 * Validate a drafted comment before posting.
 */
function validateComment(text) {
  var issues = [];

  if (!text || typeof text !== 'string') {
    return { valid: false, issues: ['Comment text is empty'] };
  }

  var urlPattern = /https?:\/\/|www\.|\.com|\.io|\.ai|\.org|\.net/i;
  if (urlPattern.test(text)) {
    issues.push('Contains a URL or domain name');
  }

  var brandNames = ['InsiderBuying', 'EarlyInsider', 'earlyinsider.com', 'insiderbuying.ai'];
  brandNames.forEach(function(brand) {
    if (text.toLowerCase().indexOf(brand.toLowerCase()) !== -1) {
      issues.push('Contains brand name: ' + brand);
    }
  });

  var sentences = text.split('. ').filter(function(s) {
    return s.trim().length > 0;
  });
  if (sentences.length < 3) {
    issues.push('Too few sentences (got ' + sentences.length + ', need 3-5)');
  }
  if (sentences.length > 5) {
    issues.push('Too many sentences (got ' + sentences.length + ', need 3-5)');
  }

  return {
    valid: issues.length === 0,
    issues: issues,
  };
}

/**
 * Build NocoDB record for Reddit_Log table.
 */
function logComment(postUrl, subreddit, text, status) {
  return {
    post_url: postUrl || '',
    subreddit: subreddit || '',
    comment_text: text || '',
    status: status || 'posted',
    posted_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Section 04 — CAT 5 Daily Thread
// ---------------------------------------------------------------------------

async function getDailyThreadTarget() {
  var stored = await getState('daily_thread_sub_index');
  var index = typeof stored === 'number' ? stored : 0;
  var subreddit = CAT5_SUBREDDITS[index % CAT5_SUBREDDITS.length];
  await setState('daily_thread_sub_index', (index + 1) % CAT5_SUBREDDITS.length);
  return subreddit;
}

async function shouldPostDailyThread() {
  var now = _now();
  // Derive weekday in EST — n8n VPS runs UTC so getDay() would be UTC
  var estStr = getESTDateString(now); // "YYYY-MM-DD" in EST
  var parts = estStr.split('-');
  var estUtc = new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]));
  var dayOfWeek = estUtc.getUTCDay(); // 0=Sun, 6=Sat, timezone-safe
  if (dayOfWeek === 0 || dayOfWeek === 6) return { post: false };

  var skipResult = await shouldSkipToday();
  if (skipResult.skip) return { post: false };

  var isWeekendRecap = dayOfWeek === 1; // Monday
  return { post: true, isWeekendRecap: isWeekendRecap };
}

async function findDailyDiscussionThread(subreddit) {
  var token = await getRedditToken();
  var now = _now();
  var todayEST = getESTDateString(now);

  function isToday(created_utc) {
    return getESTDateString(new Date(created_utc * 1000)) === todayEST;
  }

  function isDailyThread(title) {
    return /daily\s*(discussion|thread)/i.test(title);
  }

  var headers = { 'Authorization': 'Bearer ' + token, 'User-Agent': 'EarlyInsider/1.0' };

  // Layer 1: sticky 1
  try {
    var r1 = await _deps.fetch(
      'https://oauth.reddit.com/r/' + subreddit + '/about/sticky?num=1',
      { headers: headers }
    );
    if (r1.status === 200) {
      var d1 = r1.json().data;
      if (d1 && isDailyThread(d1.title) && isToday(d1.created_utc)) return d1;
    }
  } catch (_) {}

  // Layer 2: sticky 2
  try {
    var r2 = await _deps.fetch(
      'https://oauth.reddit.com/r/' + subreddit + '/about/sticky?num=2',
      { headers: headers }
    );
    if (r2.status === 200) {
      var d2 = r2.json().data;
      if (d2 && isDailyThread(d2.title) && isToday(d2.created_utc)) return d2;
    }
  } catch (_) {}

  // Layer 3: hot posts
  try {
    var r3 = await _deps.fetch(
      'https://oauth.reddit.com/r/' + subreddit + '/hot?limit=5',
      { headers: headers }
    );
    if (r3.status === 200) {
      var posts3 = r3.json().data.children.map(function(c) { return c.data; });
      var match3 = posts3.find(function(p) { return isDailyThread(p.title) && isToday(p.created_utc); });
      if (match3) return match3;
    }
  } catch (_) {}

  // Layer 4: search (last resort, may lag 2+ hours)
  try {
    var q = encodeURIComponent('Daily Discussion');
    var r4 = await _deps.fetch(
      'https://oauth.reddit.com/r/' + subreddit + '/search?q=' + q + '&sort=new&restrict_sr=1&limit=10',
      { headers: headers }
    );
    if (r4.status === 200) {
      var posts4 = r4.json().data.children.map(function(c) { return c.data; });
      var match4 = posts4.find(function(p) { return isDailyThread(p.title) && isToday(p.created_utc); });
      if (match4) return match4;
    }
  } catch (_) {}

  return null;
}

function _formatDollar(usd) {
  if (usd >= 1000000) return '$' + (usd / 1000000).toFixed(1) + 'M';
  if (usd >= 1000) return '$' + (usd / 1000).toFixed(0) + 'K';
  return '$' + usd;
}

var CAT5_TEMPLATES = [
  // 0: notable_buys
  function(data) {
    if (!data.filings || data.filings.length === 0) {
      return 'No notable insider buying activity in the last trading session.';
    }
    var lines = data.filings.slice(0, 4).map(function(f) {
      return '- **$' + f.ticker + '** — ' + f.role + ' bought ' + _formatDollar(f.value_usd) + ' on ' + f.date;
    }).join('\n');
    return '**Notable insider buying ' + (data.period || 'yesterday') + ':**\n\n'
      + lines + '\n\nForm 4 data via SEC EDGAR. Make of it what you will.';
  },
  // 1: confidence_index
  function(data) {
    var count = data.filings ? data.filings.length : 0;
    var topFiling = data.filings && data.filings[0];
    var topLine = topFiling
      ? 'Top filing: ' + topFiling.role + ' at $' + topFiling.ticker + ' — ' + _formatDollar(topFiling.value_usd)
      : 'No standout filing.';
    return '**Insider Confidence Index — ' + (data.period || 'yesterday') + ':** '
      + count + ' significant Form 4 purchases filed.\n\n'
      + topLine + '\n\nHigher count = more executives putting their own money in.';
  },
  // 2: unusual_activity
  function(data) {
    if (!data.filings || data.filings.length === 0) {
      return 'No unusual insider activity patterns detected in recent filings.';
    }
    var top = data.filings[0];
    return '**Unusual Form 4 pattern flagged — $' + top.ticker + ':** '
      + top.role + ' (' + top.insider_name + ') purchased '
      + _formatDollar(top.value_usd) + ' on ' + top.date
      + '. This represents an unusual cluster relative to baseline.'
      + ' Worth watching price action over the next 30 days.';
  },
];

function buildDailyThreadComment(data, templateIndex) {
  var fn = CAT5_TEMPLATES[templateIndex % 3];
  return fn(data);
}

async function postDailyThread() {
  var shouldPost = await shouldPostDailyThread();
  if (!shouldPost.post) { console.log('[CAT5] no post today'); return; }

  var subreddit = await getDailyThreadTarget();

  var thread = await findDailyDiscussionThread(subreddit);
  if (!thread) {
    console.log('[CAT5] no daily thread found for ' + subreddit + ' — skipping');
    return;
  }

  var period = shouldPost.isWeekendRecap ? 'Fri-Sun' : 'yesterday';
  var filings = await _fetchFilingsForPeriod(shouldPost.isWeekendRecap ? 3 : 1);

  var storedIndex = await getState('daily_thread_template_index');
  var templateIndex = typeof storedIndex === 'number' ? storedIndex : 0;
  await setState('daily_thread_template_index', (templateIndex + 1) % 3);

  var commentText = buildDailyThreadComment({ filings: filings, period: period }, templateIndex);

  var token = await getRedditToken();
  var res = await _deps.fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'EarlyInsider/1.0',
    },
    body: 'thing_id=' + encodeURIComponent(thread.name) + '&text=' + encodeURIComponent(commentText),
  });

  var result = res.json();
  var comment = result && result.json && result.json.data && result.json.data.things
    && result.json.data.things[0] && result.json.data.things[0].data;
  if (!comment) {
    console.warn('[CAT5] Reddit post comment returned no data — skipping');
    return;
  }

  await _logToRedditLog(
    thread.url || ('https://www.reddit.com/r/' + subreddit),
    subreddit,
    commentText,
    'posted'
  );
  await scheduleThreadReply(comment.name, subreddit, thread.name);

  console.log('[CAT5] posted to ' + subreddit + ' daily thread, comment ' + comment.name);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  SUBREDDITS: SUBREDDITS,
  SEARCH_KEYWORDS: SEARCH_KEYWORDS,
  CAT5_SUBREDDITS: CAT5_SUBREDDITS,

  // Original helpers
  buildSearchQueries: buildSearchQueries,
  filterByScore: filterByScore,
  draftComment: draftComment,
  validateComment: validateComment,
  logComment: logComment,

  // Test seams
  _setDeps: _setDeps,
  _setNow: _setNow,

  // Utility (exported for test helpers)
  getISOWeekKey: getISOWeekKey,
  getESTDateString: getESTDateString,

  // State helpers
  getState: getState,
  setState: setState,
  shouldSkipToday: shouldSkipToday,
  getRedditToken: getRedditToken,
  scheduleThreadReply: scheduleThreadReply,

  // Section 04 — CAT 5
  getDailyThreadTarget: getDailyThreadTarget,
  shouldPostDailyThread: shouldPostDailyThread,
  findDailyDiscussionThread: findDailyDiscussionThread,
  buildDailyThreadComment: buildDailyThreadComment,
  postDailyThread: postDailyThread,
};
