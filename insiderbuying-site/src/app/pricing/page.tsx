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
const DOT = <svg className="w-[14px] h-[14px] shrink-0" viewBox="0 0 14 14" fill="#006d34"><circle cx="7" cy="7" r="5"/></svg>;

const COMPARISON = [
  { category: "ALERTS", rows: [
    { feature: "Real-time SEC Form 4 alerts", free: false, pro: true, premium: true },
    { feature: "Smart notification filters", free: false, pro: true, premium: true },
  ]},
  { category: "ANALYSIS", rows: [
    { feature: "AI conviction scoring", free: false, pro: true, premium: true },
    { feature: "Insider track record analysis", free: false, pro: false, premium: true },
  ]},
  { category: "REPORTS", rows: [
    { feature: "Monthly insider digest", free: true, pro: true, premium: true },
    { feature: "Deep dive stock reports", free: false, pro: false, premium: true },
  ]},
  { category: "SUPPORT", rows: [
    { feature: "Community access", free: true, pro: true, premium: true },
    { feature: "Priority email support", free: false, pro: true, premium: true },
  ]},
];

const FAQS = [
  { q: "How accurate is the data?", a: "All data is sourced directly from SEC EDGAR filings. We parse Form 4 filings within 60 seconds of publication with 99.9% accuracy." },
  { q: "Can I cancel my subscription anytime?", a: "Yes. Cancel with one click from your account settings. No hidden fees, no questions asked. You keep access until the end of your billing period." },
  { q: "Do you offer a free trial for Pro?", a: "We don't offer a free trial, but our Free tier lets you experience the core alert feed. Upgrade when you need the full analysis." },
  { q: "What payment methods do you accept?", a: "We accept all major credit cards, debit cards, and Apple Pay / Google Pay through our secure Stripe payment processor." },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "annual">("annual");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="bg-[var(--color-bg-alt)]">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[var(--color-bg-alt)] border-b border-[var(--color-border-light)] pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[1216px] mx-auto text-center">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] md:leading-[52px] text-[var(--color-text)] mb-[16px] md:mb-[24px]">
            Simple Pricing
          </h1>
          <p className="text-[18px] md:text-[20px] font-normal leading-[28px] text-[var(--color-text-secondary)]">
            Start free. Upgrade when you need the full picture.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2: BILLING TOGGLE ═══ */}
      <section className="bg-white flex justify-center py-[32px] md:py-[48px]">
        <div className="bg-[var(--color-bg-alt)] p-[8px] flex items-center">
          <button
            onClick={() => setBilling("monthly")}
            className={`h-[40px] px-[24px] md:px-[32px] text-[14px] font-semibold leading-[20px] transition-all ${
              billing === "monthly" ? "bg-white text-[var(--color-primary)] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]" : "text-[var(--color-text-secondary)]"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            className={`h-[44px] px-[24px] md:px-[32px] text-[14px] font-semibold leading-[20px] flex items-center gap-[8px] transition-all ${
              billing === "annual" ? "bg-white text-[var(--color-primary)] shadow-[0px_1px_2px_rgba(0,0,0,0.05)]" : "text-[var(--color-text-secondary)]"
            }`}
          >
            Annually
            <span className="bg-[var(--color-signal-green)] text-white text-[10px] font-bold leading-[20px] px-[8px] rounded-[2px]">SAVE 21%</span>
          </button>
        </div>
      </section>

      {/* ═══ SECTION 3: PRICING CARDS ═══ */}
      <section className="bg-white pb-[var(--section-y-mobile)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[1216px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-[24px]">

          {/* FREE */}
          <div className="bg-white border border-[var(--color-border-light)] p-[28px] md:p-[40px] flex flex-col">
            <div className="mb-[32px]">
              <p className="text-[14px] font-bold leading-[20px] text-[var(--color-text-secondary)] mb-[16px]">Free</p>
              <div className="flex items-baseline gap-[4px]">
                <span className="font-[var(--font-montaga)] text-[36px] font-normal leading-[40px] text-[var(--color-text)]">$0</span>
                <span className="text-[14px] font-normal leading-[20px] text-[var(--color-text-secondary)]">/mo</span>
              </div>
            </div>
            <ul className="flex flex-col gap-[16px] mb-[40px] flex-1">
              {["Basic SEC filing alerts","Delayed ticker data (15m)","3 Saved watchlists"].map(f => (
                <li key={f} className="flex items-center gap-[12px]">{CHECK}<span className="text-[14px] font-normal leading-[20px] text-[var(--color-text-secondary)]">{f}</span></li>
              ))}
            </ul>
            <Link href="/signup" className="flex items-center justify-center h-[54px] border border-[var(--color-border)] text-[14px] font-bold leading-[20px] text-[var(--color-text)] hover:bg-[var(--color-bg-alt)] transition-colors">
              Sign Up Free
            </Link>
          </div>

          {/* PRO (Most Popular) */}
          <div className="bg-white border border-[var(--color-primary)] p-[28px] md:p-[40px] flex flex-col relative shadow-[0px_25px_50px_rgba(0,0,0,0.08)]">
            <div className="absolute -top-[12px] left-1/2 -translate-x-1/2 bg-[var(--color-signal-green)] text-white text-[10px] font-extrabold leading-[15px] px-[16px] py-[4px] rounded-[2px] whitespace-nowrap">
              MOST POPULAR
            </div>
            <div className="mb-[30px]">
              <p className="text-[14px] font-bold leading-[20px] text-[var(--color-primary)] mb-[16px]">Pro</p>
              <div className="flex items-baseline gap-[4px]">
                <span className="font-[var(--font-montaga)] text-[36px] font-normal leading-[40px] text-[var(--color-text)]">
                  ${billing === "annual" ? "24" : "29"}
                </span>
                <span className="text-[14px] font-normal leading-[20px] text-[var(--color-text-secondary)]">/mo</span>
              </div>
              {billing === "annual" && <p className="text-[12px] font-normal leading-[16px] text-[var(--color-text-muted)] mt-[4px]">billed annually</p>}
            </div>
            <ul className="flex flex-col gap-[16px] mb-[38px] flex-1">
              {["Real-time SEC Form 4 alerts","Institutional ownership data","Insider score analysis","Unlimited watchlists"].map(f => (
                <li key={f} className="flex items-center gap-[12px]">
                  <div className="w-[15px] h-[15px] rounded-full bg-[var(--color-primary)] flex items-center justify-center shrink-0">
                    <svg className="w-[8px] h-[8px]" viewBox="0 0 8 8"><path d="M1 4l2 2L7 2" stroke="white" strokeWidth="1.5" fill="none"/></svg>
                  </div>
                  <span className="text-[14px] font-normal leading-[20px] text-[var(--color-text)]">{f}</span>
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout(billing === "annual" ? process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_ANNUAL || "price_1TFVfHBJM1hcMsSa9wD5IcfH" : process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO_MONTHLY || "price_1TFVfHBJM1hcMsSanZzyirRM")}
              className="flex items-center justify-center h-[54px] bg-[var(--color-primary)] text-[14px] font-bold leading-[20px] text-white hover:bg-[var(--color-primary-dark)] transition-colors w-full cursor-pointer"
            >
              Start Pro Trial
            </button>
          </div>

          {/* PREMIUM */}
          <div className="bg-white border border-[var(--color-border-light)] p-[28px] md:p-[40px] flex flex-col">
            <div className="mb-[32px]">
              <p className="text-[14px] font-bold leading-[20px] text-[var(--color-text-secondary)] mb-[16px]">Premium</p>
              <div className="flex items-baseline gap-[4px]">
                <span className="font-[var(--font-montaga)] text-[36px] font-normal leading-[40px] text-[var(--color-text)]">
                  ${billing === "annual" ? "39" : "49"}
                </span>
                <span className="text-[14px] font-normal leading-[20px] text-[var(--color-text-secondary)]">/mo</span>
              </div>
              {billing === "annual" && <p className="text-[12px] font-normal leading-[16px] text-[var(--color-text-muted)] mt-[4px]">billed annually</p>}
            </div>
            <ul className="flex flex-col gap-[16px] mb-[40px] flex-1">
              {["API Access (10k calls/mo)","Custom Bloomberg-style terminal","1-on-1 Analyst support","Exportable CSV/Excel reports"].map(f => (
                <li key={f} className="flex items-center gap-[12px]">{CHECK}<span className="text-[14px] font-normal leading-[20px] text-[var(--color-text-secondary)]">{f}</span></li>
              ))}
            </ul>
            <Link href="/signup" className="flex items-center justify-center h-[54px] border border-[var(--color-border)] text-[14px] font-bold leading-[20px] text-[var(--color-text)] hover:bg-[var(--color-bg-alt)] transition-colors">
              Contact Sales
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 4: FEATURE COMPARISON TABLE ═══ */}
      <section className="bg-[var(--color-bg-alt)] pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[1024px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[var(--text-title)] font-normal leading-[1.1] md:leading-[36px] text-[var(--color-text)] text-center mb-[40px] md:mb-[64px]">
            Compare features
          </h2>

          <div className="bg-white shadow-[0px_1px_2px_rgba(0,0,0,0.05)] overflow-hidden">
            {/* Header */}
            <div className="flex border-b border-[var(--color-border-light)]">
              <div className="flex-1 py-[20px] md:py-[24px] px-[16px] md:px-[32px]">
                <span className="text-[13px] md:text-[14px] font-medium leading-[16px] text-[var(--color-text-secondary)]">Feature Matrix</span>
              </div>
              <div className="w-[60px] md:w-[139px] py-[20px] md:py-[24px] px-[8px] md:px-[16px] text-center">
                <span className="font-[var(--font-montaga)] text-[13px] md:text-[14px] font-normal leading-[16px] text-[var(--color-text)]">Free</span>
              </div>
              <div className="w-[60px] md:w-[122px] py-[20px] md:py-[24px] px-[8px] md:px-[16px] text-center">
                <span className="font-[var(--font-montaga)] text-[13px] md:text-[14px] font-normal leading-[16px] text-[var(--color-primary)]">Pro</span>
              </div>
              <div className="w-[70px] md:w-[189px] py-[20px] md:py-[24px] px-[8px] md:px-[16px] text-center">
                <span className="font-[var(--font-montaga)] text-[13px] md:text-[14px] font-normal leading-[16px] text-[var(--color-text)]">Premium</span>
              </div>
            </div>

            {/* Body */}
            {COMPARISON.map((cat) => (
              <div key={cat.category}>
                {/* Category header */}
                <div className="bg-[#f5f5f5] py-[12px] px-[16px] md:px-[32px]">
                  <span className="text-[11px] md:text-[12px] font-bold leading-[20px] tracking-[0.5px] text-[var(--color-text-muted)] uppercase">{cat.category}</span>
                </div>
                {/* Rows */}
                {cat.rows.map((row) => (
                  <div key={row.feature} className="flex border-b border-[var(--color-bg-alt)]">
                    <div className="flex-1 py-[16px] md:py-[20px] px-[16px] md:px-[32px]">
                      <span className="text-[13px] md:text-[14px] font-normal leading-[20px] text-[var(--color-text)]">{row.feature}</span>
                    </div>
                    <div className="w-[60px] md:w-[139px] py-[16px] md:py-[18px] flex items-center justify-center">
                      {row.free ? DOT : DASH}
                    </div>
                    <div className="w-[60px] md:w-[122px] py-[16px] md:py-[18px] flex items-center justify-center">
                      {row.pro ? DOT : DASH}
                    </div>
                    <div className="w-[70px] md:w-[189px] py-[16px] md:py-[18px] flex items-center justify-center">
                      {row.premium ? DOT : DASH}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: FAQ ═══ */}
      <section className="bg-white pt-[var(--section-y-mobile)] pb-[var(--section-y-mobile)] md:pt-[var(--section-y)] md:pb-[var(--section-y)] px-[20px] md:px-[32px]">
        <div className="max-w-[768px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[var(--text-title)] font-normal leading-[1.1] md:leading-[36px] text-[var(--color-text)] text-center mb-[40px] md:mb-[64px]">
            Frequently Asked Questions
          </h2>
          <div className="flex flex-col gap-[16px]">
            {FAQS.map((faq, i) => (
              <div key={i} className="border-b border-[var(--color-border-light)] py-[20px] md:py-[24px]">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between"
                >
                  <span className="text-[15px] md:text-[16px] font-normal leading-[24px] text-[var(--color-text)] text-left">{faq.q}</span>
                  <svg className={`w-[12px] h-[12px] shrink-0 ml-[16px] text-[var(--color-text)] transition-transform ${openFaq === i ? "rotate-45" : ""}`} viewBox="0 0 12 12">
                    <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
                {openFaq === i && (
                  <p className="mt-[16px] text-[14px] font-normal leading-[22px] text-[var(--color-text-secondary)]">{faq.a}</p>
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
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[var(--text-title)] font-normal leading-[1.2] md:leading-[40px] text-white mb-[16px] md:mb-[24px]">
            Ready to gain an information edge?
          </h2>
          <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[28px] text-white max-w-[576px] mx-auto mb-[24px]">
            Join over 12,000 institutional and retail investors using EarlyInsider to track the smart money.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[16px] sm:gap-[23px] pt-[24px]">
            <Link href="/signup" className="flex items-center justify-center h-[56px] md:h-[60px] px-[40px] bg-white text-[var(--color-navy)] text-[14px] font-medium leading-[20px] rounded-[2px] hover:bg-white/90 transition-colors w-full sm:w-auto">
              Get Started Now
            </Link>
            <Link href="/about" className="text-[14px] font-bold leading-[20px] text-white hover:underline">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
