import {
  IntegrationArt,
  LeadsArt,
  MonitoringArt,
} from "@/components/illustrations/scenes";
import { Icon, type IconName } from "@/components/ui/icons";
import { IconTile, Section, SectionHeading } from "@/components/ui/primitives";
import type { FeatureCard } from "@/lib/content";
import { featureCards } from "@/lib/content";

const arts: Record<
  FeatureCard["art"],
  (props: { className?: string }) => React.JSX.Element
> = {
  monitoring: MonitoringArt,
  leads: LeadsArt,
  integration: IntegrationArt,
};

/** Three headline capability cards: copy above, product art below. */
export function FeatureCards() {
  return (
    <Section id="features" tone="white">
      <SectionHeading
        eyebrow="The platform"
        title="Everything You Need to Boost Telecalling Productivity"
        lede="Three capabilities that work together: the call data comes in on its own, the pipeline stays current, and both land wherever your team already works."
      />

      <div className="mt-14 grid gap-6 md:grid-cols-2 lg:grid-cols-3 lg:gap-7">
        {featureCards.map((card) => {
          const Art = arts[card.art];
          return (
            <article
              key={card.id}
              className="surface-card group flex flex-col p-6 transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-200 hover:shadow-lift lg:p-7"
            >
              <div className="flex items-center gap-3">
                <IconTile tone="brand" size="lg">
                  <Icon name={card.icon as IconName} className="h-6 w-6" />
                </IconTile>
                <h3 className="text-xl">{card.title}</h3>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-ink-500">
                {card.body}
              </p>

              <ul className="mt-5 space-y-2">
                {card.points.map((p) => (
                  <li
                    key={p}
                    className="flex items-start gap-2 text-sm font-semibold text-ink-600"
                  >
                    <Icon
                      name="check"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-500"
                    />
                    {p}
                  </li>
                ))}
              </ul>

              {/* Artwork sits on a tinted plate so it reads as a screenshot. */}
              <div className="mt-6 rounded-md bg-ink-50 p-3 transition-colors duration-300 group-hover:bg-brand-50/70">
                <Art className="aspect-[4/3] w-full" />
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
