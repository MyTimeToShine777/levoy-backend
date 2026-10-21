/**
 * All marketing copy for the landing page, mirroring the content structure of
 * the reference marketing site. Every string the page renders lives here so
 * layout components contain zero prose.
 */

import type { IconName } from "@/components/ui/icons";
import { site } from "@/lib/site";

/* -------------------------------------------------------------------------- */
/* Hero                                                                        */
/* -------------------------------------------------------------------------- */

export const hero = {
  eyebrow: "SIM-based telecalling intelligence",
  title: "Unleash Telecalling Success Secrets with Callio",
  subtitle:
    "Monitor all telesales and marketing calls and discover real-time insights to improve caller productivity and track lead status from a central dashboard.",
  primaryCta: { label: "Sign Up Now", href: "https://web.levoy.co/signup" },
  secondaryCta: { label: "Explore features", href: "#features" },
  highlights: [
    "No hardware or deskphone needed",
    "Works on the phones your team already owns",
    "Live data, no manual uploads",
  ],
} as const;

/* -------------------------------------------------------------------------- */
/* Client logo wall                                                            */
/* -------------------------------------------------------------------------- */

export const clients = [
  "Pristyn Care",
  "Motilal Oswal",
  "Tata Capital",
  "Cars24",
  "Nibav Lifts",
  "Learnbay",
  "Wheelseye",
  "Excelr Solutions",
  "Agrim Wholesale",
  "Bijnis",
  "Zebu",
  "Worten",
  "Staragile",
  "Ideal",
] as const;

/* -------------------------------------------------------------------------- */
/* Three headline feature cards                                                */
/* -------------------------------------------------------------------------- */

export type FeatureCard = {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  points: readonly string[];
  art: "monitoring" | "leads" | "integration";
};

export const featureCards: readonly FeatureCard[] = [
  {
    id: "call-monitoring",
    icon: "headset",
    title: "Call Monitoring",
    body: "Every outgoing call from every team SIM is logged the moment it happens — duration, direction, drop-offs and all. Nothing is self-reported, so the numbers you plan with are the numbers you actually have.",
    points: [
      "Automatic call logs per SIM",
      "Missed and repeat-call tracking",
      "Works on Android phones — no deskphone",
    ],
    art: "monitoring",
  },
  {
    id: "lead-management",
    icon: "target",
    title: "Lead Management",
    body: "Turn a phone number into a pipeline stage. Assign ownership, set next follow-up dates and move leads through New, Contacted, Qualified, Converted or Lost without anyone losing track in a spreadsheet.",
    points: [
      "Lead stages with owner assignment",
      "Follow-up reminders and ageing",
      "Bulk import from CSV or CRM",
    ],
    art: "leads",
  },
  {
    id: "crm-api",
    icon: "plug",
    title: "CRM & API Integration",
    body: "Push calling data into the CRM your team already lives in. REST APIs and webhooks keep contacts, dispositions and call outcomes in sync both ways, so no one re-keys a single entry.",
    points: [
      "Two-way REST API",
      "Webhook events on call and lead change",
      "Works alongside your existing CRM",
    ],
    art: "integration",
  },
];

/* -------------------------------------------------------------------------- */
/* Why businesses trust Callio                                              */
/* -------------------------------------------------------------------------- */

export const trustPoints: readonly {
  id: string;
  icon: IconName;
  title: string;
  body: string;
}[] = [
  {
    id: "productivity",
    icon: "trending",
    title: "Improves Telecalling Productivity",
    body: "See which reps actually dial and which go quiet after 10am. Share the top performers' habits, then let the dashboard hold the team to a visible daily number.",
  },
  {
    id: "idle-time",
    icon: "clock",
    title: "Reduces Non-productive Time",
    body: "Idle gaps between calls, long breaks and off-phone hours become visible instead of invisible. Managers coach the cause while the pattern is still forming, not at month-end.",
  },
  {
    id: "evaluation",
    icon: "checklist",
    title: "Efficient Performance Evaluation",
    body: "Build appraisals on call volume, talk time, connect rate and conversion — objective evidence that stands up in a review, whether the team sits in office or works remotely.",
  },
  {
    id: "automation",
    icon: "automation",
    title: "Automates your Operations",
    body: "Call logging, status reporting and lead follow-ups happen on their own. Your ops team stops compiling spreadsheets and starts acting on what the numbers say.",
  },
];

/* -------------------------------------------------------------------------- */
/* Stats band + Play Store badges                                              */
/* -------------------------------------------------------------------------- */

export const stats: readonly { value: string; label: string }[] = [
  { value: "1,000+", label: "Clients worldwide" },
  { value: "12,000+", label: "Tracking phone numbers" },
  { value: "1M+", label: "Downloads" },
  { value: "4.5", label: "App rating" },
];

export const playBadges = [
  {
    id: "business",
    audience: "For businesses",
    app: "Callio Biz",
    package: "com.websoptimization.levoybiz",
  },
  {
    id: "personal",
    audience: "For individuals",
    app: "Callio",
    package: "in.levoy.individual",
  },
] as const;

/* -------------------------------------------------------------------------- */
/* Nine product features — alternating rows                                    */
/* -------------------------------------------------------------------------- */

export type ProductFeature = {
  id: string;
  icon: IconName;
  title: string;
  body: string;
  bullets: readonly string[];
  art: ArtVariant;
};

