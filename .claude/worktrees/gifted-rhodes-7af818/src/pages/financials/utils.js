import { formatCurrency } from "@/components/shared/formatters";

export const mono = { fontFamily: "var(--font-mono)" };
export const body = { fontFamily: "var(--font-body)" };

export const HEALTH_COLOR = {
  green: "var(--status-success)",
  amber: "var(--status-warning)",
  red:   "var(--status-error)",
};

// SOV family rules aligned with cost code categories (costCodes.jsx).
// Each rule maps SOV descriptions → the matching cost code category.
export const FAMILY_RULES = [
  { key: "labor",         label: "Labor",         direct: true,  test: (text) => /shop labor|shop|fabrication|fab |field labor|structural|erect|install|shipping|freight|truck/.test(text) },
  { key: "materials",     label: "Materials",      direct: true,  test: (text) => /anchor bolt|embed|joist|deck\b|raw material|material|fastener|steel|plate|angle|channel/.test(text) },
  { key: "subcontractor", label: "Subcontractor",  direct: true,  test: (text) => /detail|engineering|deck install|subcontract|sub /.test(text) },
  { key: "equipment",     label: "Equipment",      direct: true,  test: (text) => /equipment|crane|forklift|rigging|scaffold/.test(text) },
  { key: "misc",          label: "Misc.",           direct: true,  test: (text) => /coat|galv|paint|special coat|misc|sundry/.test(text) },
  { key: "overhead",      label: "Overhead",        direct: false, test: (text) => /pm\/admin|admin|overhead|indirect|insurance|bond|travel|hotel|per diem/.test(text) },
];

export function getFamilyMeta(text) {
  const normalized = String(text || "").toLowerCase();
  const match = FAMILY_RULES.find((rule) => rule.test(normalized));
  return match || { key: "misc", label: "Misc.", direct: true };
}

export function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

export function formatSigned(value) {
  if (value == null || value === "") return "\u2014";
  const raw = Number(value);
  if (!Number.isFinite(raw)) return "\u2014";
  if (raw === 0) return "$0";
  return `${raw > 0 ? "+" : ""}${formatCurrency(raw)}`;
}

export function varianceColor(value) {
  if (value < 0) return "var(--status-error)";
  if (value > 0) return "var(--status-success)";
  return "var(--text-muted)";
}

export function periodDisplay(from, to) {
  const fmt = (d) => {
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return "";
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const f = from ? fmt(from) : "";
  const t = to ? fmt(to) : "";
  if (f && t) return `${f} \u2013 ${t}`;
  return f || t || "\u2014";
}

export function agingTintBg(daysOutstanding) {
  if (daysOutstanding <= 30) return "color-mix(in srgb, var(--status-success) 3%, transparent)";
  if (daysOutstanding <= 60) return "color-mix(in srgb, var(--status-warning) 3%, transparent)";
  return "color-mix(in srgb, var(--status-error) 3%, transparent)";
}
