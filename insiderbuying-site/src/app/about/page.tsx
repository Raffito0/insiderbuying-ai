import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | EarlyInsider",
  description:
    "Learn about EarlyInsider — our mission, team, and how we deliver real-time SEC insider trading alerts and AI-powered stock analysis.",
};

const STEPS = [
  { icon: "📄", title: "SEC Filing", desc: "Real-time monitoring of the SEC EDGAR system for newly submitted Form 4 documents." },
  { icon: "🧠", title: "AI Analysis", desc: "Filtering for high conviction CEO and CFO buys while discarding routine compensation awards." },
  { icon: "🔔", title: "Alert Delivery", desc: "Instant notifications via email and your personalized dashboard as soon as a match is found." },
  { icon: "📊", title: "Your Decision", desc: "Use our data-driven insights to make informed adjustments to your investment portfolio." },
];

const TRUST_CARDS = [
  { icon: "🔒", title: "SEC Regulated Data", desc: "All data sourced directly from SEC EDGAR to ensure 100% accuracy and compliance." },
  { icon: "🤖", title: "AI-Powered Analysis", desc: "Proprietary sentiment scoring models that distinguish true conviction from noise." },
  { icon: "⚡", title: "Real-Time Delivery", desc: "Our architecture ensures sub-60 second alert latency from filing to your screen." },
];