export type ArtVariant =
  | "dashboard"
  | "employees"
  | "team-reports"
  | "analytics"
  | "history"
  | "recording"
  | "status"
  | "leads-board"
  | "leads-report";

export const productFeatures: readonly ProductFeature[] = [
  {
    id: "insightful-dashboard",
    icon: "dashboard",
    title: "Insightful Dashboard",
    body: "One screen that answers the only questions that matter: who called, who picked up, and what happened next. Filter by team, shift or rep and drill straight into an individual call.",
    bullets: [
      "Live tiles for calls, connects and talk time",
      "Drill down from team to individual call",
      "Refreshes as the day unfolds",
    ],
    art: "dashboard",
  },
  {
    id: "manage-employee",
    icon: "users",
    title: "Manage Employees",
    body: "Bring your entire calling floor into one roster — role, team, SIM and reporting line. Onboard a new rep in minutes and remove access the moment someone leaves.",
    bullets: [
      "Teams, roles and reporting lines",
      "Assign a SIM to each employee",
      "Instant offboarding of access",
    ],
    art: "employees",
  },
  {
    id: "detailed-team-reports",
    icon: "report",
    title: "Detailed Team Reports",
    body: "Per-rep day-by-day call sheets with talk time, connect rate and lead movement. Export to CSV or PDF, or schedule the report straight to a manager's inbox.",
    bullets: [
      "Day-by-day performance per employee",
      "Talk time, connect rate, conversions",
      "CSV and PDF export",
    ],
    art: "team-reports",
  },
  {
    id: "reporting-analytics",
    icon: "trending",
    title: "Reporting & Analytics",
    body: "Compare teams, spot the hour of the day your best conversions land, and catch a slump before it becomes a quarter. Charts that answer a question, not just display a number.",
    bullets: [
      "Team and campaign comparisons",
      "Hour-of-day conversion trends",
      "Spot drops before they compound",
    ],
    art: "analytics",
  },
  {
    id: "call-history",
    icon: "history",
    title: "Call History",
    body: "A searchable, timestamped log of every call made across the fleet — incoming, outgoing, missed and rejected. Filter by number, employee or date to settle any dispute in seconds.",
    bullets: [
      "Search by number, rep or date",
      "Incoming, outgoing, missed and rejected",
      "Immutable audit trail",
    ],
    art: "history",
  },
  {
    id: "recording-sync",
    icon: "mic",
    title: "Call Recording Synchronisation",
    body: "Sync your existing call recorder to Callio and line every recording up with the call log. Listen, coach and share the exact moment that won or lost the deal.",
    bullets: [
      "Sync recordings with the call log",
      "Listen inline beside the metadata",
      "Share clips for coaching",
    ],
    art: "recording",
  },
  {
    id: "daily-status",
    icon: "mail",
    title: "Daily Status Updates",
    body: "Each rep gets a simple end-of-day self-report on their phone, and you get it back in the dashboard. Remote and field teams stay accountable without a single meeting call.",
    bullets: [
      "Mobile self-report for every rep",
      "Auto-collected into the dashboard",
      "Works for field and remote teams",
    ],
    art: "status",
  },
  {
    id: "leads-management",
    icon: "target",
    title: "Leads Management",
    body: "Capture a lead the moment it comes in, attach the call that created it, and set the next action. Stages, owners and due dates keep the pipeline honest across every team.",
    bullets: [
      "Capture leads from any call",
      "Stages, owners and due dates",
      "Duplicate and stale-lead control",
    ],
    art: "leads-board",
  },
  {
    id: "leads-reporting",
    icon: "report",
    title: "Leads Reporting",
    body: "Know which source produced the converted revenue and which rep closed it. Lead-stage funnel reports make it obvious where to put next month's budget.",
    bullets: [
      "Funnel by stage and source",
      "Revenue attributed to each rep",
      "Shareable with the whole team",
    ],
    art: "leads-report",
  },
];

/* -------------------------------------------------------------------------- */
/* How it works                                                                */
/* -------------------------------------------------------------------------- */

export const steps: readonly { title: string; body: string; icon: IconName }[] =
  [
    {
      title: "Install the Callio Biz app",
      body: "Download the Callio Biz app from the Play Store on each employee's smartphone. It takes a couple of minutes and no IT support.",
      icon: "phone",
    },
    {
      title: "Calling data syncs automatically",
      body: "The app syncs call data in real time from the SIM — no dialer integration, no desktop software, no manual entry at the end of the day.",
      icon: "sync",
    },
    {
      title: "Watch the live dashboard",
      body: "Open the dashboard and email reports to see productivity, lead status and team performance as it happens, from any device.",
      icon: "dashboard",
    },
  ];

/* -------------------------------------------------------------------------- */
/* Testimonial + closing CTA                                                   */
/* -------------------------------------------------------------------------- */

export const testimonial = {
  quote:
    "Our entire tele-sales team now works from home, and that used to be a blind spot. Callio gives us the call volume, talk time and lead movement of every person on the floor — verified, not claimed — so appraisals are based on evidence and coaching happens the same day instead of next month.",
  name: "Vineet Verma",
  role: "AGM – Growth",
  company: "Pristyn Care",
} as const;

export const closingCta = {
  title: "Let's start growing your business",
  body: "Install the app on your team's phones today and see your real telecalling numbers on the dashboard by tomorrow morning.",
  primaryCta: { label: "Sign Up Now", href: "https://web.levoy.co/signup" },
  secondaryCta: { label: "Let's schedule a demo", href: site.demoUrl },
} as const;
