import type { Metadata } from "next";
import { Montaga, Inter, Space_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { OneSignalInit } from "@/components/OneSignalInit";

const montaga = Montaga({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-montaga",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "InsiderBuying.ai — Know What CEOs Are Buying",
  description:
    "Real-time SEC Form 4 insider trading alerts, AI-powered analysis, and deep dive stock reports. Track what executives buy before everyone else.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${montaga.variable} ${inter.variable} ${spaceMono.variable}`}
    >
      <body className="antialiased">
        <Navbar />
        <main>{children}</main>
        <Footer />
        <OneSignalInit />
      </body>
    </html>
  );
}
