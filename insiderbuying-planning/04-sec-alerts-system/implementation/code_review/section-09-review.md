# Section 09 Code Review: Frontend OneSignal User Tagging

**Reviewer**: Claude Opus 4.6 (Senior Code Reviewer)
**Date**: 2026-03-28
**Files reviewed**: `OneSignalInit.tsx`, `public/OneSignalSDKWorker.js`, `tests/insiderbuying/onesignal-tagging.test.js`

---

## Summary

The implementation correctly addresses the core requirement: linking Supabase auth users to OneSignal subscribers via `OneSignal.login()` and syncing filter tags on preference save. The auth state subscription with cleanup is well-structured, the service worker is correctly placed, and the test file covers all six TDD cases from the spec. One critical issue with tag type handling needs resolution before merge.

---

## What Was Done Well

- **Auth lifecycle is correct**: `getSession()` on mount for already-logged-in users, plus `onAuthStateChange` for sign-in/sign-out transitions. Cleanup via `subscription.unsubscribe()` in the effect return prevents memory leaks.
- **Separated effects**: SDK init (Effect 1) and user linking (Effect 2) are correctly in separate `useEffect` blocks, so the init guard (`initialized.current`) does not block login on re-renders.
- **Service worker placement**: `public/OneSignalSDKWorker.js` is in the correct Next.js static directory. The CDN `importScripts` approach is the standard OneSignal v16 pattern. The placeholder comment is helpful.
- **Defensive coding**: `.catch(() => {})` on `getSession()`, optional chaining on `session?.user?.id`, fallback `|| "free"` on plan tag.
- **Test coverage**: All 6 TDD cases from the spec are covered, plus a valuable regression test proving the lexicographic bug (`"10" <= "6"` is `true`).

---

## Critical Issues (Must Fix)

### C1. `syncOneSignalTags` sends `String()` but the test expects `Number()` -- and the spec explicitly warns against `String()`

**The contradiction**:
- The spec (section-09-frontend-onesignal.md, line 59) explicitly states: *"Always pass the raw number: `OneSignal.User.addTag("alert_score_min", prefs.min_significance_score)` -- not `String(prefs.min_significance_score)`."*
- The implementation at `OneSignalInit.tsx:74` does `String(prefs.min_significance_score)` -- the exact thing the spec says NOT to do.
- The test file's `buildOneSignalTags()` returns `Number()` and asserts `typeof === 'number'` -- which does NOT match the actual `syncOneSignalTags()` code that sends `String()`.

**However, the implementation is actually correct for a different reason than the spec assumes.** The `react-onesignal` SDK type signature is:

```typescript
addTag(key: string, value: string): void;  // node_modules/react-onesignal/dist/index.d.ts:392
```

The SDK only accepts strings. Passing a raw `number` would either cause a TypeScript error or get silently coerced to string by the JS runtime before reaching the SDK. OneSignal's server-side tag storage is typeless -- the `<=` filter in `deliver-alert.js` works because OneSignal parses numeric-looking strings as numbers for comparison operators.

**The real problem**: The test (`buildOneSignalTags`) returns `Number()` and asserts numeric type, but the production code (`syncOneSignalTags`) sends `String()`. The test does not test the actual function. This means:
1. The test passes, giving false confidence.
2. The production code does the right thing (sends string, as the SDK requires).
3. But the spec and test are both wrong about what "correct" looks like.

**Fix**: Update the test's `buildOneSignalTags()` to match the real `syncOneSignalTags()` behavior -- return `String(prefs.min_significance_score)` and assert string type. Then update the spec's warning to explain that OneSignal `addTag` requires strings, and the server-side `<=` filter handles numeric parsing. Also add the JSDoc comment in `syncOneSignalTags` to clearly explain this (the existing comment at line 72-73 is correct but contradicts the comment at line 63-64 in the same function).

**Severity**: Critical. The test does not validate the actual production code path. If someone "fixes" `syncOneSignalTags` to match the test (removes `String()`), TypeScript would flag it, but in plain JS it would silently pass a number to a string-typed parameter.

---

## Important Issues (Should Fix)

### I1. Race condition: Effect 2 may call `OneSignal.login()` before SDK init completes

Effect 1 does `import("react-onesignal").then(OS => OS.default.init({...}))`. Effect 2 independently does `import("react-onesignal").then(OS => OS.default.login(...))`. Both effects run on mount. The dynamic import resolves from the module cache on the second call, so `login()` can execute before `init()` completes.

In practice, `react-onesignal` uses a deferred queue pattern (`window.OneSignalDeferred.push(...)`) internally, so calls made before init are buffered and replayed after init. This means it works, but it works by accident of the SDK's internal implementation, not by design of this code.

**Fix (optional, low risk)**: The current code works with the OneSignal v16 SDK's deferred queue. Add a brief comment in Effect 2 noting this dependency:

