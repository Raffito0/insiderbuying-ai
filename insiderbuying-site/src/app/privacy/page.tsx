export default function PrivacyPage() {
  return (
    <div className="bg-[#fcf9f8]">
      <section className="bg-[#f6f3f2] pt-[80px] pb-[80px] md:pt-[128px] md:pb-[128px] px-[20px] md:px-[32px]">
        <div className="max-w-[800px] mx-auto">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] text-[#1c1b1b] mb-[16px]">Privacy Policy</h1>
          <p className="text-[14px] text-[#757688]">Last updated: March 2026</p>
        </div>
      </section>

      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px]">
        <div className="max-w-[800px] mx-auto flex flex-col gap-[32px]">
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">1. Information We Collect</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">We collect information you provide directly, such as your name, email address, and payment information when you create an account or subscribe to our services. We also automatically collect usage data including IP address, browser type, and pages visited.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">2. How We Use Your Information</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">We use your information to provide and improve our services, send you alerts and notifications you&apos;ve opted into, process payments, and communicate with you about your account. We do not sell your personal data to third parties.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">3. Data Security</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">We implement industry-standard security measures including encryption in transit (TLS 1.3) and at rest (AES-256). Access to user data is restricted to authorized personnel only. We conduct regular security audits and penetration testing.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">4. Cookies & Tracking</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">We use essential cookies for authentication and session management. Analytics cookies help us understand how visitors use our site. You can disable non-essential cookies through your browser settings.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">5. Your Rights</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">You have the right to access, correct, or delete your personal data at any time. You may also request a copy of your data or opt out of marketing communications. To exercise these rights, contact us at privacy@insiderbuying.ai.</p>
          </div>
          <div>
            <h2 className="text-[24px] font-bold leading-[32px] text-[#1c1b1b] mb-[12px]">6. Contact</h2>
            <p className="text-[16px] leading-[26px] text-[#454556]">For privacy-related inquiries, please contact our Data Protection Officer at <a href="mailto:privacy@insiderbuying.ai" className="text-[#000592] hover:underline">privacy@insiderbuying.ai</a>.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
