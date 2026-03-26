"use client";

import Link from "next/link";
import { useState } from "react";

/* ── ALERT DATA ─────────────────────────────────────────── */
const ALERTS = [
  { name: "Jensen Huang", title: "CEO", ticker: "NVDA", amount: "+$4,240,000", time: "2m ago", bg: "bg-[#f0f1f3]" },
  { name: "Tim Cook", title: "CEO", ticker: "AAPL", amount: "+$2,710,000", time: "14m ago", bg: "bg-[#f6f3f2]" },
  { name: "Satya Nadella", title: "CEO", ticker: "MSFT", amount: "+$1,420,000", time: "41m ago", bg: "bg-[#f6f3f2]" },
  { name: "Andy Jassy", title: "CEO", ticker: "AMZN", amount: "+$1,100,000", time: "1h ago", bg: "bg-[#f0f1f3]" },
  { name: "Mark Zuckerberg", title: "CEO", ticker: "META", amount: "+$3,830,000", time: "2h ago", bg: "bg-[#f6f3f2]" },
];

const STATS = [
  { value: "6%", label: "Annual Outperformance", desc: "Stocks with significant insider buying outperform the S&P 500 by an average of 6% per year.", source: "Source: Harvard Business School" },
  { value: "73%", label: "Positive Returns", desc: "When a CEO invests over $1M of their own money, the stock delivers positive returns within 12 months 73% of the time.", source: "Source: Journal of Financial Economics" },
  { value: "2 Days", label: "Your Window", desc: "Insiders must report to the SEC within 2 business days. We alert you within 60 seconds of the filing. That\u2019s your edge.", source: "Source: SEC Rule 16a-3" },
];

const REPORTS = [
  { label: "NVDA", title: "NVIDIA Deep Dive", pages: "25-page analysis", features: ["Insider buying history (12 months)", "Financial health breakdown", "Competitor comparison", "AI-powered forecast"], price: "$14" },
  { label: "BUNDLE", title: "Magnificent 7 Report", pages: "47-page complete analysis", features: ["All 7 tech giants analyzed", "Side-by-side comparison tables", "Sector-wide insider sentiment", "Portfolio allocation signals"], price: "$29", best: true },
  { label: "INCOME", title: "Dividend Kings 2026", pages: "30 stocks analyzed", features: ["Top 30 dividend aristocrats", "Yield vs growth analysis", "Insider buying patterns", "Monthly income projections"], price: "$24" },
];

const PLANS = [
  { name: "Free", desc: "Essential market monitoring.", price: "$0", features: ["Real-time alert feed", "Weekly digest email", "Basic transaction data"], border: "", btn: "border border-[#757688] text-[#1c1b1b]" },
  { name: "Pro", desc: "Maximum edge for serious investors.", price: "$29", features: ["Full AI analysis on every trade", "Conviction scoring + context", "Custom watchlist alerts", "Priority email + push alerts"], border: "border border-[#080f99]", btn: "bg-[#000592] text-white", popular: true },
  { name: "Investor", desc: "Maximum edge for serious investors.", price: "$89", features: ["Everything in Pro", "All deep dive reports included", "Monthly backtest report", "Priority support"], border: "", btn: "border border-[#757688] text-[#1c1b1b]" },
];

const FAQS = [
  { q: "Is following insider buying legal?", a: "Yes. SEC Form 4 filings are public documents. Tracking and analyzing publicly available insider transaction data is completely legal." },
  { q: "How fast are the alerts?", a: "Within 60 seconds of an SEC Form 4 filing being published on EDGAR, our system parses the transaction, runs AI analysis, and delivers the alert." },
  { q: "Do you provide investment advice?", a: "No. InsiderBuying.ai is a data and analysis platform, not a registered investment advisor. Our AI analysis is informational only." },
  { q: "Can I create a custom watchlist?", a: "Yes, Pro subscribers can create custom watchlists to track specific companies and receive instant alerts." },
  { q: "How does this compare to OpenInsider?", a: "OpenInsider provides raw SEC data. InsiderBuying.ai adds AI-powered conviction scoring, cluster detection, and institutional-grade filtering." },
  { q: "What is your cancellation policy?", a: "Cancel anytime with one click from your account settings. No hidden fees, no questions asked." },
];

