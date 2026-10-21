"use client";

import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/primitives";
import { CallioLogo, Icon } from "@/components/ui/icons";
import { navLinks, site } from "@/lib/site";

const links = [
  { label: "Home", href: "#top" },
  { label: "Features", href: "#features" },
  { label: "Why Callio", href: "#why-levoy" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Contact", href: "#contact" },
];

/**
 * Sticky marketing header. Transparent-over-hero at the top of the page, then
 * a blurred white bar once the user scrolls. The mobile drawer is a real
 * disclosure: it traps nothing fancy, it just toggles and closes on Escape.
 */
export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The drawer covers the page; stop the body from scrolling behind it.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled || open
          ? "border-b border-ink-200/80 bg-white/85 backdrop-blur-lg"
          : "border-b border-transparent bg-transparent"
      }`}
    >
      <div className="container-page flex h-16 items-center justify-between gap-4 lg:h-18">
        <a href="#top" aria-label={`${site.name} home`} className="shrink-0">
          <CallioLogo markClassName="h-9 lg:h-10" />
        </a>

        <nav aria-label="Primary" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  className="rounded-sm px-3.5 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <ButtonLink
            href={site.partnerLoginUrl}
            variant="ghost"
            size="sm"
            external
          >
            Partner Login
          </ButtonLink>
          <ButtonLink href={site.appUrl} size="sm" external>
            Sign Up Now
            <Icon name="arrowRight" className="h-4 w-4" />
          </ButtonLink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          className="inline-flex h-10 w-10 items-center justify-center rounded-sm text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700 lg:hidden"
        >
          <Icon name={open ? "close" : "menu"} className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile drawer */}
      <div
        id="mobile-nav"
        hidden={!open}
        className="border-t border-ink-200 bg-white lg:hidden"
      >
        <nav aria-label="Mobile" className="container-page py-4">
          <ul className="flex flex-col">
            {links.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-sm px-2 py-3.5 text-base font-bold text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                >
                  {l.label}
                  <Icon name="arrowRight" className="h-4 w-4 text-ink-300" />
                </a>
              </li>
            ))}
            {navLinks
              .filter((l) => l.external)
              .slice(0, 4)
              .map((l) => (
                <li key={l.label}>
                  <a
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between rounded-sm px-2 py-3.5 text-base font-bold text-ink-700 transition-colors hover:bg-brand-50 hover:text-brand-700"
                  >
                    {l.label}
                    <Icon name="arrowRight" className="h-4 w-4 text-ink-300" />
                  </a>
                </li>
              ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2.5 border-t border-ink-100 pt-4">
            <ButtonLink
              href={site.appUrl}
              size="md"
              external
              onClick={() => setOpen(false)}
            >
              Sign Up Now
            </ButtonLink>
            <ButtonLink
              href={site.partnerLoginUrl}
              variant="secondary"
              size="md"
              external
              onClick={() => setOpen(false)}
            >
              Partner Login
            </ButtonLink>
          </div>
        </nav>
      </div>
    </header>
  );
}
