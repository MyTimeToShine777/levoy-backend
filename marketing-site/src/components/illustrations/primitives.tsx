import type { ReactNode } from "react";

/**
 * Shared visual primitives for the placeholder product artwork.
 *
 * Everything is HTML + inline SVG so the site ships no raster assets and the
 * artwork inherits the design-system palette. Scenes compose these; none of
 * them fetch anything at runtime.
 */

export type FrameTone = "white" | "tint" | "dark";

/** App-window chrome shared by every scene: title bar, dots, body slot. */
export function Frame({
  title,
  badge,
  tone = "white",
  children,
  className = "",
}: {
  title: string;
  badge?: string;
  tone?: FrameTone;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    white: "bg-white border-ink-200",
    tint: "bg-ink-50 border-ink-200",
    dark: "bg-ink-900 border-ink-800",
  } as const;
  const dotTone = tone === "dark" ? "bg-ink-600" : "bg-ink-200";
  const titleTone = tone === "dark" ? "text-ink-400" : "text-ink-500";

  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded-card border shadow-card ${tones[tone]} ${className}`}
    >
      <div
        className={`flex items-center gap-2 border-b px-4 py-3 ${
          tone === "dark" ? "border-ink-800" : "border-ink-100"
        }`}
      >
        <span className="flex gap-1.5">
          <span className={`h-2 w-2 rounded-pill ${dotTone}`} />
          <span className={`h-2 w-2 rounded-pill ${dotTone}`} />
          <span className="h-2 w-2 rounded-pill bg-brand-400" />
        </span>
        <span className={`truncate pl-1 text-2xs font-bold ${titleTone}`}>
          {title}
        </span>
        {badge ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-pill bg-signal-500/12 px-2 py-0.5 text-2xs font-bold text-signal-600">
            <span className="h-1.5 w-1.5 rounded-pill bg-signal-500" />
            {badge}
          </span>
        ) : null}
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  );
}

/** Compact KPI card used in headers of several scenes. */
export function Metric({
  label,
  value,
  delta,
  tone = "brand",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "brand" | "signal" | "info" | "warn";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    signal: "bg-signal-500/12 text-signal-600",
    info: "bg-info-500/12 text-info-500",
    warn: "bg-warn-400/18 text-warn-500",
  } as const;

  return (
    <div className="rounded-sm border border-ink-100 bg-white px-3 py-2">
      <p className="truncate text-2xs font-semibold text-ink-400">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className="text-base font-extrabold text-ink-900">{value}</span>
        {delta ? (
          <span
            className={`rounded-pill px-1.5 py-0.5 text-2xs font-bold ${tones[tone]}`}
          >
            {delta}
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** Vertical bar chart. `data` values are 0–100 and map to bar heights. */
export function Bars({
  data,
  highlightIndex,
  className = "",
}: {
  data: readonly number[];
  highlightIndex?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-end gap-[3%] ${className}`}>
      {data.map((value, i) => (
        <span
          key={i}
          style={{ height: `${value}%` }}
          className={`flex-1 rounded-t-[3px] ${
            i === highlightIndex
              ? "bg-brand-500"
              : i > (highlightIndex ?? data.length)
                ? "bg-brand-200"
                : "bg-brand-100"
          }`}
        />
      ))}
    </div>
  );
}

/** Two-series line chart with a soft fill under the primary line. */
export function LineChart({
  primary,
  secondary,
  className = "",
}: {
  primary: readonly number[];
  secondary?: readonly number[];
  className?: string;
}) {
  const W = 300;
  const H = 100;
  const toPoints = (series: readonly number[]) =>
    series
      .map((v, i) => {
        const x = (i / (series.length - 1)) * W;
        const y = H - (v / 100) * (H - 12) - 6;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={`h-full w-full ${className}`}
      aria-hidden
    >
      <defs>
        <linearGradient id="lc-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1574FF" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#1574FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[25, 50, 75].map((y) => (
        <line
          key={y}
          x1="0"
          x2={W}
          y1={y}
          y2={y}
          stroke="#dbdce3"
          strokeWidth="1"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <polygon points={`0,${H} ${toPoints(primary)} ${W},${H}`} fill="url(#lc-fill)" />
      {secondary ? (
        <polyline
          points={toPoints(secondary)}
          fill="none"
          stroke="#2b7fe0"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          strokeDasharray="4 3"
        />
      ) : null}
      <polyline
        points={toPoints(primary)}
        fill="none"
        stroke="#1574FF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Donut gauge; `value` is 0–100. */
export function Donut({
  value,
  label,
  size = 92,
  track = "#eeeef2",
}: {
  value: number;
  label?: string;
  size?: number;
  track?: string;
}) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={track} strokeWidth="13" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#1574FF"
          strokeWidth="13"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      {label ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold text-ink-900">{label}</span>
        </span>
      ) : null}
    </div>
  );
}

