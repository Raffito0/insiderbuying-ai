import Link from "next/link";

const DATA_SOURCES = [
  { icon: "📄", title: "SEC Edgar Filings", desc: "Real-time monitoring of all Form 4, 13F, and Schedule 13D filings with automated parsing and classification of transaction types.", footer: "Primary source for all insider trading data" },
  { icon: "📊", title: "Financial Datasets API", desc: "Comprehensive financial data including income statements, balance sheets, cash flow, key ratios, and 10-year historical price data.", footer: "financialdatasets.ai \u2014 trusted by hedge funds" },
  { icon: "📰", title: "Market Intelligence", desc: "Earnings call transcripts, analyst consensus estimates, and real-time news feeds cross-referenced with insider filing timestamps.", footer: "Verified citations with page numbers" },
];

const STEPS = [
  { num: "STEP 01", title: "Data Collection", desc: "Automated pipelines continuously monitor SEC EDGAR for new Form 4 filings. Each filing is parsed, validated, and enriched with company fundamentals within 2\u20134 minutes." },
  { num: "STEP 02", title: "AI Research Agent", desc: "Our Dexter research agent aggregates financial data, insider history, price action, and sector context into a structured intelligence package for analysis." },
  { num: "STEP 03", title: "Article Generation", desc: "Claude Sonnet 4.6 generates institutional-grade analysis. Every sentence must contain a verifiable fact. A 14-point quality gate ensures publication standards." },
  { num: "STEP 04", title: "Quality Gate", desc: "Automated checks verify title length, meta descriptions, banned phrase detection, keyword placement, and verdict validation before any article is published." },
];

const LIMITATIONS = [
  { icon: "⚠️", text: "Reporting delays: Insiders have 2 business days to file Form 4. Some transactions are reported late. We flag late filings but cannot detect unreported trades." },
  { icon: "📋", text: "10b5-1 Plans: Pre-scheduled trading plans create noise. Our model downweights routine plan executions but cannot always distinguish conviction from mechanical selling." },
  { icon: "🤖", text: "AI limitations: Our analysis is probabilistic, not deterministic. Conviction scores reflect historical patterns but cannot predict future outcomes with certainty." },
  { icon: "📉", text: "Past performance: Historical backtest results do not guarantee future performance. Markets evolve and insider signals can be noisy during regime changes." },
];

