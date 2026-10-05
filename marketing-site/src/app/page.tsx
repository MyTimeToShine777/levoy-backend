import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Hero } from "@/components/sections/hero";
import { LogoWall } from "@/components/sections/logo-wall";
import { FeatureCards } from "@/components/sections/feature-cards";
import { TrustSection } from "@/components/sections/trust-section";
import { StatsBand } from "@/components/sections/stats-band";
import { FeatureShowcase } from "@/components/sections/feature-showcase";
import { HowItWorks } from "@/components/sections/how-it-works";
import { Testimonial } from "@/components/sections/testimonial";
import { ClosingCta } from "@/components/sections/closing-cta";

export const metadata: Metadata = {
  title: "Levoy — SIM-based Telecalling Analytics & Call Monitoring",
  description:
    "Monitor all telesales and marketing calls, improve caller productivity and track lead status from one real-time dashboard. 1,000+ clients, 12,000+ tracking numbers.",
  alternates: { canonical: "/" },
};

/**
 * Single-route marketing site. Every section is a self-contained component so
 * the page file stays an ordered list of sections.
 */
export default function Home() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <Hero />
        <LogoWall />
        <FeatureCards />
        <TrustSection />
        <StatsBand />
        <FeatureShowcase />
        <HowItWorks />
        <Testimonial />
        <ClosingCta />
      </main>
      <SiteFooter />
    </>
  );
}
