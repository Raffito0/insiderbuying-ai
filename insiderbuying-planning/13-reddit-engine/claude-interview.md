# Interview Transcript: 13-reddit-engine

## Q1: visual-templates.js for CAT 6 DD post visuals

Does `visual-templates.js` already exist, or does it need to be created?

**Answer**: Doesn't exist — create stubs in this plan. The plan should include `visual-templates.js` with placeholder/stub functions. Image implementation comes later.

---

## Q2: NocoDB table creation

Do the required tables (Reddit_State, Scheduled_Jobs, Reddit_DD_Posts) already exist?

**Answer**: Need to be created. Include NocoDB table setup as part of the plan. The plan should document the creation of all three tables as a prerequisite section.

---

## Q3: "Edit: update" job processor architecture

Should the job processor be a separate n8n workflow or a function in reddit-monitor.js?

**Answer**: Function in reddit-monitor.js, called by n8n node. Export `processScheduledEdits()` from reddit-monitor.js, triggered by a separate n8n schedule node.

---

## Q4: CAT 6 DD post Telegram approval

PROMPT-WORKFLOW-FRAMEWORK.md says Telegram approval is mandatory for DD posts. Does the spec override this?

**Answer**: No Telegram approval needed — fully automated. Quality gate + AI authenticity score >= 7 is sufficient to post.

---

## Q5: Data source for CAT 5 + CAT 6 insider filing data

What NocoDB table provides insider filings data for buildDailyThreadComment() and buildDDPost()?

**Answer**: Same NocoDB table already used in the CAT 4 flow. Reuse the same query logic that reddit-monitor.js already has (or is designed to have) for fetching insider data by ticker.

---

## Q6: Reddit OAuth authentication method

How should reddit-monitor.js obtain its OAuth access token?

**Answer**: reddit-monitor.js fetches its own token using the ROPC (Resource Owner Password Credentials) flow. POST to `reddit.com/api/v1/access_token` with client_id, client_secret, username, password as env vars.

---

## Q7: Reply-to-replies job architecture (CAT 5 GAP 5.6, CAT 6 GAP 6.6)

These delayed actions (1-2h after post) — should they use the same Scheduled_Jobs queue or a separate mechanism?

**Answer**: Store in NocoDB Scheduled_Jobs with a unified queue. Add new job types: `reddit_thread_reply` and `reddit_dd_reply`. Same `processScheduledEdits()` processor handles all job types.

---

## Q8: CAT 5 fallback when no daily discussion thread found

If r/stocks has no daily discussion thread today, what happens?

**Answer**: Skip that subreddit, post to the others. Log "no daily thread found for {subreddit}" and continue to the next target.

---

## Q9: Skip day generation timing

Who generates the weekly skip days and when?

**Answer**: Auto-generated at start of week (Monday check). `shouldSkipToday()` checks if skip_days exist for the current week in NocoDB. If not (first run on Monday), generates 1-2 random weekday skip days, stores them, then checks. Idempotent behavior — safe to call multiple times per day.

---

## Q10: CAT 5 target subreddits — all 3 or rotate?

Does each CAT 5 run post to all 3 subreddits (stocks, investing, ValueInvesting) or rotate?

**Answer**: Rotate — 1 subreddit per day. Monday = r/stocks, Tuesday = r/investing, Wednesday = r/ValueInvesting, then repeat cycle. Rotation index stored in NocoDB Reddit_State.
