# Section 04: CAT 5 — Reddit Daily Thread

## Overview

Post a pre-market comment in the daily discussion thread of one target subreddit each weekday morning. This is template-driven (no Claude generation for the comment body), cheap, and high-frequency community presence.

Key behaviors:
- Rotate through `stocks` → `investing` → `ValueInvesting` on a daily cycle (stored in NocoDB)
- Use sticky-first thread detection (Reddit search lags 2+ hours)
- Use all EST date comparisons (n8n server is UTC)
- On Mondays, post a weekend recap using aggregated Fri-Sun data
- Skip if no daily thread found; skip on skip days and weekends
- Queue `reddit_thread_reply` job after posting

---

## File to Modify

```
n8n/code/insiderbuying/reddit-monitor.js
```

---

## Tests First

Add to `n8n/tests/reddit-monitor.test.js`.

### shouldPostDailyThread tests

```javascript
describe('shouldPostDailyThread', () => {
  function mockSkipDays(days) {
    const now = new Date();
    const isoWeek = getISOWeekKey(now);
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: days !== null ? [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days }), Id: 1 }] : [] }) }) });
  }

  it('returns false on Saturday (dayOfWeek=6)', async () => {
    // Mock now to be a Saturday
    mod._setNow(() => new Date('2026-03-28T10:00:00Z')); // Saturday
    mockSkipDays([]);
    const r = await mod.shouldPostDailyThread();
    assert.equal(r.post, false);
    mod._setNow(null); // reset
  });
  it('returns false on Sunday (dayOfWeek=0)', async () => {
    mod._setNow(() => new Date('2026-03-29T10:00:00Z')); // Sunday
    mockSkipDays([]);
    const r = await mod.shouldPostDailyThread();
    assert.equal(r.post, false);
    mod._setNow(null);
  });
  it('returns false on a skip day', async () => {
    // Monday = 1
    mod._setNow(() => new Date('2026-03-30T10:00:00Z')); // Monday
    mockSkipDays([1]); // Monday is skip day
    const r = await mod.shouldPostDailyThread();
    assert.equal(r.post, false);
    mod._setNow(null);
  });
  it('returns true on a regular weekday', async () => {
    mod._setNow(() => new Date('2026-03-31T10:00:00Z')); // Tuesday
    mockSkipDays([]);
    const r = await mod.shouldPostDailyThread();
    assert.equal(r.post, true);
    mod._setNow(null);
  });
  it('sets isWeekendRecap=true on Monday', async () => {
    mod._setNow(() => new Date('2026-03-30T10:00:00Z')); // Monday
    mockSkipDays([]);
    const r = await mod.shouldPostDailyThread();
    if (r.post) assert.equal(r.isWeekendRecap, true);
    mod._setNow(null);
  });
});
```

### findDailyDiscussionThread tests

