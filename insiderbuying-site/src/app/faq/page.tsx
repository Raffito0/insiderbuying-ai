"use client";

import Link from "next/link";
import { useState } from "react";

const CATEGORIES = ["All", "Getting Started", "Alerts", "Pricing", "Data & Security", "Account"];

const FAQ_GROUPS = [
  {
    title: "Platform Essentials",
    items: [
      { q: "How does InsiderBuying.ai process SEC Form 4 filings?", a: "Our automated pipeline monitors SEC EDGAR in real-time, parsing each Form 4 filing within 60 seconds of publication. We extract transaction details, cross-reference with historical data, and run AI analysis to score conviction levels." },
      { q: "What is the \"Institutional Score\" system?", a: "The score is a multi-factor calculation using proprietary precision data. It weighs the insider's historical performance, trade size relative to holdings, and cluster buy activity across the executive suite.", open: true },
      { q: "Can I export data from the platform?", a: "Pro subscribers can export alerts and analysis in CSV format. Premium users get full API access with 10,000 calls per month and Excel-compatible report exports." },
    ],
  },
  {
    title: "Alerts & Notifications",
    items: [
      { q: "What is the latency for Real-time Alerts?", a: "Our system delivers alerts within 60 seconds of a Form 4 filing being published on SEC EDGAR. This includes parsing, AI analysis, and multi-channel delivery." },
      { q: "Can I filter alerts by sector or trade size?", a: "Yes. Pro and Premium subscribers can set custom filters by sector, market cap, minimum transaction size, insider role, and conviction score threshold." },
      { q: "How do SMS alerts work for international users?", a: "We currently support push notifications via web and mobile app globally. SMS alerts are available for US numbers on Premium plans. International SMS is on our roadmap." },
    ],
  },
  {
    title: "Data & Compliance",
    items: [
      { q: "Is the data sourced directly from the SEC?", a: "Yes. All insider transaction data comes directly from SEC EDGAR Form 4 filings. We do not use third-party data providers for our core filing data." },
      { q: "How often is the knowledge base updated?", a: "Our filing database updates in real-time as new Form 4s are published. Historical data goes back to 2018, covering over 85,000 insider transactions." },
      { q: "Do you track Rule 10b5-1 trading plans?", a: "Yes. We flag transactions that appear to be part of pre-scheduled 10b5-1 plans. Our AI downweights these in conviction scoring since they carry less signal value." },
    ],
  },
];

