import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How It Works | EarlyInsider",
  description:
    "See how EarlyInsider monitors SEC Form 4 filings in real time, applies AI analysis, and delivers high-conviction insider buying alerts to your inbox.",
};

/* ── Data ── */

const PIPELINE_CARDS = [
  {
    iconBg: "#e0e0ff",
    iconColor: "#000592",
    title: "Data Acquisition",
    desc: "We pull raw SEC Form 4, 13D, and 13G filings directly from the EDGAR database via low-latency API. Our system monitors thousands of tickers 24/7.",
  },
  {
    iconBg: "#62ff95",
    iconColor: "#006d34",
    title: "AI-Powered Filtering",
    desc: "Our proprietary AI filters out routine option exercises, tax-related sales, and automated 10b5-1 plans. We only alert you to genuine, open-market conviction buys.",
  },
  {
    iconBg: "#ffdad6",
    iconColor: "#5a0006",
    title: "Institutional Analysis",
    desc: "Every significant trade is cross-referenced with 10 years of historical insider behavior, company financials, and current market context.",
  },
];

const CHECKLIST = [
  "Instant Email Alerts",
  "Mobile Push Notifications",
  "Direct Webhook Support (API)",
  "Historical Context Included",
];

const TECH_BLOCKS = [
  {
    tag: "V2.4",
    title: "SEC EDGAR Feed",
    rows: [
      { label: "SOURCE", value: "EDGAR-API.GOV" },
      { label: "THROUGHPUT", value: "1.2GB/SEC" },
      { label: "LATENCY", value: "~150MS" },
    ],
  },
  {
    tag: "LLM",
    title: "Neural Sentiment",
    rows: [
      { label: "ENGINE", value: "CLAUDE-3.5-SONNET" },
      { label: "TOKENS/SEC", value: "140" },
      { label: "BIAS-CAL", value: "ACTIVE" },
    ],
  },
  {
    tag: "HIST",
    title: "Backtesting Engine",
    rows: [
      { label: "DATA RANGE", value: "2014 - 2024" },
      { label: "INDEXED", value: "94M RECORDS" },
      { label: "STORAGE", value: "PARQUET/S3" },
    ],
  },
  {
    tag: "SEC",
    title: "Infrastructure",
    rows: [
      { label: "ENCRYPTION", value: "AES-256-GCM" },
      { label: "PAYMENTS", value: "STRIPE-RSA" },
      { label: "UPTIME", value: "99.99% SLA" },
    ],
  },
];

const BACKTEST_LIST = [
  "10+ years of Form 4 history",
  "Sector-specific hit rates",
  "Conviction-weighted results",
];

const TIMELINE_STEPS = [
  { time: "0S", title: "SEC Filing", sub: "Event Published", active: true, final: false },
  { time: "+12S", title: "Data Parsing", sub: "Extraction Engine", active: false, final: false },
  { time: "+28S", title: "AI Scoring", sub: "Conviction Model", active: false, final: false },
  { time: "+45S", title: "Alert Sent", sub: "Email/Push API", active: false, final: false },
  { time: "+60S", title: "User Inbox", sub: "Live Opportunity", active: false, final: true },
];

const DATA_LABELS = [
  { label: "Mean Latency", value: "0.82s" },
  { label: "Node Distribution", value: "US-EAST-1" },
  { label: "Uptime", value: "99.998%" },
];

/* ── Icons (SVG) ── */

function RadarIcon({ color }: { color: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19.07 4.93A10 10 0 0 0 12 2a10 10 0 0 0-7.07 2.93" />
      <path d="M15.54 8.46A5 5 0 0 0 12 7a5 5 0 0 0-3.54 1.46" />
      <circle cx="12" cy="12" r="1" fill={color} />
    </svg>
  );
}

function FilterIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={color}>
      <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
    </svg>
  );
}

function AnalyticsIcon({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={color}>
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="#006d34">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function TechIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="#000592">
      <path d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z" />
    </svg>
  );
}

const CARD_ICONS = [RadarIcon, FilterIcon, AnalyticsIcon];

/* ── Timeline Step Icons ── */

function FilingIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="19" viewBox="0 0 24 24" fill={color}>
      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z" />
    </svg>
  );
}

function ParseIcon({ color }: { color: string }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={color}>
      <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H8V4h12v12z" />
    </svg>
  );
}

function ScoringIcon({ color }: { color: string }) {
  return (
    <svg width="18" height="19" viewBox="0 0 24 24" fill={color}>
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
    </svg>
  );
}

function AlertIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="18" viewBox="0 0 24 24" fill={color}>
      <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
    </svg>
  );
}

function InboxIcon({ color }: { color: string }) {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill={color}>
      <path d="M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z" />
    </svg>
  );
}

const STEP_ICONS = [FilingIcon, ParseIcon, ScoringIcon, AlertIcon, InboxIcon];

/* ── Page Component ── */

export default function HowItWorksPage() {
  return (
    <div className="bg-[#fcf9f8]">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[#f6f3f2] pt-[60px] pb-[40px] px-[20px] md:px-[72px]">
        <div className="max-w-[1136px] mx-auto flex flex-col gap-[16px]">
          <p className="text-[12px] font-semibold leading-[18px] tracking-[2px] text-[#454556] uppercase">
            PROCESS &amp; TECHNOLOGY
          </p>
          <h1 className="text-[32px] md:text-[42px] font-bold leading-[1.26] tracking-[-1px] text-[#1c1b1b]">
            How It Works
          </h1>
          <p className="text-[16px] md:text-[18px] font-normal leading-[29px] text-[#454556] max-w-[672px]">
            Institutional-grade real-time monitoring of SEC insider filings. From raw data to actionable alerts in 60 seconds.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2: THE DATA PIPELINE ═══ */}
      <section className="bg-white py-[64px] md:py-[96px] px-[20px] md:px-[40px]">
        <div className="max-w-[1200px] mx-auto px-[0px] md:px-[32px]">
          <h2 className="text-[28px] font-bold leading-[42px] tracking-[-0.7px] text-[#1c1b1b] text-center mb-[40px] md:mb-[64px]">
            The Data Pipeline
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[20px] md:gap-[32px]">
            {PIPELINE_CARDS.map((card, i) => {
              const Icon = CARD_ICONS[i];
              return (
                <div
                  key={card.title}
                  className="bg-[#f6f3f2] rounded-[8px] p-[28px] md:p-[44px] md:pb-[70px] flex flex-col gap-[24px]"
                >
                  <div
                    className="w-[48px] h-[48px] rounded-[4px] flex items-center justify-center"
                    style={{ backgroundColor: card.iconBg }}
                  >
                    <Icon color={card.iconColor} />
                  </div>
                  <h3 className="text-[20px] font-bold leading-[28px] text-[#1c1b1b]">
                    {card.title}
                  </h3>
                  <p className="text-[16px] font-normal leading-[26px] text-[#454556]">
                    {card.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 3: INSTANT DELIVERY ═══ */}
      <section className="bg-white py-[64px] md:py-[96px] px-[20px] md:px-[72px]">
        <div className="max-w-[1136px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-[40px] lg:gap-[80px] items-center">
          {/* Left: Text + Checklist */}
          <div className="flex flex-col gap-[32px]">
            <h2 className="text-[28px] font-bold leading-[42px] tracking-[-0.7px] text-[#1c1b1b]">
              Instant Delivery
            </h2>
            <p className="text-[18px] font-normal leading-[29px] text-[#454556]">
              When a high-conviction trade is detected, our system generates a comprehensive alert and sends it via email and push notification within 60 seconds of the filing&apos;s publication. Most competitors have a 24-hour delay &mdash; we don&apos;t.
            </p>
            <ul className="flex flex-col gap-[16px]">
              {CHECKLIST.map((item) => (
                <li key={item} className="flex items-center gap-[12px]">
                  <CheckCircleIcon />
                  <span className="text-[16px] font-medium leading-[24px] text-[#1c1b1b]">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Mock Alert Card */}
          <div className="bg-white rounded-[8px] border border-[#070707]/10 shadow-[0px_20px_40px_rgba(0,0,0,0.06)] p-[24px] md:p-[32px] flex flex-col gap-[32px]">
            {/* Alert Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-[16px]">
                <div className="w-[40px] h-[40px] rounded-[12px] bg-[#e0e0ff] flex items-center justify-center">
                  <span className="font-[var(--font-mono)] text-[16px] font-bold text-[#000592]">TSLA</span>
                </div>
                <div>
                  <p className="text-[18px] font-bold leading-[28px] text-[#1c1b1b]">Tesla, Inc.</p>
                  <p className="font-[var(--font-mono)] text-[12px] font-normal leading-[16px] tracking-[1.2px] text-[#454556]">NAS: TSLA</p>
                </div>
              </div>
              <span className="font-[var(--font-mono)] text-[10px] font-bold leading-[15px] tracking-[-0.5px] text-[#005226] bg-[#54fd8f] px-[8px] py-[4px] rounded-[2px] shrink-0">
                High Conviction
              </span>
            </div>

            {/* Alert Details */}
            <div className="flex flex-col gap-[24px]">
              {/* Insider / Transaction row */}
              <div className="flex justify-between items-end pb-[16px] border-b border-[#f0eded]">
                <div className="flex flex-col gap-[4px]">
                  <span className="font-[var(--font-mono)] text-[12px] font-normal leading-[16px] text-[#454556]">Insider</span>
                  <span className="text-[16px] font-bold leading-[24px] text-[#1c1b1b]">Kimbal Musk</span>
                </div>
                <div className="flex flex-col gap-[4px] items-end">
                  <span className="font-[var(--font-mono)] text-[12px] font-normal leading-[16px] text-[#454556]">Transaction</span>
                  <span className="text-[16px] font-bold leading-[24px] text-[#006d34]">Buy (Open Market)</span>
                </div>
              </div>

              {/* Amount / Price row */}
              <div className="flex justify-between items-end pb-[16px] border-b border-[#f0eded]">
                <div className="flex flex-col gap-[4px]">
                  <span className="font-[var(--font-mono)] text-[10px] font-normal leading-[16px] text-[#454556]">Amount</span>
                  <span className="font-[var(--font-mono)] text-[20px] font-normal leading-[24px] text-[#1c1b1b]">$2,450,000</span>
                </div>
                <div className="flex flex-col gap-[4px] items-end">
                  <span className="font-[var(--font-mono)] text-[10px] font-normal leading-[16px] text-[#454556]">Avg. Price</span>
                  <span className="font-[var(--font-mono)] text-[20px] font-normal leading-[24px] text-[#1c1b1b]">$168.42</span>
                </div>
              </div>

              {/* Alert timestamp */}
              <p className="font-[var(--font-mono)] text-[12px] font-semibold leading-[16px] text-[#000ad2] text-center">
                Alert sent: 0s after filing
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 4: THE TECHNOLOGY STACK ═══ */}
      <section className="bg-[#f5f6f8] py-[64px] md:py-[96px] px-[20px] md:px-[40px]">
        <div className="max-w-[1200px] mx-auto px-[0px] md:px-[32px]">
          <h2 className="font-[var(--font-montaga)] text-[28px] md:text-[32px] font-normal leading-[48px] text-[#1c1b1b] text-center mb-[48px] md:mb-[80px]">
            The Technology Stack
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[16px] md:gap-[24px]">
            {TECH_BLOCKS.map((block) => (
              <div
                key={block.tag}
                className="bg-white rounded-[8px] border border-[#d1d6da] p-[24px] md:p-[33px] flex flex-col gap-[24px]"
              >
                {/* Tag row */}
                <div className="flex items-center justify-between">
                  <TechIcon />
                  <span className="font-[var(--font-mono)] text-[10px] font-normal text-[#000592] bg-[#e0e0ff] px-[8px] py-[2px] rounded-[2px]">
                    {block.tag}
                  </span>
                </div>
                {/* Title */}
                <h4 className="text-[18px] font-bold leading-[28px] text-[#1c1b1b]">
                  {block.title}
                </h4>
                {/* Data rows */}
                <div className="flex flex-col gap-[8px]">
                  {block.rows.map((row, ri) => (
                    <div
                      key={row.label}
                      className={`flex justify-between items-center ${ri < block.rows.length - 1 ? "pb-[4px] border-b border-[#eae7e7]" : ""}`}
                    >
                      <span className="font-[var(--font-mono)] text-[9px] font-normal text-[#454556]">
                        {row.label}
                      </span>
                      <span className="font-[var(--font-mono)] text-[9px] font-bold text-[#1c1b1b]">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: STRATEGIC BACKTESTING ═══ */}
      <section className="bg-white py-[64px] md:py-[96px] px-[20px] md:px-[72px]">
        <div className="max-w-[1136px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-[40px] lg:gap-[80px] items-start">
          {/* Left: Text + List */}
          <div className="flex flex-col gap-[24px]">
            <p className="text-[11px] font-bold leading-[17px] tracking-[1px] text-[#5c6670] uppercase">
              VALIDATION
            </p>
            <h2 className="font-[var(--font-montaga)] text-[28px] md:text-[36px] font-normal leading-[1.25] text-[#1c1b1b]">
              Institutional-Grade Backtesting
            </h2>
            <p className="text-[18px] font-normal leading-[29px] text-[#454556]">
              We don&apos;t just deliver alerts; we validate them against a decade of historical performance.
            </p>
            <ul className="flex flex-col gap-[16px] pt-[8px]">
              {BACKTEST_LIST.map((item) => (
                <li key={item} className="flex items-center gap-[12px]">
                  <CheckCircleIcon />
                  <span className="text-[16px] font-medium leading-[24px] text-[#454556]">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Right: Chart Mockup */}
          <div className="bg-[#f6f3f2] rounded-[8px] border border-[#d1d6da] p-[28px] md:p-[40px] flex flex-col gap-[32px]">
            {/* Chart header */}
            <div className="flex items-center justify-between">
              <span className="font-[var(--font-mono)] text-[10px] font-normal text-[#454556]">
                Performance Analysis: $NVDA
              </span>
              <div className="flex items-center gap-[16px]">
                <span className="font-[var(--font-mono)] text-[10px] font-semibold text-[#1c1b1b]">Price</span>
                <span className="font-[var(--font-mono)] text-[10px] font-semibold text-[#1c1b1b]">Buy Signal</span>
              </div>
            </div>

            {/* Chart area (simplified SVG representation) */}
            <div className="relative h-[200px] w-full">
              <svg className="w-full h-full" viewBox="0 0 446 200" fill="none" preserveAspectRatio="none">
                {/* Grid lines */}
                <line x1="0" y1="50" x2="446" y2="50" stroke="#e5e2e1" strokeWidth="0.5" />
                <line x1="0" y1="100" x2="446" y2="100" stroke="#e5e2e1" strokeWidth="0.5" />
                <line x1="0" y1="150" x2="446" y2="150" stroke="#e5e2e1" strokeWidth="0.5" />

                {/* Price line (rising trend) */}
                <path
                  d="M0 170 Q50 160 100 150 T200 120 T300 80 T400 30 L446 20"
                  stroke="#000592"
                  strokeWidth="2"
                  fill="none"
                />

                {/* Buy signal marker */}
                <circle cx="180" cy="130" r="6" fill="#006d34" stroke="white" strokeWidth="2" />

                {/* Alert label */}
                <rect x="150" y="108" width="60" height="14" rx="2" fill="#006d34" />
                <text x="155" y="118" fill="white" fontSize="8" fontWeight="700" fontFamily="Space Mono, monospace">ALERT: BUY</text>
              </svg>
            </div>

            {/* Time axis */}
            <div className="flex justify-between pt-[16px] border-t border-[#d1d6da]">
              <span className="font-[var(--font-mono)] text-[8px] font-normal text-[#454556]">T-12M</span>
              <span className="font-[var(--font-mono)] text-[8px] font-normal text-[#454556]">T-6M</span>
              <span className="font-[var(--font-mono)] text-[8px] font-normal text-[#454556]">TODAY</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 6: THE 60-SECOND JOURNEY ═══ */}
      <section className="bg-[#f6f3f2] py-[80px] md:py-[128px] px-[20px] md:px-[40px] border-t border-[#e5e2e1]">
        <div className="max-w-[1200px] mx-auto">
          {/* Header */}
          <div className="flex flex-col items-center mb-[48px] md:mb-[64px]">
            <p className="text-[11px] font-bold tracking-[1px] text-[#000592] uppercase mb-[16px]">
              NETWORK PERFORMANCE
            </p>
            <h2 className="font-[var(--font-montaga)] text-[28px] md:text-[36px] font-normal leading-[54px] text-[#1c1b1b] text-center">
              The 60-Second Journey
            </h2>
            <p className="text-[16px] font-normal leading-[24px] text-[#454556] max-w-[576px] text-center mt-[16px]">
              Our low-latency infrastructure processes institutional filings faster than retail terminals can refresh.
            </p>
          </div>

          {/* Timeline */}
          <div className="max-w-[1024px] mx-auto mb-[32px] md:mb-[48px]">
            {/* Desktop: horizontal timeline */}
            <div className="hidden md:block">
              {/* Line */}
              <div className="relative mx-[16px]">
                <div className="h-[2px] bg-gradient-to-r from-[#000592] via-[#c6c5d9] to-[#006d34]" />
              </div>

              {/* Steps */}
              <div className="grid grid-cols-5 gap-0 -mt-[1px]">
                {TIMELINE_STEPS.map((step, i) => {
                  const Icon = STEP_ICONS[i];
                  const isFirst = step.active;
                  const isFinal = step.final;
                  return (
                    <div key={step.time} className="flex flex-col items-center">
                      {/* Node */}
                      <div
                        className={`w-[72px] h-[72px] rounded-[12px] flex items-center justify-center relative ${
                          isFinal
                            ? "bg-[#006d34]"
                            : "bg-white"
                        } ${
                          isFirst
                            ? "border-2 border-[#000592] shadow-[0px_4px_12px_rgba(0,5,146,0.15)]"
                            : isFinal
                              ? "shadow-[0px_4px_12px_rgba(0,109,52,0.2)]"
                              : "border border-[#c6c5d9] shadow-[0px_2px_8px_rgba(0,0,0,0.06)]"
                        }`}
                      >
                        <Icon color={isFinal ? "#ffffff" : isFirst ? "#000592" : "#454556"} />
                        {/* Time badge */}
                        <span
                          className={`absolute -bottom-[6px] font-[var(--font-mono)] text-[8px] font-bold px-[4px] py-[1px] rounded-[2px] ${
                            isFirst
                              ? "bg-[#000592] text-white"
                              : isFinal
                                ? "bg-[#005226] text-white"
                                : "bg-[#e5e2e1] text-[#454556]"
                          }`}
                        >
                          {step.time}
                        </span>
                      </div>

                      {/* Label */}
                      <div className="mt-[24px] text-center">
                        <p className="text-[14px] font-bold leading-[20px] text-[#1c1b1b]">{step.title}</p>
                        <p className={`font-[var(--font-mono)] text-[9px] font-normal mt-[4px] ${isFinal ? "text-[#006d34] font-bold" : "text-[#454556]"}`}>
                          {step.sub}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile: vertical timeline */}
            <div className="md:hidden">
              <div className="relative pl-[48px]">
                {/* Vertical line */}
                <div className="absolute left-[22px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-[#000592] via-[#c6c5d9] to-[#006d34]" />

                <div className="flex flex-col gap-[32px]">
                  {TIMELINE_STEPS.map((step, i) => {
                    const Icon = STEP_ICONS[i];
                    const isFirst = step.active;
                    const isFinal = step.final;
                    return (
                      <div key={step.time} className="flex items-start gap-[20px]">
                        {/* Node */}
                        <div
                          className={`absolute left-[6px] w-[34px] h-[34px] rounded-[8px] flex items-center justify-center shrink-0 ${
                            isFinal ? "bg-[#006d34]" : "bg-white"
                          } ${
                            isFirst
                              ? "border-2 border-[#000592]"
                              : isFinal
                                ? ""
                                : "border border-[#c6c5d9]"
                          }`}
                        >
                          <Icon color={isFinal ? "#ffffff" : isFirst ? "#000592" : "#454556"} />
                        </div>
                        {/* Text */}
                        <div>
                          <span className={`font-[var(--font-mono)] text-[8px] font-bold ${isFirst ? "text-[#000592]" : isFinal ? "text-[#006d34]" : "text-[#454556]"}`}>
                            {step.time}
                          </span>
                          <p className="text-[14px] font-bold leading-[20px] text-[#1c1b1b]">{step.title}</p>
                          <p className={`font-[var(--font-mono)] text-[9px] ${isFinal ? "text-[#006d34] font-bold" : "text-[#454556]"}`}>
                            {step.sub}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Data Labels */}
          <div className="max-w-[896px] mx-auto flex flex-col sm:flex-row justify-center gap-[32px] sm:gap-[64px] pt-[32px] border-t border-[#c6c5d9]">
            {DATA_LABELS.map((dl) => (
              <div key={dl.label} className="flex flex-col items-center sm:items-start gap-[4px]">
                <span className="font-[var(--font-mono)] text-[10px] font-normal text-[#454556]">{dl.label}</span>
                <span className="font-[var(--font-mono)] text-[18px] font-bold text-[#000592]">{dl.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 7: FINAL CTA ═══ */}
      <section className="relative bg-[#000592] py-[64px] md:py-[96px] px-[20px] md:px-[40px] overflow-hidden">
        {/* Radial gradient overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(57,68,239,0.4)_0%,transparent_70%)]" />

        <div className="relative max-w-[1200px] mx-auto px-[0px] md:px-[32px] flex flex-col md:flex-row items-center justify-between gap-[32px]">
          <h2 className="text-[24px] md:text-[32px] font-bold leading-[1.5] text-white text-center md:text-left">
            Get the edge you&apos;ve been looking for.
          </h2>
          <Link
            href="/signup"
            className="bg-white text-black text-[18px] font-medium leading-[28px] px-[40px] py-[16px] rounded-[8px] hover:bg-gray-100 active:scale-[0.98] transition-all duration-150 shrink-0"
          >
            Start Free Now
          </Link>
        </div>
      </section>
    </div>
  );
}
