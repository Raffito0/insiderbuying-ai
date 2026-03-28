# Section 08: Frontend — Subscription-Aware Blur

## Dependency

Requires **section-00-schema-migration** (the `profiles` table with `subscription_tier` column must exist). Can be implemented in parallel with all backend sections (02–07) and with section-09.

---

## Goal

The `/alerts` page currently applies `blur-[4px] select-none` and the "Upgrade to Pro" CTA overlay to **every** user unconditionally. This section makes that conditional: Pro users see the full AI analysis without blur; Free and unauthenticated users see it blurred with a CTA.

The blur is intentionally CSS-only (not server-side truncation). The text is present in the DOM — this is the FOMO mechanic. The spec explicitly allows this.

---

## Tests

**File**: `ryan_cole/insiderbuying-site/tests/insiderbuying/alerts-blur.test.tsx`

Write these tests BEFORE modifying the component:

```
# Test: isPro=true → ai_analysis rendered WITHOUT blur-[4px] and WITHOUT select-none class
# Test: isPro=false → ai_analysis rendered WITH blur-[4px] select-none class
# Test: unauthenticated user → treated as Free (blur applied, no profiles query needed)
# Test: isPro=false → "Upgrade to Pro" CTA overlay div is present in the DOM
# Test: isPro=true → "Upgrade to Pro" CTA overlay div is NOT rendered
# Test: profiles query failure (Supabase error) → gracefully falls back to isPro=false (blur everything)
# Test (integration): Supabase Realtime — new alert inserted in Supabase appears on /alerts page within 3 seconds
```

Test approach: render `AlertsPage` with a mocked `createClient` that returns a controlled `profiles` response. Assert presence/absence of `blur-[4px]` class and CTA element. Use React Testing Library.

---

## File to Modify

**`ryan_cole/insiderbuying-site/src/app/alerts/page.tsx`**

This is a `"use client"` Next.js page component. It already uses `useState` and `useEffect` with `createClient` from `@/lib/supabase/client`.

---

## Current State (what exists today)

The existing `useEffect` at line 84:
1. Creates a Supabase client
2. Fetches the 20 most recent rows from `insider_alerts`, ordered by `created_at` desc
3. Subscribes to Realtime INSERT events on `insider_alerts`

The existing render at line 220 unconditionally applies blur:
```tsx
<p className="text-[13px] md:text-[14px] font-normal leading-[20px] text-[#1c1b1b] blur-[4px] select-none">{a.ai}</p>
```

The existing CTA overlay at lines 221–225 is always rendered when `a.ai` is truthy.

---

## Changes Required

### 1. Add `isPro` state

Add a new state variable alongside the existing `isSampleData` state:

```tsx
const [isPro, setIsPro] = useState(false);
```

Default is `false` — unauthenticated users and Free users both start blurred. This is the safe default: if the profiles query fails, blur stays on.

### 2. Add profiles query inside the existing `useEffect`

Inside the same `useEffect` (after the alerts fetch), add a query to the `profiles` table:

```tsx
// Check subscription tier
supabase.auth.getUser().then(({ data: { user } }) => {
  if (!user) return; // unauthenticated → stays isPro=false
  supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .single()
    .then(({ data }) => {
      if (data?.subscription_tier === "pro") {
        setIsPro(true);
      }
      // on error or non-pro → stays false (blur everything)
    });
});
```

This runs once on mount. It does NOT need to re-run on Realtime events — subscription tier doesn't change mid-session in normal usage.

### 3. Make blur conditional on `isPro`

Change the paragraph at line 220 from unconditional blur to conditional:

```tsx
// Before:
<p className="... blur-[4px] select-none">{a.ai}</p>

// After:
<p className={`text-[13px] md:text-[14px] font-normal leading-[20px] text-[#1c1b1b] ${!isPro ? "blur-[4px] select-none" : ""}`}>{a.ai}</p>
```

### 4. Make the CTA overlay conditional on `isPro`

The overlay div (lines 221–225) that contains the lock icon, "Upgrade to Pro" text, and "Unlock this insight" link should only render when `!isPro`:

```tsx
// Wrap in: {!isPro && ( ... overlay JSX ... )}
```

### 5. Unauthenticated user — signup CTA variant

The spec says: unauthenticated users see blur + **signup CTA** (not upgrade CTA). Add a check inside the CTA overlay:

```tsx
const [isLoggedIn, setIsLoggedIn] = useState(false);
```

Set `isLoggedIn = true` when `getUser()` returns a non-null user. Inside the overlay, render either:
- If `!isLoggedIn`: "Sign up for free" link pointing to `/signup`
- If `isLoggedIn && !isPro`: "Upgrade to Pro" link pointing to `/pricing`

This distinction is important for conversion — the unauthenticated CTA should not say "Upgrade" (implies they already have an account).

---

## State Summary

After all changes, the component has these state variables:

| Variable | Type | Default | Description |
|---|---|---|---|
| `alerts` | `AlertDisplay[]` | `SAMPLE_ALERTS` | Alert feed data |
| `isSampleData` | `boolean` | `true` | Whether showing placeholder data |
| `isPro` | `boolean` | `false` | Whether current user has Pro subscription |
| `isLoggedIn` | `boolean` | `false` | Whether user is authenticated |

---

## Blur Behavior Matrix

| User state | Blur applied | CTA shown | CTA text |
|---|---|---|---|
| Unauthenticated | Yes | Yes | "Sign up for free" → `/signup` |
| Authenticated, Free | Yes | Yes | "Upgrade to Pro" → `/pricing` |
| Authenticated, Pro | No | No | — |
| Profiles query error | Yes (fallback) | Yes | "Upgrade to Pro" → `/pricing` |

---

## What NOT to Change

- The Realtime subscription logic — it already works and does not need to know about `isPro`
- The `mapAlert` function — it maps all fields including `ai_analysis` at full length (no server-side truncation)
- Sample data behavior — sample alerts can stay blurred (they're not real data anyway)
- The sticky bottom upgrade banner — it is separate from the per-card blur and should remain always visible

---

## Integration Test

After implementing, verify end-to-end:

1. Log in as a Free user → open `/alerts` → confirm all AI analysis sections are blurred
2. In Supabase Dashboard, set `profiles.subscription_tier = 'pro'` for that user → refresh page → confirm blur is gone and CTA is hidden
3. Log out → confirm blur returns (unauthenticated = Free)
4. Test Realtime: insert a row directly into `insider_alerts` via Supabase Dashboard → confirm it appears on the page within 3 seconds without a page reload