export default function AboutPage() {
  return (
    <div className="bg-[#fcf9f8]">

      {/* ═══ SECTION 1: HEADER ═══ */}
      <section className="bg-[#000592] pt-[80px] pb-[80px] md:pt-[128px] md:pb-[128px] px-[20px] md:px-[24px] flex flex-col items-center justify-center">
        <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] md:leading-[52px] text-white text-center mb-[16px] md:mb-[24px]">
          About EarlyInsider
        </h1>
        <p className="text-[16px] md:text-[18px] font-normal leading-[26px] md:leading-[29px] text-white text-center max-w-[620px]">
          Our mission is to democratize high-conviction insider trading data for the modern retail investor.
        </p>
      </section>

      {/* ═══ SECTION 2: MISSION ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px] lg:px-[240px]">
        <div className="max-w-[800px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[48px] font-normal leading-[1.15] md:leading-[42px] text-[#1c1b1b] mb-[24px] md:mb-[30px]">
            Transparency in Every Trade
          </h2>
          <div className="flex flex-col gap-[18px] md:gap-[22px]">
            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b]">
              In the complex world of the stock market, information is the ultimate currency. Historically, high-conviction data—like knowing exactly when a CEO or CFO buys their own company&apos;s shares—was the exclusive domain of institutional architects and hedge fund managers.
            </p>
            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b]">
              EarlyInsider was founded to change that landscape. We monitor SEC filings 24/7, processing thousands of Form 4 submissions through our proprietary AI engine to filter out the noise and highlight the signals that actually matter.
            </p>
            <p className="text-[16px] md:text-[17px] font-normal leading-[28px] md:leading-[30px] text-[#1c1b1b]">
              By bridging the gap between raw regulatory data and actionable intelligence, we empower retail investors to trade with the same conviction as the insiders themselves.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ SECTION 3: HOW IT WORKS ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[40px]">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[48px] font-normal leading-[1.15] md:leading-[42px] text-[#1c1b1b] text-center mb-[40px] md:mb-[64px]">
            From SEC Filing to Your Dashboard
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[20px] md:gap-[24px] lg:px-[95px]">
            {STEPS.map((step) => (
              <div key={step.title} className="bg-white p-[24px] md:p-[32px]">
                <div className="text-[24px] mb-[16px]">{step.icon}</div>
                <h3 className="text-[18px] font-bold leading-[28px] text-[#1c1b1b] mb-[12px]">{step.title}</h3>
                <p className="text-[14px] font-normal leading-[23px] text-[#1c1b1b]">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 4: DATA & TRUST ═══ */}
      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[40px]">
        <div className="max-w-[1200px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[32px] md:text-[48px] font-normal leading-[1.15] md:leading-[42px] text-[#1c1b1b] text-center mb-[40px] md:mb-[50px]">
            Institutional Grade Intelligence
          </h2>

          {/* Stats row */}
          <div className="flex flex-col md:flex-row items-center justify-center gap-[32px] md:gap-[60px] mb-[48px] md:mb-[64px]">
            {[
              { value: "$4.2B", label: "Tracked Monthly" },
              { value: "2,847", label: "Alerts Sent (24h)" },
              { value: "17,325+", label: "Companies Monitored" },
            ].map((stat, i) => (
              <div key={stat.value} className="flex items-center gap-[32px] md:gap-[60px]">
                <div className="text-center md:text-left">
                  <p className="font-[var(--font-montaga)] text-[40px] md:text-[48px] font-normal leading-[40px] text-[#1c1b1b]">{stat.value}</p>
                  <p className="text-[14px] font-normal leading-[16px] text-[#454556] mt-[8px]">{stat.label}</p>
                </div>
                {i < 2 && <div className="hidden md:block w-[1px] h-[48px] bg-[#1c1b1b]" />}
              </div>
            ))}
          </div>

          {/* Trust cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-[20px] md:gap-[32px] lg:px-[95px]">
            {TRUST_CARDS.map((card) => (
              <div key={card.title} className="bg-[#f6f3f2] p-[28px] md:p-[40px]">
                <div className="flex items-center gap-[12px] mb-[16px]">
                  <span className="text-[18px]">{card.icon}</span>
                  <span className="font-[var(--font-montaga)] text-[16px] font-normal leading-[24px] text-[#1c1b1b]">{card.title}</span>
                </div>
                <p className="text-[14px] font-normal leading-[20px] text-[#1c1b1b]">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SECTION 5: LEGAL DISCLAIMER ═══ */}
      <section className="bg-[#f6f3f2] pt-[64px] pb-[64px] md:pt-[80px] md:pb-[80px] px-[20px] md:px-[32px] lg:px-[240px]">
        <div className="max-w-[800px] mx-auto">
          <h2 className="font-[var(--font-montaga)] text-[28px] md:text-[40px] font-normal leading-[1.2] md:leading-[33px] text-[#1c1b1b] mb-[20px] md:mb-[24px]">
            Regulatory &amp; Financial Disclosure
          </h2>
          <div className="bg-white p-[24px] md:p-[32px]">
            <p className="text-[14px] font-normal leading-[23px] text-[#5c6670]">
              EarlyInsider is a financial data provider. We are not registered investment advisors. All information provided through our platform, including alerts and reports, is for educational purposes only and does not constitute financial, legal, or tax advice. Past performance of insider trading signals does not guarantee future results. All investments carry risk, and you should consult a qualified financial advisor before making any investment decisions.
            </p>
          </div>
        </div>
      </section>

      {/* ═══ CTA SECTION ═══ */}
      <section className="bg-white pt-[64px] pb-[80px] md:pt-[100px] md:pb-[128px] px-[20px] md:px-[32px] lg:px-[192px]">
        <div className="max-w-[896px] mx-auto text-center">
          <h2 className="font-[var(--font-montaga)] text-[30px] md:text-[36px] font-normal leading-[1.2] md:leading-[40px] text-[#1c1b1b] mb-[24px] md:mb-[32px]">
            Ready to follow the smart money?
          </h2>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center h-[56px] md:h-[60px] px-[32px] md:px-[40px] bg-[#000592] text-white text-[16px] md:text-[18px] font-semibold leading-[28px] rounded-[4px] hover:bg-[#080f99] transition-colors shadow-[0px_2px_4px_rgba(0,0,0,0.1)]"
          >
            Create Your Free Account
          </Link>
        </div>
      </section>
    </div>
  );
}