const LOGOS = ["NVIDIA","Apple","Microsoft","Amazon","Meta","Tesla","Google","JPMorgan","Goldman Sachs","Berkshire","J&J","UnitedHealth","Visa","Mastercard","Pfizer","Eli Lilly","Broadcom","AMD","Netflix","Costco"];

export default function HomePage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="bg-white">

      {/* ═══ 1. HERO ═══ */}
      <section className="relative w-full min-h-[500px] lg:h-[614px] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a2e] to-[#1a1a4e]" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="relative z-10 flex flex-col justify-center max-w-[868px] mx-auto h-full px-[20px] md:px-[32px] pt-[100px] pb-[60px] lg:pt-[0px] lg:pb-[0px]">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[42px] lg:text-[54px] font-normal leading-[1.15] tracking-[0.5px] text-white mb-[16px]">
            Know What CEOs Are Buying,<br />Before Everyone Else.
          </h1>
          <p className="text-[20px] font-normal leading-[32px] tracking-[0.2px] text-white/90 max-w-[672px] mb-[32px]">
            Institutional grade real-time alerts on SEC Form 4 filings. Identify high-conviction insider transactions using proprietary AI filtering.
          </p>
          <div className="flex flex-col sm:flex-row gap-[12px] sm:gap-[16px]">
            <Link href="/signup" className="flex items-center justify-center h-[56px] sm:h-[72px] px-[24px] sm:px-[40px] bg-[#000592] text-white text-[18px] font-semibold tracking-[0.2px] hover:bg-[#080f99] transition-colors">
              Start Free
            </Link>
            <Link href="/alerts" className="flex items-center justify-center h-[56px] sm:h-[72px] px-[24px] sm:px-[40px] border border-white/80 text-white text-[18px] font-semibold tracking-[0.2px] hover:bg-white/10 transition-colors">
              See Recent Alerts
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ 1.5 LOGO TICKER ═══ */}
      <section className="w-full py-[24px] bg-white overflow-hidden">
        <div className="flex gap-[48px] animate-[scroll_30s_linear_infinite] whitespace-nowrap">
          {[...LOGOS, ...LOGOS].map((logo, i) => (
            <span key={i} className="text-[13px] font-medium text-[#1c1b1b]/60 shrink-0">{logo}</span>
          ))}
        </div>
        <style>{`@keyframes scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      </section>

      {/* ═══ 2. LIVE ALERT FEED ═══ */}
      <section className="w-full py-[64px] px-[20px] md:pt-[96px] md:pr-[91px] md:pb-[96px] md:pl-[91px] bg-white">
        <div className="max-w-[1154px] mx-auto">
          <div className="flex flex-col items-center lg:flex-row lg:items-center gap-[12px] lg:gap-[16px] mb-[24px]">
            <div className="flex items-center gap-[8px] bg-[#00de16]/20 px-[12px] py-[4px] rounded-full">
              <div className="w-[8px] h-[8px] rounded-full bg-[#02810e]" />
              <span className="text-[12px] font-medium tracking-[0.1px] text-[#006d34]">Live</span>
            </div>
            <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] font-normal leading-[1.1] tracking-[0.5px] text-[#00011d] text-center lg:text-left">Recent Insider Buys</h2>
          </div>
          {/* Desktop rows — attached block */}
          <div className="hidden lg:flex flex-col mb-[16px] rounded-[8px] overflow-hidden shadow-[0px_1px_2px_rgba(0,0,0,0.05)]">
            {ALERTS.map((a, i) => (
              <div key={i} className={`flex items-center justify-between h-[112px] px-[32px] ${a.bg} ${i > 0 ? "border-t border-[#e5e2e1]" : ""}`}>
                <div className="flex items-center gap-[24px]">
                  <div className="w-[64px] h-[64px] rounded-full bg-[#d9d9d9] flex items-center justify-center text-[14px] font-semibold text-[#757688]">
                    {a.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="flex flex-col gap-[4px]">
                    <span className="text-[13px] font-normal tracking-[0.1px] text-[#757688]">{a.title}</span>
                    <span className="font-[var(--font-montaga)] text-[18px] font-normal leading-[28px] tracking-[0.2px] text-[#1c1b1b]">{a.name}</span>
                  </div>
                </div>
                <span className="text-[24px] font-medium leading-[32px] tracking-[0.2px] text-[#1c1b1b]">{a.ticker}</span>
                <span className="text-[20px] font-medium tracking-[0.2px] text-[#005c09]">{a.amount}</span>
                <span className="text-[16px] font-normal tracking-[0.2px] text-[#454556]">{a.time}</span>
              </div>
            ))}
          </div>

          {/* Mobile/tablet rows — attached, card layout */}
          <div className="lg:hidden bg-[#f6f3f2] rounded-[8px] overflow-hidden mb-[16px]">
            {ALERTS.map((a, i) => (
              <div key={i} className={`flex items-center gap-[12px] px-[16px] py-[14px] ${i > 0 ? "border-t border-[#e5e2e1]" : ""}`}>
                <div className="w-[40px] h-[40px] rounded-full bg-[#d9d9d9] flex items-center justify-center text-[11px] font-semibold text-[#757688] shrink-0">
                  {a.name.split(" ").map(n => n[0]).join("")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium leading-[18px] text-[#1c1b1b] truncate">{a.name}</p>
                  <p className="text-[11px] font-normal text-[#757688]">{a.title}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-semibold tracking-[0.5px] text-[#1c1b1b] font-[var(--font-mono)]">{a.ticker}</p>
                  <p className="text-[14px] font-semibold text-[#005c09]">{a.amount}</p>
                  <p className="text-[11px] font-normal text-[#757688]">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[16px] font-normal leading-[20px] tracking-[0.2px] text-[#757688] text-center">Source: SEC Form 4 Filings. Data updated every 15 seconds.</p>
        </div>
      </section>

      {/* ═══ 3. HOW IT WORKS ═══ */}
      <section id="how-it-works" className="w-full pt-[40px] px-[20px] md:px-[100px] pb-[64px] md:pb-[96px] bg-white">
        <div className="max-w-[1080px] mx-auto px-[32px]">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] font-normal leading-[1.1] tracking-[0.5px] text-[#1c1b1b] text-center mb-[40px] md:mb-[80px]">How It Works</h2>
          <div className="flex flex-col md:flex-row justify-between gap-[40px] md:gap-[63px]">
            {[
              { title: "We Scan", desc: "Our infrastructure monitors EDGAR databases 24/7, capturing Form 4 filings within milliseconds of publication." },
              { title: "AI Filters", desc: "We remove noise like automated sales, tax withholding, and option exercises to find true conviction." },
              { title: "You Get Alerted", desc: "High-conviction signals are pushed to your dashboard and mobile device instantly for immediate action." },
            ].map((s) => (
              <div key={s.title} className="w-full md:w-[296px] text-center">
                <div className="w-[64px] h-[64px] rounded-full bg-[#f6f3f2] mx-auto mb-[16px]" />
                <h3 className="font-[var(--font-montaga)] text-[22px] font-normal leading-[28px] tracking-[0.2px] text-[#1c1b1b] mb-[8px]">{s.title}</h3>
                <p className="text-[16px] font-normal leading-[26px] tracking-[0.2px] text-[#454556]">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 4. WHY INSIDER BUYING MATTERS ═══ */}
      <section className="w-full py-[64px] px-[20px] md:pt-[83px] md:pr-[98px] md:pb-[83px] md:pl-[98px] bg-[#f6f3f2]">
        <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] font-normal leading-[1.1] tracking-[0.5px] text-[#1c1b1b] max-w-[1084px] mx-auto mb-[32px] text-center lg:text-left">Why Insider Buying Matters</h2>
        <div className="max-w-[1084px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-[24px]">
          {STATS.map((s) => (
            <div key={s.value} className="bg-white pt-[15px] pr-[29px] pb-[30px] pl-[29px]">
              <p className="font-[var(--font-montaga)] text-[40px] lg:text-[48px] font-normal leading-[84px] tracking-[0.5px] text-[#1c1b1b]">{s.value}</p>
              <p className="font-[var(--font-montaga)] text-[20px] font-normal leading-[28px] tracking-[0.2px] text-[#1c1b1b] mb-[6px]">{s.label}</p>
              <p className="text-[16px] font-normal leading-[23px] tracking-[0.2px] text-[#454556] mb-[4px]">{s.desc}</p>
              <p className="text-[13px] font-normal leading-[23px] tracking-[0.1px] text-[#757688]">{s.source}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 5. DETAILED ALERT CARD ═══ */}
      <section className="w-full py-[64px] px-[20px] md:pt-[96px] md:pr-[98px] md:pb-[54px] md:pl-[98px] bg-white">
        <div className="max-w-[1084px] mx-auto rounded-[16px] border border-black/10 overflow-hidden">
          <div className="bg-[#f6f3f2] border-b border-black/10 px-[16px] py-[20px] md:px-[32px] md:py-[32px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[12px] md:gap-[16px]">
                <div className="w-[48px] h-[48px] rounded-full bg-[#d9d9d9] shrink-0" />
                <div>
                  <h3 className="text-[16px] md:text-[20px] font-medium leading-[24px] md:leading-[28px] tracking-[0.2px] text-[#1c1b1b] font-[var(--font-montaga)]">NVDA / NVIDIA Corp</h3>
                  <div className="flex items-center gap-[8px] mt-[2px]">
                    <span className="bg-[#006d34] text-white text-[10px] px-[8px] py-[2px] rounded-[2px]">High Conviction</span>
                    <span className="text-[11px] md:text-[12px] tracking-[0.1px] text-[#757688]">Alert ID: #88321-X</span>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0 ml-[12px]">
                <p className="text-[20px] md:text-[24px] font-bold leading-[28px] md:leading-[32px] tracking-[0.2px] text-[#006d34] font-[var(--font-mono)]">BUY</p>
                <p className="text-[11px] md:text-[12px] tracking-[0.1px] text-[#757688]">SEC Form 4</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[32px] md:gap-[40px] p-[20px] md:p-[40px]">
            <div>
              <p className="text-[13px] tracking-[0.1px] text-[#757688] mb-[24px]">Transaction Data</p>
              {[["Insider","Jensen Huang (CEO)"],["Shares Purchased","240,000"],["Average Price","$130.15"],["Total Value","$2,298,580"]].map(([l,v])=>(
                <div key={l} className="flex justify-between py-[8px] border-b border-[#f0eded]">
                  <span className="text-[16px] leading-[24px] tracking-[0.2px] text-[#454556]">{l}</span>
                  <span className={`text-[16px] font-semibold leading-[24px] tracking-[0.2px] ${l==="Total Value"?"text-[#006d34]":"text-[#1c1b1b]"}`}>{v}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[13px] tracking-[0.1px] text-[#757688] mb-[24px]">AI Analysis</p>
              <div className="bg-[#f0f1f3] p-[24px] space-y-[16px]">
                <div>
                  <p className="text-[16px] font-semibold tracking-[0.2px] text-[#1c1b1b] mb-[4px]">CONTEXT</p>
                  <p className="text-[14px] leading-[20px] tracking-[0.1px] text-[#1c1b1b]">340% above historical average purchase size for this executive.</p>
                </div>
                <div className="border-t border-[#c6c5d9] pt-[16px]">
                  <p className="text-[16px] font-semibold tracking-[0.2px] text-[#1c1b1b] mb-[4px]">HISTORICAL PERFORMANCE</p>
                  <p className="text-[14px] leading-[20px] tracking-[0.1px] text-[#1c1b1b]">Huang&apos;s last 3 purchases preceded an average 18% 60-day price gain.</p>
                </div>
                <div className="border-t border-[#c6c5d9] pt-[16px]">
                  <p className="text-[16px] font-semibold tracking-[0.2px] text-[#1c1b1b] mb-[4px]">SENTIMENT SCORE</p>
                  <div className="flex items-center gap-[8px]">
                    <div className="flex-1 h-[4px] bg-[#e5e2e1] rounded-full"><div className="h-full w-[87%] bg-[#006d34] rounded-full" /></div>
                    <span className="text-[14px] font-semibold text-[#006d34]">87/100</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <p className="text-[14px] leading-[20px] tracking-[0.1px] text-[#454556] text-center italic px-[32px] pb-[12px] pt-[25px]">
            &ldquo;Huang&apos;s purchase is the largest individual open-market buy since Q2 2026, signaling immense internal confidence in upcoming product cycles.&rdquo;
          </p>
        </div>
        <div className="flex flex-col md:flex-row items-center justify-center gap-[32px] md:gap-[60px] pt-[50px]">
          {[{v:"$4.2B",l:"Tracked Monthly"},{v:"2,847",l:"Alerts Sent (24h)"},{v:"17,325+",l:"Companies Monitored"}].map((m,i)=>(
            <div key={m.v} className="flex items-center gap-[60px]">
              <div>
                <p className="font-[var(--font-montaga)] text-[48px] font-normal leading-[40px] tracking-[0.5px] text-[#1c1b1b]">{m.v}</p>
                <p className="text-[14px] leading-[16px] tracking-[0.1px] text-[#454556] mt-[8px]">{m.l}</p>
              </div>
              {i<2&&<div className="w-[1px] h-[48px] bg-[#1c1b1b]" />}
            </div>
          ))}
        </div>
      </section>

      {/* ═══ 6. CHARTS ═══ */}
      <section className="w-full py-[64px] px-[20px] md:pt-[96px] md:pr-[68px] md:pb-[102px] md:pl-[68px] bg-[#f6f3f2]">
        <div className="max-w-[1144px] mx-auto px-[32px]">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] font-normal leading-[1.1] tracking-[0.5px] text-[#1c1b1b] mb-[40px] md:mb-[64px] text-center lg:text-left">See the Pattern</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[24px] lg:gap-[48px]">
            <div className="bg-white p-[40px] h-[400px]">
              <p className="text-[18px] leading-[28px] tracking-[0.2px] text-[#1c1b1b] mb-[32px]">Insider Buying vs Stock Price (S&P 500)</p>
              <div className="h-[229px] relative">
                <div className="absolute inset-0 flex flex-col justify-between">{[0,1,2,3].map(i=><div key={i} className="w-full h-[1px] bg-[#c6c5d9]"/>)}</div>
                <svg className="relative w-full h-full" viewBox="0 0 436 160" fill="none">
                  <path d="M0 140C50 130 100 120 150 100S250 60 300 40S380 20 436 10" stroke="#000592" strokeWidth="3"/>
                  <path d="M0 150C50 145 100 140 150 130S250 110 300 100S380 85 436 70" stroke="#00d26a" strokeWidth="3"/>
                </svg>
              </div>
              <div className="flex justify-between mt-[16px]">{["Jan","Mar","May","Jul","Sep","Nov"].map(m=><span key={m} className="text-[10px] tracking-[0.1px] text-[#757688]">{m}</span>)}</div>
            </div>
            <div className="bg-white p-[40px] h-[400px]">
              <p className="text-[18px] leading-[28px] tracking-[0.2px] text-[#1c1b1b] mb-[32px]">Monthly Insider Buying Activity ($B)</p>
              <div className="flex items-end justify-center gap-[12px] h-[229px] px-[16px]">
                {[91,137,68,183,114,217,103].map((h,i)=>(<div key={i} className="w-[47px] bg-[#000592]" style={{height:`${h}px`}}/>))}
              </div>
              <div className="flex justify-between px-[16px] mt-[16px]">{["Jul","Aug","Sep","Oct","Nov","Dec","Jan"].map(m=><span key={m} className="text-[10px] tracking-[0.1px] text-[#757688]">{m}</span>)}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ 6.5 DEEP DIVE REPORTS ═══ */}
      <section className="w-full py-[64px] md:pt-[80px] md:pb-[66px] bg-[#000232] overflow-x-clip">
        <div className="max-w-[1136px] mx-auto px-[20px] md:px-[32px]">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] leading-[1.2] tracking-[0.5px] text-white text-center mb-[12px]">Deep Dive Reports</h2>
          <p className="text-[16px] leading-[24px] tracking-[0.2px] text-[#9faab6] text-center mb-[37px]">Comprehensive stock analysis powered by SEC data and AI.</p>
          {/* Desktop: 3-col grid / Mobile: horizontal scroll carousel */}
          <div className="hidden lg:grid grid-cols-3 gap-[24px] px-[50px] mb-[37px]">
            {REPORTS.map((r)=>(
              <div key={r.label} className={`bg-white p-[32px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] border border-black/10 ${r.best?"ring-2 ring-[#000592]":""}`}>
                <div className="flex items-center gap-[12px] mb-[24px]">
                  <div className="w-[32px] h-[32px] bg-[#f3f4f6] rounded" />
                  <span className="text-[16px] font-medium tracking-[1px] text-[#1a1a1a] font-[var(--font-mono)]">{r.label}</span>
                </div>
                <h3 className="font-[var(--font-montaga)] text-[26px] leading-[28px] tracking-[1px] text-[#1a1a1a] mb-[4px]">{r.title}</h3>
                <p className="text-[14px] leading-[20px] tracking-[1px] text-[#080f99] mb-[33px]">{r.pages}</p>
                <ul className="space-y-[16px] mb-[40px]">
                  {r.features.map(f=>(<li key={f} className="flex items-center gap-[12px]"><svg className="w-[11px] h-[8px] shrink-0" viewBox="0 0 11 8"><path d="M1 4l3 3L10 1" stroke="#006d34" strokeWidth="2" fill="none"/></svg><span className="text-[14px] leading-[20px] text-[#1a1a1a]">{f}</span></li>))}
                </ul>
                <p className="font-[var(--font-montaga)] text-[48px] leading-[36px] tracking-[1px] text-[#1a1a1a] mb-[8px]">{r.price}</p>
                <p className="text-[14px] font-light tracking-[1px] text-[#757688] mb-[24px]">*one-time payment</p>
                <Link href="/reports" className="flex items-center justify-center w-full h-[50px] bg-[#000592] text-white text-[14px] font-medium tracking-[1px]">GET REPORT</Link>
              </div>
            ))}
          </div>

          {/* Mobile carousel — extends past container to scroll edge-to-edge */}
          <div className="lg:hidden flex gap-[16px] overflow-x-auto snap-x snap-mandatory pb-[16px] mb-[37px] scrollbar-hide -mx-[20px] px-[20px]">
            {REPORTS.map((r, ri)=>(
              <div key={r.label} className={`bg-white p-[28px] shadow-[0px_1px_2px_rgba(0,0,0,0.05)] border border-black/10 min-w-[280px] max-w-[300px] shrink-0 snap-center ${ri===REPORTS.length-1?"mr-[20px]":""} ${r.best?"ring-2 ring-[#000592]":""}`}>
                <div className="flex items-center gap-[12px] mb-[20px]">
                  <div className="w-[32px] h-[32px] bg-[#f3f4f6] rounded" />
                  <span className="text-[14px] font-medium tracking-[1px] text-[#1a1a1a] font-[var(--font-mono)]">{r.label}</span>
                </div>
                <h3 className="font-[var(--font-montaga)] text-[22px] leading-[26px] tracking-[1px] text-[#1a1a1a] mb-[4px]">{r.title}</h3>
                <p className="text-[13px] leading-[18px] tracking-[1px] text-[#080f99] mb-[24px]">{r.pages}</p>
                <ul className="space-y-[12px] mb-[28px]">
                  {r.features.map(f=>(<li key={f} className="flex items-center gap-[10px]"><svg className="w-[11px] h-[8px] shrink-0" viewBox="0 0 11 8"><path d="M1 4l3 3L10 1" stroke="#006d34" strokeWidth="2" fill="none"/></svg><span className="text-[13px] leading-[18px] text-[#1a1a1a]">{f}</span></li>))}
                </ul>
                <p className="font-[var(--font-montaga)] text-[36px] leading-[32px] tracking-[1px] text-[#1a1a1a] mb-[6px]">{r.price}</p>
                <p className="text-[12px] font-light tracking-[1px] text-[#757688] mb-[20px]">*one-time payment</p>
                <Link href="/reports" className="flex items-center justify-center w-full h-[46px] bg-[#000592] text-white text-[13px] font-medium tracking-[1px]">GET REPORT</Link>
              </div>
            ))}
          </div>
          <style>{`.scrollbar-hide::-webkit-scrollbar{display:none}.scrollbar-hide{-ms-overflow-style:none;scrollbar-width:none}`}</style>
          <div className="text-center">
            <Link href="/reports" className="text-[16px] font-medium tracking-[1px] text-white hover:underline">View all reports &rarr;</Link>
          </div>
        </div>
      </section>

      {/* ═══ 8. PRICING ═══ */}
      <section className="w-full py-[64px] md:pt-[96px] md:pb-[96px] bg-[#f6f3f2]">
        <div className="max-w-[1216px] mx-auto px-[20px] md:px-[32px]">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] leading-[1.1] tracking-[0.5px] text-[#1c1b1b] text-center mb-[40px] md:mb-[80px]">Simple Pricing</h2>
          <div className="max-w-[1024px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-[24px]">
            {PLANS.map((p)=>(
              <div key={p.name} className={`bg-white p-[48px] relative ${p.border}`}>
                {p.popular&&<div className="absolute -top-[15px] left-1/2 -translate-x-1/2 bg-[#000592] text-white text-[10px] font-medium tracking-[1px] px-[24px] py-[4px] rounded-full whitespace-nowrap">Most Popular</div>}
                <h3 className="font-[var(--font-montaga)] text-[32px] leading-[32px] tracking-[1px] text-[#1c1b1b] mb-[8px]">{p.name}</h3>
                <p className="text-[14px] leading-[20px] tracking-[1px] text-[#454556] mb-[32px]">{p.desc}</p>
                <div className="flex items-baseline mb-[48px]">
                  <span className="font-[var(--font-montaga)] text-[48px] leading-[48px] tracking-[0.5px] text-[#1c1b1b]">{p.price}</span>
                  <span className="text-[16px] leading-[24px] text-[#757688] ml-[4px]">/mo</span>
                </div>
                <ul className="space-y-[16px] mb-[48px]">
                  {p.features.map(f=>(<li key={f} className="flex items-center gap-[12px] text-[14px] leading-[20px] text-[#1c1b1b]"><div className="w-[11px] h-[11px] rounded-full border-2 border-[#006d34] flex items-center justify-center"><div className="w-[5px] h-[5px] rounded-full bg-[#006d34]"/></div>{f}</li>))}
                </ul>
                <Link href="/signup" className={`flex items-center justify-center w-full h-[58px] text-[16px] font-medium tracking-[1px] transition-colors ${p.btn}`}>Get Started</Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 9. FAQ ═══ */}
      <section className="w-full py-[64px] md:pt-[96px] md:pb-[96px] bg-white">
        <div className="max-w-[800px] mx-auto px-[20px] md:px-[32px]">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] leading-[1.1] tracking-[0.5px] text-[#1c1b1b] text-center mb-[40px] md:mb-[64px]">Frequently Asked Questions</h2>
          <div className="flex flex-col gap-[24px]">
            {FAQS.map((faq,i)=>(
              <div key={i} className="border-b border-[#f0eded] pb-[24px]">
                <button onClick={()=>setOpenFaq(openFaq===i?null:i)} className="w-full flex items-center justify-between">
                  <span className="text-[18px] leading-[28px] tracking-[0.2px] text-[#1c1b1b] text-left">{faq.q}</span>
                  <svg className={`w-[12px] h-[12px] shrink-0 ml-[16px] text-[#757688] transition-transform ${openFaq===i?"rotate-45":""}`} viewBox="0 0 12 12"><path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="2"/></svg>
                </button>
                {openFaq===i&&<p className="mt-[16px] text-[16px] leading-[26px] tracking-[0.2px] text-[#454556]">{faq.a}</p>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ 10. FINAL CTA ═══ */}
      <section className="w-full bg-[#141313] py-[64px] md:py-[128px]">
        <div className="max-w-[1216px] mx-auto px-[32px] text-center">
          <h2 className="font-[var(--font-montaga)] text-[39px] md:text-[48px] leading-[1.2] tracking-[0.5px] text-white mb-[16px]">You&apos;ll know in 60 seconds.</h2>
          <p className="text-[20px] leading-[28px] tracking-[0.2px] text-[#94a3b8] max-w-[672px] mx-auto mb-[32px]">Don&apos;t wait for the morning news. Join thousands of sophisticated investors receiving institutional-grade insider data delivered in real-time.</p>
          <Link href="/signup" className="inline-flex items-center justify-center h-[56px] px-[48px] bg-[#000592] text-white text-[16px] font-medium tracking-[0.2px] rounded-[4px] hover:bg-[#080f99] transition-colors">Start Free</Link>
        </div>
      </section>

      {/* Footer is rendered globally from layout.tsx */}
    </div>
  );
}
