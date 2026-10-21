import type { SVGProps } from "react";

/**
 * Inline SVG icon set drawn on a 24×24 grid with a 1.75 stroke so every glyph
 * optically matches at the sizes used across the page. All icons inherit colour
 * from the `currentColor` of their container — brand tinting happens in CSS.
 */

export type IconName =
  | "headset"
  | "target"
  | "plug"
  | "trending"
  | "clock"
  | "checklist"
  | "automation"
  | "dashboard"
  | "users"
  | "report"
  | "history"
  | "mic"
  | "mail"
  | "phone"
  | "sync"
  | "shield"
  | "check"
  | "arrowRight"
  | "star"
  | "quote"
  | "play"
  | "menu"
  | "close"
  | "spark";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false as const,
};

const paths: Record<IconName, React.ReactNode> = {
  headset: (
    <>
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13h2.5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
      <path d="M20 13h-2.5a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1H19a1 1 0 0 0 1-1z" />
      <path d="M18 18v.5a2.5 2.5 0 0 1-2.5 2.5H13" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v3.5a5.5 5.5 0 0 1-11 0z" />
      <path d="M12 17v4" />
    </>
  ),
  trending: (
    <>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15.5 6.5h5v5" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  checklist: (
    <>
      <path d="M4 7.5 6 9.5 9.5 6" />
      <path d="M4 16.5 6 18.5 9.5 15" />
      <path d="M13 8.5h7M13 17.5h7" />
    </>
  ),
  automation: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3.5M12 17.5V21M21 12h-3.5M6.5 12H3" />
      <path d="m18.4 5.6-2.5 2.5M8.1 15.9l-2.5 2.5M18.4 18.4l-2.5-2.5M8.1 8.1 5.6 5.6" />
    </>
  ),
  dashboard: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M9 9.5V20" />
      <path d="M12.5 13h4.5M12.5 16.5h4.5" />
    </>
  ),
  users: (
    <>
      <circle cx="9.5" cy="8.5" r="3.25" />
      <path d="M3.5 19.5a6 6 0 0 1 12 0" />
      <path d="M16 6.2a3.25 3.25 0 0 1 0 5.6" />
      <path d="M17.5 14.4a6 6 0 0 1 3 5.1" />
    </>
  ),
  report: (
    <>
      <path d="M6 3.5h8l4.5 4.5v12.5H6z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9.5 17v-3M12.5 17v-5.5M15.5 17v-2" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V9H8" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="10" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.8 7.2 8.2 5.8 8.2-5.8" />
    </>
  ),
  phone: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="3" />
      <path d="M10.5 5.5h3" />
      <path d="M12 18.2h.01" />
    </>
  ),
  sync: (
    <>
      <path d="M20 12a8 8 0 0 1-13.7 5.6" />
      <path d="M4 12a8 8 0 0 1 13.7-5.6" />
      <path d="M17.5 3v3.6h-3.6M6.5 21v-3.6h3.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  arrowRight: (
    <>
      <path d="M4.5 12h15" />
      <path d="m13.5 6 6 6-6 6" />
    </>
  ),
  star: (
    <path
      d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z"
      stroke="none"
      fill="currentColor"
    />
  ),
  quote: (
    <>
      <path d="M9.5 6.5C7 7.6 5.5 9.8 5.5 12.8V17h5.5v-5.5H8.2c0-1.9.8-3.3 2.6-4.2z" />
      <path d="M18 6.5c-2.5 1.1-4 3.3-4 6.3V17h5.5v-5.5h-2.8c0-1.9.8-3.3 2.6-4.2z" />
    </>
  ),
  play: <path d="M4 2.5 13.5 12 4 21.5z" stroke="none" fill="currentColor" />,
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.5l-1.8-5.9L4.5 10.8 10.2 9z" />
      <path d="M18.5 17.5 19.2 19.6l2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z" />
    </>
  ),
};

