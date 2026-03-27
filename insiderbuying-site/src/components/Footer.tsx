import Link from "next/link";

export function Footer() {
  return (
    <footer className="w-full bg-[#151414] pt-[60px] px-[20px] pb-[40px] md:pt-[80px] md:px-[60px]">
      <div className="max-w-[1160px] mx-auto px-[32px]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-[32px] mb-[40px] md:mb-[80px]">
          <div>
            <p className="font-[var(--font-montaga)] text-[22px] leading-[28px] text-white mb-[22px]">Early Insider</p>
            <p className="text-[14px] leading-[23px] text-[#94a3b8]">Precise signals. Real-time edge.</p>
          </div>
          <div>
            <p className="text-[16px] leading-[24px] text-white mb-[24px]">Product</p>
            <ul className="space-y-[16px]">
              {[
                { label: "About", href: "/about" },
                { label: "Pricing", href: "/pricing" },
                { label: "FAQ", href: "/faq" },
                { label: "Blog", href: "/blog" },
              ].map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-[14px] leading-[20px] text-[#94a3b8] hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[16px] leading-[24px] text-white mb-[24px]">Company</p>
            <ul className="space-y-[16px]">
              {[
                { label: "Contact", href: "/contact" },
                { label: "Privacy", href: "/privacy" },
                { label: "Terms", href: "/terms" },
              ].map((l) => (
                <li key={l.label}>
                  <Link href={l.href} className="text-[14px] leading-[20px] text-[#94a3b8] hover:text-white transition-colors">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[16px] leading-[24px] text-white mb-[24px]">Legal</p>
            <p className="text-[10px] leading-[16px] tracking-[1px] text-[#94a3b8]">
              Legal Disclaimer: Financial data is for informational purposes only. Trading involves significant risk. Consult a professional advisor before making any investment decisions.
            </p>
          </div>
        </div>
        <div className="border-t border-white/10 pt-[16px]">
          <p className="text-[12px] leading-[16px] text-[#64748b]">&copy; 2026 EarlyInsider. Institutional Grade Data. All Rights Reserved.</p>
        </div>
      </div>
    </footer>
  );
}
