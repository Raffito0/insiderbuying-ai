import Link from "next/link";

export default function ContactPage() {
  return (
    <div className="bg-[#fcf9f8]">
      <section className="bg-[#f6f3f2] pt-[80px] pb-[80px] md:pt-[128px] md:pb-[128px] px-[20px] md:px-[32px]">
        <div className="max-w-[800px] mx-auto text-center">
          <h1 className="font-[var(--font-montaga)] text-[39px] md:text-[54px] font-normal leading-[1.1] text-[#1c1b1b] mb-[16px] md:mb-[24px]">Contact Us</h1>
          <p className="text-[16px] md:text-[18px] font-normal leading-[28px] text-[#454556]">
            We&apos;d love to hear from you. Reach out to our team for support, partnerships, or press inquiries.
          </p>
        </div>
      </section>

      <section className="bg-white pt-[64px] pb-[64px] md:pt-[96px] md:pb-[96px] px-[20px] md:px-[32px]">
        <div className="max-w-[600px] mx-auto">
          <div className="flex flex-col gap-[40px]">
            <div>
              <h2 className="text-[20px] font-bold leading-[28px] text-[#1c1b1b] mb-[8px]">General Support</h2>
              <p className="text-[16px] leading-[26px] text-[#454556]">For account issues, billing questions, or technical support.</p>
              <a href="mailto:support@insiderbuying.ai" className="text-[16px] font-medium text-[#000592] hover:underline mt-[8px] inline-block">support@insiderbuying.ai</a>
            </div>
            <div>
              <h2 className="text-[20px] font-bold leading-[28px] text-[#1c1b1b] mb-[8px]">Enterprise & Partnerships</h2>
              <p className="text-[16px] leading-[26px] text-[#454556]">For institutional partnerships, API access, or custom data solutions.</p>
              <a href="mailto:enterprise@insiderbuying.ai" className="text-[16px] font-medium text-[#000592] hover:underline mt-[8px] inline-block">enterprise@insiderbuying.ai</a>
            </div>
            <div>
              <h2 className="text-[20px] font-bold leading-[28px] text-[#1c1b1b] mb-[8px]">Press & Media</h2>
              <p className="text-[16px] leading-[26px] text-[#454556]">For media inquiries, interviews, or data citation requests.</p>
              <a href="mailto:press@insiderbuying.ai" className="text-[16px] font-medium text-[#000592] hover:underline mt-[8px] inline-block">press@insiderbuying.ai</a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
