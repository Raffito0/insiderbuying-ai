"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

async function handleCheckout(priceId: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "/signup";
    return;
  }

  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priceId }),
  });

  const data = await res.json();
  if (data.url) {
    window.location.href = data.url;
  }
}

const CHECK = <svg className="w-[14px] h-[14px] shrink-0" viewBox="0 0 14 14" fill="#006d34"><path d="M2 7l3.5 3.5L12 4" stroke="#006d34" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const DASH = <span className="text-[14px] text-[#c6c5d9]">&mdash;</span>;
const DOT = <svg className="w-[14px] h-[11px] shrink-0" viewBox="0 0 14 11" fill="none"><path d="M1 5.5l4 4L13 1" stroke="#006d34" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>;

const PRICING_PLANS = [
  { name: "Free", desc: "Start monitoring.", priceAnnual: "$0", priceMonthly: "$0", features: ["Delayed Form 4 feed (15-minute lag)", "5 watchlist tickers", "Weekly insider digest email", "Basic filing data", "Access to CEO Alpha Report"], border: "border border-[var(--color-border-light)]", btn: "", iconType: "check" as const, checkoutId: () => "" },
  { name: "Analyst", desc: "See what the data means.", priceAnnual: "$24", priceMonthly: "$29", features: ["Real-time Form 4 alerts (under 60 seconds)", "AI conviction scoring on every filing", "Plain-English analysis per transaction", "25 watchlist tickers with custom filters", "Weekly AI summary with sector patterns", "1 Deep Dive report per month", "Email and Slack delivery"], border: "border border-[var(--color-primary)]", btn: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-dark)]", popular: true, iconType: "badge" as const, checkoutId: (b: string) => b === "annual" ? (process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL || "price_1TFVfHBJM1hcMsSa9wD5IcfH") : (process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "price_1TFVfHBJM1hcMsSanZzyirRM") },
  { name: "Investor", desc: "The complete research desk.", priceAnnual: "$84", priceMonthly: "$99", features: ["Everything in Analyst", "Unlimited Deep Dive reports", "API access: programmatic Form 4 data", "Webhook integration", "Unlimited watchlist tickers", "Priority custom report requests (24h)", "CSV and JSON data export"], border: "border border-[var(--color-border-light)]", btn: "border border-[var(--color-border)] text-[color:var(--color-text)] hover:bg-[var(--color-bg-alt)]", iconType: "check" as const, checkoutId: (b: string) => b === "annual" ? (process.env.NEXT_PUBLIC_STRIPE_PRICE_INVESTOR_ANNUAL || "price_INVESTOR_ANNUAL_TODO") : (process.env.NEXT_PUBLIC_STRIPE_PRICE_INVESTOR_MONTHLY || "price_INVESTOR_MONTHLY_TODO") },
];

const COMPARISON = [
  { category: "DATA & ALERTS", rows: [
    { feature: "Form 4 feed (delayed 15 min)", free: true, pro: true, premium: true },
    { feature: "Real-time Form 4 alerts (under 60s)", free: false, pro: true, premium: true },
    { feature: "AI conviction scoring", free: false, pro: true, premium: true },
    { feature: "Plain-English analysis per filing", free: false, pro: true, premium: true },
  ]},
  { category: "WATCHLIST & FILTERS", rows: [
    { feature: "5 watchlist tickers", free: true, pro: true, premium: true },
    { feature: "25 watchlist tickers with custom filters", free: false, pro: true, premium: true },
    { feature: "Unlimited watchlist tickers", free: false, pro: false, premium: true },
  ]},
  { category: "REPORTS & DELIVERY", rows: [
    { feature: "Weekly insider digest email", free: true, pro: true, premium: true },
    { feature: "Weekly AI summary with sector patterns", free: false, pro: true, premium: true },
    { feature: "1 Deep Dive report per month", free: false, pro: true, premium: true },
    { feature: "Unlimited Deep Dive reports", free: false, pro: false, premium: true },
    { feature: "Email and Slack delivery", free: false, pro: true, premium: true },
  ]},
  { category: "INTEGRATIONS & EXPORT", rows: [
    { feature: "API access: programmatic Form 4 data", free: false, pro: false, premium: true },
    { feature: "Webhook integration", free: false, pro: false, premium: true },
    { feature: "CSV and JSON data export", free: false, pro: false, premium: true },
    { feature: "Priority custom report requests (24h)", free: false, pro: false, premium: true },
  ]},
];

