import Link from "next/link";
import NewsletterForm from "@/components/NewsletterForm";

const TOC = [
  { num: "01", label: "The Signal in the Noise", active: true },
  { num: "02", label: "Technical Infrastructure", active: false },
  { num: "03", label: "High-Conviction Scoring", active: false },
  { num: "04", label: "Replacement Cycle Trends", active: false },
  { num: "05", label: "Summary and Outlook", active: false },
];

const TAGS = ["#Semiconductors", "#InsiderTrading", "#GrowthInvesting", "#MacroSignals"];

const RELATED = [
  "The S&P Mega-Cap Insider Rotation",
  "Decoding Q3 Filings with AI Models",
  "Rare Earth Semiconductors and Allocation",
];

export function generateStaticParams() {
  return [
    { slug: "great-repricing-yield-curve" },
    { slug: "energy-giants-accumulation" },
    { slug: "tech-insiders-commodities" },
    { slug: "aristocrat-play-dividend" },
    { slug: "semiconductor-forecast" },
  ];
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  await params;

  return (
    <div className="bg-[#fcf9f8] pt-[48px] md:pt-[128px] pb-[1px]">
      <div className="max-w-[1152px] mx-auto flex gap-[48px] lg:gap-[80px] px-[16px] md:px-[32px]">

        {/* ═══ ARTICLE ═══ */}
        <article className="flex-1 min-w-0">

          {/* HEADER */}
          <div className="mb-[24px]">
            <span className="inline-block bg-[#eae7e7] px-[12px] py-[4px] text-[12px] font-medium leading-[16px] text-[#454556] mb-[16px]">
              Market Analysis
            </span>
            <h1 className="font-[var(--font-montaga)] text-[28px] md:text-[38px] font-normal leading-[1.2] md:leading-[42px] text-[#1a1a1a] mb-[12px]">
              Institutional Positioning in Semi-Cap Equipment: The Stealth Accumulation Phase
            </h1>
            <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[29px] text-[#5c6670] mb-[24px]">
              Deciphering the surge in Form 4 filings among mid-tier semiconductor executives during the recent volatility period.
            </p>

            {/* Meta bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between py-[20px] md:py-[24px] border-y border-[#c6c5d9] gap-[12px]">
              <div className="flex items-center gap-[12px] md:gap-[16px]">
                <div className="w-[40px] h-[40px] md:w-[48px] md:h-[48px] rounded-full bg-[#f0eded]" />
                <div>
                  <p className="text-[14px] font-semibold leading-[20px] text-[#1a1a1a]">Marcus Vane</p>
                  <p className="text-[12px] font-normal leading-[16px] text-[#5c6670]">Lead Analyst, Technology</p>
                </div>
              </div>
              <div className="flex items-center gap-[16px] md:gap-[24px] ml-[52px] sm:ml-0">
                <span className="flex items-center gap-[6px] text-[12px] md:text-[13px] font-normal leading-[20px] text-[#454556]">
                  <svg className="w-[13px] h-[15px]" viewBox="0 0 13 15" fill="none"><rect x="1" y="2" width="11" height="12" rx="1" stroke="#454556" strokeWidth="1.5"/><path d="M4 0v4M9 0v4M1 6h11" stroke="#454556" strokeWidth="1.5"/></svg>
                  Oct 24, 2024
                </span>
                <span className="flex items-center gap-[6px] text-[12px] md:text-[13px] font-normal leading-[20px] text-[#454556]">
                  <svg className="w-[15px] h-[15px]" viewBox="0 0 15 15" fill="none"><circle cx="7.5" cy="7.5" r="6.5" stroke="#454556" strokeWidth="1.5"/><path d="M7.5 4v4l3 2" stroke="#454556" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  12 min read
                </span>
              </div>
            </div>
          </div>

          {/* FEATURED IMAGE */}
          <figure className="mb-[24px]">
            <div className="w-full h-[220px] md:h-[438px] bg-[#f0eded] rounded-[4px]" />
            <figcaption className="mt-[12px] md:mt-[15px] text-[12px] md:text-[13px] font-normal leading-[20px] md:leading-[21px] text-[#454556]">
              Fig 1.1: Automated wafer inspection systems at a Tier 1 fabrication facility. Source: Global Tech Visuals.
            </figcaption>
          </figure>

          {/* ARTICLE BODY */}
          <div className="mb-[48px] md:mb-[80px]">
            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b] mb-[24px]">
              The current landscape of the semiconductor equipment sector is undergoing a quiet but profound shift. While retail sentiment remains jittery due to macro headwinds, our proprietary tracking of SEC Form 4 filings reveals a different narrative. C-suite executives at critical supply-chain nodes are accumulating shares at levels not seen since the post-pandemic recovery phase.
            </p>

            <h2 className="font-[var(--font-montaga)] text-[26px] md:text-[32px] font-normal leading-[1.2] md:leading-[42px] text-[#1a1a1a] mt-[36px] md:mt-[48px] mb-[20px] md:mb-[24px]">
              The Signal in the Noise
            </h2>

            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b] mb-[24px]">
              Historically, cluster buying—where three or more insiders buy shares within a 30-day window—serves as a high-conviction signal for future relative outperformance. We are seeing this pattern emerge in companies producing lithography and deposition equipment, particularly among mid-cap names that institutional investors have been quietly accumulating.
            </p>

            {/* Bullet list */}
            <ul className="mb-[24px] flex flex-col gap-[12px] md:gap-[16px]">
              {[
                "Aggregate insider buying volume reached $45M across the sector last month.",
                "Institutional ownership maintained a steady 84% floor during the pullback.",
                "Relative Strength Index (RSI) shows a bullish divergence on weekly charts.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-[12px] md:gap-[14px]">
                  <svg className="w-[20px] h-[20px] shrink-0 mt-[2px]" viewBox="0 0 20 20" fill="#006d34"><circle cx="10" cy="10" r="10"/><path d="M6 10l3 3 5-5" stroke="white" strokeWidth="2" fill="none"/></svg>
                  <span className="text-[16px] md:text-[17px] font-normal leading-[26px] text-[#1c1b1b]">{item}</span>
                </li>
              ))}
            </ul>

            {/* Blockquote */}
            <blockquote className="bg-[#f1f1f1] border-l-[1px] border-black p-[20px] md:p-[32px] mb-[24px]">
              <p className="text-[17px] md:text-[19px] font-normal leading-[28px] md:leading-[31px] text-[#1c1b1b] italic">
                &ldquo;The data suggests we are at the inflection point of the replacement cycle. Insiders know the order book for 2025 is already being committed.&rdquo;
              </p>
            </blockquote>

            <h3 className="font-[var(--font-montaga)] text-[26px] md:text-[32px] font-normal leading-[1.2] md:leading-[33px] text-[#1a1a1a] mt-[36px] md:mt-[48px] mb-[20px] md:mb-[24px]">
              Technical Infrastructure and Scalability
            </h3>

            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b] mb-[24px]">
              Monitoring these flows requires high-frequency data pipelines. For instance, our API uses the following endpoint logic to filter for &ldquo;Significant Cluster Events&rdquo;:
            </p>

            {/* Code block */}
            <div className="bg-white p-[16px] md:p-[24px] mb-[24px] overflow-x-auto">
              <code className="text-[13px] md:text-[14px] font-normal leading-[20px] text-[#000592] font-[var(--font-mono)] whitespace-nowrap">
                GET /v1/signals/insider-cluster?sector=semi-cap&amp;min_confidence=0.85
              </code>
            </div>

            {/* In-article widget */}
            <div className="bg-white flex flex-col md:flex-row md:items-center justify-between p-[24px] md:p-[40px] mb-[24px] gap-[20px]">
              <div className="flex flex-col gap-[7px]">
                <div className="flex items-center gap-[12px]">
                  <span className="font-[var(--font-mono)] text-[18px] font-bold text-[#1a1a1a]">NVDA</span>
                  <span className="bg-[#54fd8f] text-[10px] font-bold text-[#006d34] px-[8px] py-[2px] rounded-[2px]">HIGH CONVICTION</span>
                </div>
                <p className="text-[14px] font-normal leading-[20px] text-[#454556]">
                  Latest Transaction: <span className="font-medium">$1.2M (CEO Purchase)</span>
                </p>
                <div className="flex gap-[24px] pt-[8px]">
                  <div>
                    <p className="text-[22px] font-bold leading-[24px] text-[#006d34] font-[var(--font-mono)]">87</p>
                    <p className="text-[11px] font-normal leading-[16px] text-[#757688]">Conviction</p>
                  </div>
                  <div>
                    <p className="text-[22px] font-bold leading-[24px] text-[#1a1a1a] font-[var(--font-mono)]">3</p>
                    <p className="text-[11px] font-normal leading-[16px] text-[#757688]">Cluster Size</p>
                  </div>
                </div>
              </div>
              <Link href="/alerts" className="flex items-center justify-center h-[48px] md:h-[52px] px-[24px] md:px-[32px] bg-[#000592] text-white text-[14px] font-medium leading-[20px] shrink-0">
                VIEW FULL ANALYSIS
              </Link>
            </div>

            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b]">
              In conclusion, the convergence of high-conviction insider buying and depressed valuations provides a rare window of opportunity for institutional investors. We expect the next earnings cycle to validate this thesis as margin expansion begins to reflect in reported numbers.
            </p>
          </div>

          {/* ═══ FOOTER ═══ */}
          <div className="pt-[40px] md:pt-[80px] border-t border-[#c6c5d9]">
            {/* Tags */}
            <div className="flex flex-wrap gap-[8px] mb-[24px]">
              {TAGS.map((tag) => (
                <span key={tag} className="bg-[#eae7e7] px-[12px] py-[4px] text-[12px] font-medium leading-[18px] text-[#454556]">
                  {tag}
                </span>
              ))}
            </div>

            {/* Share bar */}
            <div className="flex items-center justify-between py-[20px] md:py-[24px] border-y border-[#c6c5d9] mb-[24px]">
              <span className="font-[var(--font-montaga)] text-[16px] md:text-[18px] font-normal leading-[20px] text-[#454556]">Share this Insight</span>
              <div className="flex gap-[12px] md:gap-[16px]">
                {[0, 1, 2].map((i) => (
                  <button key={i} className="w-[36px] h-[36px] md:w-[40px] md:h-[40px] border border-[#c6c5d9] flex items-center justify-center hover:bg-[#f6f3f2] transition-colors">
                    <div className="w-[13px] h-[13px] bg-[#454556] rounded-sm" />
                  </button>
                ))}
              </div>
            </div>

            {/* Related Articles */}
            <div className="pt-[24px] pb-[40px]">
              <h4 className="font-[var(--font-montaga)] text-[26px] md:text-[32px] font-normal leading-[1.2] md:leading-[28px] text-[#1c1b1b] mb-[24px] md:mb-[32px]">Related Articles</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-[20px] md:gap-[24px]">
                {RELATED.map((title) => (
                  <Link key={title} href="#" className="group">
                    <div className="w-full aspect-[4/3] bg-[#f0eded] rounded-[4px] mb-[12px] md:mb-[16px]" />
                    <p className="text-[14px] font-medium leading-[20px] text-[#1a1a1a] group-hover:text-[#000592] transition-colors">
                      {title}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            {/* Author Bio */}
            <div className="bg-white flex flex-col sm:flex-row gap-[20px] md:gap-[32px] p-[24px] md:p-[32px]">
              <div className="w-[64px] h-[64px] md:w-[80px] md:h-[80px] rounded-full bg-[#f0eded] border-[2px] border-white shadow shrink-0" />
              <div className="flex flex-col gap-[6px]">
                <p className="font-[var(--font-montaga)] text-[20px] md:text-[22px] font-normal leading-[28px] text-[#1c1b1b]">Marcus Vane</p>
                <p className="text-[14px] font-normal leading-[23px] text-[#454556]">
                  Marcus has over 15 years of experience in equity research and quant modeling. Prior to joining EarlyInsider, he served as a lead analyst at J.P. Morgan focusing on global technology supply chains.
                </p>
                <div className="flex gap-[16px] pt-[9px]">
                  <span className="text-[12px] font-medium leading-[16px] text-[#000592]">@marcusvane</span>
                  <span className="text-[12px] font-medium leading-[16px] text-[#000592]">LinkedIn</span>
                </div>
              </div>
            </div>
          </div>
        </article>

        {/* ═══ SIDEBAR ═══ */}
        <aside className="w-[280px] shrink-0 hidden lg:flex flex-col gap-[40px]">
          <div className="bg-white p-[32px]">
            <p className="font-[var(--font-montaga)] text-[20px] font-normal leading-[16px] text-[#454556] pb-[16px] border-b border-[#c6c5d9] mb-[23px]">Contents</p>
            <nav className="flex flex-col gap-[15px]">
              {TOC.map((item) => (
                <a key={item.num} href="#" className={`text-[13px] leading-[20px] ${item.active ? "font-semibold text-[#000592]" : "font-normal text-[#454556] hover:text-[#000592]"}`}>
                  {item.num}. {item.label}
                </a>
              ))}
            </nav>
          </div>
          <div className="bg-white p-[32px]">
            <p className="font-[var(--font-montaga)] text-[20px] font-normal leading-[16px] text-[#454556] pb-[16px] border-b border-[#c6c5d9] mb-[24px]">Premium Reports</p>
            <div className="flex flex-col gap-[24px]">
              {[{ title: "Semi-Cap Deep Dive 2024", price: "$29.99" },{ title: "AI Infrastructure Report", price: "$19.99" }].map((r) => (
                <div key={r.title} className="flex flex-col gap-[8px]">
                  <Link href="/reports" className="text-[14px] font-medium leading-[20px] text-[#1a1a1a] hover:text-[#000592]">{r.title}</Link>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-normal leading-[16px] text-[#757688]">{r.price}</span>
                    <Link href="/reports" className="text-[12px] font-medium leading-[16px] text-[#000592]">View &rarr;</Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#000592] p-[32px] pt-[31px] pb-[48px]">
            <p className="font-[var(--font-montaga)] text-[22px] font-normal leading-[22px] text-white mb-[12px]">Join the 1%</p>
            <p className="text-[12px] font-normal leading-[20px] text-[#9ba2ff] mb-[12px]">Get weekly insider summaries delivered to your terminal every Monday morning.</p>
            <NewsletterForm source="blog_article" />
          </div>
        </aside>
      </div>
    </div>
  );
}
