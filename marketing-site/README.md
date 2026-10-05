# Levoy — Marketing Site

A self-contained, single-page marketing site for a SIM-based telecalling
analytics product. Built as its own Next.js App Router application, independent
of the sibling `../frontend` app — no shared code, no shared config.

## Run it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run start   # serve the production build
```

## What's here

One route, `/`, composed of nine sections in `src/app/page.tsx`:

| Section | Component | Reference content it mirrors |
| --- | --- | --- |
| Sticky header + mobile drawer | `layout/site-header.tsx` | Nav, Partner Login, Sign Up Now |
| Hero | `sections/hero.tsx` | "Unleash Telecalling Success Secrets with Levoy" |
| Client logo wall | `sections/logo-wall.tsx` | The client carousel |
| Three feature cards | `sections/feature-cards.tsx` | "Everything You Need to Boost Telecalling Productivity" |
| Why businesses trust it | `sections/trust-section.tsx` | The four benefits |
| Stats band + Play badges | `sections/stats-band.tsx` | 1,000+ / 12,000+ / 1M+ / 4.5 and both Play listings |
| Nine feature rows | `sections/feature-showcase.tsx` | Insightful Dashboard → Leads Reporting |
| How it works | `sections/how-it-works.tsx` | The three setup steps |
| Testimonial | `sections/testimonial.tsx` | Customer quote |
| Closing CTA + footer | `sections/closing-cta.tsx`, `layout/site-footer.tsx` | "Let's start growing your business", contact and legal |

## Design system

Tokens live in one place: the `@theme` block in `src/app/globals.css`
(Tailwind v4 CSS-first config). Nothing uses an ad-hoc hex value.

- **Brand** — `brand-50…950`, a crimson scale anchored on `#FF4444`.
- **Ink** — `ink-50…950`, the cool neutral scale used for all body copy.
- **Support** — `signal-*`, `info-*`, `warn-*`, used only inside illustrations
  and status pills so artwork can carry meaning without new brand colours.
- **Type** — Manrope via `next/font/google`, wired to `--font-sans`.
- **Radius / shadow / motion** — `rounded-card`, `shadow-lift`, `shadow-glow`,
  `animate-marquee`, and a global `prefers-reduced-motion` override.

Custom utilities (`@utility`): `container-page`, `eyebrow`, `mask-edges`,
`text-gradient-brand`.

## Content model

All prose is data, not markup:

- `src/lib/content.ts` — hero, clients, feature cards, trust points, stats,
  the nine features, steps, testimonial, closing CTA.
- `src/lib/site.ts` — name, contact details, nav, footer columns, social links,
  legal URLs.

Editing copy means editing one of those two files; the components contain no
prose.

## Artwork

There are **no raster images and no hotlinked assets** — the page ships zero
`<img>` tags and makes no third-party requests.

- `illustrations/primitives.tsx` — reusable app-window chrome plus data-viz
  building blocks (`Frame`, `Metric`, `Bars`, `LineChart`, `Donut`, `Track`,
  `Avatar`, `Pill`, `Waveform`, `ListRow`).
- `illustrations/scenes.tsx` — thirteen composed scenes (hero dashboard, three
  feature-card arts, nine feature-row arts), mapped by an `ArtVariant` key.
- `ui/icons.tsx` — a 24×24 stroked icon set, plus the brand mark, wordmark and
  social glyphs.

**Client logos** are deterministic text placeholders: a monogram built from the
company's initials, in one of four mark shapes and four palette-locked tints,
selected by a stable hash of the name. They read as an intentional logo grid
and never break.

## Deliberate simplifications

- **Placeholder logos, not real ones.** The reference's logo files are
  trademarked assets; shipping or hotlinking them isn't appropriate.
- **Original testimonial prose.** The quote is written to match the subject
  matter (employee evaluation, work-from-home monitoring) without copying the
  reference's wording — measured at ~13% word overlap with a two-word longest
  shared run.
- **Stub destinations.** Secondary links (career, blog, help, partner policy…)
  point at the real levoy.co URLs. There are no local stub pages, so they
  open in a new tab.
- **No dark mode.** The brand is a light marketing surface; `prefers-color-scheme`
  is not themed, so the page renders identically everywhere.

## Verification

`npm run build` completes with zero errors. The build output is fully
prerendered — `/` is static, so it can be served from any CDN or static host.

Responsive behaviour was checked at 1440px and 390px: no horizontal scroll at
either width, the desktop nav collapses to a working hamburger drawer with
`aria-expanded`/`aria-controls`, and all 103 inline SVGs render at full size.