```typescript
// Effect 2 — Link Supabase user to OneSignal subscriber
// Note: OneSignal SDK uses a deferred queue, so login() calls before init()
// completes are buffered automatically. No explicit ordering needed.
```

This prevents a future developer from adding an `await` or guard that introduces a different timing bug.

### I2. `onAuthStateChange` fires on `TOKEN_REFRESHED` events, calling redundant `login()`

Supabase fires `onAuthStateChange` for `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`, and `PASSWORD_RECOVERY`. The current code calls `OneSignal.login()` on every event where `session?.user?.id` exists, including `TOKEN_REFRESHED` (which fires every ~60 minutes). This means `login()` is called repeatedly for the same user ID.

OneSignal's `login()` is idempotent for the same external ID, so this causes no functional bug -- just unnecessary SDK calls. But it is worth filtering:

```typescript
const { data: { subscription } } = supabase.auth.onAuthStateChange(
  (event, session) => {
    if (event === 'SIGNED_OUT') return; // no-op, user is gone
    if (session?.user?.id) {
      import("react-onesignal").then((OneSignal) => {
        OneSignal.default.login(session.user.id);
      });
    }
  }
);
```

Or, for maximum precision, only call on `SIGNED_IN` and `USER_UPDATED`. This is a minor optimization but improves clarity of intent.

### I3. No `OneSignal.logout()` on sign-out

When the user signs out, `onAuthStateChange` fires with `event === 'SIGNED_OUT'` and `session === null`. The current code does nothing (the `if (session?.user?.id)` guard skips it). This means the OneSignal subscriber remains linked to the old Supabase user ID after sign-out.

If another user signs in on the same browser, `login()` is called with the new ID, which correctly re-links. But between sign-out and new sign-in, push notifications could still be delivered to the old user's subscription.

**Fix**: Add `OneSignal.default.logout()` when event is `SIGNED_OUT`:

```typescript
(event, session) => {
  if (event === 'SIGNED_OUT') {
    import("react-onesignal").then((OS) => OS.default.logout());
    return;
  }
  if (session?.user?.id) {
    import("react-onesignal").then((OS) => OS.default.login(session.user.id));
  }
}
```

---

## Suggestions (Nice to Have)

### S1. Test file is `.js` but spec says `.ts`

The spec at line 36 says the test should be at `tests/insiderbuying/onesignal-tagging.test.ts` (TypeScript). The actual file is `.test.js`. This is consistent with other test files in the project (all `.test.js`), so it is fine pragmatically, but the spec should be updated to match reality.

### S2. `syncOneSignalTags` is exported from a `"use client"` component file

Exporting a standalone async function (`syncOneSignalTags`) from the same file as a React component (`OneSignalInit`) is slightly unusual. The function has no dependency on the component. Consider whether it should live in a dedicated `lib/onesignal.ts` utility file for cleaner imports from the alert preferences page. Not blocking -- it works fine as-is.

### S3. Test `buildOneSignalTags` is duplicated logic, not imported

The test defines its own `buildOneSignalTags()` and `shouldLoginToOneSignal()` functions that "mirror" the production code. This is an acceptable pattern when you cannot import React component code into a plain Jest test, but it means the test and production code can drift apart (as happened with C1). The comment at line 11 acknowledges this. If the project later adds jsdom support or extracts these as utility functions, the tests should be updated to import the real functions.

### S4. `export const dynamic = "force-static"` on the subscribe route

The `subscribe/route.ts` file has `export const dynamic = "force-static"` at line 1, but the GET and PUT handlers both call `supabase.auth.getUser()` which reads cookies -- a dynamic operation. This directive tells Next.js to statically generate the route at build time, which will fail or return unauthorized for all users. This is not part of the section-09 diff, but it is a pre-existing bug that will block the tag sync flow (tags are set after a successful PUT to this route).

---

## Plan Alignment

| Spec requirement | Status | Notes |
|---|---|---|
| `OneSignal.login()` called with `session.user.id` | PASS | Correct in both mount and state-change paths |
| Auth state change subscription + cleanup | PASS | `onAuthStateChange` + `return () => subscription.unsubscribe()` |
| `alert_score_min` as correct type for W5 filtering | NEEDS FIX | Production code sends String (correct for SDK). Test asserts Number (incorrect mirror). Spec warning is misleading |
| `plan` tag as `free`/`pro` | PASS | Fallback to `"free"` when missing |
| Service worker at `public/OneSignalSDKWorker.js` | PASS | CDN importScripts, placeholder comment |
| Tags set on preference save (not only login) | PASS | `syncOneSignalTags` exported for call-site use |
| All 6 TDD test cases | PASS (with caveat) | All cases covered, but test logic diverges from production code on type handling |

---

## Verdict

**Approve with required changes.** Fix C1 (align test assertions with actual `syncOneSignalTags` behavior -- both send strings) and consider I3 (add `logout()` on sign-out). The core auth linking and tag sync architecture is sound.
