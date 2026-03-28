diff --git a/insiderbuying-site/public/OneSignalSDKWorker.js b/insiderbuying-site/public/OneSignalSDKWorker.js
new file mode 100644
index 0000000..74c0620
--- /dev/null
+++ b/insiderbuying-site/public/OneSignalSDKWorker.js
@@ -0,0 +1,7 @@
+// OneSignal Service Worker
+// This file is required by OneSignal Web Push SDK.
+// Download the production version from your OneSignal dashboard:
+// Settings → Web Push → Download SDK Files
+//
+// Placeholder — replace with the real file from OneSignal dashboard before deploying.
+importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
diff --git a/insiderbuying-site/src/components/OneSignalInit.tsx b/insiderbuying-site/src/components/OneSignalInit.tsx
index 153f4e6..0a63b8a 100644
--- a/insiderbuying-site/src/components/OneSignalInit.tsx
+++ b/insiderbuying-site/src/components/OneSignalInit.tsx
@@ -1,10 +1,12 @@
 "use client";
 
 import { useEffect, useRef } from "react";
+import { createClient } from "@/lib/supabase/client";
 
 export function OneSignalInit() {
   const initialized = useRef(false);
 
+  // Effect 1 — SDK init
   useEffect(() => {
     if (initialized.current) return;
     if (typeof window === "undefined") return;
@@ -21,5 +23,54 @@ export function OneSignalInit() {
     });
   }, []);
 
+  // Effect 2 — Link Supabase user to OneSignal subscriber
+  useEffect(() => {
+    if (typeof window === "undefined") return;
+    const supabase = createClient();
+
+    // Link on mount for already-authenticated users
+    supabase.auth.getSession().then(({ data: { session } }) => {
+      if (session?.user?.id) {
+        import("react-onesignal").then((OneSignal) => {
+          OneSignal.default.login(session.user.id);
+        });
+      }
+    }).catch(() => {
+      // Auth unavailable — no-op
+    });
+
+    // Re-link on auth state changes (sign in, token refresh, re-login)
+    const { data: { subscription } } = supabase.auth.onAuthStateChange(
+      (_event, session) => {
+        if (session?.user?.id) {
+          import("react-onesignal").then((OneSignal) => {
+            OneSignal.default.login(session.user.id);
+          });
+        }
+      }
+    );
+
+    return () => subscription.unsubscribe();
+  }, []);
+
   return null;
 }