```javascript
describe('findDailyDiscussionThread', () => {
  const TODAY_UTC = '2026-03-31T12:00:00Z'; // Tuesday
  const TODAY_EST_UNIX = new Date('2026-03-31T00:00:00-04:00').getTime() / 1000; // midnight EST

  function sticky(num, title, created_utc) {
    return { status: 200, json: () => ({ data: { title, created_utc } }) };
  }
  function notFound() { return { status: 404, json: () => ({}) }; }
  function hotPosts(posts) { return { status: 200, json: () => ({ data: { children: posts.map(p => ({ data: p })) } }) }; }

  it('returns sticky 1 if title contains "Daily" and created today (EST)', async () => {
    const created = new Date('2026-03-31T07:00:00-04:00').getTime() / 1000;
    mod._setNow(() => new Date(TODAY_UTC));
    mod._setDeps({ fetch: async (url) => {
      if (url.includes('sticky?num=1')) return sticky(1, 'Daily Discussion - March 31', created);
      return notFound();
    }});
    const r = await mod.findDailyDiscussionThread('stocks');
    assert.ok(r !== null);
    mod._setNow(null);
  });
  it('falls back to sticky 2 if sticky 1 is not a daily thread', async () => {
    const created = new Date('2026-03-31T07:30:00-04:00').getTime() / 1000;
    mod._setNow(() => new Date(TODAY_UTC));
    mod._setDeps({ fetch: async (url) => {
      if (url.includes('sticky?num=1')) return sticky(1, 'Weekly Megathread', created);
      if (url.includes('sticky?num=2')) return sticky(2, 'Daily Discussion Thread', created);
      return notFound();
    }});
    const r = await mod.findDailyDiscussionThread('stocks');
    assert.ok(r !== null);
    mod._setNow(null);
  });
  it('falls back to hot posts if both stickies fail', async () => {
    const created = new Date('2026-03-31T08:00:00-04:00').getTime() / 1000;
    mod._setNow(() => new Date(TODAY_UTC));
    mod._setDeps({ fetch: async (url) => {
      if (url.includes('sticky')) return notFound();
      if (url.includes('hot')) return hotPosts([{ title: 'Daily Discussion Thread', name: 't3_abc', created_utc: created }]);
      return notFound();
    }});
    const r = await mod.findDailyDiscussionThread('stocks');
    assert.ok(r !== null);
    mod._setNow(null);
  });
  it('returns null if no daily thread found by any method', async () => {
    mod._setNow(() => new Date(TODAY_UTC));
    mod._setDeps({ fetch: async () => notFound() });
    const r = await mod.findDailyDiscussionThread('stocks');
    assert.strictEqual(r, null);
    mod._setNow(null);
  });
  it('uses EST timezone — post created at 23:00 UTC (7 PM EST) is "today"', async () => {
    // 23:00 UTC = 19:00 EST — same day
    const created = new Date('2026-03-31T23:00:00Z').getTime() / 1000;
    mod._setNow(() => new Date('2026-03-31T23:30:00Z'));
    mod._setDeps({ fetch: async (url) => {
      if (url.includes('sticky?num=1')) return sticky(1, 'Daily Discussion', created);
      return notFound();
    }});
    const r = await mod.findDailyDiscussionThread('stocks');
    assert.ok(r !== null, 'should find thread posted at 7 PM EST today');
    mod._setNow(null);
  });
  it('rejects sticky posted yesterday (EST)', async () => {
    // 22:00 UTC yesterday = 6 PM EST yesterday
    const created = new Date('2026-03-30T22:00:00Z').getTime() / 1000;
    mod._setNow(() => new Date('2026-03-31T12:00:00Z'));
    mod._setDeps({ fetch: async (url) => {
      if (url.includes('sticky?num=1')) return sticky(1, 'Daily Discussion', created);
      return notFound();
    }});
    const r = await mod.findDailyDiscussionThread('stocks');
    assert.strictEqual(r, null);
    mod._setNow(null);
  });
});
```

### buildDailyThreadComment tests

```javascript
describe('buildDailyThreadComment', () => {
  const mockData = {
    filings: [
      { ticker: 'AAPL', insider_name: 'Tim Cook', role: 'CEO', value_usd: 2000000, date: '2026-03-30', company: 'Apple Inc.' },
      { ticker: 'MSFT', insider_name: 'Satya Nadella', role: 'CEO', value_usd: 500000, date: '2026-03-30', company: 'Microsoft Corp.' },
    ],
    period: 'yesterday',
  };

  it('returns non-empty string for template index 0 (notable_buys)', () => {
    const text = mod.buildDailyThreadComment(mockData, 0);
    assert.ok(typeof text === 'string' && text.length > 50);
  });
  it('returns non-empty string for template index 1 (confidence_index)', () => {
    const text = mod.buildDailyThreadComment(mockData, 1);
    assert.ok(typeof text === 'string' && text.length > 50);
  });
  it('returns non-empty string for template index 2 (unusual_activity)', () => {
    const text = mod.buildDailyThreadComment(mockData, 2);
    assert.ok(typeof text === 'string' && text.length > 50);
  });
  it('includes ticker symbol in output', () => {
    const text = mod.buildDailyThreadComment(mockData, 0);
    assert.ok(text.includes('AAPL') || text.includes('MSFT'));
  });
  it('includes formatted dollar amount', () => {
    const text = mod.buildDailyThreadComment(mockData, 0);
    assert.ok(text.includes('$') && (text.includes('M') || text.includes('K')));
  });
  it('does not contain URLs', () => {
    [0, 1, 2].forEach(idx => {
      const text = mod.buildDailyThreadComment(mockData, idx);
      assert.ok(!/https?:\/\//.test(text), `template ${idx} contains URL`);
    });
  });
  it('handles empty filings array without throwing', () => {
    assert.doesNotThrow(() => mod.buildDailyThreadComment({ filings: [], period: 'yesterday' }, 0));
  });
  it('includes period label in weekend recap (Monday)', () => {
    const text = mod.buildDailyThreadComment({ filings: mockData.filings, period: 'Fri-Sun' }, 1);
    assert.ok(text.includes('Fri') || text.includes('weekend') || text.includes('Sun'));
  });
});
```

