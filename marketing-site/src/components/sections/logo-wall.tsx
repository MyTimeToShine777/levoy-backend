import { clients } from "@/lib/content";

/**
 * Client logo wall.
 *
 * Real brand logos are trademarked assets we don't have the right to ship, so
 * each tile is a deterministic, palette-locked placeholder: a monogram drawn
 * from the company's initials inside a tinted mark, plus the wordmark set in
 * the brand typeface. It reads as an intentional logo grid rather than a
 * broken image, and it stays crisp at any size with zero network requests.
 */

/** Stable hash → picks a tint index so a given name always looks the same. */
function hash(value: string) {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h;
}

function initials(name: string) {
  const words = name.split(/[\s-]+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* Four mark shapes × four tints give 16 distinct-looking tiles. */
const marks = [
  "rounded-md",
  "rounded-pill",
  "rounded-xs",
  "rounded-br-lg rounded-tl-md",
];

const tints = [
  "bg-brand-500 text-white",
  "bg-ink-800 text-white",
  "bg-brand-50 text-brand-700 ring-1 ring-brand-100",
  "bg-ink-100 text-ink-800",
];

function LogoTile({ name }: { name: string }) {
  const seed = hash(name);
  const shape = marks[seed % marks.length];
  const tint = tints[(seed >> 3) % tints.length];

  return (
    <li className="group flex shrink-0 items-center gap-2.5 px-4 sm:px-5">
      <span
        aria-hidden
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center text-2xs font-extrabold tracking-tight transition-transform duration-200 group-hover:scale-105 ${shape} ${tint}`}
      >
        {initials(name)}
      </span>
      <span className="text-sm font-extrabold whitespace-nowrap text-ink-600 transition-colors group-hover:text-ink-900 sm:text-[0.95rem]">
        {name}
      </span>
    </li>
  );
}

export function LogoWall() {
  // Duplicated once so the -50% keyframe loops without a visible seam.
  const loop = [...clients, ...clients];

  return (
    <section aria-label="Clients" className="border-y border-ink-100 bg-ink-50/70 py-12 sm:py-14">
      <div className="container-page">
        <p className="text-center text-2xs font-extrabold tracking-[0.16em] text-ink-400 uppercase">
          Trusted by sales teams at
        </p>
      </div>

      <div className="mask-edges mt-7 flex overflow-hidden">
        <ul className="animate-marquee flex min-w-max items-center gap-8 pr-8 sm:gap-12 sm:pr-12">
          {loop.map((name, i) => (
            <LogoTile key={`${name}-${i}`} name={name} />
          ))}
        </ul>
      </div>
    </section>
  );
}