const FAQS = [
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings in under 30 seconds. No phone call, no retention page. Annual plans refunded pro-rata." },
  { q: "Is this financial advice?", a: "No. EarlyInsider provides structured analysis of public SEC filing data. Conviction scores reflect pattern analysis, not recommendations." },
  { q: "Is there a free trial?", a: "Analyst and Investor plans include a 14-day free trial. No credit card required. After 14 days, reverts to Free automatically." },
  { q: "What payment methods do you accept?", a: "Visa, Mastercard, American Express via Stripe. Annual billing saves 20%." },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="bg-[var(--color-bg-alt)]">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[var(--color-bg-alt)] border-b border-[var(--color-border-light)] pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[1216px] mx-auto text-center">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] md:leading-[52px] text-[color:var(--color-text)] mb-[16px] md:mb-[24px]">
            Choose Your Signal Level
          </h1>
          <p className="text-[18px] font-normal leading-[28px] text-[color:var(--color-text-secondary)]">
            All plans include the SEC EDGAR real-time Form 4 feed. 17,325+ companies monitored continuously.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2: BILLING TOGGLE ═══ */}
      <section className="bg-white flex justify-center py-[32px] md:py-[48px]">
        <div className="bg-[var(--color-bg-alt)] p-[8px] flex items-center">
          <button
            onClick={() => setBilling("monthly")}
            className={`h-[44px] px-[24px] md:px-[32px] text-[14px] font-semibold leading-[20px] transition-all ${
              billing === "monthly" ? "bg-white text-[color:var(--color-primary)] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]" : "text-[color:var(--color-text-secondary)]"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={`h-[44px] px-[24px] md:px-[32px] text-[14px] font-semibold leading-[20px] flex items-center gap-[8px] transition-all ${
              billing === "annual" ? "bg-white text-[color:var(--color-primary)] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]" : "text-[color:var(--color-text-secondary)]"
            }`}
          >
            Annually
            <span className="bg-[var(--color-signal-green)] text-white text-[11px] font-bold leading-[20px] px-[8px] rounded-[2px]">SAVE 21%</span>
          </button>
        </div>
      </section>

      {/* ═══ SECTION 3: PRICING CARDS (same style as homepage) ═══ */}
      <section className="bg-white pb-[var(--section-y-mobile)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[1024px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-[var(--gap-items)]">
          {PRICING_PLANS.map((p) => (
            <div key={p.name} className={`bg-white p-[28px] md:p-[48px] relative ${p.border}`}>
              {p.popular && <div className="absolute -top-[15px] left-1/2 -translate-x-1/2 bg-[var(--color-signal-green)] text-white text-[11px] font-extrabold tracking-[1px] px-[16px] py-[4px] rounded-[2px] whitespace-nowrap">MOST POPULAR</div>}
              <h3 className="font-[var(--font-montaga)] text-[32px] leading-[32px] tracking-[1px] text-[color:var(--color-text)] mb-[8px]">{p.name}</h3>
              <p className="text-[14px] leading-[20px] tracking-[1px] text-[color:var(--color-text-secondary)] mb-[16px]">{p.desc}</p>
              <div className="flex items-baseline mb-[8px]">
                <span className="font-[var(--font-montaga)] text-[48px] leading-[48px] tracking-[0.5px] text-[color:var(--color-text)]">{billing === "annual" ? p.priceAnnual : p.priceMonthly}</span>
                <span className="text-[16px] leading-[24px] text-[color:var(--color-text-muted)] ml-[4px]">/mo</span>
              </div>
              {billing === "annual" && p.name !== "Free" && <p className="text-[12px] font-normal leading-[16px] text-[color:var(--color-text-muted)] mb-[32px]">billed annually</p>}
              {(billing !== "annual" || p.name === "Free") && <div className="mb-[32px]" />}
              <ul className="flex flex-col gap-[16px] mb-[48px]">
                {p.features.map(f => (
                  <li key={f} className="flex items-center gap-[12px] text-[14px] leading-[20px] text-[color:var(--color-text)]">
                    {p.iconType === "badge" ? (
                      <div className="w-[15px] h-[15px] rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
                        <svg className="w-[8px] h-[8px]" viewBox="0 0 8 8"><path d="M1 4l2 2L7 2" stroke="white" strokeWidth="1.5" fill="none"/></svg>
                      </div>
                    ) : (
                      <svg className="w-[11px] h-[8px] shrink-0" viewBox="0 0 11 8"><path d="M1 4l3 3L10 1" stroke="#006d34" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    )}
                    {f}
                  </li>
                ))}
              </ul>
              {p.name === "Free" ? (
                <Link href="/signup" className="flex items-center justify-center w-full h-[58px] text-[16px] font-medium tracking-[1px] transition-colors border border-[var(--color-border)] text-[color:var(--color-text)] hover:bg-[var(--color-bg-alt)]">Start Monitoring Free</Link>
              ) : (
                <button
                  onClick={() => handleCheckout(p.checkoutId(billing))}
                  className={`flex items-center justify-center w-full h-[58px] text-[16px] font-medium tracking-[1px] transition-colors cursor-pointer ${p.btn}`}
                >
                  Get Access
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SECTION 4: FEATURE COMPARISON TABLE ═══ */}
      <section className="bg-[var(--color-bg-alt)] pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[1024px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[length:var(--text-title)] font-normal leading-[1.1] md:leading-[36px] text-[color:var(--color-text)] text-center mb-[40px] md:mb-[64px]">
            Compare features
          </h2>

          <div className="bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
            <div className="min-w-0">
            {/* Header */}
            <div className="flex bg-[#00058f]">
              <div className="w-[45%] md:flex-1 py-[20px] md:py-[24px] px-[8px] md:px-[32px]">
                <span className="text-[12px] md:text-[14px] font-bold leading-[16px] md:tracking-[0.5px] text-white uppercase">Feature Matrix</span>
              </div>
              <div className="w-[18%] md:w-[139px] py-[20px] md:py-[24px] px-[2px] md:px-[16px] text-center">
                <span className="text-[12px] md:text-[14px] font-bold leading-[16px] md:tracking-[0.5px] text-white uppercase">Free</span>
              </div>
              <div className="w-[18%] md:w-[122px] py-[20px] md:py-[24px] px-[2px] md:px-[16px] text-center">
                <span className="text-[12px] md:text-[14px] font-bold leading-[16px] md:tracking-[0.5px] text-white uppercase">Analyst</span>
              </div>
              <div className="w-[19%] md:w-[189px] py-[20px] md:py-[24px] px-[2px] md:px-[16px] text-center">
                <span className="text-[12px] md:text-[14px] font-bold leading-[16px] md:tracking-[0.5px] text-white uppercase">Investor</span>
              </div>
            </div>

            {/* Body */}
            {COMPARISON.map((cat) => (
              <div key={cat.category}>
                {/* Category header */}
                <div className="bg-[#191ea8] py-[12px] px-[16px] md:px-[32px]">
                  <span className="text-[12px] font-bold leading-[20px] tracking-[0.5px] text-white uppercase">{cat.category}</span>
                </div>
                {/* Rows */}
                {cat.rows.map((row) => (
                  <div key={row.feature} className="flex border-b border-[var(--color-bg-alt)]">
                    <div className="w-[45%] md:flex-1 py-[16px] md:py-[20px] px-[8px] md:px-[32px]">
                      <span className="text-[13px] md:text-[14px] font-normal leading-[18px] md:leading-[20px] text-[color:var(--color-text)]">{row.feature}</span>
                    </div>
                    <div className="w-[18%] md:w-[139px] py-[16px] md:py-[18px] flex items-center justify-center">
                      {row.free ? DOT : DASH}
                    </div>
                    <div className="w-[18%] md:w-[122px] py-[16px] md:py-[18px] flex items-center justify-center">
                      {row.pro ? DOT : DASH}
                    </div>
                    <div className="w-[19%] md:w-[189px] py-[16px] md:py-[18px] flex items-center justify-center">
                      {row.premium ? DOT : DASH}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: FAQ ═══ */}
      <section className="bg-white pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[768px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[length:var(--text-title)] font-normal leading-[1.1] md:leading-[36px] text-[color:var(--color-text)] text-center mb-[40px] md:mb-[64px]">
            Frequently Asked Questions
          </h2>
          <div className="flex flex-col gap-[16px]">
            {FAQS.map((faq, i) => (
              <div key={i} className="border-b border-[var(--color-border-light)] py-[20px] md:py-[24px]">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                  className="w-full flex items-center justify-between"
                >
                  <span className="text-[16px] md:text-[18px] font-normal leading-[28px] text-[color:var(--color-text)] text-left">{faq.q}</span>
                  <svg className={`w-[12px] h-[12px] shrink-0 ml-[16px] text-[color:var(--color-text)] transition-transform ${openFaq === i ? "rotate-45" : ""}`} viewBox="0 0 12 12">
                    <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                {openFaq === i && (
                  <p className="mt-[16px] text-[15px] md:text-[16px] font-normal leading-[24px] md:leading-[26px] text-[color:var(--color-text-secondary)]">{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 6: FINAL CTA ═══ */}
      <section className="bg-[var(--color-primary)] pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px] relative overflow-hidden">
        {/* Decorative lines */}
        <div className="absolute inset-0 opacity-[0.06]">
          <div className="absolute top-[80px] left-0 right-0 h-[1px] bg-white" />
          <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-white" />
          <div className="absolute bottom-[80px] left-0 right-0 h-[1px] bg-white" />
        </div>
        <div className="relative max-w-[1216px] mx-auto text-center">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[length:var(--text-title)] font-normal leading-[1.2] md:leading-[40px] text-white mb-[16px] md:mb-[24px]">
            Last week: 847 Form 4 filings across SEC EDGAR.
          </h2>
          <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[28px] text-white max-w-[576px] mx-auto mb-[24px]">
            23 triggered high-conviction alerts. Free users received the Monday morning digest. Analyst subscribers had each alert within 60 seconds.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[16px] sm:gap-[23px] pt-[24px]">
            <Link href="/signup" className="flex items-center justify-center h-[56px] md:h-[60px] px-[40px] bg-white text-[color:var(--color-navy)] text-[14px] font-medium leading-[20px] rounded-[2px] hover:bg-white/90 transition-colors w-full sm:w-auto">
              Start Monitoring Free
            </Link>
            <Link href="/about" className="text-[14px] font-bold leading-[20px] text-white hover:underline">
              View Methodology
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