export default function MethodologyPage() {
  return (
    <div className="bg-[#fcf9f8]">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[#f6f3f2] pt-[80px] pb-[80px] md:pt-[128px] md:pb-[128px] px-[20px] md:px-[32px] lg:px-[90px]">
        <div className="max-w-[1100px] mx-auto">
          <p className="text-[12px] font-normal leading-[18px] text-[#757688] mb-[16px]">TRANSPARENCY</p>
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[60px] font-normal leading-[1.1] md:leading-[60px] text-[#1c1b1b] mb-[16px]">
            How We Analyze
          </h1>
          <p className="text-[17px] md:text-[20px] font-normal leading-[28px] md:leading-[32px] text-[#454556] max-w-[672px] pt-[8px] md:pt-[16px]">
            Every number in our articles comes from a verifiable source. Here&apos;s exactly how our research process works to ensure institutional-grade precision.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2: DATA SOURCES ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[90px]">
        <div className="max-w-[1100px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[48px] font-normal leading-[1.2] md:leading-[36px] text-[#1c1b1b] mb-[40px] md:mb-[64px]">
            Our Data Sources
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[20px] md:gap-[32px]">
            {DATA_SOURCES.map((src) => (
              <div key={src.title} className="bg-[#f6f3f2] rounded-[4px] border border-black/10 p-[28px] md:p-[40px] flex flex-col">
                <span className="text-[24px] mb-[20px] md:mb-[24px]">{src.icon}</span>
                <h3 className="text-[18px] font-bold leading-[28px] text-[#1c1b1b] mb-[12px] md:mb-[16px]">{src.title}</h3>
                <p className="text-[14px] font-normal leading-[23px] text-[#1c1b1b] mb-[24px] flex-1">{src.desc}</p>
                <div className="pt-[20px] md:pt-[24px] border-t border-[#c6c5d9]">
                  <p className="text-[12px] font-normal leading-[16px] text-[#000592]">{src.footer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 3: ANALYSIS PROCESS (SIMPLE VERTICAL ON ALL SCREENS) ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[128px]">
        <div className="max-w-[1024px] mx-auto">
          <h2 className="text-[26px] md:text-[30px] font-bold leading-[1.2] md:leading-[36px] text-[#1c1b1b] text-center mb-[48px] md:mb-[80px]">
            Our Analysis Process
          </h2>
          <div className="relative max-w-[600px] mx-auto">
            {/* Vertical line */}
            <div className="absolute left-[6px] md:left-[6px] top-0 bottom-0 w-[1px] bg-[#c6c5d9]" />
            <div className="flex flex-col gap-[48px] md:gap-[64px]">
              {STEPS.map((step) => (
                <div key={step.num} className="flex gap-[24px] md:gap-[32px]">
                  <div className="relative z-10 w-[12px] h-[12px] rounded-full bg-[#000592] border-[4px] border-[#f6f3f2] shadow-[0px_0px_0px_2px_rgba(0,0,0,0.05)] shrink-0 mt-[4px]" />
                  <div>
                    <p className="text-[12px] font-bold leading-[20px] tracking-[2px] text-[#000592] uppercase mb-[6px]">{step.num}</p>
                    <h3 className="text-[20px] md:text-[24px] font-bold leading-[1.3] md:leading-[32px] text-[#1c1b1b] mb-[8px]">{step.title}</h3>
                    <p className="text-[15px] md:text-[16px] font-normal leading-[24px] md:leading-[26px] text-[#454556]">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 4: AI TRANSPARENCY ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[222px]">
        <div className="max-w-[836px] mx-auto pl-[24px] md:pl-[64px] border-l border-[#000592]">
          <h2 className="text-[24px] md:text-[30px] font-bold leading-[1.3] md:leading-[36px] text-[#1c1b1b] mb-[24px] md:mb-[32px]">
            We Use AI — And We&apos;re Transparent About It
          </h2>
          <div className="flex flex-col gap-[20px] md:gap-[24px]">
            <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[29px] text-[#454556]">
              At InsiderBuying.ai, we leverage advanced Large Language Models to synthesize vast amounts of financial data into readable, actionable insights. However, we maintain a human-in-the-loop oversight to ensure the highest standards of accuracy.
            </p>
            <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[29px] text-[#454556]">
              Crucially, the AI is not &ldquo;hallucinating&rdquo; data points. Every ticker symbol, purchase price, and percentage change is pulled directly from official SEC EDGAR filings via our proprietary data pipeline. The AI serves as a high-speed research analyst, identifying correlations that might take a human hours to uncover.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: LIMITATIONS ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[190px]">
        <div className="max-w-[900px] mx-auto">
          <h2 className="text-[24px] md:text-[30px] font-bold leading-[1.3] md:leading-[36px] text-[#1c1b1b] mb-[28px] md:mb-[40px]">
            Limitations
          </h2>
          <div className="bg-white rounded-[4px] shadow-[0px_1px_3px_rgba(0,0,0,0.06)] p-[24px] md:p-[48px]">
            <div className="flex flex-col gap-[20px] md:gap-[24px]">
              {LIMITATIONS.map((item, i) => (
                <div key={i} className="flex gap-[12px] md:gap-[16px]">
                  <span className="text-[16px] shrink-0 pt-[2px]">{item.icon}</span>
                  <p className="text-[15px] md:text-[16px] font-normal leading-[24px] text-[#454556]">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 6: VERIFY OUR DATA ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[190px]">
        <div className="max-w-[900px] mx-auto text-center">
          <h2 className="text-[24px] md:text-[30px] font-bold leading-[1.3] md:leading-[36px] text-[#1c1b1b] mb-[16px]">
            Verify Our Data
          </h2>
          <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[28px] text-[#454556] mb-[24px] md:mb-[32px]">
            Every data point in our articles can be independently verified.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[16px] md:gap-[24px]">
            {[
              { title: "SEC EDGAR Database", desc: "Search official government filings directly to cross-reference our analysis." },
              { title: "Financial Datasets API", desc: "Review the documentation for the institutional data layer powering our platform." },
            ].map((link) => (
              <a key={link.title} href="#" className="bg-[#f6f3f2] rounded-[4px] p-[24px] md:p-[32px] text-left hover:bg-[#eae7e7] transition-colors group">
                <div className="flex items-center justify-between mb-[12px] md:mb-[16px]">
                  <h3 className="text-[18px] md:text-[20px] font-bold leading-[28px] text-[#1c1b1b]">{link.title}</h3>
                  <svg className="w-[16px] h-[16px] text-[#454556] group-hover:translate-x-[2px] transition-transform shrink-0 ml-[8px]" viewBox="0 0 16 16" fill="none">
                    <path d="M4 12L12 4M12 4H6M12 4v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="text-[14px] font-normal leading-[20px] text-[#454556]">{link.desc}</p>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
