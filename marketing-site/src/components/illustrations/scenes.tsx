import {
  Avatar,
  Bars,
  Donut,
  Frame,
  LineChart,
  ListRow,
  Metric,
  Pill,
  Track,
  Waveform,
} from "./primitives";
import type { ArtVariant } from "@/lib/content";

/**
 * Product artwork: one composed scene per marketing claim. All scenes fill
 * their container (`h-full w-full`) so the alternating rows can size them with
 * a single aspect wrapper.
 */

type SceneProps = { className?: string };

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export function HeroDashboardArt({ className }: SceneProps) {
  return (
    <Frame
      title="Live dashboard · Sales floor"
      badge="Syncing now"
      tone="white"
      className={className}
    >
      <div className="grid h-full grid-rows-[auto_1fr] gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Calls today" value="486" delta="+12%" />
          <Metric label="Connect rate" value="38.4%" delta="+4.1" tone="signal" />
          <Metric label="Talk time" value="6h 12m" delta="+51m" tone="info" />
          <Metric label="Leads won" value="27" delta="+9" tone="warn" />
        </div>

        <div className="grid grid-cols-[1.55fr_1fr] gap-3">
          <div className="flex flex-col rounded-sm border border-ink-100 bg-white p-3">
            <div className="flex items-center justify-between">
              <p className="text-2xs font-bold text-ink-500">Calls per hour</p>
              <Pill tone="brand">Today</Pill>
            </div>
            <div className="mt-2 h-[58%]">
              <LineChart
                primary={[34, 48, 42, 63, 58, 74, 69, 88, 76, 92, 84, 96]}
                secondary={[30, 36, 38, 44, 41, 50, 47, 54, 52, 58, 56, 60]}
              />
            </div>
            <div className="mt-auto flex items-center gap-4 pt-2">
              <span className="flex items-center gap-1.5 text-2xs font-semibold text-ink-500">
                <span className="h-2 w-2 rounded-pill bg-brand-500" /> Outbound
              </span>
              <span className="flex items-center gap-1.5 text-2xs font-semibold text-ink-500">
                <span className="h-2 w-2 rounded-pill bg-info-500" /> Inbound
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-1 items-center justify-center gap-3 rounded-sm border border-ink-100 bg-white p-3">
              <Donut value={74} label="74%" size={78} />
              <div className="min-w-0">
                <p className="text-2xs font-bold text-ink-500">Productivity</p>
                <p className="text-2xs font-semibold text-signal-600">
                  +8% vs last week
                </p>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-2 rounded-sm border border-ink-100 bg-white p-3">
              <ListRow tone="brand" />
              <ListRow tone="signal" labelWidth={38} />
              <ListRow tone="info" labelWidth={52} />
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Three feature-card arts                                                    */
/* -------------------------------------------------------------------------- */

export function MonitoringArt({ className }: SceneProps) {
  return (
    <Frame title="Call log · SIM 1" badge="Live" className={className}>
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex items-center gap-2 rounded-sm border border-brand-100 bg-brand-50 p-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-pill bg-brand-500 text-white">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
              <path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.2 11.4 11.4 0 0 0 3.6.6 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.3.2 2.5.6 3.6a1 1 0 0 1-.3 1z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-2xs font-bold text-ink-800">
              Outgoing · 98204 11238
            </p>
            <p className="text-2xs font-semibold text-brand-700">
              Connected · 02:14
            </p>
          </div>
          <Pill tone="signal" ><span className="ml-0.5">Logged</span></Pill>
        </div>
        {[
          { n: "Incoming · 99100 44871", s: "01:02", tone: "info" as const },
          { n: "Outgoing · 98204 11238", s: "00:18", tone: "brand" as const },
          { n: "Missed · 90040 77812", s: "—", tone: "warn" as const },
          { n: "Outgoing · 98991 30210", s: "03:47", tone: "brand" as const },
        ].map((row) => (
          <div
            key={row.n}
            className="flex items-center gap-2 rounded-sm border border-ink-100 bg-white px-2.5 py-2"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-pill ${
                row.tone === "brand"
                  ? "bg-brand-500"
                  : row.tone === "info"
                    ? "bg-info-500"
                    : "bg-warn-400"
              }`}
            />
            <span className="truncate text-2xs font-semibold text-ink-600">
              {row.n}
            </span>
            <span className="ml-auto text-2xs font-bold text-ink-800">
              {row.s}
            </span>
          </div>
        ))}
        <div className="mt-auto flex items-center justify-between rounded-sm bg-ink-50 px-2.5 py-2">
          <span className="text-2xs font-bold text-ink-500">Today</span>
          <span className="text-2xs font-extrabold text-ink-900">
            42 calls · 5h 08m
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function LeadsArt({ className }: SceneProps) {
  const columns = [
    { label: "New", count: 18, tone: "ink" as const, bars: [70, 45, 90] },
    { label: "Contacted", count: 11, tone: "info" as const, bars: [50, 80, 35] },
    { label: "Qualified", count: 7, tone: "warn" as const, bars: [90, 60, 40] },
    { label: "Converted", count: 4, tone: "signal" as const, bars: [65, 95, 55] },
  ];

  return (
    <Frame title="Lead pipeline" badge="Auto-synced" className={className}>
      <div className="grid h-full grid-cols-2 gap-2 sm:grid-cols-4">
        {columns.map((col) => (
          <div
            key={col.label}
            className="flex min-w-0 flex-col gap-2 rounded-sm bg-ink-50 p-2"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="truncate text-2xs font-extrabold text-ink-700">
                {col.label}
              </span>
              <Pill tone={col.tone}>{col.count}</Pill>
            </div>
            <div className="flex h-2/3 flex-col justify-end gap-1.5">
              {col.bars.map((h, i) => (
                <span
                  key={i}
                  className="rounded-xs border border-ink-200 bg-white"
                  style={{ height: `${h}%` }}
                >
                  <span className="block h-1 w-1/2 rounded-pill bg-brand-200" />
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function IntegrationArt({ className }: SceneProps) {
  return (
    <Frame title="API · Webhooks" tone="dark" badge="v2 connected" className={className}>
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex items-center gap-2">
          <span className="flex flex-1 items-center gap-2 rounded-sm border border-ink-800 bg-ink-950 px-2.5 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-brand-500 text-2xs font-extrabold text-white">
              CZ
            </span>
            <span className="text-2xs font-bold text-ink-200">Levoy API</span>
          </span>
          <span className="relative flex h-8 w-8 items-center justify-center">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-brand-500 to-info-500" />
            <span className="h-2 w-2 rounded-pill bg-brand-500 shadow-glow" />
          </span>
          <span className="flex flex-1 items-center gap-2 rounded-sm border border-ink-800 bg-ink-950 px-2.5 py-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-info-500 text-2xs font-extrabold text-white">
              CRM
            </span>
            <span className="text-2xs font-bold text-ink-200">Your CRM</span>
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden rounded-sm border border-ink-800 bg-ink-950 p-2.5 font-mono text-[0.6rem] leading-relaxed">
          <p className="text-ink-500">
            <span className="text-brand-400">POST</span> /v1/calls/completed
          </p>
          <p className="truncate text-signal-400">
            {`{ "sim": "98204 11238", "duration": 134,`}
          </p>
          <p className="pl-3 text-signal-400">{`  "lead_id": "LD-2291",`}</p>
          <p className="pl-3 text-signal-400">{`  "outcome": "connected" }`}</p>
          <p className="mt-1 text-ink-500">
            <span className="text-info-400">200</span> · webhook delivered
          </p>
          <p className="text-ink-500">
            <span className="text-brand-400">POST</span> /v1/leads/stage
          </p>
          <p className="text-signal-400">{`{ "stage": "qualified" }`}</p>
        </div>

        <div className="flex items-center gap-1.5">
          {["call.completed", "lead.created", "lead.stage"].map((evt) => (
            <span
              key={evt}
              className="rounded-pill bg-ink-800 px-2 py-0.5 text-[0.58rem] font-bold text-ink-300"
            >
              {evt}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------------------------------------------------- */
/* Nine product-feature scenes                                                 */
/* -------------------------------------------------------------------------- */

function DashboardScene({ className }: SceneProps) {
  return (
    <Frame title="Dashboard" badge="Live" className={className}>
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Calls" value="486" delta="+12%" />
          <Metric label="Avg talk" value="4m 12s" tone="info" />
          <Metric label="Conv." value="5.6%" delta="+1.2" tone="signal" />
        </div>
        <div className="flex min-h-0 flex-1 gap-3">
          <div className="flex flex-1 flex-col rounded-sm border border-ink-100 p-3">
            <p className="text-2xs font-bold text-ink-500">Calls by hour</p>
            <div className="mt-2 min-h-0 flex-1">
              <Bars
                data={[38, 52, 44, 66, 58, 74, 61, 82, 70, 88, 79, 94]}
                highlightIndex={9}
              />
            </div>
          </div>
          <div className="flex w-[38%] flex-col gap-2">
            <div className="flex flex-1 items-center justify-center rounded-sm border border-ink-100">
              <Donut value={74} label="74%" size={76} />
            </div>
            <div className="flex flex-1 items-end">
              <div className="flex h-full w-full items-end gap-[4%]">
                {[45, 62, 38, 74, 56, 88].map((h, i) => (
                  <span
                    key={i}
                    style={{ height: `${h}%` }}
                    className="flex-1 rounded-t-[3px] bg-info-500/30"
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}

function EmployeesScene({ className }: SceneProps) {
  const people = [
    { i: "RK", t: "brand" as const, w: 88 },
    { i: "AS", t: "info" as const, w: 74 },
    { i: "MJ", t: "signal" as const, w: 61 },
    { i: "PN", t: "warn" as const, w: 43 },
    { i: "DV", t: "ink" as const, w: 92 },
  ];

  return (
    <Frame title="Employees · 42 active" className={className}>
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2 rounded-sm bg-ink-50 px-2.5 py-2">
          <Avatar initials="HR" tone="brand" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xs font-bold text-ink-800">
              Priya Nair · Team Alpha
            </p>
            <p className="text-2xs font-semibold text-ink-400">
              SIM 98204 11238 · On duty
            </p>
          </div>
          <Pill tone="signal">Active</Pill>
        </div>
        {people.map((p) => (
          <div
            key={p.i}
            className="flex items-center gap-2.5 rounded-sm border border-ink-100 px-2.5 py-1.5"
          >
            <Avatar initials={p.i} tone={p.t} size="sm" />
            <div className="min-w-0 flex-1">
              <Track value={p.w} tone={p.t === "ink" ? "brand" : p.t} />
            </div>
            <span className="w-8 shrink-0 text-right text-2xs font-extrabold text-ink-800">
              {p.w}%
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function TeamReportsScene({ className }: SceneProps) {
  const rows = [
    ["Rohit K.", "142", "4m 06s", "38%", "12"],
    ["Anita S.", "128", "3m 41s", "35%", "9"],
    ["Manish J.", "119", "3m 22s", "31%", "8"],
    ["Divya V.", "104", "2m 58s", "27%", "6"],
  ];

  return (
    <Frame title="Team report · Team Alpha" badge="Daily" className={className}>
      <div className="flex h-full flex-col">
        <div className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-2 border-b border-ink-100 pb-2 text-2xs font-extrabold tracking-wide text-ink-400 uppercase">
          <span>Rep</span>
          <span className="text-right">Calls</span>
          <span className="text-right">Talk</span>
          <span className="text-right">Conn.</span>
          <span className="text-right">Won</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-around">
          {rows.map((r, i) => (
            <div
              key={r[0]}
              className="grid grid-cols-[1.6fr_repeat(4,1fr)] items-center gap-2 border-b border-dashed border-ink-100 py-1.5 last:border-0"
            >
              <span className="flex min-w-0 items-center gap-2">
                <Avatar
                  initials={r[0]
                    .split(" ")
                    .map((w) => w[0])
                    .join("")}
                  size="sm"
                  tone={i % 2 ? "ink" : "brand"}
                />
                <span className="truncate text-2xs font-bold text-ink-800">
                  {r[0]}
                </span>
              </span>
              {r.slice(1).map((v, j) => (
                <span
                  key={j}
                  className={`text-right text-2xs font-bold ${
                    j === 3 ? "text-signal-600" : "text-ink-700"
                  }`}
                >
                  {v}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-auto flex items-center justify-between rounded-sm bg-brand-50 px-2.5 py-1.5">
          <span className="text-2xs font-bold text-brand-700">
            Exported · PDF & CSV
          </span>
          <span className="text-2xs font-extrabold text-brand-800">
            +12% vs last week
          </span>
        </div>
      </div>
    </Frame>
  );
}

function AnalyticsScene({ className }: SceneProps) {
  return (
    <Frame title="Analytics · Conversion trend" badge="This month" className={className}>
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="Team Alpha" value="5.6%" delta="+1.2" />
          <Metric label="Team Beta" value="4.1%" tone="info" />
          <Metric label="Overall" value="4.8%" tone="signal" />
        </div>
        <div className="min-h-0 flex-1 rounded-sm border border-ink-100 p-3">
          <div className="flex items-center justify-between">
            <p className="text-2xs font-bold text-ink-500">
              Conversion rate by day
            </p>
            <span className="flex items-center gap-3 text-2xs font-semibold text-ink-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-pill bg-brand-500" /> Alpha
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-pill bg-info-500" /> Beta
              </span>
            </span>
          </div>
          <div className="mt-2 h-[calc(100%-1.5rem)]">
            <LineChart
              primary={[42, 55, 48, 66, 58, 74, 69, 81, 76, 88]}
              secondary={[30, 34, 40, 38, 45, 44, 51, 49, 55, 58]}
            />
          </div>
        </div>
      </div>
    </Frame>
  );
}

function HistoryScene({ className }: SceneProps) {
  return (
    <Frame title="Call history · All SIMs" className={className}>
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex items-center gap-2 rounded-sm border border-ink-200 bg-white px-2.5 py-2">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-ink-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="11" cy="11" r="6.5" />
            <path d="m16 16 4 4" strokeLinecap="round" />
          </svg>
          <span className="text-2xs font-semibold text-ink-400">
            Search number, employee or date
          </span>
          <Pill tone="ink">Today</Pill>
        </div>
        {[
          ["10:42", "Outgoing", "98204 11238", "02:14", "signal"],
          ["10:18", "Incoming", "99100 44871", "01:02", "info"],
          ["09:55", "Missed", "90040 77812", "—", "warn"],
          ["09:31", "Rejected", "98991 30210", "00:06", "warn"],
          ["09:04", "Outgoing", "98204 11238", "00:18", "signal"],
        ].map((r, i) => (
          <div
            key={r[0] + r[2]}
            className="flex items-center gap-2 border-b border-dashed border-ink-100 pb-1.5 last:border-0"
          >
            <span className="w-9 shrink-0 text-2xs font-bold text-ink-400">
              {r[0]}
            </span>
            <Pill tone={r[4] as "signal" | "info" | "warn"}>{r[1]}</Pill>
            <span className="min-w-0 flex-1 truncate text-2xs font-bold text-ink-700">
              {r[2]}
            </span>
            <span className="shrink-0 text-2xs font-extrabold text-ink-800">
              {r[3]}
            </span>
            {i === 0 ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-brand-500" />
            ) : (
              <span className="h-1.5 w-1.5 shrink-0" />
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

function RecordingScene({ className }: SceneProps) {
  return (
    <Frame title="Recording · 10:42:08" badge="Synced" tone="dark" className={className}>
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-2.5 rounded-sm border border-ink-800 bg-ink-950 p-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-brand-500 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-px" fill="currentColor" aria-hidden>
              <path d="M7 4.5 20 12 7 19.5z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <Waveform bars={30} className="h-8" />
          </div>
          <span className="shrink-0 text-2xs font-extrabold text-ink-300">
            02:14
          </span>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-ink-800 bg-ink-950 px-2.5 py-2">
          <span className="text-2xs font-bold text-ink-400">Call metadata</span>
          <Pill tone="brand">Connected</Pill>
        </div>

        <div className="flex min-h-0 flex-1 flex-col justify-center gap-2">
          <ListRow tone="brand" labelWidth={38} valueWidth={14} />
          <ListRow tone="signal" labelWidth={52} valueWidth={14} />
          <ListRow tone="info" labelWidth={30} valueWidth={14} />
          <ListRow tone="ink" labelWidth={45} valueWidth={14} />
        </div>

        <div className="flex items-center gap-1.5">
          {["Share clip", "Mark moment", "Add note"].map((t) => (
            <span
              key={t}
              className="flex-1 rounded-sm border border-ink-800 bg-ink-950 py-1.5 text-center text-[0.6rem] font-bold text-ink-300"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function StatusScene({ className }: SceneProps) {
  return (
    <Frame title="Daily status · End of day" className={className}>
      <div className="flex h-full flex-col gap-2.5">
        <div className="rounded-sm border border-ink-100 p-3">
          <p className="text-2xs font-bold text-ink-500">
            How did today go?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {["Met target", "Follow-ups done", "New enquiries"].map((t, i) => (
              <span
                key={t}
                className={`rounded-pill px-2 py-1 text-2xs font-bold ring-1 ${
                  i === 0
                    ? "bg-brand-50 text-brand-700 ring-brand-100"
                    : "bg-white text-ink-500 ring-ink-200"
                }`}
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {[
          { i: "RK", n: "Rohit K.", c: "42 calls · 5h 08m", s: "On track", t: "signal" as const },
          { i: "AS", n: "Anita S.", c: "38 calls · 4h 41m", s: "On track", t: "signal" as const },
          { i: "PN", n: "Priya N.", c: "19 calls · 2h 02m", s: "Needs review", t: "warn" as const },
        ].map((row) => (
          <div
            key={row.n}
            className="flex items-center gap-2.5 rounded-sm border border-ink-100 px-2.5 py-2"
          >
            <Avatar initials={row.i} tone={row.t} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xs font-bold text-ink-800">{row.n}</p>
              <p className="truncate text-2xs font-semibold text-ink-400">
                {row.c}
              </p>
            </div>
            <Pill tone={row.t}>{row.s}</Pill>
          </div>
        ))}

        <div className="mt-auto rounded-sm bg-ink-50 px-2.5 py-2 text-center text-2xs font-bold text-ink-500">
          Sent from the mobile app · no meeting required
        </div>
      </div>
    </Frame>
  );
}

function LeadsBoardScene({ className }: SceneProps) {
  const cards = [
    { n: "Verma Hospital", v: "LD-2291", s: "Qualified", t: "warn" as const, d: "Follow up Fri" },
    { n: "Shah Motors", v: "LD-2292", s: "Contacted", t: "info" as const, d: "Call back 4pm" },
    { n: "Patel Clinic", v: "LD-2293", s: "New", t: "ink" as const, d: "Unassigned" },
  ];

  return (
    <Frame title="Leads · My pipeline" badge="26 open" className={className}>
      <div className="flex h-full flex-col gap-2">
        <div className="flex items-center gap-2 rounded-sm bg-brand-50 px-2.5 py-2">
          <span className="h-1.5 w-1.5 rounded-pill bg-brand-500" />
          <span className="text-2xs font-bold text-brand-700">
            4 leads due today
          </span>
          <span className="ml-auto text-2xs font-extrabold text-brand-800">
            7 converted
          </span>
        </div>
        {cards.map((c, i) => (
          <div
            key={c.v}
            className="rounded-sm border border-ink-100 bg-white p-2.5"
            style={{ opacity: 1 - i * 0.12 }}
          >
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-2xs font-extrabold text-ink-800">
                {c.n}
              </p>
              <Pill tone={c.t}>{c.s}</Pill>
            </div>
            <p className="mt-1 text-2xs font-semibold text-ink-400">
              {c.v} · {c.d}
            </p>
            <div className="mt-2">
              <Track value={[78, 54, 32][i]} tone={i === 2 ? "warn" : "brand"} />
            </div>
          </div>
        ))}
        <div className="mt-auto flex items-center gap-1.5">
          {["Capture lead", "Assign owner", "Set reminder"].map((t) => (
            <span
              key={t}
              className="flex-1 rounded-sm bg-ink-50 py-1.5 text-center text-[0.6rem] font-bold text-ink-600"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function LeadsReportScene({ className }: SceneProps) {
  const sources = [
    { n: "Inbound website", v: 92, c: "38" },
    { n: "Referral", v: 74, c: "26" },
    { n: "Campaign", v: 58, c: "19" },
    { n: "Existing client", v: 41, c: "12" },
  ];

  return (
    <Frame title="Lead report · By source" badge="This month" className={className}>
      <div className="flex h-full flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <Metric label="New leads" value="412" delta="+9%" />
          <Metric label="Qualified" value="148" delta="+21" tone="warn" />
          <Metric label="Converted" value="95" delta="+17" tone="signal" />
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-around gap-2.5">
          {sources.map((s, i) => (
            <div key={s.n} className="flex items-center gap-2.5">
              <span className="w-28 shrink-0 truncate text-2xs font-bold text-ink-600">
                {s.n}
              </span>
              <span className="min-w-0 flex-1">
                <Track value={s.v} tone={i === 0 ? "brand" : i === 3 ? "ink" : "info"} />
              </span>
              <span className="w-6 shrink-0 text-right text-2xs font-extrabold text-ink-800">
                {s.c}
              </span>
            </div>
          ))}
        </div>
        <div className="rounded-sm border border-ink-100 bg-ink-50 px-2.5 py-2">
          <p className="text-2xs font-bold text-ink-500">
            Revenue attributed · ₹ 24.6L this month
          </p>
        </div>
      </div>
    </Frame>
  );
}

const scenes: Record<ArtVariant, (props: SceneProps) => React.JSX.Element> = {
  dashboard: DashboardScene,
  employees: EmployeesScene,
  "team-reports": TeamReportsScene,
  analytics: AnalyticsScene,
  history: HistoryScene,
  recording: RecordingScene,
  status: StatusScene,
  "leads-board": LeadsBoardScene,
  "leads-report": LeadsReportScene,
};

/** Renders the scene bound to a marketing feature id. */
export function FeatureArt({
  variant,
  className,
}: {
  variant: ArtVariant;
  className?: string;
}) {
  const Scene = scenes[variant];
  return <Scene className={className} />;
}
