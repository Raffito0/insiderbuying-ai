const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  filterRelevant,
  draftReply,
  sendToTelegramReview,
  extractTicker,
  buildFilingContext,
} = require('../code/insiderbuying/x-engagement.js');

// ---------------------------------------------------------------------------
// filterRelevant
// ---------------------------------------------------------------------------
describe('filterRelevant', () => {
  it('removes accounts with low followers (bot-like)', () => {
    const items = [
      { id: '1', text: 'test', user: { followers_count: 5, following_count: 100, created_at: '2020-01-01' } },
    ];
    const result = filterRelevant(items);
    assert.equal(result.length, 0);
  });

  it('removes new accounts (< 30 days old)', () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 10); // 10 days ago
    const items = [
      { id: '1', text: 'test', user: { followers_count: 500, following_count: 200, created_at: recentDate.toISOString() } },
    ];
    const result = filterRelevant(items);
    assert.equal(result.length, 0);
  });

  it('keeps legitimate accounts', () => {
    const items = [
      { id: '1', text: 'AAPL insider buying', user: { followers_count: 500, following_count: 200, created_at: '2020-01-01' } },
    ];
    const result = filterRelevant(items);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, '1');
  });

  it('handles null/empty input', () => {
    assert.deepEqual(filterRelevant(null), []);
    assert.deepEqual(filterRelevant([]), []);
  });

  it('filters out items without user object', () => {
    const items = [{ id: '1', text: 'test' }];
    const result = filterRelevant(items);
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// draftReply
// ---------------------------------------------------------------------------
describe('draftReply', () => {
  it('returns prompt string with maxTokens', () => {
    const tweet = { id: '123', text: 'AAPL insiders bought big', user: { screen_name: 'trader_joe' } };
    const result = draftReply(tweet);
    assert.ok(typeof result.prompt === 'string');
    assert.ok(result.prompt.length > 0);
    assert.ok(typeof result.maxTokens === 'number');
  });

  it('prompt contains the original tweet text', () => {
    const tweet = { id: '123', text: 'Big insider purchase on NVDA', user: { screen_name: 'stockguy' } };
    const result = draftReply(tweet);
    assert.ok(result.prompt.indexOf('Big insider purchase on NVDA') !== -1);
  });

  it('prompt includes no-link and no-brand rules', () => {
    const tweet = { id: '1', text: 'test', user: { screen_name: 'user1' } };
    const result = draftReply(tweet);
    assert.ok(result.prompt.indexOf('NO links') !== -1 || result.prompt.indexOf('No links') !== -1);
    assert.ok(result.prompt.indexOf('brand') !== -1);
  });
});

// ---------------------------------------------------------------------------
// sendToTelegramReview
// ---------------------------------------------------------------------------
describe('sendToTelegramReview', () => {
  it('returns object with inline_keyboard containing 3 buttons', () => {
    const original = { id: 'tw123', text: 'Some tweet', user: { screen_name: 'trader' } };
    const result = sendToTelegramReview(original, 'Draft reply here', 'chat456');

    assert.ok(result.reply_markup);
    assert.ok(result.reply_markup.inline_keyboard);
    const buttons = result.reply_markup.inline_keyboard[0];
    assert.equal(buttons.length, 3);
    assert.equal(buttons[0].text, 'Approve');
    assert.equal(buttons[1].text, 'Edit');
    assert.equal(buttons[2].text, 'Skip');
  });

  it('callback_data contains tweet id', () => {
    const original = { id: 'tw999', text: 'test', user: { screen_name: 'x' } };
    const result = sendToTelegramReview(original, 'reply', 'chat1');
    const buttons = result.reply_markup.inline_keyboard[0];
    assert.ok(buttons[0].callback_data.indexOf('tw999') !== -1);
  });

  it('includes chat_id and message text', () => {
    const result = sendToTelegramReview({ id: '1', text: 'orig', user: { screen_name: 'u' } }, 'draft', 'mychat');
    assert.equal(result.chat_id, 'mychat');
    assert.ok(typeof result.text === 'string');
    assert.ok(result.text.indexOf('draft') !== -1);
  });
});

// ---------------------------------------------------------------------------
// extractTicker
// ---------------------------------------------------------------------------
describe('extractTicker', () => {
  it('returns first cashtag from tweet text', () => {
    assert.equal(extractTicker('$NVDA is buying heavily this quarter'), 'NVDA');
  });

  it('returns extended ticker BRK.B including suffix', () => {
    assert.equal(extractTicker('Big move in $BRK.B today'), 'BRK.B');
  });

  it('returns first cashtag when multiple present', () => {
    assert.equal(extractTicker('$NVDA $AMD both moving'), 'NVDA');
  });

  it('returns null when no cashtags', () => {
    assert.equal(extractTicker('The market is up today'), null);
  });

  it('returns null for dollar-amount context ($ followed by digit)', () => {
    assert.equal(extractTicker('Insider bought $1.2M worth of shares'), null);
  });

  it('returns null for lowercase ticker', () => {
    assert.equal(extractTicker('the $nvda trade is interesting'), null);
  });

  it('strips trailing sentence period from NVDA.', () => {
    assert.equal(extractTicker('Loading up on $NVDA.'), 'NVDA');
  });

  it('returns null for empty string', () => {
    assert.equal(extractTicker(''), null);
  });

  it('returns null for null input', () => {
    assert.equal(extractTicker(null), null);
  });

  it('returns first of three tickers', () => {
    assert.equal(extractTicker('Watch $AAPL and $MSFT and $GOOG'), 'AAPL');
  });
});

// ---------------------------------------------------------------------------
// buildFilingContext
// ---------------------------------------------------------------------------
describe('buildFilingContext', () => {
  const sampleFilings = [
    {
      ticker: 'NVDA',
      insider_name: 'Jensen Huang',
      insider_role: 'CEO',
      transaction_value: 2400000,
      transaction_date: '2024-11-15',
      price_at_purchase: 142.50,
      historical_return: '+23% avg',
    },
  ];

  it('returns FilingContext with all fields populated', () => {
    const ctx = buildFilingContext({ text: 'Big $NVDA buy' }, sampleFilings);
    assert.ok(ctx !== null);
    assert.equal(ctx.ticker, 'NVDA');
    assert.equal(ctx.insiderName, 'Jensen Huang');
    assert.equal(ctx.insiderRole, 'CEO');
    assert.equal(ctx.transactionDate, '2024-11-15');
    assert.equal(ctx.trackRecord, '+23% avg');
  });

  it('formats transactionValue as $M string', () => {
    const ctx = buildFilingContext({ text: '$NVDA buy' }, sampleFilings);
    assert.ok(ctx.transactionValue.startsWith('$'));
    assert.ok(ctx.transactionValue.indexOf('M') !== -1);
  });

  it('caps clusterCount at 3 when 4 filings match', () => {
    const multi = Array.from({ length: 4 }, () => Object.assign({}, sampleFilings[0]));
    const ctx = buildFilingContext({ text: '$NVDA cluster' }, multi);
    assert.equal(ctx.clusterCount, 3);
  });

  it('returns null when no cashtag in tweet', () => {
    assert.equal(buildFilingContext({ text: 'Market is interesting today' }, sampleFilings), null);
  });

  it('returns null when filings is empty array', () => {
    assert.equal(buildFilingContext({ text: '$NVDA is moving' }, []), null);
  });

  it('returns null when filings is null', () => {
    assert.equal(buildFilingContext({ text: '$NVDA is moving' }, null), null);
  });

  it('priceAtPurchase is a number', () => {
    const ctx = buildFilingContext({ text: '$NVDA' }, sampleFilings);
    assert.equal(typeof ctx.priceAtPurchase, 'number');
    assert.equal(ctx.priceAtPurchase, 142.50);
  });

  it('trackRecord is null when filing has no historical_return', () => {
    const f = [Object.assign({}, sampleFilings[0], { historical_return: undefined })];
    const ctx = buildFilingContext({ text: '$NVDA' }, f);
    assert.equal(ctx.trackRecord, null);
  });

  it('finds first ticker with filing data when multiple tickers in tweet', () => {
    const amdFilings = [{
      ticker: 'AMD', insider_name: 'Lisa Su', insider_role: 'CEO',
      transaction_value: 1000000, transaction_date: '2024-11-10', price_at_purchase: 130.00,
    }];
    const ctx = buildFilingContext({ text: '$NVDA $AMD both moving' }, amdFilings);
    assert.equal(ctx.ticker, 'AMD');
  });

  it('formats $150K as K string', () => {
    const f = [Object.assign({}, sampleFilings[0], { transaction_value: 150000 })];
    const ctx = buildFilingContext({ text: '$NVDA' }, f);
    assert.ok(ctx.transactionValue.indexOf('K') !== -1);
  });

  it('clusterCount is 1 for single filing', () => {
    const ctx = buildFilingContext({ text: '$NVDA' }, sampleFilings);
    assert.equal(ctx.clusterCount, 1);
  });
});
