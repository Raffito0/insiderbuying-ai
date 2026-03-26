import Link from "next/link";

const CATEGORIES = ["All", "Insider Buying", "Stock Analysis", "Earnings", "Dividend", "Market Commentary"];

const FEATURED = {
  slug: "great-repricing-yield-curve",
  category: "Market Commentary",
  categoryColor: "text-[#000592]",
  title: "The Great Repricing: Navigating the 2024 Yield Curve Transition",
  excerpt: "As central banks pivot towards a neutral stance, we analyze the structural shifts in global fixed income and what it means for institutional portfolios.",
  author: "David Sterling",
  date: "Oct 17, 2024",
};

const ARTICLES = [
  { slug: "energy-giants-accumulation", category: "Stock Analysis", catColor: "text-[#006d34]", title: "Post-Earnings: The Quiet Accumulation of Energy Giants", excerpt: "Underlying cash flow trends suggest a major breakout for traditional energy leaders in Q3.", author: "Carter Reed", date: "Sep 12" },
  { slug: "tech-insiders-commodities", category: "Insider Buying", catColor: "text-[#000592]", title: "Why Tech Insiders are Hedging with Commodities", excerpt: "Analyzing the recent $400M outflow from Silicon Valley executives into rare earth metals.", author: "Analyst Team", date: "Sep 10" },
  { slug: "aristocrat-play-dividend", category: "Dividend", catColor: "text-[#006d34]", title: "The Aristocrat Play: 3 Stocks with 40-Year Growth", excerpt: "Stability in volatility—identifying the dividend kings that thrive during inflation cycles.", author: "Analyst Team", date: "Sep 8" },
  { slug: "semiconductor-forecast", category: "Earnings", catColor: "text-[#000592]", title: "Semi-Conductor Forecast: Winter or Spring?", excerpt: "Breaking down the divergent earnings reports from the world's largest foundries.", author: "Samuel Wright", date: "Sep 5" },
];

const POPULAR = [
  "The S&P Blackout: Institutional Portfolio Redistribution",
  "AI Infrastructure: Beyond the Chipmakers",
  "Private Equity Liquidity Threats for 2025",
  "Emerging Markets Index: A New Map",
  "Blockchain Computing and Algorithmic Trading Rights",
];

const INSIDER_WIDGET = [
  { ticker: "NVDA", action: "CEO Buy", amount: "$4.2M" },
  { ticker: "LMT", action: "CFO Buy", amount: "$2.1M" },
  { ticker: "MSFT", action: "Director Buy", amount: "$1.8M" },
];

