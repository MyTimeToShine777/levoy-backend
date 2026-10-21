import { HeroDashboardArt } from "@/components/illustrations/scenes";
import { ButtonLink } from "@/components/ui/primitives";
import { Icon } from "@/components/ui/icons";
import { hero } from "@/lib/content";

/**
 * Above-the-fold hero: copy on the left, live dashboard artwork on the right.
 * On mobile the artwork drops below the copy so the CTA stays above the fold.
 */
export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-white">
      {/* Ambient background wash */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -right-32 h-[34rem] w-[34rem] rounded-pill bg-brand-100/60 blur-3xl" />
        <div className="absolute -bottom-52 -left-40 h-[30rem] w-[30rem] rounded-pill bg-brand-50 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.55]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgb(11 12 17 / 0.055) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="container-page relative">
        <div className="grid items-center gap-12 py-14 sm:py-18 lg:grid-cols-[1.02fr_1.1fr] lg:gap-14 lg:py-24">
          {/* Copy */}
          <div>
            <p className="eyebrow">
              <span className="h-1.5 w-1.5 rounded-pill bg-brand-500" />
              {hero.eyebrow}
            </p>

            <h1 className="mt-5 text-[2.15rem] leading-[1.08] sm:text-5xl lg:text-[3.4rem]">
              Unleash Telecalling{" "}
              <span className="text-gradient-brand">Success Secrets</span> with
              Callio
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-500 sm:text-lg">
              {hero.subtitle}
            </p>

            <ul className="mt-6 space-y-2.5">
              {hero.highlights.map((h) => (
                <li
                  key={h}
                  className="flex items-start gap-2.5 text-sm font-semibold text-ink-600"
                >
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-signal-500/12 text-signal-600">
                    <Icon name="check" className="h-3 w-3" />
                  </span>
                  {h}
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={hero.primaryCta.href} size="lg" external>
                {hero.primaryCta.label}
                <Icon name="arrowRight" className="h-5 w-5" />
              </ButtonLink>
              <ButtonLink href={hero.secondaryCta.href} variant="secondary" size="lg">
                {hero.secondaryCta.label}
              </ButtonLink>
            </div>

            <div className="mt-8 flex items-center gap-4 border-t border-ink-100 pt-6">
              <div className="flex -space-x-2.5">
                {["PK", "MO", "TC", "C2"].map((i, idx) => (
                  <span
                    key={i}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-pill text-2xs font-extrabold text-white ring-2 ring-white ${
                      ["bg-brand-500", "bg-ink-800", "bg-info-500", "bg-signal-500"][idx]
                    }`}
                  >
                    {i}
                  </span>
                ))}
              </div>
              <p className="text-sm text-ink-500">
                <span className="font-extrabold text-ink-800">1,000+ clients</span>{" "}
                worldwide trust Callio
              </p>
            </div>
          </div>

          {/* Artwork */}
          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-4 rounded-xl bg-gradient-to-tr from-brand-500/12 via-transparent to-info-500/10 blur-2xl"
            />
            <div className="relative animate-float">
              <HeroDashboardArt className="aspect-[4/3] w-full" />
            </div>

            {/* Floating call chip */}
            <div className="absolute -bottom-5 left-2 hidden items-center gap-2.5 rounded-card border border-ink-200 bg-white px-4 py-3 shadow-lift sm:flex lg:-left-6">
              <span className="relative flex h-9 w-9 items-center justify-center rounded-pill bg-brand-500 text-white">
                <span className="absolute inset-0 animate-pulse-ring rounded-pill bg-brand-500/50" />
                <Icon name="phone" className="relative h-4 w-4" />
              </span>
              <div>
                <p className="text-2xs font-bold text-ink-400">Live call</p>
                <p className="text-sm font-extrabold text-ink-900">
                  02:14 · Connected
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
