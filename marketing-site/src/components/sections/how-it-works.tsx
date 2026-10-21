import { Icon } from "@/components/ui/icons";
import { IconTile, Section, SectionHeading } from "@/components/ui/primitives";
import { steps } from "@/lib/content";

/** Three-step onboarding timeline on a brand gradient. */
export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="white">
      <SectionHeading
        eyebrow="How Callio works"
        title="Three Steps. No Hardware, No Dialer Integration."
        lede="Your team keeps using the phones they already carry. Callio reads the SIM and does the rest."
      />

      <ol className="relative mt-14 grid gap-8 lg:mt-18 lg:grid-cols-3 lg:gap-10">
        {/* Connector rail — horizontal on desktop, hidden on mobile where the
            vertical stack reads better without it. */}
        <span
          aria-hidden
          className="absolute top-[3.25rem] right-[16%] left-[16%] hidden h-px border-t-2 border-dashed border-ink-200 lg:block"
        />

        {steps.map((step, i) => (
          <li
            key={step.title}
            className="group relative flex flex-col items-center text-center"
          >
            <div className="relative">
              {/* Node sits on the rail; the ring hides the dashes behind it. */}
              <span className="absolute inset-0 -m-2 rounded-pill bg-white" />
              <span className="relative inline-flex h-24 w-24 items-center justify-center rounded-pill border border-ink-200 bg-white shadow-card transition-all duration-300 group-hover:-translate-y-1 group-hover:border-brand-300 group-hover:shadow-lift">
                <IconTile tone="brand" size="lg">
                  <Icon name={step.icon} className="h-7 w-7" />
                </IconTile>
              </span>
              <span className="absolute -top-2 -right-2 inline-flex h-8 w-8 items-center justify-center rounded-pill bg-ink-900 text-sm font-extrabold text-white ring-4 ring-white">
                {i + 1}
              </span>
            </div>

            <h3 className="mt-6 text-xl">{step.title}</h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink-500">
              {step.body}
            </p>
          </li>
        ))}
      </ol>

      {/* Reassurance strip */}
      <div className="mt-14 grid gap-4 sm:grid-cols-3">
        {[
          {
            icon: "clock" as const,
            title: "Live in a day",
            body: "Most teams see their first dashboard by tomorrow morning.",
          },
          {
            icon: "shield" as const,
            title: "Permission-based",
            body: "Reps see only their own data; managers see their team.",
          },
          {
            icon: "automation" as const,
            title: "Zero manual entry",
            body: "Nothing to type, export or upload at the end of the day.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex items-start gap-3.5 rounded-card border border-ink-200 bg-ink-50 p-5"
          >
            <IconTile tone="brand" size="sm">
              <Icon name={item.icon} className="h-5 w-5" />
            </IconTile>
            <div>
              <p className="text-sm font-extrabold text-ink-900">
                {item.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                {item.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