/** Renders a named icon at the default 24px box; `className` sizes it. */
export function Icon({
  name,
  className,
  ...rest
}: { name: IconName } & IconProps) {
  return (
    <svg {...base} {...rest} className={className}>
      {paths[name]}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Brand + social glyphs (filled, not stroked)                                */
/* -------------------------------------------------------------------------- */

/**
 * The Callio logo (the "C" mark and the wordmark), cut from the brand kit's own artwork, never redrawn.
 * `tone="dark"` is the version for dark backgrounds. `markClassName` sets the height (for example "h-10"); the width follows.
 */
export function CallioLogo({
  className,
  markClassName,
  tone = "light",
}: {
  className?: string;
  markClassName?: string;
  tone?: "light" | "dark";
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tone === "dark" ? "/callio-logo-dark.png" : "/callio-logo-light.png"}
      alt="Callio"
      // the light picture has a white background; multiply drops it so it also sits cleanly on the translucent header
      className={`block w-auto ${tone === "dark" ? "" : "mix-blend-multiply"} ${markClassName ?? "h-9"} ${className ?? ""}`}
    />
  );
}

const socialPaths: Record<string, React.ReactNode> = {
  facebook: (
    <path
      d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.6 1.7-1.6h1.5V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.3H8v3h2.5V21z"
      fill="currentColor"
    />
  ),
  twitter: (
    <path
      d="M20 6.4c-.6.3-1.3.5-2 .6.7-.4 1.2-1 1.5-1.8-.7.4-1.4.6-2.2.8a3.4 3.4 0 0 0-5.8 3.1A9.7 9.7 0 0 1 4.4 5.2a3.4 3.4 0 0 0 1 4.5c-.5 0-1-.2-1.5-.4 0 1.6 1.1 2.9 2.6 3.2-.5.1-1 .2-1.5.1.4 1.4 1.7 2.4 3.2 2.4a6.9 6.9 0 0 1-5 1.3 9.6 9.6 0 0 0 15.5-7.6v-.4c.7-.5 1.2-1.1 1.7-1.8z"
      fill="currentColor"
    />
  ),
  linkedin: (
    <path
      d="M6.9 8.9H4.3V20h2.6zM5.6 4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2M20 13.8c0-3-1.6-4.4-3.7-4.4-1.7 0-2.5 1-2.9 1.6V8.9H10.8V20h2.6v-5.9c0-.5 0-.9.2-1.2.3-.7.9-1.3 1.8-1.3 1.2 0 1.7.9 1.7 2.3V20H20z"
      fill="currentColor"
    />
  ),
  instagram: (
    <path
      d="M16.5 5.5h-9A2.5 2.5 0 0 0 5 8v8a2.5 2.5 0 0 0 2.5 2.5h9A2.5 2.5 0 0 0 19 16V8a2.5 2.5 0 0 0-2.5-2.5M12 15.4A3.4 3.4 0 1 1 12 8.6a3.4 3.4 0 0 1 0 6.8m0-5.5a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2m4.4-3.1a.8.8 0 1 1-1.6 0 .8.8 0 0 1 1.6 0"
      fill="currentColor"
    />
  ),
  youtube: (
    <path
      d="M20.6 8.2a2.5 2.5 0 0 0-1.8-1.8C17.3 6 12 6 12 6s-5.3 0-6.8.4A2.5 2.5 0 0 0 3.4 8.2 26 26 0 0 0 3 12c0 1.3.1 2.6.4 3.8a2.5 2.5 0 0 0 1.8 1.8C6.7 18 12 18 12 18s5.3 0 6.8-.4a2.5 2.5 0 0 0 1.8-1.8c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8M10.2 14.6V9.4l4.4 2.6z"
      fill="currentColor"
    />
  ),
};

export function SocialIcon({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
      focusable={false}
    >
      {socialPaths[name]}
    </svg>
  );
}