export default function FaqPage() {
  const [activeTab, setActiveTab] = useState("All");
  const [openItems, setOpenItems] = useState<Record<string, boolean>>({ "Platform Essentials-1": true });

  function toggle(key: string) {
    setOpenItems((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="bg-[#fcf9f8]">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[112px] md:pb-[112px] px-[20px] md:px-[32px] lg:px-[192px]">
        <div className="max-w-[896px] mx-auto text-center">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] md:leading-[70px] text-[#1c1b1b] mb-[16px] md:mb-[24px]">
            Frequently Asked Questions
          </h1>
          <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[29px] text-[#454556] max-w-[672px] mx-auto">
            Everything you need to know about our institutional-grade insider trading intelligence platform and SEC data processing.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2: CATEGORY TABS ═══ */}
      <nav className="bg-white border-b border-[#c6c5d9] sticky top-[82px] z-40 overflow-x-auto">
        <div className="max-w-[976px] mx-auto px-[20px] md:px-[32px] lg:px-[152px] flex items-center justify-start md:justify-center gap-[20px] md:gap-[32px] py-[16px]">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`text-[14px] leading-[20px] pb-[16px] border-b-[1px] transition-colors whitespace-nowrap ${
                activeTab === cat
                  ? "font-bold text-[#000592] border-[#000592]"
                  : "font-normal text-[#454556] border-transparent hover:text-[#1c1b1b]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </nav>

      {/* ═══ SECTION 3: FAQ ACCORDION ═══ */}
      <section className="bg-white pt-[48px] pb-[48px] md:pt-[112px] md:pb-[112px] px-[20px] md:px-[32px] lg:px-[250px]">
        <div className="max-w-[780px] mx-auto flex flex-col gap-[48px] md:gap-[80px]">
          {FAQ_GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="font-[var(--font-montaga)] text-[26px] md:text-[30px] font-normal leading-[32px] text-[#1c1b1b] pl-[16px] border-l-[1px] border-[#000592] mb-[24px] md:mb-[32px]">
                {group.title}
              </h2>
              <div className="flex flex-col gap-[12px] md:gap-[16px]">
                {group.items.map((item, i) => {
                  const key = `${group.title}-${i}`;
                  const isOpen = openItems[key] || false;
                  return (
                    <div key={key} className="bg-[#f6f3f2]">
                      <button
                        onClick={() => toggle(key)}
                        className="w-full flex items-center justify-between p-[20px] md:p-[24px]"
                      >
                        <span className="text-[15px] md:text-[16px] font-medium leading-[24px] md:leading-[28px] text-[#1c1b1b] text-left pr-[16px] md:pr-[24px]">
                          {item.q}
                        </span>
                        <svg
                          className={`w-[12px] h-[12px] shrink-0 text-[#1c1b1b] transition-transform ${isOpen ? "rotate-45" : ""}`}
                          viewBox="0 0 12 12"
                        >
                          <path d="M6 0v12M0 6h12" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="px-[20px] pb-[20px] md:px-[24px] md:pb-[24px]">
                          <p className="text-[15px] md:text-[16px] font-normal leading-[24px] md:leading-[26px] text-[#454556]">
                            {item.a}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ═══ SECTION 4: STILL HAVE QUESTIONS ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[112px] md:pb-[112px] px-[20px] md:px-[32px] lg:px-[192px]">
        <div className="max-w-[896px] mx-auto text-center">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[48px] font-normal leading-[1.2] md:leading-[40px] text-[#1c1b1b] mb-[16px]">
            Still have questions?
          </h2>
          <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[28px] text-[#454556] max-w-[576px] mx-auto mb-[24px]">
            Our dedicated support team and institutional analysts are available 24/7 to assist with your technical or data inquiries.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-[12px] sm:gap-[15px] pt-[24px]">
            <Link
              href="mailto:support@insiderbuying.ai"
              className="flex items-center justify-center h-[54px] md:h-[58px] px-[32px] border border-[#000592] text-[15px] md:text-[16px] font-medium leading-[24px] text-[#000592] hover:bg-[#000592] hover:text-white transition-colors w-full sm:w-auto"
            >
              Contact Support
            </Link>
            <Link
              href="/methodology"
              className="flex items-center justify-center h-[54px] md:h-[58px] px-[32px] border border-[#000592] text-[15px] md:text-[16px] font-medium leading-[24px] text-[#000592] hover:bg-[#000592] hover:text-white transition-colors w-full sm:w-auto"
            >
              View Documentation
            </Link>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: BENTO DECORATIVE ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[112px] md:pb-[112px] px-[20px] md:px-[32px] lg:px-[88px]">
        <div className="max-w-[1104px] mx-auto grid grid-cols-1 lg:grid-cols-[725px_346px] gap-[24px] lg:gap-[33px]">
          {/* Left — Dark card */}
          <div className="bg-[#000592] rounded-[4px] p-[32px] md:p-[48px] flex flex-col justify-between min-h-[300px] lg:h-[400px]">
            <div>
              <p className="text-[14px] font-normal leading-[16px] text-white/80 mb-[16px]">Intelligence Briefing</p>
              <h3 className="font-[var(--font-montaga)] text-[28px] md:text-[40px] font-normal leading-[1.15] md:leading-[36px] text-white">
                Master the markets with institutional precision.
              </h3>
            </div>
            <div className="flex items-center gap-[16px] mt-[32px] lg:mt-0">
              <div className="w-[48px] h-[48px] bg-white/10 rounded flex items-center justify-center shrink-0">
                <svg className="w-[18px] h-[10px]" viewBox="0 0 18 10" fill="none"><path d="M0 10L6 4l4 4L18 0" stroke="white" strokeWidth="2"/></svg>
              </div>
              <span className="text-[14px] font-normal leading-[20px] text-white">+12.4% Avg. Cluster Alpha</span>
            </div>
          </div>

          {/* Right — White card */}
          <div className="bg-white rounded-[4px] border border-[#f0eded] p-[28px] md:px-[32px] md:py-[48px] lg:py-[85px] flex flex-col justify-center">
            <svg className="w-[100px] md:w-[282px] h-[30px] mb-[24px]" viewBox="0 0 282 30" fill="#000592">
              <rect x="0" y="5" width="30" height="20" rx="2" />
              <rect x="35" y="0" width="30" height="30" rx="2" opacity="0.6" />
              <rect x="70" y="8" width="30" height="14" rx="2" opacity="0.3" />
            </svg>
            <h4 className="font-[var(--font-montaga)] text-[26px] md:text-[32px] font-normal leading-[1.2] md:leading-[40px] text-[#1c1b1b] mb-[16px] md:mb-[22px]">
              Institutional Security
            </h4>
            <p className="text-[14px] font-normal leading-[23px] text-[#454556] mb-[24px]">
              Enterprise-grade encryption and SEC-compliant data handling for hedge funds and family offices.
            </p>
            <Link href="/about" className="flex items-center gap-[8px] text-[14px] font-semibold leading-[20px] text-[#000592] hover:underline">
              Learn More
              <svg className="w-[8px] h-[8px]" viewBox="0 0 8 8" fill="none"><path d="M0 4h6M4 2l2 2-2 2" stroke="#000592" strokeWidth="1.5"/></svg>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
