'use strict';

// Fetch polyfill for n8n sandbox
const _https = require('https');
const _http = require('http');
const { URL } = require('url');

// ---------------------------------------------------------------------------
// W8 X (Twitter) Engagement Monitoring
// ---------------------------------------------------------------------------

var MIN_FOLLOWERS = 10;
var MIN_FOLLOWING = 10;
var MIN_ACCOUNT_AGE_DAYS = 30;

/**
 * Filter out bots and already-replied threads.
 * Criteria: follower/following > 10, account age >= 30 days.
 * @param {Array} items - Array of tweet objects with user data
 *   Each item: { id, text, user: { followers_count, following_count, created_at }, in_reply_to_status_id }
 * @returns {Array} Filtered array of relevant tweets
 */
function filterRelevant(items) {
  if (!items || !Array.isArray(items)) return [];

  var now = Date.now();
  var minAgeMs = MIN_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;

  return items.filter(function(item) {
    if (!item || !item.user) return false;

    var user = item.user;

    // Filter bots: must have minimum followers and following
    if ((user.followers_count || 0) < MIN_FOLLOWERS) return false;
    if ((user.following_count || 0) < MIN_FOLLOWING) return false;

    // Filter new accounts (likely bots)
    if (user.created_at) {
      var accountAge = now - new Date(user.created_at).getTime();
      if (accountAge < minAgeMs) return false;
    }

    return true;
  });
}

/**
 * Build Claude Haiku prompt for drafting a reply.
 * Rules: no links, no brand name, sound like a trader.
 * @param {object} originalTweet - { id, text, user: { screen_name } }
 * @returns {object} { prompt, maxTokens }
 */
function draftReply(originalTweet) {
  var tweetText = (originalTweet && originalTweet.text) || '';
  var author = (originalTweet && originalTweet.user && originalTweet.user.screen_name) || 'someone';

  var prompt = 'You are a knowledgeable retail trader who follows SEC insider filings closely. '
    + 'Draft a short reply to this tweet by @' + author + ':\n\n'
    + '"' + tweetText + '"\n\n'
    + 'RULES:\n'
    + '- Sound like a real trader, not a brand or marketing account\n'
    + '- NO links or URLs of any kind\n'
    + '- NO brand names (do not mention InsiderBuying, EarlyInsider, or any website)\n'
    + '- Add genuine value: share an insight, data point, or perspective\n'
    + '- Keep it conversational and under 240 characters\n'
    + '- If you reference insider buying data, present it as your own knowledge\n'
    + '- One reply only, no alternatives\n\n'
    + 'Reply:';

  return {
    prompt: prompt,
    maxTokens: 100,
  };
}

/**
 * Build Telegram sendMessage payload with inline keyboard for review.
 * Buttons: Approve / Edit / Skip
 * @param {object} original - Original tweet { id, text, user: { screen_name } }
 * @param {string} draft - Draft reply text
 * @param {string} chatId - Telegram chat ID
 * @returns {object} Telegram sendMessage payload
 */
function sendToTelegramReview(original, draft, chatId) {
  var author = (original && original.user && original.user.screen_name) || 'unknown';
  var tweetId = (original && original.id) || 'unknown';
  var originalText = (original && original.text) || '';

  var message = 'X REPLY DRAFT\n\n'
    + 'Replying to @' + author + ':\n'
    + '"' + originalText + '"\n\n'
    + 'Draft reply:\n'
    + '"' + draft + '"\n\n'
    + 'Approve, edit, or skip?';

  return {
    method: 'sendMessage',
    chat_id: chatId,
    text: message,
    reply_markup: {
      inline_keyboard: [
        [
          { text: 'Approve', callback_data: 'x:approve:' + tweetId },
          { text: 'Edit', callback_data: 'x:edit:' + tweetId },
          { text: 'Skip', callback_data: 'x:skip:' + tweetId },
        ],
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// Data enrichment helpers
// ---------------------------------------------------------------------------

/**
 * Extract the first cashtag from tweet text.
 * Matches $TICKER (1-6 uppercase letters, optional .A/.B suffix).
 * Returns ticker string without leading $, or null if not found.
 * @param {string} tweetText
 * @returns {string|null}
 */
function extractTicker(tweetText) {
  if (!tweetText) return null;
  var match = /\$([A-Z]{1,6}(?:\.[A-Z]{1,2})?)/.exec(tweetText);
  return match ? match[1] : null;
}

/**
 * Extract all cashtags from text (internal helper for buildFilingContext).
 * @param {string} text
 * @returns {string[]}
 */
function _extractAllTickers(text) {
  var results = [];
  var re = /\$([A-Z]{1,6}(?:\.[A-Z]{1,2})?)/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/**
 * Format a dollar value as abbreviated string.
 * @param {number} val
 * @returns {string}
 */
function _formatValue(val) {
  if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
  if (val >= 1000) return '$' + (val / 1000).toFixed(1) + 'K';
  return '$' + Number(val).toFixed(0);
}

/**
 * Build a FilingContext from a tweet and pre-fetched filings array.
 * Returns null if no matching filing is found.
 * @param {object} tweet - { text: string }
 * @param {Array} filings - NocoDB Insider_Filings records
 * @returns {FilingContext|null}
 */
function buildFilingContext(tweet, filings) {
  if (!filings || !Array.isArray(filings) || filings.length === 0) return null;
  var text = tweet && tweet.text;
  if (!text) return null;

  var tickers = _extractAllTickers(text);
  if (tickers.length === 0) return null;

  var matchedTicker = null;
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    if (filings.some(function(f) { return f.ticker === t; })) {
      matchedTicker = t;
      break;
    }
  }
  if (!matchedTicker) return null;

  var matched = filings.filter(function(f) { return f.ticker === matchedTicker; });
  var primary = matched[0];

  return {
    ticker: matchedTicker,
    insiderName: primary.insider_name,
    insiderRole: primary.insider_role,
    transactionValue: _formatValue(primary.transaction_value),
    transactionDate: primary.transaction_date,
    priceAtPurchase: primary.price_at_purchase,
    trackRecord: (primary.historical_return != null && primary.historical_return !== '') ? primary.historical_return : null,
    clusterCount: Math.min(matched.length, 3),
  };
}

module.exports = {
  filterRelevant: filterRelevant,
  draftReply: draftReply,
  sendToTelegramReview: sendToTelegramReview,
  extractTicker: extractTicker,
  buildFilingContext: buildFilingContext,
};
