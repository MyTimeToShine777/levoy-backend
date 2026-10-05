import { Icon } from "@/components/ui/icons";
import { IconTile, Section, SectionHeading } from "@/components/ui/primitives";
import { trustPoints } from "@/lib/content";

/** "Why businesses trust Levoy" — four benefit rows on a dark band. */
export function TrustSection() {
  return (
    <Section id="why-levoy" tone="dark">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-500/60 to-transparent" />

      <SectionHeading
        eyebrow="Why Levoy"
        title="Why Businesses Trust Levoy?"
        lede="Because the numbers arrive on their own, and because a manager can act on them the same day instead of at the end of the month."
        invert
      />

      <div className="mt-14 grid gap-px overflow-hidden rounded-card bg-ink-800 sm:grid-cols-2">
        {trustPoints.map((point, i) => (
          <article
            key={point.id}
            className="group relative bg-ink-950 p-7 transition-colors duration-300 hover:bg-ink-900 lg:p-9"
          >
            {/* Oversized step number as a watermark */}
            <span
              aria-hidden
              className="pointer-events-none absolute -top-4 right-5 text-[5rem] leading-none font-extrabold text-ink-900 transition-colors duration-300 group-hover:text-brand-950"
            >
              {String(i + 1).padStart(2, "0")}
            </span>

            <div className="relative">
              <IconTile tone="dark" size="md">
                <Icon name={point.icon} className="h-6 w-6" />
              </IconTile>
              <h3 className="mt-5 text-lg text-white lg:text-xl">
                {point.title}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-400">
                {point.body}
              </p>
            </div>
          </article>
        ))}
      </div>

      <p className="mt-10 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-center text-sm text-ink-400">
        <Icon name="shield" className="h-4 w-4 text-brand-400" />
        Built for teams that answer for their numbers — on the floor and at home.
      </p>
    </Section>
  );
}
