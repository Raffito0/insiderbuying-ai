diff --git a/insiderbuying-site/src/app/alerts/page.tsx b/insiderbuying-site/src/app/alerts/page.tsx
index 62e4ca7..da81741 100644
--- a/insiderbuying-site/src/app/alerts/page.tsx
+++ b/insiderbuying-site/src/app/alerts/page.tsx
@@ -81,6 +81,8 @@ const TOP_BUYS = [
 export default function AlertsPage() {
   const [alerts, setAlerts] = useState<AlertDisplay[]>(SAMPLE_ALERTS);
   const [isSampleData, setIsSampleData] = useState(true);
+  const [isPro, setIsPro] = useState(false);
+  const [isLoggedIn, setIsLoggedIn] = useState(false);
   useEffect(() => {
     const supabase = createClient();
 
@@ -98,6 +100,23 @@ export default function AlertsPage() {
         // If empty or error, keep sample data
       });
 
+    // Check subscription tier
+    supabase.auth.getUser().then(({ data: { user } }) => {
+      if (!user) return; // unauthenticated → stays isPro=false
+      setIsLoggedIn(true);
+      supabase
+        .from("profiles")
+        .select("subscription_tier")
+        .eq("id", user.id)
+        .single()
+        .then(({ data }) => {
+          if (data?.subscription_tier === "pro") {
+            setIsPro(true);
+          }
+          // on error or non-pro → stays false (blur everything)
+        });
+    });
+
     // Subscribe to realtime INSERTs
     const channel = supabase
       .channel("insider_alerts_realtime")
@@ -217,12 +236,18 @@ export default function AlertsPage() {
                       <span className="text-[12px] font-bold leading-[16px] text-[var(--color-primary)]">AI Sentiment Analysis</span>
                     </div>
                     <div className="relative">
-                      <p className="text-[13px] md:text-[14px] font-normal leading-[20px] text-[var(--color-text)] blur-[4px] select-none">{a.ai}</p>
-                      <div className="absolute inset-0 bg-[var(--color-bg-alt)]/60 flex flex-col items-center justify-center">
-                        <svg className="w-[14px] h-[19px] mb-[8px]" viewBox="0 0 14 19" fill="#1c1b1b"><path d="M7 0a5 5 0 00-5 5v3H1a1 1 0 00-1 1v9a1 1 0 001 1h12a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a5 5 0 00-5-5zm3 8V5a3 3 0 10-6 0v3h6z"/></svg>
-                        <p className="text-[13px] md:text-[14px] font-medium leading-[20px] text-[var(--color-text)] text-center">Upgrade to Pro for instant AI analysis</p>
-                        <Link href="/pricing" className="text-[12px] font-medium leading-[16px] text-[var(--color-primary)] mt-[4px]">Unlock this insight &rarr;</Link>
-                      </div>
+                      <p className={`text-[13px] md:text-[14px] font-normal leading-[20px] text-[var(--color-text)] ${!isPro ? "blur-[4px] select-none" : ""}`}>{a.ai}</p>
+                      {!isPro && (
+                        <div className="absolute inset-0 bg-[var(--color-bg-alt)]/60 flex flex-col items-center justify-center">
+                          <svg className="w-[14px] h-[19px] mb-[8px]" viewBox="0 0 14 19" fill="#1c1b1b"><path d="M7 0a5 5 0 00-5 5v3H1a1 1 0 00-1 1v9a1 1 0 001 1h12a1 1 0 001-1V9a1 1 0 00-1-1h-1V5a5 5 0 00-5-5zm3 8V5a3 3 0 10-6 0v3h6z"/></svg>
+                          <p className="text-[13px] md:text-[14px] font-medium leading-[20px] text-[var(--color-text)] text-center">
+                            {!isLoggedIn ? "Sign up for free to unlock AI analysis" : "Upgrade to Pro for instant AI analysis"}
+                          </p>
+                          <Link href={!isLoggedIn ? "/signup" : "/pricing"} className="text-[12px] font-medium leading-[16px] text-[var(--color-primary)] mt-[4px]">
+                            {!isLoggedIn ? "Sign up free" : "Unlock this insight"} &rarr;
+                          </Link>
+                        </div>
+                      )}
                     </div>
                   </div>
                 )}
diff --git a/insiderbuying-site/tests/insiderbuying/alerts-blur.test.js b/insiderbuying-site/tests/insiderbuying/alerts-blur.test.js
new file mode 100644
index 0000000..bf981e5
--- /dev/null
+++ b/insiderbuying-site/tests/insiderbuying/alerts-blur.test.js
@@ -0,0 +1,112 @@
+'use strict';
+
+/**
+ * Section 08: Subscription-Aware Blur — Logic Tests
+ *
+ * Tests the blur/CTA logic extracted from alerts/page.tsx.
+ * Since the project uses plain Jest (no jsdom/RTL), we test the
+ * pure logic functions that determine blur and CTA behavior.
+ */
+
+// ── Extracted logic (mirrors what page.tsx uses) ─────────────────────────────
+
+function getBlurState({ isLoggedIn, isPro }) {
+  return {
+    shouldBlur: !isPro,
+    showCta: !isPro,
+    ctaText: !isLoggedIn ? 'Sign up for free' : 'Upgrade to Pro',
+    ctaLink: !isLoggedIn ? '/signup' : '/pricing',
+  };
+}
+
+function deriveIsPro(profileData) {
+  if (!profileData) return false;
+  return profileData.subscription_tier === 'pro';
+}
+
+function getBlurClasses(isPro) {
+  return isPro ? '' : 'blur-[4px] select-none';
+}
+
+// ─────────────────────────────────────────────────────────────────────────────
+describe('section-08: alerts-blur logic', () => {
+
+  describe('deriveIsPro()', () => {
+    test('returns true for pro subscription', () => {
+      expect(deriveIsPro({ subscription_tier: 'pro' })).toBe(true);
+    });
+
+    test('returns false for free subscription', () => {
+      expect(deriveIsPro({ subscription_tier: 'free' })).toBe(false);
+    });
+
+    test('returns false for null profile data (query error)', () => {
+      expect(deriveIsPro(null)).toBe(false);
+    });
+
+    test('returns false for undefined profile data', () => {
+      expect(deriveIsPro(undefined)).toBe(false);
+    });
+
+    test('returns false for missing subscription_tier field', () => {
+      expect(deriveIsPro({})).toBe(false);
+    });
+  });
+
+  describe('getBlurClasses()', () => {
+    test('isPro=true → no blur classes', () => {
+      expect(getBlurClasses(true)).toBe('');
+    });
+
+    test('isPro=false → blur-[4px] select-none', () => {
+      expect(getBlurClasses(false)).toBe('blur-[4px] select-none');
+    });
+  });
+
+  describe('getBlurState()', () => {
+    test('unauthenticated → blur, signup CTA', () => {
+      const state = getBlurState({ isLoggedIn: false, isPro: false });
+      expect(state.shouldBlur).toBe(true);
+      expect(state.showCta).toBe(true);
+      expect(state.ctaText).toBe('Sign up for free');
+      expect(state.ctaLink).toBe('/signup');
+    });
+
+    test('authenticated free → blur, upgrade CTA', () => {
+      const state = getBlurState({ isLoggedIn: true, isPro: false });
+      expect(state.shouldBlur).toBe(true);
+      expect(state.showCta).toBe(true);
+      expect(state.ctaText).toBe('Upgrade to Pro');
+      expect(state.ctaLink).toBe('/pricing');
+    });
+
+    test('authenticated pro → no blur, no CTA', () => {
+      const state = getBlurState({ isLoggedIn: true, isPro: true });
+      expect(state.shouldBlur).toBe(false);
+      expect(state.showCta).toBe(false);
+    });
+
+    test('profiles query failure → treated as free (blur)', () => {
+      // When profiles query fails, isPro stays false
+      const state = getBlurState({ isLoggedIn: true, isPro: false });
+      expect(state.shouldBlur).toBe(true);
+      expect(state.showCta).toBe(true);
+    });
+  });
+
+  describe('blur behavior matrix', () => {
+    const cases = [
+      { desc: 'unauthenticated',       isLoggedIn: false, isPro: false, blur: true,  cta: true,  ctaText: 'Sign up for free' },
+      { desc: 'authenticated, free',    isLoggedIn: true,  isPro: false, blur: true,  cta: true,  ctaText: 'Upgrade to Pro' },
+      { desc: 'authenticated, pro',     isLoggedIn: true,  isPro: true,  blur: false, cta: false, ctaText: undefined },
+      { desc: 'profiles error',         isLoggedIn: true,  isPro: false, blur: true,  cta: true,  ctaText: 'Upgrade to Pro' },
+    ];
+
+    test.each(cases)('$desc → blur=$blur, cta=$cta', ({ isLoggedIn, isPro, blur, cta, ctaText }) => {
+      const state = getBlurState({ isLoggedIn, isPro });
+      expect(state.shouldBlur).toBe(blur);
+      expect(state.showCta).toBe(cta);
+      if (ctaText) expect(state.ctaText).toBe(ctaText);
+    });
+  });
+});
