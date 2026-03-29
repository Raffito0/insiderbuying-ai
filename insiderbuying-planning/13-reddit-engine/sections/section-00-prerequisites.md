# Section 00: Prerequisites — NocoDB Tables + visual-templates.js Stub

## Overview

This section has no logic in `reddit-monitor.js`. It creates the infrastructure that every subsequent section depends on:

1. Three new NocoDB tables (Reddit_State, Scheduled_Jobs, Reddit_DD_Posts) with required indexes
2. A new file `visual-templates.js` with three stub functions

Do this section before writing any other code. There is no rollback path if sections 01-06 are partially implemented and the tables don't exist yet.

---

## Files to Create / Modify

```
n8n/code/insiderbuying/visual-templates.js   (new file)
n8n/tests/visual-templates.test.js           (new test file)
```

No changes to `reddit-monitor.js` in this section.

---

## Tests First

**File**: `n8n/tests/visual-templates.test.js`

Run: `node --test n8n/tests/visual-templates.test.js`

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vt = require('../code/insiderbuying/visual-templates.js');

describe('visual-templates stubs', () => {
  it('generateInsiderTable returns null', () => {
    assert.strictEqual(vt.generateInsiderTable([]), null);
  });
  it('generatePriceChart returns null', () => {
    assert.strictEqual(vt.generatePriceChart('AAPL', {}), null);
  });
  it('generatePeerRadar returns null', () => {
    assert.strictEqual(vt.generatePeerRadar('AAPL', []), null);
  });
  it('all three accept undefined args without throwing', () => {
    assert.doesNotThrow(() => vt.generateInsiderTable(undefined));
    assert.doesNotThrow(() => vt.generatePriceChart(undefined, undefined));
    assert.doesNotThrow(() => vt.generatePeerRadar(undefined, undefined));
  });
});
```

---

## Implementation: visual-templates.js

```javascript
// visual-templates.js
// Stub implementations — image generation is deferred.
// CAT 6 upload logic skips any visual that returns null.
'use strict';

module.exports = {
  generateInsiderTable: (filings) => null,
  generatePriceChart: (ticker, priceData) => null,
  generatePeerRadar: (ticker, peers) => null,
};
```

---

## NocoDB Table Setup

### Reddit_State

Purpose: generic key/value store for all per-subreddit counters and weekly state. Flexible schema allows adding new state keys without migrations.

| Field | Type | Notes |
|-------|------|-------|
| `key` | Text | Unique. Index: unique index on `key`. |
| `value` | LongText | JSON-serialized. |
| `updated_at` | DateTime | Set on every write. |

**Index**: Unique index on `key` column.

Keys used at runtime (do not need to pre-populate — created on first write):
- `{subreddit}_structure_index` — e.g. `wallstreetbets_structure_index` = `"2"`
- `week_skip_days` — e.g. `{"week":"2026-W13","days":[2,4]}`
- `daily_thread_sub_index` — `"0"` / `"1"` / `"2"`
- `daily_thread_template_index` — `"0"` / `"1"` / `"2"`
- `reddit_auth` — `{"token":"Bearer xyz...","expires_at":"2026-03-28T14:30:00Z"}`

### Scheduled_Jobs

Purpose: unified queue for all delayed Reddit actions. Replaces all `sleep()` calls.

| Field | Type | Notes |
|-------|------|-------|
| `type` | Text | One of 5 job types (see below). |
| `payload` | JSON | Job-specific data. |
| `execute_after` | DateTime | When to process this job. |
| `status` | Text | `pending` / `done` / `skipped`. Default: `pending`. |
| `created_at` | DateTime | Auto-set on insert. |

**Index**: Composite index on `(status, execute_after)`. Required — without this, the 15-min sweep query does a full table scan.

Job types:
- `reddit_reply_deferred` — deferred CAT 4 reply (10-30 min delay)
- `reddit_edit` — append "Edit: moved X%" to a posted comment (2h delay)
- `reddit_thread_reply` — reply to replies on a CAT 5 daily thread comment (1-2h delay)
- `reddit_ama` — post AMA comment on a CAT 6 DD post (5-10 min delay)
- `reddit_dd_reply` — reply to top comments on a CAT 6 DD post (1h and 6h)

### Reddit_DD_Posts

Purpose: tracks posted DD posts for frequency limiting.

| Field | Type | Notes |
|-------|------|-------|
| `ticker` | Text | Stock ticker. |
| `post_url` | Text | URL of the Reddit post. |
| `subreddit` | Text | Subreddit posted to. |
| `price_at_post` | Decimal | Ticker price at time of posting. |
| `authenticity_score` | Decimal | Human-likeness score from Claude. |
| `posted_at` | DateTime | When the post went live. |
| `status` | Text | `draft` / `posted`. |

**Index**: Index on `posted_at` column.

---

## Dependencies

This section has **no dependencies** on other sections.

All sections 01-06 depend on this section.

---

## Definition of Done

- [ ] `visual-templates.js` exists and exports `generateInsiderTable`, `generatePriceChart`, `generatePeerRadar`
- [ ] All 4 visual-templates tests pass
- [ ] `Reddit_State` table created in NocoDB with unique index on `key`
- [ ] `Scheduled_Jobs` table created in NocoDB with composite index on `(status, execute_after)`
- [ ] `Reddit_DD_Posts` table created in NocoDB with index on `posted_at`
- [ ] Existing `reddit-monitor.test.js` tests continue to pass (no changes made)
