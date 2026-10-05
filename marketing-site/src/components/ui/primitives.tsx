import Link from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "onDark" | "onDarkGhost";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-pill font-bold tracking-tight transition-all duration-200 whitespace-nowrap select-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-500 text-white shadow-glow hover:bg-brand-600 hover:-translate-y-0.5 hover:shadow-lift active:translate-y-0",
  secondary:
    "bg-white text-ink-800 border border-ink-200 shadow-xs hover:border-brand-300 hover:text-brand-700 hover:-translate-y-0.5",
  ghost: "text-ink-700 hover:text-brand-600 hover:bg-brand-50",
  onDark:
    "bg-white text-brand-700 shadow-lift hover:-translate-y-0.5 hover:bg-brand-50",
  onDarkGhost:
    "text-white/80 border border-white/25 hover:text-white hover:border-white/50 hover:bg-white/10",
};

const sizes: Record<Size, string> = {
  sm: "h-10 px-4 text-sm",
  md: "h-12 px-6 text-[0.95rem]",
  lg: "h-14 px-8 text-base",
};

function classes(variant: Variant, size: Size, extra?: string) {
  return `${base} ${variants[variant]} ${sizes[size]} ${extra ?? ""}`;
}

type ButtonLinkProps = {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
  external?: boolean;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className">;

/** Anchor styled as a button; `external` opens in a new tab safely. */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
  external,
  ...rest
}: ButtonLinkProps) {
  const cls = classes(variant, size, className);

  if (external || href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a
        href={href}
        className={cls}
        {...(href.startsWith("http")
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        {...rest}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cls} {...rest}>
      {children}
    </Link>
  );
}

/** Section shell: vertical rhythm + optional tinted background. */
export function Section({
  id,
  children,
  className = "",
  tone = "white",
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  tone?: "white" | "tint" | "dark" | "brand";
}) {
  const tones = {
    white: "bg-white",
    tint: "bg-ink-50",
    dark: "bg-ink-950 text-ink-200",
    brand: "bg-brand-50",
  } as const;

  return (
    <section
      id={id}
      className={`relative ${tones[tone]} py-16 sm:py-20 lg:py-28`}
    >
      <div className="container-page">{children}</div>
    </section>
  );
}

/** Centred heading block with optional eyebrow, lede and alignment. */
export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "center",
  invert = false,
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "center" | "left";
  invert?: boolean;
  className?: string;
}) {
  const alignment =
    align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-2xl";

  return (
    <div className={`${alignment} ${className}`}>
      {eyebrow ? (
        <p
          className={
            invert
              ? "mb-4 inline-flex items-center gap-2 rounded-pill border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-bold tracking-[0.08em] text-brand-200 uppercase"
              : "eyebrow mb-4"
          }
        >
          {eyebrow}
        </p>
      ) : null}
      <h2
        className={`text-3xl leading-[1.12] sm:text-4xl lg:text-[2.75rem] ${
          invert ? "text-white" : "text-ink-900"
        }`}
      >
        {title}
      </h2>
      {lede ? (
        <p
          className={`mt-4 text-base leading-relaxed sm:text-lg ${
            invert ? "text-ink-300" : "text-ink-500"
          }`}
        >
          {lede}
        </p>
      ) : null}
    </div>
  );
}

/** Square tinted tile that hosts an icon; shared by every feature block. */
export function IconTile({
  children,
  tone = "brand",
  size = "md",
}: {
  children: ReactNode;
  tone?: "brand" | "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-600 ring-brand-100",
    dark: "bg-ink-900 text-brand-400 ring-ink-800",
    light: "bg-white text-brand-600 ring-ink-100",
  } as const;
  const sizes = {
    sm: "h-10 w-10 rounded-sm",
    md: "h-12 w-12 rounded-md",
    lg: "h-14 w-14 rounded-md",
  } as const;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ring-1 ${tones[tone]} ${sizes[size]}`}
    >
      {children}
    </span>
  );
}