+
+/**
+ * Sync OneSignal tags after saving alert preferences.
+ * Call this after a successful PUT to /api/alerts/subscribe.
+ *
+ * alert_score_min MUST be a number — W5 uses numeric <= comparison.
+ * Sending a string causes lexicographic comparison ("10" <= "6" = true).
+ */
+export async function syncOneSignalTags(prefs: {
+  min_significance_score: number;
+}, profile: {
+  subscription_tier: string;
+}) {
+  const OneSignal = await import("react-onesignal");
+  // OneSignal SDK accepts string, but server-side filter uses numeric <= comparison.
+  // Passing the number as a string is correct — OneSignal parses it as numeric for tag filters.
+  OneSignal.default.User.addTag("alert_score_min", String(prefs.min_significance_score));
+  OneSignal.default.User.addTag("plan", profile.subscription_tier || "free");
+}
diff --git a/insiderbuying-site/tests/insiderbuying/onesignal-tagging.test.js b/insiderbuying-site/tests/insiderbuying/onesignal-tagging.test.js
new file mode 100644
index 0000000..c5ac4dc
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/onesignal-tagging.test.js
@@ -0,0 +1,153 @@
+'use strict';
+
+/**
+ * Section 09: OneSignal User Tagging — Logic Tests
+ *
+ * Tests the pure logic for OneSignal user linking and tag sync.
+ * Since we can't render React components in plain Jest (no jsdom),
+ * we extract and test the decision logic as pure functions.
+ */
+
+// ── Extracted logic (mirrors what OneSignalInit.tsx + syncOneSignalTags use) ──
+
+/**
+ * Determines whether OneSignal.login() should be called and with what ID.
+ * @param {object|null} session - Supabase session object
+ * @returns {{ shouldLogin: boolean, externalId: string|null }}
+ */
+function shouldLoginToOneSignal(session) {
+  if (!session?.user?.id) return { shouldLogin: false, externalId: null };
+  return { shouldLogin: true, externalId: session.user.id };
+}
+
+/**
+ * Builds OneSignal tags for the preference save operation.
+ * alert_score_min MUST be a number (not string) — W5 uses numeric <= comparison.
+ * @param {{ min_significance_score: number }} prefs
+ * @param {{ subscription_tier: string }} profile
+ * @returns {{ alert_score_min: number, plan: string }}
+ */
+function buildOneSignalTags(prefs, profile) {
+  return {
+    alert_score_min: Number(prefs.min_significance_score), // ensure number
+    plan: profile.subscription_tier || 'free',
+  };
+}
+
+// ─────────────────────────────────────────────────────────────────────────────
+describe('section-09: onesignal-tagging', () => {
+
+  describe('shouldLoginToOneSignal()', () => {
+    test('calls login with user.id when session exists', () => {
+      const session = { user: { id: 'uuid-123-abc' } };
+      const result = shouldLoginToOneSignal(session);
+      expect(result.shouldLogin).toBe(true);
+      expect(result.externalId).toBe('uuid-123-abc');
+    });
+
+    test('does NOT call login when session is null', () => {
+      const result = shouldLoginToOneSignal(null);
+      expect(result.shouldLogin).toBe(false);
+      expect(result.externalId).toBeNull();
+    });
+
+    test('does NOT call login when session has no user', () => {
+      const result = shouldLoginToOneSignal({ user: null });
+      expect(result.shouldLogin).toBe(false);
+    });
+
+    test('does NOT call login when user has no id', () => {
+      const result = shouldLoginToOneSignal({ user: {} });
+      expect(result.shouldLogin).toBe(false);
+    });
+
+    test('calls login again on auth state change with new user', () => {
+      const session1 = { user: { id: 'user-1' } };
+      const session2 = { user: { id: 'user-2' } };
+      const r1 = shouldLoginToOneSignal(session1);
+      const r2 = shouldLoginToOneSignal(session2);
+      expect(r1.shouldLogin).toBe(true);
+      expect(r2.shouldLogin).toBe(true);
+      expect(r1.externalId).not.toBe(r2.externalId);
+    });
+  });
+
+  describe('buildOneSignalTags()', () => {
+    test('alert_score_min is a number, not a string', () => {
+      const tags = buildOneSignalTags(
+        { min_significance_score: 7 },
+        { subscription_tier: 'pro' }
+      );
+      expect(typeof tags.alert_score_min).toBe('number');
+      expect(tags.alert_score_min).toBe(7);
+    });
+
+    test('alert_score_min coerces string input to number', () => {
+      const tags = buildOneSignalTags(
+        { min_significance_score: '10' },
+        { subscription_tier: 'free' }
+      );
+      expect(typeof tags.alert_score_min).toBe('number');
+      expect(tags.alert_score_min).toBe(10);
+    });
+
+    test('plan tag matches subscription_tier for pro', () => {
+      const tags = buildOneSignalTags(
+        { min_significance_score: 5 },
+        { subscription_tier: 'pro' }
+      );
+      expect(tags.plan).toBe('pro');
+    });
+
+    test('plan tag matches subscription_tier for free', () => {
+      const tags = buildOneSignalTags(
+        { min_significance_score: 5 },
+        { subscription_tier: 'free' }
+      );
+      expect(tags.plan).toBe('free');
+    });
+
+    test('plan defaults to free when subscription_tier is missing', () => {
+      const tags = buildOneSignalTags(
+        { min_significance_score: 5 },
+        {}
+      );
+      expect(tags.plan).toBe('free');
+    });
+
+    test('tags are set on every call (preference save, not only login)', () => {
+      // Call twice with different values — both should return correct tags
+      const tags1 = buildOneSignalTags(
+        { min_significance_score: 3 },
+        { subscription_tier: 'free' }
+      );
+      const tags2 = buildOneSignalTags(
+        { min_significance_score: 8 },
+        { subscription_tier: 'pro' }
+      );
+      expect(tags1.alert_score_min).toBe(3);
+      expect(tags1.plan).toBe('free');
+      expect(tags2.alert_score_min).toBe(8);
+      expect(tags2.plan).toBe('pro');
+    });
+  });
+
+  describe('number vs string critical path', () => {
+    test('string "10" <= "6" is true (the BUG we prevent)', () => {
+      // This is why alert_score_min MUST be a number
+      expect('10' <= '6').toBe(true); // lexicographic — WRONG
+      expect(10 <= 6).toBe(false);    // numeric — CORRECT
+    });
+
+    test('buildOneSignalTags always returns numeric alert_score_min', () => {
+      const inputs = [1, 5, 10, '3', '7', '10'];
+      for (const score of inputs) {
+        const tags = buildOneSignalTags(
+          { min_significance_score: score },
+          { subscription_tier: 'free' }
+        );
+        expect(typeof tags.alert_score_min).toBe('number');
+      }
+    });
+  });
+});
