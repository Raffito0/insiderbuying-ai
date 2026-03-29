# **EarlyInsider.com — Comprehensive UI Audit**

**Date:** 2026-03-28 | **Framework:** Next.js 16 \+ Tailwind v4 | **Pages audited:** 8+ pages \+ shared components

---

## **Anti-Patterns Verdict**

**Result: Mostly passes, with 3 notable tells**

The design is purposefully restrained — dark navy \+ green/red data signals, Montaga serif \+ Inter body, no glassmorphism, no gradient text, no rainbow palette. It reads like a data product, not a WordPress template. However:

1. **Empty icon circles** (homepage "How It Works", line 149): Placeholder gray circles (`w-[64px] h-[64px] rounded-full bg-[var(--color-bg-alt)]`) with no actual icons — a classic AI-generated filler. These are empty by design in the code.  
2. **"Hero metrics" trio** (10.2% / 25% / 60%) — defensible because they cite actual academic papers, but the visual treatment (3 large number cards) is a common AI template pattern.  
3. **Inter font for body** — expected and not a problem; the Montaga pairing redeems it.

**Overall anti-pattern score: 7/10 (design is distinctive enough)**

---

## **Executive Summary**

| Severity | Count |
| ----- | ----- |
| Critical | 2 |
| High | 6 |
| Medium | 7 |
| Low | 5 |

**Top 3 blockers:**

