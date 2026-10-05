import { Avatar } from "@/components/illustrations/primitives";
import { Icon } from "@/components/ui/icons";
import { Section } from "@/components/ui/primitives";
import { testimonial } from "@/lib/content";

/** Single customer quote, framed by a soft brand card. */
export function Testimonial() {
  return (
    <Section tone="white">
      <figure className="surface-card relative mx-auto max-w-4xl overflow-hidden p-7 sm:p-10 lg:p-12">
        {/* Decorative quote mark */}
        <Icon
          name="quote"
          className="absolute -top-2 right-6 h-24 w-24 text-brand-50 sm:h-32 sm:w-32"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-pill bg-brand-100/45 blur-3xl"
        />

        <div className="relative">
          <div
            className="flex gap-1 text-warn-400"
            role="img"
            aria-label="Rated 5 out of 5"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <Icon key={i} name="star" className="h-5 w-5" />
            ))}
          </div>

          <blockquote className="mt-6">
            <p className="text-lg leading-relaxed font-medium text-ink-700 sm:text-xl sm:leading-relaxed lg:text-[1.4rem] lg:leading-[1.55]">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
          </blockquote>

          <figcaption className="mt-8 flex items-center gap-4 border-t border-ink-100 pt-6">
            <Avatar initials="VV" tone="brand" size="md" />
            <div>
              <p className="text-base font-extrabold text-ink-900">
                {testimonial.name}
              </p>
              <p className="text-sm text-ink-500">
                {testimonial.role}, {testimonial.company}
              </p>
            </div>
          </figcaption>
        </div>
      </figure>
    </Section>
  );
}
