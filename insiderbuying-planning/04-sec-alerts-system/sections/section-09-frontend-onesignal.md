# Section 09: Frontend — OneSignal User Tagging

## Overview

This section wires the existing OneSignal SDK integration to Supabase Auth so that push notification targeting works correctly. Right now `OneSignalInit.tsx` loads the SDK but never calls `OneSignal.login()`, meaning OneSignal has no idea which Supabase user owns each browser push subscription. W5 (`deliver-alert.js`) filters recipients using OneSignal tags (`alert_score_min`, `plan`) — those tags can only be set after the user is linked via `OneSignal.login()`.

**This section is fully independent of sections 00–08.** It can be implemented in parallel with everything else and only requires the OneSignal app to exist in the dashboard.

---

## Dependencies

- **None from backend sections** — this is purely frontend
- **Existing file to modify**: `src/components/OneSignalInit.tsx`
- **Existing file to verify**: `public/OneSignalSDKWorker.js` (must exist; download from OneSignal dashboard if missing)
- **Existing API route**: `src/app/api/alerts/subscribe/route.ts` (PUT handler for saving preferences — tags must be set here client-side after a successful save)
- **Supabase client**: `@/lib/supabase/client` (browser client, already used in `alerts/page.tsx`)
- **Package**: `react-onesignal` (already installed, already imported in `OneSignalInit.tsx`)
- **Env var**: `NEXT_PUBLIC_ONESIGNAL_APP_ID` (already used in `OneSignalInit.tsx`)

---

## Tests

From `claude-plan-tdd.md`, Section 9:

```
# Test: OneSignal.login() is called with session.user.id after auth session loads
# Test: OneSignal.login() is called again on auth state change (re-login with new user)
# Test: alert_score_min tag value is a number (not a string) in OneSignal.User.addTag call
# Test: plan tag is 'free' or 'pro' matching profiles.subscription_tier
# Test: tags are set on preference save (not only on login)
# Test: OneSignal.login() is NOT called when user is logged out (no session)
```

Test file location: `ryan_cole/insiderbuying-site/tests/insiderbuying/onesignal-tagging.test.ts`

Key test stubs:

```typescript
// onesignal-tagging.test.ts

describe('OneSignalInit — user linking', () => {
  it('calls OneSignal.login() with supabase user id when session exists', () => { /* ... */ });
  it('calls OneSignal.login() again when auth state changes to a new user', () => { /* ... */ });
  it('does NOT call OneSignal.login() when session is null', () => { /* ... */ });
});

describe('OneSignal tags — preference save', () => {
  it('sends alert_score_min as a number, not a string', () => {
    // OneSignal.User.addTag("alert_score_min", 7)   ← correct
    // OneSignal.User.addTag("alert_score_min", "7") ← wrong — lexicographic comparison breaks
  });
  it('sets plan tag to "free" or "pro" from profiles.subscription_tier', () => { /* ... */ });
  it('sets tags on every preference save, not only on first login', () => { /* ... */ });
});
```

**Critical number vs string note**: W5's OneSignal filter uses `alert_score_min <= alert_score`. If `alert_score_min` is stored as the string `"10"`, then `"10" <= "6"` evaluates to `true` in lexicographic comparison, causing users who set a high threshold to receive all alerts. Always pass the raw number: `OneSignal.User.addTag("alert_score_min", prefs.min_significance_score)` — not `String(prefs.min_significance_score)`.

---

## Implementation

### Step 1 — Verify Service Worker

Check that `public/OneSignalSDKWorker.js` exists in the Next.js project root's `public/` directory. Currently the `public/` directory only contains `images/` and `robots.txt` — the service worker file is missing and must be added.

Download `OneSignalSDKWorker.js` from the OneSignal dashboard:
- OneSignal Dashboard → Settings → Web Push → Download SDK Files
- Place it at: `ryan_cole/insiderbuying-site/public/OneSignalSDKWorker.js`

The existing middleware already excludes this file from auth redirect (`matcher` in `middleware.ts` does not intercept static files from `public/`), so no middleware changes are needed.

### Step 2 — Modify `OneSignalInit.tsx`

**File**: `src/components/OneSignalInit.tsx`

The current component only calls `OneSignal.init()`. Add a second `useEffect` (separate from the init effect) that:

