"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";

const HIDDEN_PATHS = ["/alerts", "/reports", "/how-it-works", "/pricing", "/free-report", "/signup", "/login"];

export function StickyBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success">("idle");

  useEffect(() => {
    if (localStorage.getItem("ei_subscribed") === "1" || localStorage.getItem("ei_sticky_dismissed") === "1") {
      setDismissed(true);
      return;
    }

    function onScroll() {
      setVisible(window.scrollY > 600);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (dismissed) return null;
  if (!visible) return null;
  if (HIDDEN_PATHS.some((p) => pathname.startsWith(p))) return null;
  if (state === "success") return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState("loading");
    try {
      await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), placement: "sticky_bar", source: "earlyinsider.com" }),
      });
      setState("success");
      localStorage.setItem("ei_subscribed", "1");
    } catch {
      setState("idle");
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-bg-alt)] border-t border-[var(--color-border)] md:bg-[var(--color-bg-dark)] md:border-white/10 md:top-0 md:bottom-auto md:border-b md:border-t-0">
      <form onSubmit={handleSubmit} className="max-w-[1216px] mx-auto px-[16px]">

        {/* ── Mobile layout: title centered above, then row ── */}
        <div className="md:hidden py-[10px] flex flex-col items-center gap-[8px]">
          <p className="text-[12px] text-white/80 leading-[16px] text-center">
            <span style={{ color: "#236c37" }} className="font-semibold">Free</span>
            {" "}CEO Alpha Report
          </p>
          <div className="flex items-center gap-[8px]">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-[160px] h-[34px] px-[12px] text-[13px] bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="h-[34px] px-[16px] bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {state === "loading" ? "..." : "Get Report"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                localStorage.setItem("ei_sticky_dismissed", "1");
              }}
              className="text-white/40 hover:text-white/70 transition-colors shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Desktop layout: single row ── */}
        <div className="hidden md:flex items-center justify-between gap-[12px] py-[10px]">
          <p className="text-[13px] text-white/80 leading-[18px] shrink-0">
            <span className="font-medium text-white">Free:</span> The CEO Alpha Report. 50,247 CEO purchases. 68% win rate.
          </p>
          <div className="flex items-center gap-[8px] shrink-0">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="w-[200px] h-[34px] px-[12px] text-[13px] bg-white/10 border border-white/20 text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
            />
            <button
              type="submit"
              disabled={state === "loading"}
              className="h-[34px] px-[16px] bg-[var(--color-primary)] text-white text-[13px] font-medium hover:bg-[var(--color-primary-dark)] transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {state === "loading" ? "..." : "Get Report"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setDismissed(true);
              localStorage.setItem("ei_sticky_dismissed", "1");
            }}
            className="text-white/40 hover:text-white/70 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <svg className="w-[16px] h-[16px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

      </form>
    </div>
  );
}