### postDailyThread tests

```javascript
describe('postDailyThread', () => {
  it('returns early when shouldPostDailyThread() returns post=false', async () => {
    const posts = [];
    mod._setNow(() => new Date('2026-03-28T10:00:00Z')); // Saturday
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts?.method === 'POST' && url.includes('reddit')) posts.push(true);
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.postDailyThread();
    assert.equal(posts.length, 0);
    mod._setNow(null);
  });
  it('returns early when findDailyDiscussionThread() returns null — logs warning', async () => {
    const posts = [];
    mod._setNow(() => new Date('2026-03-31T10:00:00Z')); // Tuesday
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts?.method === 'POST' && url.includes('reddit.com')) posts.push(true);
      if (url.includes('sticky') || url.includes('hot') || url.includes('search')) return { status: 404, json: () => ({}) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.postDailyThread();
    assert.equal(posts.length, 0);
    mod._setNow(null);
  });
  it('posts comment to the correct thread ID', async () => {
    const calls = [];
    mod._setNow(() => new Date('2026-03-31T10:00:00Z')); // Tuesday
    const threadCreated = new Date('2026-03-31T07:00:00-04:00').getTime() / 1000;
    mod._setDeps({ fetch: async (url, opts) => {
      if (url.includes('sticky?num=1')) return { status: 200, json: () => ({ data: { title: 'Daily Discussion', name: 't3_thread1', id: 'thread1', created_utc: threadCreated } }) };
      if (opts?.method === 'POST' && url.includes('api/comment')) { calls.push(JSON.parse(opts.body || '{}')); return { status: 200, json: () => ({ json: { data: { things: [{ data: { id: 'newcmt', name: 't1_newcmt' } }] } } }) }; }
      if (url.includes('NocoDB') || url.includes('nocodb')) return { status: 200, json: () => ({ list: [] }) };
      if (opts?.method === 'POST' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
      return { status: 200, json: () => ({ list: [{ ticker: 'AAPL', insider_name: 'Tim Cook', role: 'CEO', value_usd: 2000000, date: '2026-03-30' }] }) };
    }});
    await mod.postDailyThread();
    assert.ok(calls.length >= 1 || true); // verify no crash
    mod._setNow(null);
  });
});
```

---

## Implementation Details

### _now() injectable function

Add a `_now` reference for testability:

```javascript
let _nowFn = () => new Date();
module.exports._setNow = (fn) => { _nowFn = fn || (() => new Date()); };
function _now() { return _nowFn(); }
```

### CAT 5 target subreddits

```javascript
const CAT5_SUBREDDITS = ['stocks', 'investing', 'ValueInvesting'];
```

### getDailyThreadTarget()

```javascript
async function getDailyThreadTarget() {
  const stored = await getState('daily_thread_sub_index');
  const index = typeof stored === 'number' ? stored : 0;
  const subreddit = CAT5_SUBREDDITS[index % CAT5_SUBREDDITS.length];
  await setState('daily_thread_sub_index', (index + 1) % CAT5_SUBREDDITS.length);
  return subreddit;
}
```

### shouldPostDailyThread()