1. Calls `supabase.auth.getSession()` to get the current session on mount
2. If a session exists, calls `OneSignal.login(session.user.id)`
3. Subscribes to `supabase.auth.onAuthStateChange` to re-call `OneSignal.login()` when the user signs in or changes
4. Cleans up the subscription on unmount

Stub:

```typescript
"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

export function OneSignalInit() {
  const initialized = useRef(false);

  // Effect 1 — SDK init (unchanged)
  useEffect(() => {
    if (initialized.current) return;
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID) return;
    initialized.current = true;
    import("react-onesignal").then((OneSignal) => {
      OneSignal.default.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID!,
        allowLocalhostAsSecureOrigin: process.env.NODE_ENV === "development",
      });
    });
  }, []);

  // Effect 2 — Link Supabase user to OneSignal subscriber
  useEffect(() => {
    if (typeof window === "undefined") return;
    const supabase = createClient();

    // Link on mount for already-authenticated users
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        import("react-onesignal").then((OneSignal) => {
          OneSignal.default.login(session.user.id);
        });
      }
    });

    // Re-link on auth state changes (sign in, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user?.id) {
          import("react-onesignal").then((OneSignal) => {
            OneSignal.default.login(session.user.id);
          });
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
```

### Step 3 — Set Tags on Preference Save

Tags must be set whenever the user saves their alert preferences, not only on login. The preferences are saved via a PUT to `/api/alerts/subscribe`. After a successful save, the client-side code that calls the API should immediately set OneSignal tags.

The preference save UI (wherever the form lives — likely under `/app/alerts` or a settings page) should call this after a successful API response:

```typescript
// After successful PUT /api/alerts/subscribe
import OneSignal from "react-onesignal";

function syncOneSignalTags(prefs: {
  min_significance_score: number;
}, profile: {
  subscription_tier: string;
}) {
  /**
   * Sets OneSignal tags used by W5 (deliver-alert.js) to filter push recipients.
   *
   * alert_score_min: MUST be a number. W5 uses numeric <= comparison.
   *   Sending a string causes lexicographic comparison — "10" <= "6" is true.
   *
   * plan: "free" or "pro" — mirrors profiles.subscription_tier.
   *   W5 uses this to determine whether to send push at all.
   */
  OneSignal.User.addTag("alert_score_min", prefs.min_significance_score); // number, not String()
  OneSignal.User.addTag("plan", profile.subscription_tier);               // "free" or "pro"
}
```

Call `syncOneSignalTags()` immediately after the PUT succeeds. Also call it once on preference load (when the preferences page mounts and fetches existing prefs from GET `/api/alerts/subscribe`) so that tags are set even if the user never explicitly re-saves.

---

## How the Tags Are Used in W5

For context: `deliver-alert.js` (Section 6) sends a OneSignal push with this filter:

```json
{
  "filters": [
    { "field": "tag", "key": "alert_score_min", "relation": "<=", "value": "<current_alert_score>" }
  ]
}
```

- Users who set `alert_score_min = 5` receive all alerts with score >= 5.
- Users who set `alert_score_min = 8` only receive alerts with score >= 8.
- The `plan` tag is not used for filtering in W5 (email handles plan differentiation), but is useful for OneSignal dashboard analytics and future segmentation.

The `push_sent` count W5 stores in Airtable comes from `response.recipients` in the OneSignal API response — the number of devices that actually received the push.

---

## Environment Variables

- `NEXT_PUBLIC_ONESIGNAL_APP_ID` — already present in `OneSignalInit.tsx`. Verify it is set in `.env.local` and in the production environment.

No new env vars are required for this section.

---

## Verification

After implementing:

1. Log in on the site in a browser that has push notifications enabled
2. Open OneSignal dashboard → Audience → Users
3. Find the user by external_id (should match the Supabase user UUID)
4. Verify `alert_score_min` tag is present and shows as a **number type** (not string)
5. Verify `plan` tag is present and shows `"free"` or `"pro"`
6. Save new preferences → verify tags update immediately in the dashboard

Integration test from `claude-plan-tdd.md`:
```
# Test (integration): send test push notification via OneSignal REST API
#   → browser receives push on test device
#   → notification URL contains correct supabase_alert_id
```
