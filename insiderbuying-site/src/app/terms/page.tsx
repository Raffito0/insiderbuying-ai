export default function TermsPage() {
  return (
    <div className="bg-[#fcf9f8]">
      <section className="bg-[#f6f3f2] pt-[80px] pb-[80px] md:pt-[128px] md:pb-[128px] px-[20px] md:px-[32px]">
        <div className="max-w-[800px] mx-auto">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] text-[#1c1b1b] mb-[16px]">Terms of Service</h1>
          <p className="text-[14px] text-[#757688]">Last updated: March 2026</p>
        </div>
      </section>

      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px]">
        <div className="max-w-[800px] mx-auto flex flex-col gap-[32px]">
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">1. Acceptance of Terms</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">By accessing or using EarlyInsider, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use our services.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">2. Service Description</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">EarlyInsider provides financial data analytics, SEC Form 4 filing alerts, and AI-powered analysis of insider trading activity. Our platform aggregates publicly available data from the SEC EDGAR database and applies proprietary scoring models.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">3. Not Financial Advice</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">EarlyInsider is not a registered investment advisor, broker-dealer, or financial planner. All information provided through our platform is for educational and informational purposes only. Nothing on this site constitutes financial, legal, or tax advice. Past performance of insider trading signals does not guarantee future results. Always consult a qualified financial advisor before making investment decisions.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">4. Account Terms</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">You must provide accurate and complete information when creating an account. You are responsible for maintaining the security of your account credentials. You must be at least 18 years old to use our services.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">5. Subscription & Billing</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">Paid subscriptions are billed monthly or annually as selected. You may cancel at any time from your account settings. Cancellation takes effect at the end of the current billing period. No refunds are provided for partial billing periods.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">6. Intellectual Property</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">All content, analysis, scoring models, and proprietary data on EarlyInsider are owned by us. You may not reproduce, distribute, or create derivative works from our content without written permission.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">7. Limitation of Liability</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">EarlyInsider shall not be liable for any indirect, incidental, or consequential damages arising from your use of our services. Our total liability shall not exceed the amount paid by you in the 12 months preceding the claim.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">8. Contact</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">For questions about these terms, contact us at <a href="mailto:legal@earlyinsider.com" className="text-[#000592] hover:underline">legal@earlyinsider.com</a>.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