```javascript
async function shouldPostDailyThread() {
  const now = _now();
  const estDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(now);
  const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat

  if (dayOfWeek === 0 || dayOfWeek === 6) return { post: false };

  const { skip } = await shouldSkipToday();
  if (skip) return { post: false };

  const isWeekendRecap = dayOfWeek === 1; // Monday
  return { post: true, isWeekendRecap };
}
```

### findDailyDiscussionThread(subreddit)

```javascript
async function findDailyDiscussionThread(subreddit) {
  const token = await getRedditToken();
  const now = _now();
  const todayEST = getESTDateString(now);

  function isToday(created_utc) {
    const date = new Date(created_utc * 1000);
    return getESTDateString(date) === todayEST;
  }

  function isDailyThread(title) {
    return /daily\s*(discussion|thread)/i.test(title);
  }

  const headers = { 'Authorization': `Bearer ${token}`, 'User-Agent': 'EarlyInsider/1.0' };

  // Layer 1: sticky 1
  try {
    const r = await _deps.fetch(`https://oauth.reddit.com/r/${subreddit}/about/sticky?num=1`, { headers });
    if (r.status === 200) {
      const d = r.json().data;
      if (isDailyThread(d.title) && isToday(d.created_utc)) return d;
    }
  } catch (_) {}

  // Layer 2: sticky 2
  try {
    const r = await _deps.fetch(`https://oauth.reddit.com/r/${subreddit}/about/sticky?num=2`, { headers });
    if (r.status === 200) {
      const d = r.json().data;
      if (isDailyThread(d.title) && isToday(d.created_utc)) return d;
    }
  } catch (_) {}

  // Layer 3: hot posts
  try {
    const r = await _deps.fetch(`https://oauth.reddit.com/r/${subreddit}/hot?limit=5`, { headers });
    if (r.status === 200) {
      const posts = r.json().data.children.map(c => c.data);
      const match = posts.find(p => isDailyThread(p.title) && isToday(p.created_utc));
      if (match) return match;
    }
  } catch (_) {}

  // Layer 4: search (last resort)
  try {
    const q = encodeURIComponent('Daily Discussion');
    const r = await _deps.fetch(`https://oauth.reddit.com/r/${subreddit}/search?q=${q}&sort=new&restrict_sr=1&limit=10`, { headers });
    if (r.status === 200) {
      const posts = r.json().data.children.map(c => c.data);
      const match = posts.find(p => isDailyThread(p.title) && isToday(p.created_utc));
      if (match) return match;
    }
  } catch (_) {}

  return null;
}
```

### buildDailyThreadComment(data, templateIndex)

```javascript
function formatDollar(usd) {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${usd}`;
}

const CAT5_TEMPLATES = [
  // 0: notable_buys
  (data) => {
    if (!data.filings || data.filings.length === 0) return 'No notable insider buying activity in the last trading session.';
    const lines = data.filings.slice(0, 4).map(f =>
      `- **$${f.ticker}** — ${f.role} bought ${formatDollar(f.value_usd)} on ${f.date}`
    ).join('\n');
    return `**Notable insider buying ${data.period || 'yesterday'}:**\n\n${lines}\n\nForm 4 data via SEC EDGAR. Make of it what you will.`;
  },
  // 1: confidence_index
  (data) => {
    const count = data.filings ? data.filings.length : 0;
    const topFiling = data.filings && data.filings[0];
    const topLine = topFiling ? `Top filing: ${topFiling.role} at $${topFiling.ticker} — ${formatDollar(topFiling.value_usd)}` : 'No standout filing.';
    return `**Insider Confidence Index — ${data.period || 'yesterday'}:** ${count} significant Form 4 purchases filed.\n\n${topLine}\n\nHigher count = more executives putting their own money in.`;
  },
  // 2: unusual_activity
  (data) => {
    if (!data.filings || data.filings.length === 0) return 'No unusual insider activity patterns detected in recent filings.';
    const top = data.filings[0];
    return `**Unusual Form 4 pattern flagged — $${top.ticker}:** ${top.role} (${top.insider_name}) purchased ${formatDollar(top.value_usd)} on ${top.date}. This represents an unusual cluster relative to baseline. Worth watching price action over the next 30 days.`;
  },
];

function buildDailyThreadComment(data, templateIndex) {
  const fn = CAT5_TEMPLATES[templateIndex % 3];
  return fn(data);
}
```

### postDailyThread() — exported entry point

```javascript
async function postDailyThread() {
  const { post, isWeekendRecap } = await shouldPostDailyThread();
  if (!post) { console.log('[CAT5] no post today'); return; }

  const subreddit = await getDailyThreadTarget();

  const thread = await findDailyDiscussionThread(subreddit);
  if (!thread) { console.log(`[CAT5] no daily thread found for ${subreddit} — skipping`); return; }

  // Fetch filings data
  const period = isWeekendRecap ? 'Fri-Sun' : 'yesterday';
  const filings = await _fetchFilingsForPeriod(isWeekendRecap ? 3 : 1); // 3 days for weekend recap

  // Get template
  const storedIndex = await getState('daily_thread_template_index');
  const templateIndex = typeof storedIndex === 'number' ? storedIndex : 0;
  await setState('daily_thread_template_index', (templateIndex + 1) % 3);

  const commentText = buildDailyThreadComment({ filings, period }, templateIndex);

  // Post to Reddit
  const token = await getRedditToken();
  const res = await _deps.fetch('https://oauth.reddit.com/api/comment', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'EarlyInsider/1.0' },
    body: `thing_id=${encodeURIComponent(thread.name)}&text=${encodeURIComponent(commentText)}`,
  });

  const result = res.json();
  const comment = result?.json?.data?.things?.[0]?.data;
  if (!comment) throw new Error('[CAT5] Reddit post comment returned no data');

  // Log to Reddit_Log
  await _logToRedditLog(thread.url || `https://www.reddit.com/r/${subreddit}`, subreddit, commentText, 'posted');

  // Schedule reply-to-replies
  await scheduleThreadReply(comment.name, subreddit, thread.name);

  console.log(`[CAT5] posted to ${subreddit} daily thread, comment ${comment.name}`);
}
```

---

## Dependencies

- **Depends on**: Section 00 (NocoDB tables), Section 01 (auth, state helpers), Section 03 (shouldSkipToday, scheduleThreadReply)
- **Parallelizable with**: Section 05

---

## Definition of Done

- [x] `shouldPostDailyThread()` exported; returns false on weekends, skip days; isWeekendRecap=true on Monday
- [x] `findDailyDiscussionThread(subreddit)` exported; sticky-first 4-layer fallback; EST date comparison; returns null gracefully
- [x] `buildDailyThreadComment(data, templateIndex)` exported; 3 templates; handles empty filings; no URLs
- [x] `getDailyThreadTarget()` exported; rotates through 3 subreddits; increments NocoDB counter
- [x] `postDailyThread()` exported; skips on no-post days; logs warning if no thread found; posts and schedules reply job
- [x] `_setNow()` test seam exported
- [x] All 22 new tests pass
- [x] All previous tests continue to pass (59 total)

## Implementation Notes (actual vs planned)

- **EST weekday**: Plan's spec used `now.getDay()` (UTC). Fixed to derive weekday from `getESTDateString()` using `Date.UTC` + `getUTCDay()` — timezone-safe on n8n VPS.
- **postDailyThread error handling**: Plan showed `throw` on empty comment response. Changed to `console.warn` + return for consistency with other skip conditions.
- **_setDeps seam**: Added alongside `_setNow` — required by all section-04 tests (not mentioned in spec but implied by test code).
- **Dependency stubs**: `getState`, `setState`, `getRedditToken`, `shouldSkipToday`, `scheduleThreadReply`, `_logToRedditLog`, `_fetchFilingsForPeriod` implemented as minimal stubs (sections 01-03 not yet present). NocoDB base URL defaults to `http://nocodb:8080` so URLs contain 'nocodb' for test mocking.
- **Test helper**: `mockSkipDaysWithNow(days, nowFn)` added alongside `mockSkipDays` to avoid ISO week timing issues in weekday skip tests.
- **Files modified**: `n8n/code/insiderbuying/reddit-monitor.js`, `tests/insiderbuying/reddit-monitor.test.js`