/** Horizontal progress bar used for per-employee utilisation. */
export function Track({
  value,
  tone = "brand",
}: {
  value: number;
  tone?: "brand" | "signal" | "info" | "warn" | "ink";
}) {
  const tones = {
    brand: "bg-brand-500",
    signal: "bg-signal-500",
    info: "bg-info-500",
    warn: "bg-warn-400",
    ink: "bg-ink-300",
  } as const;

  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-pill bg-ink-100">
      <span
        className={`block h-full rounded-pill ${tones[tone]}`}
        style={{ width: `${value}%` }}
      />
    </span>
  );
}

/** Two-letter avatar chip. */
export function Avatar({
  initials,
  tone = "brand",
  size = "md",
}: {
  initials: string;
  tone?: "brand" | "info" | "signal" | "warn" | "ink";
  size?: "sm" | "md";
}) {
  const tones = {
    brand: "bg-brand-100 text-brand-700",
    info: "bg-info-500/15 text-info-500",
    signal: "bg-signal-500/15 text-signal-600",
    warn: "bg-warn-400/20 text-warn-500",
    ink: "bg-ink-100 text-ink-600",
  } as const;
  const sizes = {
    sm: "h-6 w-6 text-[0.55rem]",
    md: "h-8 w-8 text-2xs",
  } as const;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-pill font-extrabold ${tones[tone]} ${sizes[size]}`}
    >
      {initials}
    </span>
  );
}

/** Status pill (lead stage / call outcome). */
export function Pill({
  children,
  tone = "ink",
}: {
  children: ReactNode;
  tone?: "brand" | "signal" | "info" | "warn" | "ink";
}) {
  const tones = {
    brand: "bg-brand-50 text-brand-700 ring-brand-100",
    signal: "bg-signal-500/12 text-signal-600 ring-signal-500/20",
    info: "bg-info-500/12 text-info-500 ring-info-500/20",
    warn: "bg-warn-400/18 text-warn-500 ring-warn-400/25",
    ink: "bg-ink-50 text-ink-500 ring-ink-200",
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-pill px-2 py-0.5 text-2xs font-bold ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Waveform strip representing synchronised call audio. */
export function Waveform({
  bars = 34,
  className = "",
}: {
  bars?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-[3px] ${className}`} aria-hidden>
      {Array.from({ length: bars }, (_, i) => {
        // Deterministic pseudo-waveform so SSR and client markup always match.
        const h = 18 + Math.abs(Math.sin(i * 1.7) * 62) + ((i * 7) % 20);
        const played = i / bars < 0.42;
        return (
          <span
            key={i}
            style={{ height: `${h}%` }}
            className={`flex-1 rounded-pill ${
              played ? "bg-brand-500" : "bg-brand-200"
            }`}
          />
        );
      })}
    </div>
  );
}

/** Generic skeleton list row: dot, label bar, trailing value bar. */
export function ListRow({
  labelWidth = 45,
  valueWidth = 18,
  tone = "brand",
}: {
  labelWidth?: number;
  valueWidth?: number;
  tone?: "brand" | "info" | "signal" | "ink";
}) {
  const tones = {
    brand: "bg-brand-200",
    info: "bg-info-500/25",
    signal: "bg-signal-500/25",
    ink: "bg-ink-200",
  } as const;

  return (
    <div className="flex items-center gap-2">
      <span className={`h-2 w-2 shrink-0 rounded-pill ${tones[tone]}`} />
      <span
        className="h-2 shrink-0 rounded-pill bg-ink-200"
        style={{ width: `${labelWidth}%` }}
      />
      <span className="ml-auto flex items-center gap-1.5">
        <span
          className="h-2 rounded-pill bg-ink-100"
          style={{ width: `${valueWidth * 2}%` }}
        />
        <span className="h-2 w-6 rounded-pill bg-brand-200" />
      </span>
    </div>
  );
}