export default function BlogPage() {
  return (
    <div className="bg-[#fcf9f8] flex flex-col">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[#f5f6f8] pt-[48px] pb-[48px] md:pt-[80px] md:pb-[80px] px-[20px] md:px-[40px]">
        <div className="max-w-[1200px] mx-auto flex flex-col gap-[12px] md:gap-[16px]">
          <p className="text-[12px] font-medium leading-[18px] text-[#5c6670]">Insights</p>
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] md:leading-[70px] text-[#1a1a1a]">Blog</h1>
          <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[29px] text-[#5c6670] max-w-[672px]">
            Institutional-grade market analysis, proprietary trading strategies, and executive briefings on global macro trends.
          </p>
        </div>
      </section>

      {/* ═══ SECTION 2: CATEGORY TABS + SEARCH ═══ */}
      <section className="bg-white border-b border-[#e8eaed] sticky top-[82px] z-40 overflow-x-auto">
        <div className="max-w-[1200px] mx-auto px-[16px] md:px-[32px] flex items-center justify-between h-[60px] md:h-[71px] min-w-max md:min-w-0">
          <div className="flex items-center gap-[16px] md:gap-[32px] h-full">
            {CATEGORIES.map((cat, i) => (
              <button
                key={cat}
                className={`text-[13px] md:text-[14px] leading-[20px] h-full border-b-[1px] whitespace-nowrap ${
                  i === 0 ? "font-bold text-[#1a1a1a] border-[#000592]" : "font-normal text-[#5c6670] border-transparent hover:text-[#1a1a1a]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="hidden md:flex items-center bg-[#f6f3f2] rounded h-[36px] px-[18px] gap-[8px] ml-[16px]">
            <svg className="w-[14px] h-[14px] text-[#757688]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" strokeWidth="2"/><path d="M21 21l-4.35-4.35" strokeWidth="2" strokeLinecap="round"/></svg>
            <input
              type="text"
              placeholder="Search insights..."
              className="bg-transparent text-[14px] font-normal leading-[17px] text-[#1a1a1a] placeholder:text-[#6b7280] outline-none w-[200px]"
            />
          </div>
        </div>
      </section>

      {/* ═══ MAIN CONTENT ═══ */}
      <section className="max-w-[1200px] mx-auto w-full px-[16px] md:px-[32px] pt-[32px] md:pt-[48px] pb-[48px]">
        <div className="flex gap-[48px] lg:gap-[64px]">

          {/* LEFT COLUMN */}
          <div className="flex-1 flex flex-col gap-[48px] md:gap-[80px]">

            {/* Featured Article */}
            <div className="flex flex-col md:flex-row gap-[20px] md:gap-[32px] md:items-center">
              <div className="w-full md:w-[387px] h-[200px] md:h-[217px] bg-[#e5e2e1] rounded-[4px] shrink-0" />
              <div className="flex flex-col gap-[8px] md:gap-[11px]">
                <p className={`text-[10px] font-medium leading-[15px] ${FEATURED.categoryColor}`}>{FEATURED.category}</p>
                <Link href={`/blog/${FEATURED.slug}`}>
                  <h2 className="font-[var(--font-montaga)] text-[24px] md:text-[30px] font-normal leading-[1.25] md:leading-[38px] text-[#1a1a1a] hover:text-[#000592] transition-colors">
                    {FEATURED.title}
                  </h2>
                </Link>
                <p className="text-[15px] md:text-[16px] font-normal leading-[24px] md:leading-[26px] text-[#5c6670]">
                  {FEATURED.excerpt}
                </p>
                <div className="flex items-center gap-[12px] mt-[8px] md:mt-[13px]">
                  <div className="w-[36px] h-[36px] md:w-[40px] md:h-[40px] rounded-full bg-[#eae7e7]" />
                  <div>
                    <p className="text-[13px] font-medium leading-[18px] text-[#1a1a1a]">{FEATURED.author}</p>
                    <p className="text-[12px] font-normal leading-[16px] text-[#5c6670]">{FEATURED.date}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Article Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[32px] md:gap-[48px]">
              {ARTICLES.map((a) => (
                <div key={a.slug} className="flex flex-col">
                  <div className="w-full aspect-[16/9] bg-[#e5e2e1] rounded-[4px] mb-[12px]" />
                  <p className={`text-[10px] font-medium leading-[15px] ${a.catColor} mb-[4px]`}>{a.category}</p>
                  <Link href={`/blog/${a.slug}`}>
                    <h3 className="font-[var(--font-montaga)] text-[20px] md:text-[22px] font-normal leading-[1.25] md:leading-[28px] text-[#1a1a1a] hover:text-[#000592] transition-colors mb-[8px]">
                      {a.title}
                    </h3>
                  </Link>
                  <p className="text-[14px] font-normal leading-[20px] text-[#5c6670] mb-[8px]">{a.excerpt}</p>
                  <div className="flex items-center gap-[8px] pt-[8px]">
                    <span className="text-[12px] font-normal leading-[18px] text-[#5c6670]">{a.author}</span>
                    <span className="text-[12px] font-normal leading-[18px] text-[#5c6670]">{a.date}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Mobile/Tablet: Popular Articles */}
            <div className="lg:hidden pt-[32px]">
              <h4 className="font-[var(--font-montaga)] text-[20px] font-normal leading-[18px] text-[#1a1a1a] mb-[20px]">Popular Articles</h4>
              <div className="flex flex-col gap-[16px]">
                {POPULAR.map((title, i) => (
                  <div key={i} className="flex gap-[12px] items-start">
                    <span className="text-[20px] font-bold font-[var(--font-mono)] text-[#c6c5d9] leading-[20px] shrink-0 w-[24px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link href="#" className="text-[14px] font-medium leading-[20px] text-[#1a1a1a] hover:text-[#000592]">
                      {title}
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile/Tablet: Insider Widget */}
            <div className="lg:hidden bg-[#e5e5e5] p-[20px] mt-[32px] flex flex-col gap-[16px]">
              <h4 className="font-[var(--font-montaga)] text-[18px] font-normal leading-[18px] text-[#1a1a1a]">Insider Widget</h4>
              <div className="grid grid-cols-3 gap-[10px]">
                {INSIDER_WIDGET.map((item) => (
                  <div key={item.ticker} className="bg-white p-[12px] text-center">
                    <p className="text-[14px] font-bold leading-[20px] text-[#1a1a1a] font-[var(--font-mono)]">{item.ticker}</p>
                    <p className="text-[11px] font-normal leading-[16px] text-[#5c6670]">{item.action}</p>
                    <p className="text-[14px] font-semibold leading-[20px] text-[#006d34] mt-[4px]">{item.amount}</p>
                  </div>
                ))}
              </div>
              <Link href="/alerts" className="text-[12px] font-medium leading-[18px] text-[#000592] text-center hover:underline">
                View all insider trades
              </Link>
            </div>

            {/* Load More */}
            <div className="flex justify-center pt-[24px] md:pt-[32px]">
              <button className="h-[46px] px-[32px] rounded-[4px] border border-[#d1d6da] text-[14px] font-bold leading-[20px] text-[#1a1a1a] hover:bg-[#f6f3f2] transition-colors w-full sm:w-auto">
                Load more articles
              </button>
            </div>
          </div>

          {/* SIDEBAR — desktop only */}
          <aside className="w-[336px] shrink-0 hidden lg:flex flex-col gap-[48px]">
            {/* Popular Articles */}
            <div className="flex flex-col gap-[24px]">
              <h4 className="font-[var(--font-montaga)] text-[20px] font-normal leading-[18px] text-[#1a1a1a]">Popular Articles</h4>
              <div className="flex flex-col gap-[24px]">
                {POPULAR.map((title, i) => (
                  <div key={i} className="flex gap-[16px]">
                    <span className="text-[24px] font-bold font-[var(--font-mono)] text-[#c6c5d9] leading-[24px] shrink-0 w-[24px]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <Link href="#" className="text-[14px] font-medium leading-[20px] text-[#1a1a1a] hover:text-[#000592]">
                      {title}
                    </Link>
                  </div>
                ))}
              </div>
            </div>

            {/* Insider Widget */}
            <div className="bg-[#e5e5e5] p-[24px] flex flex-col gap-[24px]">
              <div className="flex items-center justify-between">
                <h4 className="font-[var(--font-montaga)] text-[20px] font-normal leading-[18px] text-[#1a1a1a]">Insider Widget</h4>
                <svg className="w-[12px] h-[12px] text-[#1a1a1a]" viewBox="0 0 12 12"><path d="M0 6h12M6 0v12" stroke="currentColor" strokeWidth="2"/></svg>
              </div>
              <div className="flex flex-col gap-[16px]">
                {INSIDER_WIDGET.map((item) => (
                  <div key={item.ticker} className="bg-white p-[16px] flex items-center justify-between">
                    <div>
                      <p className="text-[14px] font-bold leading-[20px] text-[#1a1a1a] font-[var(--font-mono)]">{item.ticker}</p>
                      <p className="text-[12px] font-normal leading-[16px] text-[#5c6670]">{item.action}</p>
                    </div>
                    <span className="text-[14px] font-semibold leading-[20px] text-[#006d34]">{item.amount}</span>
                  </div>
                ))}
              </div>
              <Link href="/alerts" className="text-[12px] font-medium leading-[18px] text-[#000592] text-center hover:underline">
                View all insider trades
              </Link>
            </div>
          </aside>
        </div>
      </section>

      {/* ═══ NEWSLETTER BAR ═══ */}
      <section className="bg-[#002a5e] pt-[48px] pb-[48px] md:pt-[64px] md:pb-[64px] px-[20px] md:px-[40px]">
        <div className="max-w-[1200px] mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-[24px] lg:gap-[64px]">
          <div className="flex flex-col gap-[8px]">
            <h2 className="font-[var(--font-montaga)] text-[28px] md:text-[42px] font-normal leading-[1.2] md:leading-[36px] text-white">Subscribe to the Briefing</h2>
            <p className="text-[15px] md:text-[16px] font-normal leading-[24px] text-white">
              Receive exclusive weekly analysis directly to your terminal. No noise, just architectural precision.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-[8px] w-full sm:w-auto shrink-0">
            <input
              type="email"
              placeholder="Email Address"
              className="w-full sm:w-[300px] h-[48px] bg-white px-[24px] text-[16px] font-normal leading-[19px] text-[#1a1a1a] placeholder:text-[#6b7280]"
            />
            <button className="h-[48px] px-[32px] bg-white text-[16px] font-medium leading-[24px] text-[#1c1b1b] hover:bg-white/90 transition-colors">
              Subscribe
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
