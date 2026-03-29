"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

const NAV_LINKS = [
  { href: "/alerts", label: "Live Alerts" },
  { href: "/reports", label: "Reports" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/pricing", label: "Pricing" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (mobileOpen) {
      setIsAnimating(true);
      requestAnimationFrame(() => setIsVisible(true));
    } else if (isAnimating) {
      setIsVisible(false);
      timeoutRef.current = setTimeout(() => setIsAnimating(false), 280);
    }
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [mobileOpen]);

  function closeMenu() {
    setMobileOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[var(--color-border-light)]">
      <nav aria-label="Main menu" className="mx-auto max-w-[1280px] flex items-center justify-between h-20 px-6">
        {/* Logo */}
        <Link href="/" className="flex items-baseline gap-0 text-[22px] md:text-[26px]">
          <span className="font-[var(--font-inter)] font-normal text-[color:var(--color-text)]">
            Early
          </span>
          <span className="font-[var(--font-inter)] font-bold text-[color:var(--color-text)]">
            Insider
          </span>
        </Link>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/login"
            className="text-sm font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-text)]"
          >
            Login
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center h-10 px-6 text-sm font-semibold tracking-wider text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] transition-colors"
          >
            Start Free
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            {mobileOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            ) : (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu — animated overlay */}
      {isAnimating && (
        <>
          <div
            className="md:hidden fixed inset-0 top-[80px] z-40 transition-opacity duration-[280ms] ease-out"
            style={{ backgroundColor: `rgba(0,0,0,${isVisible ? 0.2 : 0})` }}
            onClick={closeMenu}
          />
          <div
            id="mobile-nav"
            role="navigation"
            aria-label="Mobile menu"
            className="md:hidden fixed left-0 right-0 top-[80px] z-50 bg-white px-6 py-5 space-y-3 transition-all duration-[280ms] ease-out origin-top"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0) scaleY(1)" : "translateY(-8px) scaleY(0.97)",
            }}
          >
            {NAV_LINKS.map((link, i) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-[15px] font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors py-[2px]"
                style={{
                  opacity: isVisible ? 1 : 0,
                  transform: isVisible ? "translateY(0)" : "translateY(-4px)",
                  transition: `opacity 200ms ease ${80 + i * 40}ms, transform 200ms ease ${80 + i * 40}ms`,
                }}
                onClick={closeMenu}
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/login"
              className="block text-[15px] font-medium text-[color:var(--color-muted)] hover:text-[color:var(--color-text)] transition-colors py-[2px]"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(-4px)",
                transition: `opacity 200ms ease ${80 + NAV_LINKS.length * 40}ms, transform 200ms ease ${80 + NAV_LINKS.length * 40}ms`,
              }}
              onClick={closeMenu}
            >
              Login
            </Link>
            <div
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? "translateY(0)" : "translateY(-4px)",
                transition: `opacity 200ms ease ${80 + (NAV_LINKS.length + 1) * 40}ms, transform 200ms ease ${80 + (NAV_LINKS.length + 1) * 40}ms`,
              }}
            >
              <Link
                href="/signup"
                className="block w-full text-center h-10 leading-10 text-sm font-semibold tracking-wider text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] transition-colors mt-1"
                onClick={closeMenu}
              >
                Start Free
              </Link>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
