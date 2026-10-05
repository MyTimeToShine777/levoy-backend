import { Icon } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/primitives";
import { closingCta } from "@/lib/content";
import { site } from "@/lib/site";

/**
 * Closing CTA band — id="contact" so the header link and footer reach it.
 * Dark with a brand glow so it separates cleanly from the footer beneath.
 */
export function ClosingCta() {
  return (
    <section id="contact" className="relative overflow-hidden bg-ink-950 py-16 sm:py-20 lg:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 h-[28rem] w-[52rem] -translate-x-1/2 -translate-y-1/2 rounded-pill bg-brand-600/25 blur-3xl" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.14) 1px, transparent 0)",
            backgroundSize: "30px 30px",
          }}
        />
      </div>

      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-pill border border-white/15 bg-white/10 text-brand-300">
            <Icon name="spark" className="h-7 w-7" />
          </span>

          <h2 className="mt-6 text-3xl leading-tight text-white sm:text-4xl lg:text-[2.75rem]">
            {closingCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-ink-300 sm:text-lg">
            {closingCta.body}
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
            <ButtonLink
              href={closingCta.primaryCta.href}
              variant="onDark"
              size="lg"
              external
            >
              {closingCta.primaryCta.label}
              <Icon name="arrowRight" className="h-5 w-5" />
            </ButtonLink>
            <ButtonLink
              href={closingCta.secondaryCta.href}
              variant="onDarkGhost"
              size="lg"
            >
              {closingCta.secondaryCta.label}
            </ButtonLink>
          </div>

          <p className="mt-7 text-sm text-ink-400">
            Questions? Call{" "}
            <a
              href={site.contact.phoneHref}
              className="font-bold text-brand-300 hover:text-brand-200"
            >
              {site.contact.phone}
            </a>{" "}
            or email{" "}
            <a
              href={`mailto:${site.contact.email}`}
              className="font-bold text-brand-300 hover:text-brand-200"
            >
              {site.contact.email}
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
