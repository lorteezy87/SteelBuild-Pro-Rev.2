/** Pure helpers for Landing auth/demo forms. */

export function canSubmitCredentials(email: string, password: string): boolean {
  return Boolean((email || "").trim() && password);
}

export function canSubmitEmailOnly(email: string): boolean {
  return Boolean((email || "").trim());
}

export function buildDemoPayload(demoForm: {
  name?: string;
  email?: string;
  company?: string;
  tonnage?: string;
  message?: string;
}): {
  name: string;
  email: string;
  company: string | null;
  tonnage: string | null;
  message: string | null;
} {
  return {
    name: (demoForm.name || "").trim(),
    email: (demoForm.email || "").trim(),
    company: (demoForm.company || "").trim() || null,
    tonnage: (demoForm.tonnage || "").trim() || null,
    message: (demoForm.message || "").trim() || null,
  };
}

export function isScrolledPast(scrollY: number, threshold = 30): boolean {
  return scrollY > threshold;
}

export const C = {
  // Dual-theme hex allowlist: public landing uses a fixed executive-light brand palette.
  base: "#F5F7FA",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  ink: "#101827",
  navy: "#172033",
  body: "#536179",
  muted: "#8491A6",
  line: "#E2E8F0",
  line2: "#CBD5E1",
  amber: "#F5A800",
  amberDark: "#C47D00",
  blue: "#2563EB",
  green: "#059669",
  red: "#DC2626",
};

export const F = {
  body: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  display: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
};

export const HERO_STRIP = "/steelbuild-hero.svg";
export const LOGO_IMG = "/steelbuild-pro-logo.jpg";

export const NAV_LINKS = [
  { label: "Platform", target: "platform" },
  { label: "Modules", target: "modules" },
  { label: "Workflow", target: "workflow" },
  { label: "Pricing", target: "pricing" },
  { label: "Demo", target: "demo" },
];

export const EXEC_METRICS = [
  { value: "8", label: "Featured modules" },
  { value: "1", label: "Source of truth" },
  { value: "24/7", label: "Project visibility" },
  { value: "0", label: "Spreadsheet handoffs" },
];

export const VALUE_CARDS = [
  {
    kicker: "Executive control",
    title: "Portfolio health without waiting for status meetings.",
    body: "See open RFIs, schedule exposure, cost pressure, field blockers, and production status in one command view.",
  },
  {
    kicker: "Steel-first execution",
    title: "Built around the way steel moves.",
    body: "Detailing, release, fabrication, deliveries, erection, change orders, pay apps, and closeout stay connected by project.",
  },
  {
    kicker: "Commercial confidence",
    title: "Evidence stays attached to the work.",
    body: "RFIs, photos, documents, budget hours, backcharges, and change orders stay organized for faster decisions and stronger backup.",
  },
];

export const MODULES = [
  { name: "Command Center", desc: "Executive workload, risk, and decision queue", stat: "86% clear", tone: "blue" },
  { name: "Portfolio", desc: "Multi-project performance and exposure", stat: "$58.4M", tone: "green" },
  { name: "RFIs", desc: "Ownership, aging, and response control", stat: "47 open", tone: "red" },
  { name: "Detailing", desc: "Drawings, models, approvals, and release", stat: "156 dwgs", tone: "blue" },
  { name: "Schedule", desc: "Critical path, delivery, and field impacts", stat: "72%", tone: "amber" },
  { name: "Fab Release", desc: "Shop release readiness and blockers", stat: "142", tone: "green" },
  { name: "Field Today", desc: "Crew, issues, inspections, and photos", stat: "32 issues", tone: "amber" },
  { name: "Budget Control", desc: "Cost, hours, COs, and pay applications", stat: "-2.4%", tone: "green" },
];

export const WORKFLOW = [
  { step: "01", title: "Plan", body: "Set up the project, team, schedule, budgets, and drawing controls." },
  { step: "02", title: "Coordinate", body: "Move RFIs, detailing, procurement, and work packages through ownership lanes." },
  { step: "03", title: "Execute", body: "Track fabrication, deliveries, field work, resources, issues, and photos." },
  { step: "04", title: "Control", body: "Protect margin with budget hours, change orders, SOVs, pay apps, and reports." },
];

export const PROOF_POINTS = [
  "Project dashboard modeled after real steel PM workflows",
  "Light, executive interface aligned with the attached module mockups",
  "Module-by-module visibility without burying users in navigation",
  "Designed to feel credible in owner, GC, and leadership conversations",
];


export const monoLabel = (extra: Record<string, unknown> = {}) => ({
  fontFamily: F.mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.muted,
  ...extra,
});
