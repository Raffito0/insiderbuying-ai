"use client";

import { useState } from "react";

const FEATURES = [
  "CEO vs. CFO buying performance gap",
  "Cluster buying signals from 10-year backtest",
  "Industry-specific conviction multipliers",
  "Risk-adjusted return attribution metrics",
];

const CARDS = [
  { title: "Backtest Results", desc: "A deep dive into 10 years of CEO buying data and the specific alpha generated compared to the S&P 500." },
  { title: "Current Patterns", desc: "Identification of the three dominant buying patterns emerging in the current high-interest rate environment." },
  { title: "Conviction Scoring", desc: "How to weight an insider purchase based on the executive\u2019s historical performance and position size." },
];

export default function FreeReportPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 1000));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <div className="bg-[#fcf9f8]">

      {/* ═══ SECTION 1: HERO ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px]">
        <div className="max-w-[1216px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-[40px] lg:gap-[64px] items-start">

          {/* Left — Text content */}
          <div className="flex flex-col gap-[32px] max-w-[576px]">
            <p className="text-[14px] font-bold leading-[20px] text-[#006d34] font-[var(--font-mono)]">FREE RESEARCH</p>
            <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] md:leading-[60px] text-[#1c1b1b]">
              InsiderBuying<br />Backtest Report
            </h1>
            <p className="text-[18px] font-normal leading-[28px] text-[#000ad2]">Updated March 2026</p>
            <p className="text-[18px] font-normal leading-[29px] text-[#454556]">
              Our proprietary analysis of over 50,000 SEC Form 4 filings reveals the specific CEO purchase patterns that historically precede significant market outperformance.
            </p>
            <ul className="flex flex-col gap-[16px]">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-[12px]">
                  <svg className="w-[20px] h-[20px] shrink-0" viewBox="0 0 20 20" fill="#006d34"><circle cx="10" cy="10" r="10"/><path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" fill="none"/></svg>
                  <span className="text-[16px] font-medium leading-[24px] text-[#1c1b1b]">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — Report preview card */}
          <div className="flex flex-col items-center gap-[-11px]">
            <div className="w-full max-w-[478px] bg-white rounded-[2px] border border-[#000592] shadow-[0px_4px_24px_rgba(0,0,0,0.08)] p-[16px]">
              {/* Report mockup interior */}
              <div className="flex flex-col gap-[24px] p-[16px]">
                {/* Top bar */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-[var(--font-mono)] text-[#000592] uppercase tracking-wider">InsiderBuying.ai</span>
                  <span className="text-[10px] font-normal text-[#757688]">March 2026</span>
                </div>
                {/* Title */}
                <div className="pt-[32px]">
                  <h2 className="font-[var(--font-montaga)] text-[28px] font-normal leading-[32px] text-[#1c1b1b]">
                    The Insider Alpha<br />Strategy
                  </h2>
                </div>
                <div className="w-[48px] h-[6px] bg-[#006d34] rounded-full" />
                {/* Description */}
                <p className="text-[13px] font-normal leading-[20px] text-[#454556]">
                  Proprietary backtest analysis of 50,000+ SEC Form 4 filings. CEO buying signals vs S&P 500 benchmark.
                </p>
              </div>
              {/* Chart mockup */}
              <div className="bg-white p-[8px] mt-[16px]">
                <div className="flex items-end justify-center gap-[8px] h-[117px]">
                  {[40, 65, 30, 55, 75, 45, 60, 35, 70, 50].map((h, i) => (
                    <div key={i} className="w-[28px] bg-[#000592] rounded-t-[2px]" style={{ height: `${h}px` }} />
                  ))}
                </div>
              </div>
              {/* Footer stats */}
              <div className="flex items-center justify-between pt-[16px] mt-[16px] border-t border-[#f0eded]">
                <div>
                  <p className="text-[18px] font-bold leading-[24px] text-[#006d34] font-[var(--font-mono)]">+23.4%</p>
                  <p className="text-[10px] font-normal leading-[14px] text-[#757688]">Avg. Signal Return</p>
                </div>
                <div className="text-right">
                  <p className="text-[18px] font-bold leading-[24px] text-[#1c1b1b] font-[var(--font-mono)]">68%</p>
                  <p className="text-[10px] font-normal leading-[14px] text-[#757688]">Win Rate (12mo)</p>
                </div>
              </div>
            </div>
            <p className="text-[14px] font-light leading-[16px] text-[#454556] text-center pt-[48px]">
              12-14 pages &middot; Updated monthly &middot; Free forever
            </p>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 2: EMAIL CAPTURE ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[390px]">
        <div className="max-w-[500px] mx-auto text-center">
          {submitted ? (
            <div className="py-[32px]">
              <div className="w-[56px] h-[56px] rounded-full bg-[#006d34]/10 flex items-center justify-center mx-auto mb-[16px]">
                <svg className="w-[24px] h-[24px]" viewBox="0 0 24 24" fill="#006d34"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </div>
              <h2 className="font-[var(--font-montaga)] text-[42px] font-normal leading-[36px] text-[#1c1b1b] mb-[12px]">Check your email!</h2>
              <p className="text-[16px] font-normal leading-[24px] text-[#454556]">We sent the report to <strong>{email}</strong></p>
            </div>
          ) : (
            <>
              <h2 className="font-[var(--font-montaga)] text-[42px] font-normal leading-[36px] text-[#1c1b1b] mb-[12px]">
                Get the Report
              </h2>
              <p className="text-[16px] font-normal leading-[24px] text-[#454556] mb-[32px]">
                Enter your email and we&apos;ll send it instantly.
              </p>
              <form onSubmit={handleSubmit} className="flex flex-col gap-[16px]">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="institutional@firm.com"
                  className="w-full h-[55px] px-[24px] bg-white text-[16px] font-normal leading-[19px] text-[#1c1b1b] placeholder:text-[#757688] focus:outline-none focus:ring-2 focus:ring-[#000592]"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-[52px] bg-[#006d34] text-white text-[14px] font-bold leading-[20px] hover:bg-[#005c28] transition-colors disabled:opacity-50"
                >
                  {loading ? "Sending..." : "Download Free Report"}
                </button>
                <p className="text-[12px] font-normal leading-[15px] text-[#757688]">
                  By clicking download, you agree to our Terms of Service and Privacy Policy.
                </p>
              </form>
            </>
          )}
        </div>
      </section>

      {/* ═══ SECTION 3: WHAT YOU'LL LEARN ═══ */}
      <section className="bg-[#fcf9f8] pt-[64px] pb-[64px] md:pt-[128px] md:pb-[128px] px-[20px] md:px-[32px] lg:px-[150px]">
        <div className="max-w-[980px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[42px] font-normal leading-[1.2] md:leading-[40px] text-[#1c1b1b] mb-[40px] md:mb-[80px]">
            What You&apos;ll Learn
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[20px] md:gap-[32px]">
            {CARDS.map((card) => (
              <div key={card.title} className="bg-white rounded-[4px] border-[0px] border-black/0 p-[40px]">
                <div className="w-full h-[28px] bg-[#000592] rounded-[2px] opacity-30 mb-[24px]" />
                <h3 className="text-[20px] font-bold leading-[28px] text-[#1c1b1b] mb-[24px]">{card.title}</h3>
                <p className="text-[16px] font-normal leading-[26px] text-[#454556]">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 4: SOCIAL PROOF BAR ═══ */}
      <section className="bg-white border-y border-[#f0eded] py-[48px] px-[32px]">
        <p className="text-[12px] font-normal leading-[16px] text-[#757688] font-[var(--font-mono)] text-center">
          Powered by real SEC Form 4 data &middot; Updated monthly &middot; 100% free
        </p>
      </section>

      {/* ═══ SECTION 5: FINAL CTA ═══ */}
      <section className="bg-[#002a5e] pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[192px] relative overflow-hidden">
        {/* Abstract bg */}
        <div className="absolute left-0 top-0 bottom-0 w-[426px] opacity-10 bg-gradient-to-r from-white/20 to-transparent" />

        <div className="relative max-w-[896px] mx-auto text-center">
          <h2 className="font-[var(--font-montaga)] text-[30px] md:text-[42px] font-normal leading-[1.2] md:leading-[48px] text-white mb-[16px]">
            Don&apos;t invest blind.
          </h2>
          <p className="text-[16px] md:text-[20px] font-normal leading-[26px] md:leading-[28px] text-white mb-[32px] md:mb-[48px]">
            See what executives are buying with their own money.
          </p>
          <form className="flex flex-col sm:flex-row gap-[12px] sm:gap-[16px] max-w-[672px] mx-auto w-full">
            <input
              type="email"
              placeholder="Enter your email"
              className="w-full sm:flex-1 sm:min-w-0 h-[52px] md:h-[56px] px-[20px] md:px-[24px] bg-white rounded-[4px] text-[16px] font-normal leading-[19px] text-[#1c1b1b] placeholder:text-[#757688]"
            />
            <button className="h-[52px] md:h-[56px] px-[28px] md:px-[40px] bg-[#006d34] rounded-[4px] text-[15px] md:text-[16px] font-bold leading-[24px] text-white hover:bg-[#005c28] transition-colors shrink-0 whitespace-nowrap">
              Access Report
            </button>
          </form>
          <p className="text-[12px] font-normal leading-[15px] text-white/60 mt-[16px]">
            Institutional Grade Intelligence
          </p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      {/* Footer is rendered globally from layout.tsx */}
    </div>
  );
}