1. Broken CSS variable `--color-muted` in Navbar — nav links have no intended color  
2. FAQ category tabs do not filter — broken feature  
3. `--color-text-muted` (\#94A3B8) fails WCAG AA contrast (2.4:1) — used site-wide

---

## **Critical Issues**

### **C-1 — Broken CSS Variable in Navbar**

**Location:** Navbar.tsx:35,46,96,104  
**Category:** Theming / Visual Bug

**Impact:** All nav links (Live Alerts, Reports, How It Works, Pricing, Login) on BOTH desktop and mobile are missing their intended color. `var(--color-muted)` resolves to nothing — the defined variable is `--color-text-muted`. Links will fallback to `inherit` (body color \#1C1B1B), making nav links indistinguishable from black body text.

\# Navbar.tsx lines 35, 46, 96, 104  
var(--color-muted)  ←── DOESN'T EXIST  
                   should be: var(--color-text-muted)

**Suggested command:** `/normalize` to fix token usage across components.

---

### **C-2 — FAQ Category Tabs Are Non-Functional**

**Location:** faq/page.tsx:39-78  
**Category:** Broken Functionality

**Impact:** The 6 category tabs (All / Getting Started / Alerts / Pricing / Data & Security / Account) update `activeTab` state but the FAQ groups are **never filtered** by it. Users click tabs expecting content to change — nothing happens. This is a user trust issue on a page that signals product credibility.

// activeTab is set but never used in filtering:  
const \[activeTab, setActiveTab\] \= useState("All");  
// FAQ\_GROUPS.map(...) — no filter applied anywhere

**Suggested command:** Fix with `/harden` (add the filter logic).

---

## **High-Severity Issues**

### **H-1 — `--color-text-muted` Fails WCAG AA Contrast Everywhere**

**Location:** Entire site — used as secondary text, labels, subtitles  
**Category:** Accessibility / Contrast  
**WCAG:** 1.4.3 Contrast (Minimum) — Level AA

**Impact:** `#94A3B8` on white `#FFFFFF` \= **2.4:1 contrast ratio**. WCAG AA requires 4.5:1 for normal text and 3:1 for large text (18pt+). This token fails both. Used in: ticker/title subtitles in alert feed, comparison table muted headers, pricing page secondary text, mobile alert subtitles, navbar (where the variable exists but is broken — C-1).

**Recommendation:** Darken `--color-text-muted` to at least `#6B7280` (contrast ratio 4.6:1 on white).

**Suggested command:** `/normalize` to update the token.

---

### **H-2 — 11px Text on Mobile**

**Location:** Homepage mobile alert feed — page.tsx:125, Pricing comparison table category headers — pricing/page.tsx:217  
**Category:** Typography / Responsive

**Impact:** `text-[11px]` is completely illegible on mobile without zoom. Below 12px is generally considered the absolute minimum; iOS Safari's minimum default is 12px (browsers sometimes auto-scale up but this isn't reliable). Two specific locations:

* page.tsx:125 — mobile alert subtitle: `"text-[11px] font-normal text-[color:var(--color-text-muted)]"` — 11px text in a low-contrast muted color  
* pricing/page.tsx:217 — comparison table category headers on mobile: `"text-[11px] md:text-[12px]"`

**Recommendation:** Minimum 14px for secondary/caption text on mobile. 13px for captions if necessary.

**Suggested command:** `/typeset`

---

### **H-3 — Billing Toggle: Inconsistent Button Heights**

**Location:** pricing/page.tsx:90-104  
**Category:** UI Inconsistency / Touch Target

**Impact:** Monthly button is `h-[40px]`, Annual button is `h-[44px]`. In the same pill-style toggle, two different heights create a visible vertical misalignment. The inner buttons don't align.

\<\!-- Monthly: h-\[40px\] \--\>  
\<\!-- Annual: h-\[44px\] (includes the SAVE badge inline) \--\>

**Recommended fix:** Both buttons `h-[44px]`, place the SAVE badge absolutely or outside the button.

**Suggested command:** `/polish`

---

### **H-4 — Missing `aria-expanded` on Mobile Hamburger**

**Location:** Navbar.tsx:59-62  
**Category:** Accessibility (WCAG 4.1.2)

**Impact:** The hamburger button has `aria-label="Toggle menu"` but no `aria-expanded={mobileOpen}`. Screen readers can't tell users whether the menu is open or closed.

**Recommended fix:** Add `aria-expanded={mobileOpen}` to the button element.

**Suggested command:** `/harden`

---

### **H-5 — FAQ Accordion Missing ARIA Expand State**

**Location:** faq/page.tsx:94-107  
**Category:** Accessibility (WCAG 4.1.2)

**Impact:** The `<button>` elements that toggle FAQ items are missing `aria-expanded` and `aria-controls`. Screen reader users have no way to know which items are open/closed without listening to the content.

The buttons use `<button>` elements (correct), but need:

* `aria-expanded={isOpen}`  
* `aria-controls={answerId}`  
* The answer div needs `id={answerId}` and `role="region"`

**Suggested command:** `/harden`

---

### **H-6 — `MOST POPULAR` and `SAVE 21%` Badges at 10px**

**Location:** pricing/page.tsx:103,133  
**Category:** Typography

**Impact:** `text-[10px]` on the "MOST POPULAR" pill badge and the "SAVE 21%" badge. These are key conversion elements. 10px is sub-pixel on many displays and completely illegible on low-density screens.

**Recommendation:** Minimum 11px for these, preferably 12px. The `font-extrabold`/`font-bold` weights help but don't compensate for the raw size.

**Suggested command:** `/typeset`

---

## **Medium-Severity Issues**

### **M-1 — Entire Homepage is `"use client"` for Static Data**

**Location:** page.tsx:1  
**Category:** Performance

**Impact:** The whole homepage (600+ lines, with ALERTS, STATS, REPORTS, PLANS, FAQS, LOGOS arrays) is a client bundle. Only the FAQ accordion needs client state (`openFaq`). Everything else — the hero, alert feed, how-it-works, stats, charts, reports, pricing preview — is completely static and could be a server component. This unnecessarily bloats the JS bundle shipped to users.

**Recommendation:** Extract only the FAQ accordion into a `<FaqSection>` client component. The rest becomes server-rendered HTML.

**Suggested command:** `/optimize`

---

### **M-2 — Logo Ticker Keyframe in Inline `<style>` Tag**

**Location:** page.tsx:82  
**Category:** Performance / Code Pattern

**Impact:** `<style>{`@keyframes scroll{...}`}</style>` injected inside JSX is non-standard. While it works in this render context, the keyframe isn't cached by the browser's CSS engine the same way a stylesheet entry would be. Should live in `globals.css`.

**Recommendation:** Move to globals.css under a `@keyframes scroll` block.

**Suggested command:** `/optimize`

---

### **M-3 — Logo Ticker Not `aria-hidden`**

**Location:** page.tsx:76-83  
**Category:** Accessibility

**Impact:** The scrolling ticker renders 40 company name `<span>` elements (LOGOS array doubled). Screen readers will announce all 40 items. This is purely decorative trust-building content.

**Recommended fix:** Add `aria-hidden="true"` to the section.

---

### **M-4 — FAQ `<nav>` Element Misuse**

**Location:** faq/page.tsx:62  
**Category:** Semantic HTML (WCAG 1.3.1)

**Impact:** The category filter bar uses `<nav>` element but contains filter toggle buttons, not navigation links. `<nav>` is reserved for sets of navigation links (ARIA landmark). Screen reader users browsing by landmarks will find this "navigation" region confusing.

**Recommended fix:** Change to `<div role="tablist" aria-label="FAQ Categories">` with each button having `role="tab"` and `aria-selected`.

---

### **M-5 — Feature Comparison Table Inaccessible on Mobile**

**Location:** pricing/page.tsx:196-260  
**Category:** Responsive / Accessibility

**Impact:** On narrow mobile (375px), the comparison table has:

* Feature text column: flexible width (most of row)  
* Free column: fixed `w-[60px]`  
* Analyst column: fixed `w-[60px]`  
* Investor column: fixed `w-[70px]`

At 375px width with 40px horizontal padding, the feature text column is approximately 375-40-60-60-70 \= **145px** for long feature descriptions like "API access: programmatic Form 4 data". This causes aggressive text wrapping making rows multi-line and the table difficult to read. No horizontal scroll wrapper.

**Recommendation:** Add `overflow-x-auto` wrapper, or switch to a stacked card format on mobile.

**Suggested command:** `/adapt`

---

### **M-6 — Design System Tokens Not Used for Typography Scale**

**Location:** globals.css — entire codebase  
**Category:** Theming / Maintainability

**Impact:** `globals.css` defines `--text-display: 54px`, `--text-title: 42px`, etc. but most pages use raw pixel values like `text-[54px]`, `text-[42px]` directly. Only a few places use `text-[length:var(--text-title)]`. If you need to adjust the type scale, you'd need to find and change every instance rather than updating one token.

**Recommendation:** Consistently use `text-[length:var(--text-title)]` etc. throughout.

**Suggested command:** `/normalize`

---

### **M-7 — Dead CSS Tokens in Design System**

**Location:** globals.css:7,30  
**Category:** Theming / Maintainability

**Impact:** `--color-navy: #002A5E` and `--color-link: #000AD2` are defined in the theme but never referenced in any of the reviewed component files. These are dead variables that create false expectations.

**Recommendation:** Either use them consistently (especially `--color-link` for actual hyperlinks) or remove them.

---

## **Low-Severity Issues**

### **L-1 — Tab Buttons: Insufficient Touch Target Height**

**Location:** faq/page.tsx:65-76  
**Category:** Accessibility / Mobile UX (WCAG 2.5.5)

**Impact:** Category tab buttons have `pb-[16px]` (for the border indicator) but no `pt-` padding. Effective touch area: \~36px tall (20px line-height \+ 16px bottom padding). Apple HIG recommends 44pt minimum. The container has `py-[16px]` but that's on the wrapping div.

**Recommendation:** Add `py-[14px]` to each button, use `mb` for the border indicator instead.

---

### **L-2 — Hero Sub-caption at 14px with Low Opacity**

**Location:** page.tsx:61-62  
**Category:** Typography

**Impact:** "All data sourced directly from SEC EDGAR." is `text-[14px] text-white/60`. While white-on-dark has good contrast overall, 60% opacity white at 14px is at the edge of readability on mobile. At 375px this serves as a trust signal but may be missed.

**Recommendation:** Bump to `text-white/75` or `text-white/80`.

---

### **L-3 — Pricing: Investor CTA Uses Link Instead of Checkout**

**Location:** pricing/page.tsx:181-183  
**Category:** UX / Conversion

**Impact:** The Analyst card uses `<button onClick={() => handleCheckout(...)}>` (goes directly to Stripe). The Investor card uses `<Link href="/signup">` (goes to signup, not checkout). Users clicking "Start 14-Day Trial" on Investor land on a generic signup page, not a pre-filled checkout. Possible conversion drop.

**Recommendation:** Investor card should also use `handleCheckout(INVESTOR_PRICE_ID)`.

---

### **L-4 — No Focus Rings on Interactive Elements**

**Location:** Entire codebase  
**Category:** Accessibility (WCAG 2.4.7)

**Impact:** Interactive elements (Navbar CTA button, pricing toggle buttons, FAQ accordion triggers, comparison table) have no explicit `focus:ring` classes. Tailwind's CSS reset removes browser defaults. Keyboard-only and screen reader users can't see focused state.

**Recommended fix:** Add `focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] focus-visible:outline-none` to all interactive elements.

**Suggested command:** `/harden`

---

### **L-5 — Homepage Alert Feed Section: Redundant Padding**

**Location:** page.tsx:86,139  
**Category:** Spacing Inconsistency

**Impact:** The Live Alert Feed section uses `py-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)]` (consistent). But the How It Works section uses `pt-[var(--section-y-mobile)] px-[20px] md:px-[100px] pb-[var(--section-y-mobile)] md:pb-[var(--section-y)]` — it has `md:px-[100px]` (100px horizontal padding on tablet) but no `lg:` override, AND an inner `div` with `px-[32px]` — double-padding is applied on medium screens.

**Suggested command:** `/polish`

---

## **Patterns & Systemic Issues**

1. **`text-[11px]` appears in 2+ locations** — 11px should be globally banned below `--text-caption` (12px minimum)  
2. **`var(--color-muted)` used in Navbar but not defined** — suggests the variable was renamed during development but not updated in all consumers  
3. **Type scale tokens exist in globals.css but almost never used** — `text-[length:var(--text-title)]` pattern is only used in \~4 locations; the rest use raw `text-[42px]`, `text-[54px]` values. Systemic inconsistency.  
4. **Every page is `"use client"`** — even pages with no user interaction. This pattern should only apply where state/events are actually needed.  
5. **Focus styles absent universally** — no `focus-visible:ring` on any interactive element across the reviewed files.

---

## **Positive Findings**

* **Semantic button elements for FAQ accordion** — properly uses `<button>` not `<div>` (after what appears to be a revision), and faq/page.tsx:94 shows correct button semantics  
* **CSS custom properties architecture** — the token system in globals.css is clean and well-organized; the problem is adoption, not the system itself  
* **Mobile-first responsive breakpoints** — consistently uses `md:` upgrades, mobile layout is a true first-class citizen  
* **Color-coded signals** — green/red buy/sell system is consistent and purposeful throughout the design, not decorative  
* **`aria-label` on hamburger** — Navbar has the label even if missing `aria-expanded`  
* **Correct contrast on body text** — `--color-text: #1C1B1B` (\~18:1 on white) and `--color-text-secondary: #454556` (\~8.3:1 on white) both pass WCAG AAA  
* **Sample data fallback** — graceful degradation when real data unavailable is production-quality thinking  
* **Space Mono for data/tickers** — typographically intentional, elevates the fintech character of the product

---

## **Recommendations by Priority**

### **Immediate (blocking or broken)**

1. **Fix `--color-muted` → `--color-text-muted`** in Navbar.tsx (4 lines) — nav is visually broken  
2. **Implement FAQ tab filtering** — broken feature on the FAQ page  
3. **Darken `--color-text-muted`** from `#94A3B8` to `#6B7280` — site-wide contrast failure

### **Short-term (this sprint)**

4. **Eliminate `text-[11px]`** — replace with minimum `text-[13px]` throughout  
5. **Add `aria-expanded` to** hamburger and FAQ accordion buttons  
6. **Fix billing toggle height** — both buttons to `h-[44px]`  
7. **Badge font sizes** — 10px badges to 11-12px  
8. **Fix Investor CTA** — should use `handleCheckout()` not `<Link href="/signup">`

### **Medium-term (next sprint)**

9. **Add `focus-visible:ring` to all interactive elements** — keyboard accessibility sweep  
10. **Move logo ticker keyframe to globals.css**  
11. **Add `aria-hidden="true"` to logo ticker section**  
12. **Fix `<nav>` → `<div role="tablist">` in FAQ**  
13. **Comparison table mobile** — add scroll wrapper or responsive alternative  
14. **Split homepage client/server** — extract `FaqSection` client component only

### **Long-term (polish)**

15. **Migrate all raw pixel type sizes to design token variables**  
16. **Remove or use dead tokens** (`--color-navy`, `--color-link`)  
17. **Address logo ticker double-padding on How It Works section**

---

## **Suggested Commands for Fixes**

| Command | Addresses |
| ----- | ----- |
| `/typeset` | H-2 (11px text), H-6 (10px badges), L-2 (hero caption opacity), M-6 (token adoption) |
| `/normalize` | C-1 (broken variable), H-1 (contrast token), M-6 (type scale) |
| `/harden` | C-2 (FAQ filtering), H-4 (aria-expanded hamburger), H-5 (accordion ARIA), L-4 (focus rings) |
| `/adapt` | M-5 (comparison table mobile overflow) |
| `/polish` | H-3 (toggle height), L-5 (section padding) |
| `/optimize` | M-1 (use client scope), M-2 (keyframe inline style) |

