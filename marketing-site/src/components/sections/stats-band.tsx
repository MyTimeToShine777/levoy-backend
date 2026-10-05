import { Icon } from "@/components/ui/icons";
import { ButtonLink } from "@/components/ui/primitives";
import { playBadges, stats } from "@/lib/content";
import { site } from "@/lib/site";

/** Stats counters plus the two Google Play listings. */
export function StatsBand() {
  return (
    <section aria-label="Usage statistics" className="relative overflow-hidden bg-brand-600 py-14 sm:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgb(255 255 255 / 0.35) 1px, transparent 0)",
          backgroundSize: "26px 26px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-pill bg-brand-400/30 blur-3xl"
      />

      <div className="container-page relative">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-9 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <dt className="sr-only">{s.label}</dt>
              <dd>
                <span className="block text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[2.75rem]">
                  {s.value}
                </span>
                <span className="mt-1.5 block text-xs font-bold tracking-wide text-brand-100 uppercase sm:text-sm">
                  {s.label}
                </span>
              </dd>
            </div>
          ))}
        </dl>

        {/* Play Store listings */}
        <div className="mt-12 border-t border-white/20 pt-10">
          <p className="text-center text-sm font-semibold text-brand-100">
            Two apps, one dashboard — pick the one that fits how you work.
          </p>

          <ul className="mt-6 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
            {playBadges.map((badge) => (
              <li
                key={badge.id}
                className="group flex items-center gap-3.5 rounded-card border border-white/25 bg-ink-950 px-5 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/50 hover:shadow-lift sm:min-w-[19rem]"
              >
                <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-sm bg-white text-brand-600 transition-transform duration-200 group-hover:scale-105">
                  <Icon name="play" className="ml-0.5 h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-2xs font-bold tracking-wide text-white/70 uppercase">
                    {badge.audience}
                  </p>
                  <p className="truncate text-base font-extrabold text-white">
                    Get it on <span className="text-brand-300">Google Play</span>
                  </p>
                  <p className="truncate text-2xs font-semibold text-white/50">
                    {badge.app} · {badge.package}
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-9 flex justify-center">
            <ButtonLink href={site.playUrl} variant="onDark" size="md" external>
              Download the app
              <Icon name="arrowRight" className="h-4 w-4" />
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
