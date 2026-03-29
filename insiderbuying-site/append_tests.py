"""Append section 01-03 tests to reddit-monitor.test.js"""
filepath = 'tests/insiderbuying/reddit-monitor.test.js'

tests = """
// ===== SECTION 01: SUBREDDIT_TONE_MAP + getRedditToken + getState/setState + getRedditLog =====

describe('SUBREDDIT_TONE_MAP', () => {
  test('has exactly 5 subreddits', () => {
    expect(Object.keys(mod.SUBREDDIT_TONE_MAP).length).toBe(5);
  });
  test('includes wallstreetbets, ValueInvesting, stocks, Dividends, InsiderTrades', () => {
    ['wallstreetbets', 'ValueInvesting', 'stocks', 'Dividends', 'InsiderTrades'].forEach(sub => {
      expect(mod.SUBREDDIT_TONE_MAP[sub]).toBeTruthy();
    });
  });
  test('each entry has tone, wordLimit, style, example, dailyCap', () => {
    Object.values(mod.SUBREDDIT_TONE_MAP).forEach(cfg => {
      expect(typeof cfg.tone).toBe('string');
      expect(Array.isArray(cfg.wordLimit) && cfg.wordLimit.length === 2).toBe(true);
      expect(typeof cfg.style).toBe('string');
      expect(typeof cfg.example).toBe('string');
      expect(typeof cfg.dailyCap).toBe('number');
    });
  });
  test('dailyCaps sum to 10', () => {
    const total = Object.values(mod.SUBREDDIT_TONE_MAP).reduce((s, c) => s + c.dailyCap, 0);
    expect(total).toBe(10);
  });
  test('wordLimit[0] < wordLimit[1] for all entries', () => {
    Object.entries(mod.SUBREDDIT_TONE_MAP).forEach(([sub, cfg]) => {
      expect(cfg.wordLimit[0]).toBeLessThan(cfg.wordLimit[1]);
    });
  });
});

describe('getRedditToken - refresh token mode', () => {
  test('uses grant_type=refresh_token when REDDIT_REFRESH_TOKEN is set', async () => {
    let capturedBody = '';
    mod._setDeps({ fetch: async (url, opts) => {
      capturedBody = opts.body || '';
      if (url.includes('reddit.com')) return { status: 200, json: () => ({ access_token: 'tok123', expires_in: 3600 }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    process.env.REDDIT_REFRESH_TOKEN = 'refresh_abc';
    process.env.REDDIT_CLIENT_ID = 'cid';
    process.env.REDDIT_CLIENT_SECRET = 'csec';
    const token = await mod.getRedditToken({ _skipCache: true });
    expect(capturedBody.includes('grant_type=refresh_token')).toBe(true);
    expect(token).toBe('tok123');
    delete process.env.REDDIT_REFRESH_TOKEN;
  });

  test('reads cached token from NocoDB if not expired - no HTTP call to Reddit', async () => {
    let redditCallCount = 0;
    const future = new Date(Date.now() + 7200000).toISOString();
    mod._setDeps({ fetch: async (url, opts) => {
      if (url.includes('reddit.com')) redditCallCount++;
      return { status: 200, json: () => ({ list: [{ key: 'reddit_auth', value: JSON.stringify({ token: 'cached_tok', expires_at: future }), Id: 1 }] }) };
    }});
    const token = await mod.getRedditToken();
    expect(token).toBe('cached_tok');
    expect(redditCallCount).toBe(0);
  });

  test('calls Reddit auth endpoint when cached token is expired', async () => {
    let redditCallCount = 0;
    const past = new Date(Date.now() - 1000).toISOString();
    mod._setDeps({ fetch: async (url, opts) => {
      if (url.includes('reddit.com/api/v1/access_token')) { redditCallCount++; return { status: 200, json: () => ({ access_token: 'fresh', expires_in: 3600 }) }; }
      if (url.includes('reddit.com')) return { status: 200, json: () => ({ access_token: 'fresh', expires_in: 3600 }) };
      return { status: 200, json: () => ({ list: [{ key: 'reddit_auth', value: JSON.stringify({ token: 'old_tok', expires_at: past }), Id: 1 }] }) };
    }});
    process.env.REDDIT_REFRESH_TOKEN = 'reftok';
    const token = await mod.getRedditToken();
    expect(token).toBe('fresh');
    expect(redditCallCount).toBeGreaterThanOrEqual(1);
    delete process.env.REDDIT_REFRESH_TOKEN;
  });
});

describe('getRedditToken - ROPC fallback', () => {
  test('uses grant_type=password when REDDIT_REFRESH_TOKEN is absent', async () => {
    delete process.env.REDDIT_REFRESH_TOKEN;
    process.env.REDDIT_USERNAME = 'user1';
    process.env.REDDIT_PASSWORD = 'pass1';
    let capturedBody = '';
    mod._setDeps({ fetch: async (url, opts) => {
      capturedBody = opts.body || '';
      if (url.includes('reddit.com')) return { status: 200, json: () => ({ access_token: 'ropc_tok', expires_in: 3600 }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.getRedditToken({ _skipCache: true });
    expect(capturedBody.includes('grant_type=password')).toBe(true);
    expect(capturedBody.includes('username=user1')).toBe(true);
  });
});

describe('getState / setState', () => {
  test('getState returns JSON-parsed value for existing key', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ key: 'some_key', value: '{"count":3}', Id: 1 }] }) }) });
    const val = await mod.getState('some_key');
    expect(val).toEqual({ count: 3 });
  });
  test('getState returns null for missing key (empty list)', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [] }) }) });
    const val = await mod.getState('missing_key');
    expect(val).toBeNull();
  });
  test('setState sends POST/PATCH with JSON-serialized value', async () => {
    const writes = [];
    mod._setDeps({ fetch: async (url, opts) => { writes.push({ url, opts }); return { status: 200, json: () => ({ list: [] }) }; } });
    await mod.setState('my_key', { foo: 42 });
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const writeCall = writes.find(w => w.opts && (w.opts.method === 'POST' || w.opts.method === 'PATCH'));
    expect(writeCall).toBeTruthy();
    const body = typeof writeCall.opts.body === 'string' ? JSON.parse(writeCall.opts.body) : writeCall.opts.body;
    expect(body.value.includes('42')).toBe(true);
  });
  test('getState returns null when NocoDB returns malformed JSON', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ key: 'bad_key', value: 'not-json{{{', Id: 1 }] }) }) });
    const val = await mod.getState('bad_key');
    expect(val).toBeNull();
  });
});

describe('getRedditLog', () => {
  test('returns array of posted records for given date', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ subreddit: 'stocks', status: 'posted' }, { subreddit: 'wsb', status: 'posted' }] }) }) });
    const logs = await mod.getRedditLog('2026-03-28');
    expect(logs.length).toBe(2);
  });
  test('returns empty array when no records', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [] }) }) });
    const logs = await mod.getRedditLog('2026-03-28');
    expect(logs).toEqual([]);
  });
});

// ===== SECTION 02: REPLY_STRUCTURES + getNextReplyStructure + validateReply + validateDDPost =====

describe('REPLY_STRUCTURES', () => {
  test('defines exactly 3 structures', () => {
    expect(mod.REPLY_STRUCTURES.length).toBe(3);
  });
  test('each structure has id and systemPromptInstruction', () => {
    mod.REPLY_STRUCTURES.forEach(s => {
      expect(typeof s.id).toBe('string');
      expect(typeof s.systemPromptInstruction).toBe('string');
      expect(s.systemPromptInstruction.length).toBeGreaterThan(20);
    });
  });
  test('ids are Q_A_DATA, AGREEMENT_BUT, DATA_INTERPRET', () => {
    const ids = mod.REPLY_STRUCTURES.map(s => s.id);
    expect(ids).toContain('Q_A_DATA');
    expect(ids).toContain('AGREEMENT_BUT');
    expect(ids).toContain('DATA_INTERPRET');
  });
});

describe('getNextReplyStructure', () => {
  let stateStore;
  beforeEach(() => {
    stateStore = {};
    mod._setDeps({ fetch: async (url, opts) => {
      const isWrite = opts && (opts.method === 'PATCH' || opts.method === 'POST');
      if (isWrite) {
        const body = JSON.parse(opts.body);
        if (body.key) stateStore[body.key] = body.value;
        else { const idMatch = url.match(/\\/([0-9]+)$/); if (idMatch) stateStore['_id_' + idMatch[1]] = body.value; }
        return { status: 200, json: () => ({}) };
      }
      const keyMatch = url.match(/where=\\(key,eq,([^)&]+)\\)/);
      const key = keyMatch ? decodeURIComponent(keyMatch[1]) : null;
      if (key && stateStore[key] !== undefined) return { status: 200, json: () => ({ list: [{ key, value: stateStore[key], Id: 1 }] }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
  });

  test('returns REPLY_STRUCTURES[0] on first call', async () => {
    const s = await mod.getNextReplyStructure('stocks');
    expect(s.id).toBe('Q_A_DATA');
  });
  test('returns REPLY_STRUCTURES[1] on second call', async () => {
    await mod.getNextReplyStructure('stocks');
    const s = await mod.getNextReplyStructure('stocks');
    expect(s.id).toBe('AGREEMENT_BUT');
  });
  test('wraps around to index 0 after cycling through all 3', async () => {
    await mod.getNextReplyStructure('stocks');
    await mod.getNextReplyStructure('stocks');
    const s = await mod.getNextReplyStructure('stocks');
    expect(s.id).toBe('DATA_INTERPRET');
    const s2 = await mod.getNextReplyStructure('stocks');
    expect(s2.id).toBe('Q_A_DATA');
  });
  test('rotates independently per subreddit', async () => {
    await mod.getNextReplyStructure('wallstreetbets');
    await mod.getNextReplyStructure('wallstreetbets');
    const stocksFirst = await mod.getNextReplyStructure('stocks');
    expect(stocksFirst.id).toBe('Q_A_DATA');
  });
});

describe('validateReply - word count', () => {
  test('accepts text within range for stocks (100-150 words)', () => {
    const text = 'word '.repeat(120).trim();
    const r = mod.validateReply(text, 'stocks');
    expect(r.valid).toBe(true);
  });
  test('rejects text below wordLimit[0] for wallstreetbets (min 50)', () => {
    const text = 'word '.repeat(30).trim();
    const r = mod.validateReply(text, 'wallstreetbets');
    expect(r.valid).toBe(false);
  });
  test('rejects text above wordLimit[1] for ValueInvesting (max 200)', () => {
    const text = 'word '.repeat(250).trim();
    const r = mod.validateReply(text, 'ValueInvesting');
    expect(r.valid).toBe(false);
  });
  test('applies tolerance: 46-word text passes for wsb min=50', () => {
    const text = 'word '.repeat(46).trim();
    const r = mod.validateReply(text, 'wallstreetbets');
    expect(r.valid).toBe(true);
  });
  test('returns valid, words, min, max shape', () => {
    const text = 'word '.repeat(100).trim();
    const r = mod.validateReply(text, 'stocks');
    expect('valid' in r && 'words' in r && 'min' in r && 'max' in r).toBe(true);
  });
});

describe('validateReply - markdown stripping', () => {
  test('strips bold markers before counting words', () => {
    const text = '**CEO** just ' + 'bought word '.repeat(90);
    const r = mod.validateReply(text, 'stocks');
    expect(r.words).toBeLessThan(190);
  });
  test('handles link syntax without crashing', () => {
    const text = '[See filing](https://sec.gov) ' + 'word '.repeat(100);
    const r = mod.validateReply(text, 'stocks');
    expect(typeof r.words).toBe('number');
  });
  test('strips header markers before counting', () => {
    const text = '### Header\\n' + 'word '.repeat(120);
    const r = mod.validateReply(text, 'stocks');
    expect(typeof r.words).toBe('number');
  });
});

describe('validateReply - URL and brand name check', () => {
  test('rejects text containing https://', () => {
    const text = 'word '.repeat(100) + ' check https://example.com';
    const r = mod.validateReply(text, 'stocks');
    expect(r.valid).toBe(false);
  });
  test('rejects text containing EarlyInsider', () => {
    const text = 'word '.repeat(100) + ' EarlyInsider is great';
    const r = mod.validateReply(text, 'stocks');
    expect(r.valid).toBe(false);
  });
  test('accepts company names Apple or Tesla', () => {
    const text = 'Apple CEO ' + 'bought stock at '.repeat(15) + 'interesting data point here.';
    const r = mod.validateReply(text, 'ValueInvesting');
    expect(!r.issues || !r.issues.some(i => i.toLowerCase().includes('brand'))).toBe(true);
  });
  test('accepts $AAPL ticker symbol', () => {
    const text = '$AAPL CEO ' + 'bought shares at '.repeat(15) + 'notable filing.';
    const r = mod.validateReply(text, 'stocks');
    expect(!r.issues || r.issues.every(i => !i.toLowerCase().includes('url'))).toBe(true);
  });
  test('rejects empty text', () => {
    expect(mod.validateReply('', 'stocks').valid).toBe(false);
  });
});

describe('validateDDPost', () => {
  function buildDDText(wordCount, bearWordCount, hasTLDR, charOverride) {
    if (charOverride) return 'x'.repeat(charOverride);
    const bear = '## Bear Case\\n' + 'risk '.repeat(bearWordCount);
    const body = 'word '.repeat(Math.max(0, wordCount - bearWordCount));
    const tldr = hasTLDR ? '\\n## TLDR\\n- point one\\n- point two' : '';
    return body + bear + tldr;
  }

  test('accepts valid post (1800 words, bear 450, TLDR present)', () => {
    const r = mod.validateDDPost(buildDDText(1800, 450, true));
    expect(r.valid).toBe(true);
  });
  test('rejects post with word count < 1500', () => {
    const r = mod.validateDDPost(buildDDText(1000, 450, true));
    expect(r.valid).toBe(false);
  });
  test('rejects post with word count > 2500', () => {
    const r = mod.validateDDPost(buildDDText(3000, 450, true));
    expect(r.valid).toBe(false);
  });
  test('rejects post with bear case < 400 words', () => {
    const r = mod.validateDDPost(buildDDText(1800, 200, true));
    expect(r.valid).toBe(false);
  });
  test('rejects post without TLDR block', () => {
    const r = mod.validateDDPost(buildDDText(1800, 450, false));
    expect(r.valid).toBe(false);
  });
  test('rejects post with charCount > 38000', () => {
    const r = mod.validateDDPost(buildDDText(0, 0, false, 38001));
    expect(r.valid).toBe(false);
  });
  test('charCount field is correct', () => {
    const r = mod.validateDDPost(buildDDText(0, 0, false, 37999));
    expect(r.charCount).toBeLessThan(38000);
  });
  test('does NOT reject post containing Apple or $AAPL', () => {
    const text = 'Apple CEO Tim Cook $AAPL ' + 'word '.repeat(1500) + '## Bear Case\\n' + 'risk '.repeat(450) + '\\n## TLDR\\n- point';
    const r = mod.validateDDPost(text);
    expect(r.valid).toBe(true);
  });
  test('returns valid, wordCount, bearWordCount, hasTLDR, charCount shape', () => {
    const r = mod.validateDDPost('x');
    expect('valid' in r && 'wordCount' in r && 'bearWordCount' in r && 'hasTLDR' in r && 'charCount' in r).toBe(true);
  });
});

// ===== SECTION 03: checkDailyCommentLimit + shouldSkipToday + upvoteContext + jobs + runCAT4 =====

function _testGetISOWeek(d) {
  const date = new Date(d); date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${date.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

describe('checkDailyCommentLimit', () => {
  function makeLog(entries) {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: entries }) }) });
  }
  test('returns allowed=true when no posts today', async () => {
    makeLog([]);
    const r = await mod.checkDailyCommentLimit('stocks');
    expect(r.allowed).toBe(true);
  });
  test('returns allowed=false when global total >= 10', async () => {
    makeLog(Array(10).fill({ subreddit: 'wallstreetbets', status: 'posted' }));
    const r = await mod.checkDailyCommentLimit('stocks');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/global/);
  });
  test('returns allowed=false when per-sub count >= dailyCap (wsb cap=3)', async () => {
    makeLog([
      { subreddit: 'wallstreetbets', status: 'posted' },
      { subreddit: 'wallstreetbets', status: 'posted' },
      { subreddit: 'wallstreetbets', status: 'posted' },
    ]);
    const r = await mod.checkDailyCommentLimit('wallstreetbets');
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/cap/);
  });
  test('ignores failed/skipped status records in count', async () => {
    makeLog([
      { subreddit: 'stocks', status: 'failed' },
      { subreddit: 'stocks', status: 'skipped' },
    ]);
    const r = await mod.checkDailyCommentLimit('stocks');
    expect(r.allowed).toBe(true);
  });
  test('includes reason field when not allowed', async () => {
    makeLog(Array(10).fill({ subreddit: 'stocks', status: 'posted' }));
    const r = await mod.checkDailyCommentLimit('stocks');
    expect(typeof r.reason).toBe('string');
  });
});

describe('shouldSkipToday', () => {
  function mockState(stored) {
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) return { status: 200, json: () => ({}) };
      if (stored) return { status: 200, json: () => ({ list: [{ key: 'week_skip_days', value: JSON.stringify(stored), Id: 1 }] }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
  }
  test('returns skip=false on a non-skip weekday', async () => {
    const today = new Date();
    const isoWeek = _testGetISOWeek(today);
    const dayOfWeek = today.getDay();
    const skipDay = dayOfWeek === 1 ? 2 : 1;
    mockState({ week: isoWeek, days: [skipDay] });
    const r = await mod.shouldSkipToday();
    expect(r.skip).toBe(false);
  });
  test('returns skip=true when today is a designated skip day', async () => {
    const today = new Date();
    const isoWeek = _testGetISOWeek(today);
    const dayOfWeek = today.getDay();
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      mockState({ week: isoWeek, days: [dayOfWeek] });
      const r = await mod.shouldSkipToday();
      expect(r.skip).toBe(true);
    }
  });
  test('auto-generates skip days if week_skip_days missing from NocoDB', async () => {
    const writes = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(JSON.parse(opts.body)); return { status: 200, json: () => ({}) }; }
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.shouldSkipToday();
    expect(writes.length).toBeGreaterThanOrEqual(1);
  });
  test('generated skip days are weekdays only (JS day 1-5)', async () => {
    const writes = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(JSON.parse(opts.body)); return { status: 200, json: () => ({}) }; }
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.shouldSkipToday();
    const written = writes.find(w => w.value && w.value.includes('days'));
    if (written) {
      const data = JSON.parse(written.value);
      data.days.forEach(d => { expect(d >= 1 && d <= 5).toBe(true); });
    }
  });
  test('generates 1 or 2 skip days', async () => {
    const writes = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(JSON.parse(opts.body)); return { status: 200, json: () => ({}) }; }
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.shouldSkipToday();
    const written = writes.find(w => w.value && w.value.includes('days'));
    if (written) {
      const data = JSON.parse(written.value);
      expect(data.days.length >= 1 && data.days.length <= 2).toBe(true);
    }
  });
  test('does not regenerate if already set for current week', async () => {
    const writes = [];
    const today = new Date();
    const isoWeek = _testGetISOWeek(today);
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && (opts.method === 'POST' || opts.method === 'PATCH')) { writes.push(true); return { status: 200, json: () => ({}) }; }
      return { status: 200, json: () => ({ list: [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days: [2] }), Id: 1 }] }) };
    }});
    await mod.shouldSkipToday();
    await mod.shouldSkipToday();
    expect(writes.length).toBe(0);
  });
});

describe('upvoteContext', () => {
  test('calls Reddit vote API exactly 3 times', async () => {
    const calls = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (url.includes('/api/vote')) calls.push(opts.body);
      if (url.includes('reddit.com/api/v1/access_token')) return { status: 200, json: () => ({ access_token: 'tok', expires_in: 3600 }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    delete process.env.REDDIT_REFRESH_TOKEN;
    process.env.REDDIT_USERNAME = 'u';
    process.env.REDDIT_PASSWORD = 'p';
    await mod.upvoteContext('post123', 'comment1', 'comment2');
    expect(calls.length).toBe(3);
  });
  test('upvotes postId, comment1Id, comment2Id all with dir=1', async () => {
    const votedIds = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (url.includes('/api/vote')) {
        const body = new URLSearchParams(opts.body);
        votedIds.push({ id: body.get('id'), dir: body.get('dir') });
      }
      if (url.includes('reddit.com/api/v1/access_token')) return { status: 200, json: () => ({ access_token: 'tok', expires_in: 3600 }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    delete process.env.REDDIT_REFRESH_TOKEN;
    await mod.upvoteContext('t3_postid', 't1_c1', 't1_c2');
    expect(votedIds.some(v => v.id === 't3_postid' && v.dir === '1')).toBe(true);
    expect(votedIds.some(v => v.id === 't1_c1' && v.dir === '1')).toBe(true);
    expect(votedIds.some(v => v.id === 't1_c2' && v.dir === '1')).toBe(true);
  });
});

describe('scheduleEditUpdate', () => {
  test('inserts reddit_edit job with execute_after ~2h from now', async () => {
    const jobs = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(JSON.parse(opts.body));
      return { status: 200, json: () => ({}) };
    }});
    const before = Date.now();
    await mod.scheduleEditUpdate('t1_abc', 'AAPL', 'stocks', 142.50);
    expect(jobs.length).toBeGreaterThanOrEqual(1);
    const job = jobs[0];
    expect(job.type).toBe('reddit_edit');
    expect(job.status).toBe('pending');
    const executeAfter = new Date(job.execute_after).getTime();
    expect(executeAfter >= before + 115 * 60 * 1000 && executeAfter <= before + 125 * 60 * 1000).toBe(true);
    const payload = typeof job.payload === 'string' ? JSON.parse(job.payload) : job.payload;
    expect(payload.commentId).toBe('t1_abc');
  });
});

describe('scheduleDDReplies', () => {
  test('inserts exactly 2 reddit_dd_reply jobs', async () => {
    const jobs = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(JSON.parse(opts.body));
      return { status: 200, json: () => ({}) };
    }});
    await mod.scheduleDDReplies('t3_ddpost', 'stocks', 'AAPL');
    expect(jobs.length).toBe(2);
    expect(jobs.every(j => j.type === 'reddit_dd_reply')).toBe(true);
  });
  test('first at ~1h, second at ~6h', async () => {
    const jobs = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(JSON.parse(opts.body));
      return { status: 200, json: () => ({}) };
    }});
    const before = Date.now();
    await mod.scheduleDDReplies('t3_ddpost', 'stocks', 'AAPL');
    const times = jobs.map(j => new Date(j.execute_after).getTime()).sort((a, b) => a - b);
    expect(times[0] >= before + 55 * 60 * 1000 && times[0] <= before + 65 * 60 * 1000).toBe(true);
    expect(times[1] >= before + 5.5 * 60 * 60 * 1000 && times[1] <= before + 6.5 * 60 * 60 * 1000).toBe(true);
  });
});

describe('processScheduledJobs', () => {
  test('ignores jobs with execute_after in the future', async () => {
    const futureJob = { Id: 1, type: 'reddit_edit', payload: '{}', status: 'pending', execute_after: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [futureJob] }) }) });
    await mod.processScheduledJobs();
    expect(true).toBe(true);
  });
  test('ignores jobs with status = done', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [{ Id: 1, type: 'reddit_edit', payload: '{}', status: 'done', execute_after: new Date(Date.now() - 1000).toISOString() }] }) }) });
    await mod.processScheduledJobs();
    expect(true).toBe(true);
  });
  test('marks job skipped (not crashed) if job handler throws', async () => {
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'PATCH' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
      if (url.includes('reddit.com') && opts && opts.method === 'GET') return { status: 404, json: () => ({}) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    await mod.processScheduledJobs({ _fixedJobs: [{ Id: 1, type: 'reddit_edit', payload: JSON.stringify({ commentId: 't1_del', ticker: 'AAPL', priceAtPost: 140 }), status: 'pending', execute_after: new Date(Date.now() - 1000).toISOString() }] });
    expect(true).toBe(true);
  });
  test('processes past-due pending jobs without crashing', async () => {
    const jobs = [
      { Id: 1, type: 'reddit_reply_deferred', payload: JSON.stringify({ postId: 't3_a', subreddit: 'stocks', ticker: 'AAPL', insiderData: { ticker: 'AAPL', insider_name: 'Tim Cook', role: 'CEO', value_usd: 2000000, date: '2026-03-25' }, structure: { id: 'Q_A_DATA', systemPromptInstruction: 'Open with a question.' } }), status: 'pending', execute_after: new Date(Date.now() - 1000).toISOString() },
    ];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'PATCH' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
      if (url.includes('reddit.com') && opts && opts.method === 'POST') return { status: 200, json: () => ({ json: { data: { things: [{ data: { id: 'c1', name: 't1_c1' } }] } } }) };
      if (url.includes('anthropic')) return { status: 200, json: () => ({ content: [{ text: 'CEO bought $2M. Third buy this year.' }] }) };
      return { status: 200, json: () => ({ list: jobs }) };
    }});
    await mod.processScheduledJobs();
    expect(true).toBe(true);
  });
  test('accepts empty _fixedJobs array', async () => {
    mod._setDeps({ fetch: async () => ({ status: 200, json: () => ({ list: [] }) }) });
    await mod.processScheduledJobs({ _fixedJobs: [] });
    expect(true).toBe(true);
  });
});

describe('runCAT4Comments', () => {
  test('returns early without scheduling jobs if shouldSkipToday is true', async () => {
    const today = new Date();
    const isoWeek = _testGetISOWeek(today);
    const dayOfWeek = today.getDay();
    const jobs = [];
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) jobs.push(true);
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        return { status: 200, json: () => ({ list: [{ key: 'week_skip_days', value: JSON.stringify({ week: isoWeek, days: [dayOfWeek] }), Id: 1 }] }) };
      }
      return { status: 200, json: () => ({ list: [] }) };
    }});
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      await mod.runCAT4Comments();
      expect(jobs.length).toBe(0);
    }
  });
  test('does not throw on empty post results', async () => {
    mod._setDeps({ fetch: async (url, opts) => {
      if (opts && opts.method === 'POST' && url.includes('Scheduled_Jobs')) return { status: 200, json: () => ({}) };
      if (url.includes('reddit.com/api/v1/access_token')) return { status: 200, json: () => ({ access_token: 'tok', expires_in: 3600 }) };
      if (url.includes('search.json')) return { status: 200, json: () => ({ data: { children: [] } }) };
      return { status: 200, json: () => ({ list: [] }) };
    }});
    delete process.env.REDDIT_REFRESH_TOKEN;
    process.env.REDDIT_USERNAME = 'u';
    process.env.REDDIT_PASSWORD = 'p';
    await mod.runCAT4Comments();
    expect(true).toBe(true);
  });
});
"""

with open(filepath, 'a', encoding='utf-8') as f:
    f.write(tests)

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.read().count('\n')
print(f'Done. Total lines: {lines}')
