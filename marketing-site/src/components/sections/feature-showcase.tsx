import { FeatureArt } from "@/components/illustrations/scenes";
import { Icon } from "@/components/ui/icons";
import { IconTile, Section, SectionHeading } from "@/components/ui/primitives";
import { productFeatures } from "@/lib/content";

/**
 * Nine product capabilities as alternating image/text rows. Rows 0-indexed:
 * even rows put art on the right, odd rows mirror it, so the column of artwork
 * zig-zags down the page and reads naturally on a phone (stacked, art first).
 */
export function FeatureShowcase() {
  return (
    <Section id="showcase" tone="tint">
      <SectionHeading
        eyebrow="Feature by feature"
        title="Nine Tools That Cover the Whole Telecalling Cycle"
        lede="From the first dial of the morning to the monthly appraisal, every step has a screen behind it — and all of them write to the same dashboard."
      />

      <div className="mt-16 space-y-16 lg:mt-20 lg:space-y-24">
        {productFeatures.map((feature, i) => {
          const flipped = i % 2 === 1;

          return (
            <article
              key={feature.id}
              className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14"
            >
              {/* Artwork */}
              <div className={flipped ? "lg:order-2" : "lg:order-1"}>
                <div
                  className={`relative rounded-lg p-3 sm:p-5 ${
                    flipped ? "bg-brand-50" : "bg-white"
                  } ring-1 ring-ink-200/70`}
                >
                  <div
                    aria-hidden
                    className="absolute -inset-3 -z-10 rounded-xl bg-gradient-to-br from-brand-100/50 to-transparent blur-xl"
                  />
                  <FeatureArt
                    variant={feature.art}
                    className="aspect-[4/3] w-full"
                  />
                </div>
              </div>

              {/* Copy */}
              <div className={flipped ? "lg:order-1" : "lg:order-2"}>
                <div className="flex items-center gap-3">
                  <IconTile tone="brand" size="md">
                    <Icon name={feature.icon} className="h-5.5 w-5.5" />
                  </IconTile>
                  <span className="text-2xs font-extrabold tracking-[0.14em] text-ink-400 uppercase">
                    Feature {String(i + 1).padStart(2, "0")}
                  </span>
                </div>

                <h3 className="mt-4 text-2xl sm:text-3xl">{feature.title}</h3>

                <p className="mt-3.5 max-w-lg text-base leading-relaxed text-ink-500">
                  {feature.body}
                </p>

                <ul className="mt-6 space-y-3">
                  {feature.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-pill bg-brand-500/12 text-brand-600">
                        <Icon name="check" className="h-3 w-3" />
                      </span>
                      <span className="text-sm font-semibold text-ink-700">
                        {b}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </Section>
  );
}
